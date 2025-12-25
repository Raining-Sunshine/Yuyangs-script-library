/** ESP_composite_vtx_bone_legend_FINAL.jsx
 *
 * Inputs in folder:
 *   - vtx1.bmp, vtx2.bmp, ...
 *   - bone1.bmp, bone2.bmp, ...
 *   - minmax.bmp  (legend only, same for all i)
 *
 * Output:
 *   - ESP1.png, ESP2.png, ...
 *
 * Logic:
 *   - NEVER modify vtx pixels
 *   - bone & minmax: SAME handling pipeline
 *       default: set blend mode MULTIPLY (white becomes visually transparent)
 *       optional: "true delete pixels" for white background (bone & minmax)
 */

#target photoshop
app.bringToFront();

(function () {
    app.displayDialogs = DialogModes.NO;

    var inFolder = Folder.selectDialog("Select folder containing vtx*.bmp, bone*.bmp and minmax.bmp");
    if (!inFolder) return;

    var outFolder = Folder.selectDialog("Select output folder for ESP*.png (Cancel = use input folder)");
    if (!outFolder) outFolder = inFolder;

    var fLegend = new File(inFolder.fsName + "/minmax.bmp");
    if (!fLegend.exists) {
        alert("Missing minmax.bmp in:\n" + inFolder.fsName);
        return;
    }

    // ===== Settings =====
    // Bone & legend use SAME behavior:
    // Recommended: no deletion; just Multiply so white bg doesn't cover.
    var OVERLAY_USE_MULTIPLY = true;

    // If you really need "true delete pixels" for white bg:
    // set OVERLAY_TRUE_DELETE_WHITE = true.
    var OVERLAY_TRUE_DELETE_WHITE = false;

    // For overlay true-delete only:
    var OVERLAY_WHITE_FUZZ = 10;   // 0~20. Keep small to avoid touching colored bar/text edges.
    var OVERLAY_EXPAND_PX  = 1;    // 0~2. Increase if a thin white rim remains.

    var UI_SLEEP_MS = 20;

    // ===== Helpers =====
    function front(doc) {
        app.activeDocument = doc;
        app.bringToFront();
        try { app.refresh(); } catch (e) {}
        $.sleep(UI_SLEEP_MS);
    }

    function closeNoSave(doc) {
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e) {}
    }

    function normalizeRGB8(doc) {
        front(doc);
        try { if (doc.mode !== DocumentMode.RGB) doc.changeMode(ChangeMode.RGB); } catch (e) {}
        try { doc.bitsPerChannel = BitsPerChannelType.EIGHT; } catch (e2) {}
    }

    function layerFromBackground(doc) {
        front(doc);
        try {
            if (doc.backgroundLayer) {
                doc.activeLayer = doc.backgroundLayer;
                executeAction(stringIDToTypeID("layerFromBackground"), new ActionDescriptor(), DialogModes.NO);
            }
        } catch (e) {}
    }

    function unlockAll(doc) {
        front(doc);

        function unlockLayer(layer) {
            try { layer.allLocked = false; } catch (e) {}
            try { layer.pixelsLocked = false; } catch (e) {}
            try { layer.positionLocked = false; } catch (e) {}
            try { layer.transparentPixelsLocked = false; } catch (e) {}
            if (layer.typename === "LayerSet") {
                for (var i = 0; i < layer.layers.length; i++) unlockLayer(layer.layers[i]);
            }
        }

        layerFromBackground(doc);
        for (var i = 0; i < doc.layers.length; i++) unlockLayer(doc.layers[i]);
        try { doc.activeLayer.visible = true; } catch (e3) {}
    }

    function ensureArtLayerActive(doc) {
        front(doc);
        if (doc.activeLayer && doc.activeLayer.typename === "ArtLayer") return;
        for (var i = 0; i < doc.layers.length; i++) {
            if (doc.layers[i].typename === "ArtLayer") { doc.activeLayer = doc.layers[i]; return; }
        }
    }

    function matchCanvasToTarget(srcDoc, targetDoc) {
        front(srcDoc);
        if (srcDoc.width !== targetDoc.width || srcDoc.height !== targetDoc.height) {
            // keep top-left anchored (same as VMD snapshot)
            srcDoc.resizeCanvas(targetDoc.width, targetDoc.height, AnchorPosition.TOPLEFT);
        }
    }

    function duplicateLayerTo(docSrc, docDst, newName) {
        front(docSrc);
        unlockAll(docSrc);
        ensureArtLayerActive(docSrc);

        // Duplicate ENTIRE layer => no position shift
        var dup = docSrc.activeLayer.duplicate(docDst, ElementPlacement.PLACEATBEGINNING);
        try { dup.name = newName; } catch (e) {}
        return dup;
    }

    function exportPNG(doc, file) {
        front(doc);
        normalizeRGB8(doc);

        var opts = new ExportOptionsSaveForWeb();
        opts.format = SaveDocumentType.PNG;
        opts.PNG8 = false;
        opts.transparency = true;
        opts.interlaced = false;
        opts.quality = 100;

        doc.exportDocument(file, ExportType.SAVEFORWEB, opts);
    }

    // --- White removal (overlay ONLY) via mask apply (stable) ---
    function deselectSafe(doc) {
        front(doc);
        try { doc.selection.deselect(); } catch (e) {}
    }

    function hasSelection(doc) {
        try { var b = doc.selection.bounds; return !!b; } catch (e) { return false; }
    }

    function colorRangeSelectWhite(doc, fuzziness) {
        front(doc);

        var desc = new ActionDescriptor();
        desc.putInteger(charIDToTypeID("Fzns"), fuzziness);

        var white = new ActionDescriptor();
        white.putDouble(charIDToTypeID("Rd  "), 255.0);
        white.putDouble(charIDToTypeID("Grn "), 255.0);
        white.putDouble(charIDToTypeID("Bl  "), 255.0);

        desc.putObject(charIDToTypeID("Mnm "), charIDToTypeID("RGBC"), white);
        desc.putObject(charIDToTypeID("Mxm "), charIDToTypeID("RGBC"), white);

        executeAction(charIDToTypeID("ClrR"), desc, DialogModes.NO);
    }

    function addLayerMaskHideSelection() {
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putClass(charIDToTypeID("Chnl"));
        desc.putReference(charIDToTypeID("Nw  "), ref);

        var ref2 = new ActionReference();
        ref2.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
        desc.putReference(charIDToTypeID("At  "), ref2);

        // Hide selection (selected pixels become hidden)
        desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("HdSl"));
        executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
    }

    function applyLayerMask() {
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
        desc.putReference(charIDToTypeID("null"), ref);
        desc.putBoolean(charIDToTypeID("Aply"), true);
        executeAction(charIDToTypeID("Dlt "), desc, DialogModes.NO);
    }

    // Generic: true-delete white bg on current doc's active art layer
    function overlayTrueDeleteWhite(docOverlay, fuzz, expandPx) {
        front(docOverlay);
        normalizeRGB8(docOverlay);
        unlockAll(docOverlay);
        ensureArtLayerActive(docOverlay);

        deselectSafe(docOverlay);
        colorRangeSelectWhite(docOverlay, fuzz);

        if (hasSelection(docOverlay)) {
            if (expandPx && expandPx > 0) {
                try { docOverlay.selection.expand(expandPx); } catch (e) {}
            }
            // Bake to transparency via mask apply (more reliable than selection.clear())
            addLayerMaskHideSelection();
            applyLayerMask();
        }
        deselectSafe(docOverlay);
    }

    function applyOverlayPolicy(docOverlay) {
        // NOTE: This modifies overlay docs (bone/minmax) only, never vtx.
        if (OVERLAY_TRUE_DELETE_WHITE) {
            overlayTrueDeleteWhite(docOverlay, OVERLAY_WHITE_FUZZ, OVERLAY_EXPAND_PX);
        }
        // Multiply is applied after duplication (on the layer inside vtx doc),
        // but if you prefer applying here, it doesn't matter. We keep it on duplicated layer.
    }

    function findIndices(folder) {
        var bones = folder.getFiles(function (f) {
            return f instanceof File && /^bone(\d+)\.bmp$/i.test(f.name);
        });

        var idx = {};
        for (var b = 0; b < bones.length; b++) {
            var m = bones[b].name.match(/^bone(\d+)\.bmp$/i);
            if (!m) continue;
            var i = parseInt(m[1], 10);
            if (new File(folder.fsName + "/vtx" + i + ".bmp").exists) idx[i] = true;
        }

        var list = [];
        for (var k in idx) if (idx.hasOwnProperty(k)) list.push(parseInt(k, 10));
        list.sort(function (a, b) { return a - b; });
        return list;
    }

    // ===== Batch =====
    var indices = findIndices(inFolder);
    if (indices.length === 0) {
        alert("No pairs found. Need bone{i}.bmp AND vtx{i}.bmp.\nFolder:\n" + inFolder.fsName);
        return;
    }

    var report = [];
    for (var t = 0; t < indices.length; t++) {
        var i = indices[t];

        var fBone = new File(inFolder.fsName + "/bone" + i + ".bmp");
        var fVtx  = new File(inFolder.fsName + "/vtx" + i + ".bmp");
        var fOut  = new File(outFolder.fsName + "/ESP" + i + ".png");

        var docVtx = null, docBone = null, docLegend = null;

        try {
            // 1) Open vtx (base). Do not modify pixels.
            docVtx = app.open(fVtx);
            front(docVtx);
            normalizeRGB8(docVtx);
            unlockAll(docVtx);
            ensureArtLayerActive(docVtx);
            try { docVtx.activeLayer.name = "vtx" + i; } catch (e0) {}

            // 2) Open bone => apply SAME overlay policy => duplicate whole layer to vtx
            docBone = app.open(fBone);
            front(docBone);
            normalizeRGB8(docBone);
            unlockAll(docBone);
            ensureArtLayerActive(docBone);
            matchCanvasToTarget(docBone, docVtx);

            applyOverlayPolicy(docBone);

            var boneLayer = duplicateLayerTo(docBone, docVtx, "bone" + i);
            closeNoSave(docBone); docBone = null;

            // 3) Open legend(minmax) => apply SAME overlay policy => duplicate to vtx
            docLegend = app.open(fLegend);
            front(docLegend);
            normalizeRGB8(docLegend);
            unlockAll(docLegend);
            ensureArtLayerActive(docLegend);
            matchCanvasToTarget(docLegend, docVtx);

            applyOverlayPolicy(docLegend);

            var legendLayer = duplicateLayerTo(docLegend, docVtx, "legend");
            closeNoSave(docLegend); docLegend = null;

            // 4) Apply SAME blend rule to BOTH overlays (bone & legend)
            if (OVERLAY_USE_MULTIPLY) {
                try { boneLayer.blendMode   = BlendMode.MULTIPLY; } catch (eBM1) {}
                try { legendLayer.blendMode = BlendMode.MULTIPLY; } catch (eBM2) {}
            }

            // 5) Export composite (IMPORTANT: export the vtx doc)
            exportPNG(docVtx, fOut);
            closeNoSave(docVtx); docVtx = null;

            report.push("OK   i=" + i + " -> " + fOut.fsName);
        } catch (err) {
            if (docLegend) closeNoSave(docLegend);
            if (docBone) closeNoSave(docBone);
            if (docVtx) closeNoSave(docVtx);
            report.push("FAIL i=" + i + " : " + err);
        }
    }

    alert(
        "Batch finished.\n\n" + report.join("\n") +
        "\n\nOverlay handling (bone & minmax):\n" +
        "- Multiply=" + OVERLAY_USE_MULTIPLY +
        ", TrueDeleteWhite=" + OVERLAY_TRUE_DELETE_WHITE +
        ", Fuzz=" + OVERLAY_WHITE_FUZZ +
        ", ExpandPx=" + OVERLAY_EXPAND_PX
    );
})();

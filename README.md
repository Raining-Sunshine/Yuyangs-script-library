Please cite Du, Y., Shen, P., Liu, H., Zhang, Y., Jia, L., Pu, X., Yang, F., Ren, T., Chu, D., Wang, Z., & Wei, D. (2024). Multi-receptor skin with highly sensitive tele-perception somatosensory. Science Advances, 10(37), eadp8681. https://doi.org/doi:10.1126/sciadv.adp8681 


For automatic ESP process，use multiwfn to generate all pdb files, then put test.vmd in the VMD folder, change outdir into the folder you want to put your seperated layers of ESP, then add
proc test {} {source test.vmd}
in vmd.rc.

To use the script, simply open VMD and type "test" in command line. the script will generate and save colored vtx file in vtx.bmp, molecular structure and surface maximum and minimum points at bone.bmp. If you changed the BWR coloring range, then you need to generate a colorbar image seperately and name it minmax.bmp, otherwise the colorbar image in this repo should be fine to use.

Put minmax, bone and vtx in one folder, upen the jsx script using Photoshop, Photoshop version should be no later than 2023. then click confirm and select the input and output folder, the script will automatically merge vtx,none and bmp into one image and save to designated folder as ESP.png.

Please cite the paper [] if you used this ESP script.(I haven't published the paper yet, will put the paper detail here when the paper gets published. before that you can simply cite this repo or siomply not citing anyone.)

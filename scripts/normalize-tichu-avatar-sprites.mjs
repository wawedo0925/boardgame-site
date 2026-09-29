import sharp from "sharp";

const cellSize=512;
const transparent={r:0,g:0,b:0,alpha:0};

async function normalized(source,region,box){
 const regionBuffer=await sharp(source).extract(region).png().toBuffer();
 const image=await sharp(regionBuffer).trim({background:transparent}).resize(box.width,box.height,{fit:"contain",background:transparent}).png().toBuffer();
 const canvas=sharp({create:{width:cellSize,height:cellSize,channels:4,background:transparent}});
 return canvas.composite([{input:image,left:Math.round((cellSize-box.width)/2),top:box.top}]).png().toBuffer();
}

async function empty(){return sharp({create:{width:cellSize,height:cellSize,channels:4,background:transparent}}).png().toBuffer()}

async function sheet(cells,columns,output){
 const rows=Math.ceil(cells.length/columns),background=await empty();
 const layers=[];
 for(let i=0;i<columns*rows;i++)layers.push({input:cells[i]||background,left:(i%columns)*cellSize,top:Math.floor(i/columns)*cellSize});
 await sharp({create:{width:columns*cellSize,height:rows*cellSize,channels:4,background:transparent}}).composite(layers).webp({quality:92,alphaQuality:100}).toFile(output);
}

const hair=[];
for(let row=0;row<4;row++)for(let column=0;column<4;column++){
 const index=row*4+column,extendedHeight=index===2?276:index===3?310:256;
 hair.push(await normalized("public/tichu-avatar-hair-v2.webp",{left:column*256,top:row*256,width:256,height:extendedHeight},{width:400,height:400,top:0}));
}
await sheet(hair,4,"public/tichu-avatar-hair-v3.webp");

const face=[];
const faceRows=[[0,300],[300,285]];
for(const [top,height] of faceRows)for(let column=0;column<4;column++)face.push(await normalized("public/tichu-avatar-expressions-v2.webp",{left:column*256,top,width:256,height},{width:190,height:165,top:178}));
await sheet(face,4,"public/tichu-avatar-expressions-v3.webp");

const outfits=[];
const outfitRows=[[0,290],[290,185],[475,208]];
for(const [top,height] of outfitRows)for(let column=0;column<4;column++)outfits.push(await normalized("public/tichu-avatar-outfits-v2.webp",{left:column*256,top,width:256,height},{width:360,height:145,top:367}));
await sheet(outfits,4,"public/tichu-avatar-outfits-v3.webp");

const accessories=[await empty()];
const accessorySources=[[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2],[0,3],[1,3],[2,3],[3,3]];
for(let i=0;i<accessorySources.length;i++){
 const[column,row]=accessorySources[i],faceItem=i>=13;
 accessories.push(await normalized("public/tichu-avatar-funny-accessories-v2.webp",{left:column*256,top:row*256,width:256,height:256},faceItem?{width:300,height:150,top:190}:{width:380,height:195,top:0}));
}
await sheet(accessories,4,"public/tichu-avatar-accessories-v3.webp");

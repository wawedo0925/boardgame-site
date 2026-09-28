export async function optimizeImage(file:File,{maxWidth=1600,maxHeight=1600,quality=.82}:{maxWidth?:number;maxHeight?:number;quality?:number}={}) {
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error('JPG, PNG, WEBP 이미지만 등록할 수 있습니다.');
  if(file.size>10*1024*1024)throw new Error('사진 크기는 10MB 이하여야 합니다.');
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,maxWidth/bitmap.width,maxHeight/bitmap.height);
  const width=Math.max(1,Math.round(bitmap.width*scale));
  const height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d');
  if(!context){bitmap.close();throw new Error('사진을 처리하지 못했습니다.');}
  context.drawImage(bitmap,0,0,width,height);bitmap.close();
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality));
  if(!blob)throw new Error('사진을 변환하지 못했습니다.');
  const base=file.name.replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9가-힣_-]/g,'-')||'image';
  return new File([blob],`${base}.webp`,{type:'image/webp',lastModified:Date.now()});
}

import sharp from "sharp";

const source = "public/tichu-avatar-hair-mask-v4-raw.png";
const target = "public/tichu-avatar-hair-mask-v4.png";
const {data, info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const output = Buffer.alloc(info.width * info.height * 4);

for (let row = 0; row < 4; row++) {
  const top = Math.round(row * info.height / 4);
  const bottom = Math.round((row + 1) * info.height / 4);
  for (let column = 0; column < 4; column++) {
    const left = Math.round(column * info.width / 4);
    const right = Math.round((column + 1) * info.width / 4);
    const width = right - left;
    const height = bottom - top;
    const active = new Uint8Array(width * height);
    const seen = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sourceIndex = ((top + y) * info.width + left + x) * 4;
      const light = (data[sourceIndex] + data[sourceIndex + 1] + data[sourceIndex + 2]) / 3;
      if (data[sourceIndex + 3] > 128 && light > 190) active[y * width + x] = 1;
    }

    const components = [];
    for (let start = 0; start < active.length; start++) {
      if (!active[start] || seen[start]) continue;
      const pixels = [];
      const queue = [start];
      seen[start] = 1;
      for (let head = 0; head < queue.length; head++) {
        const current = queue[head];
        pixels.push(current);
        const x = current % width;
        const y = Math.floor(current / width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (active[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
        }
      }
      components.push(pixels);
    }

    components.sort((a,b)=>b.length-a.length);
    const cutoff = Math.max(350, (components[0]?.length || 0) * .035);
    for (const component of components.filter((pixels, index)=>index < 4 && pixels.length >= cutoff)) {
      for (const pixel of component) {
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const outputIndex = ((top + y) * info.width + left + x) * 4;
        output[outputIndex] = 255;
        output[outputIndex + 1] = 255;
        output[outputIndex + 2] = 255;
        output[outputIndex + 3] = 255;
      }
    }
  }
}

await sharp(output, {raw:{width:info.width,height:info.height,channels:4}}).png().toFile(target);
console.log(`Created ${target}`);

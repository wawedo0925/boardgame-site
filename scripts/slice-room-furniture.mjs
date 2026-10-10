import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const source = path.join(root, "public", "hideout", "room-items-sheet.png");
const output = path.join(root, "public", "hideout", "room-items");
const names = ["shelf", "sofa", "table", "frames", "clock", "sconce"];
const metadata = await sharp(source).metadata();
await fs.mkdir(output, { recursive: true });

for (let index = 0; index < names.length; index += 1) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const left = Math.floor((col * metadata.width) / 3);
  const top = Math.floor((row * metadata.height) / 2);
  const right = Math.floor(((col + 1) * metadata.width) / 3);
  const bottom = Math.floor(((row + 1) * metadata.height) / 2);
  const { data, info } = await sharp(source).extract({ left, top, width: right - left, height: bottom - top }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const seen = new Uint8Array(info.width * info.height);
  const queue = new Int32Array(info.width * info.height);
  let head = 0; let tail = 0;
  const add = (pixel) => { if (!seen[pixel]) { seen[pixel] = 1; queue[tail++] = pixel; } };
  for (let x = 0; x < info.width; x += 1) { add(x); add((info.height - 1) * info.width + x); }
  for (let y = 0; y < info.height; y += 1) { add(y * info.width); add(y * info.width + info.width - 1); }
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % info.width; const y = Math.floor(pixel / info.width);
    const base = pixel * 4;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue;
      const next = ny * info.width + nx;
      if (seen[next]) continue;
      const at = next * 4;
      const delta = Math.abs(data[base] - data[at]) + Math.abs(data[base + 1] - data[at + 1]) + Math.abs(data[base + 2] - data[at + 2]);
      if (delta <= 16) add(next);
    }
  }
  for (let pixel = 0; pixel < seen.length; pixel += 1) if (seen[pixel]) data[pixel * 4 + 3] = 0;
  await sharp(data, { raw: info }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(path.join(output, `${names[index]}.png`));
}

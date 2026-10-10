import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const input = path.join(root, "public", "hideout", "furniture-sprites-v1.png");
const output = path.join(root, "public", "hideout", "furniture");
const names = ["chair-green", "chair-sofa", "chair-stool", "lamp-classic", "lamp-lantern", "lamp-candle", "rug-forest", "rug-wine", "rug-night", "plant-monstera", "plant-flower", "plant-cactus"];
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const labels = new Int16Array(width * height);
const queue = new Int32Array(width * height);
const components = [];
let label = 0;

for (let start = 0; start < width * height; start += 1) {
  if (labels[start] || data[start * 4 + 3] < 8) continue;
  label += 1; let head = 0; let tail = 0; let count = 0; let sumX = 0; let sumY = 0;
  queue[tail++] = start; labels[start] = label;
  while (head < tail) {
    const pixel = queue[head++]; const x = pixel % width; const y = Math.floor(pixel / width);
    count += 1; sumX += x; sumY += y;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue;
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = ny * width + nx;
      if (!labels[next] && data[next * 4 + 3] >= 8) { labels[next] = label; queue[tail++] = next; }
    }
  }
  components[label] = { count, cx: sumX / count, cy: sumY / count };
}

await fs.mkdir(output, { recursive: true });
for (let index = 0; index < names.length; index += 1) {
  const owned = new Set();
  for (let id = 1; id < components.length; id += 1) {
    const component = components[id]; if (!component || component.count < 6) continue;
    let nearest = 0; let nearestDistance = Infinity;
    for (let cell = 0; cell < 12; cell += 1) {
      const x = (((cell % 3) + .5) * width) / 3; const y = ((Math.floor(cell / 3) + .5) * height) / 4;
      const distance = (component.cx - x) ** 2 + (component.cy - y) ** 2;
      if (distance < nearestDistance) { nearest = cell; nearestDistance = distance; }
    }
    if (nearest === index) owned.add(id);
  }
  const pixels = Buffer.from(data);
  for (let pixel = 0; pixel < width * height; pixel += 1) if (!owned.has(labels[pixel])) pixels[pixel * 4 + 3] = 0;
  await sharp(pixels, { raw: { width, height, channels: 4 } }).trim({ background: { r:0,g:0,b:0,alpha:0 } }).resize(512,512,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toFile(path.join(output, `${names[index]}.png`));
}

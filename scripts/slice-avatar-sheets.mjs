import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sheets = ["full", "hair", "hats", "tops", "bottoms", "shoes"];

for (const category of sheets) {
  const input = path.join(root, "public", "avatars", "sheets", `${category}.png`);
  const output = path.join(root, "public", "avatars", category);
  await fs.mkdir(output, { recursive: true });
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Invalid sheet: ${input}`);

  for (let index = 0; index < 16; index += 1) {
    const target = path.join(output, `${String(index + 1).padStart(2, "0")}.png`);
    if (category === "hats" && ![5, 12, 13, 14].includes(index)) {
      await sharp({ create: { width: 384, height: 384, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .png()
        .toFile(target);
      continue;
    }
    const column = index % 4;
    const row = Math.floor(index / 4);
    const left = Math.floor((column * metadata.width) / 4);
    const top = Math.floor((row * metadata.height) / 4);
    const right = Math.floor(((column + 1) * metadata.width) / 4);
    const bottom = Math.floor(((row + 1) * metadata.height) / 4);
    let image = sharp(input)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize(384, 384, { fit: "fill" });
    if (category === "hats" && index === 14) {
      image = image.composite([{ input: { create: { width: 12, height: 384, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }, left: 0, top: 0, blend: "dest-out" }]);
    }
    await image.png().toFile(target);
  }
}

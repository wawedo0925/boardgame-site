import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sheets = ["full", "hair", "tops", "bottoms", "shoes"];

for (const category of sheets) {
  const input = path.join(root, "public", "avatars", "sheets", `${category}.png`);
  const output = path.join(root, "public", "avatars", category);
  await fs.mkdir(output, { recursive: true });
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Invalid sheet: ${input}`);

  for (let index = 0; index < 16; index += 1) {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const left = Math.floor((column * metadata.width) / 4);
    const top = Math.floor((row * metadata.height) / 4);
    const right = Math.floor(((column + 1) * metadata.width) / 4);
    const bottom = Math.floor(((row + 1) * metadata.height) / 4);
    await sharp(input)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize(384, 384, { fit: "fill" })
      .png()
      .toFile(path.join(output, `${String(index + 1).padStart(2, "0")}.png`));
  }
}

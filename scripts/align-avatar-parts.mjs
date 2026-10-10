import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const canvas = 384;
const layouts = {
  hair: { width: 300, height: 250, top: 12 },
  hats: { width: 300, height: 210, top: 8 },
  tops: { width: 205, height: 125, top: 160 },
  bottoms: { width: 190, height: 100, top: 246 },
  shoes: { width: 155, height: 68, top: 313 },
};

for (const [category, layout] of Object.entries(layouts)) {
  const inputDirectory = path.join(root, "public", "avatars", category);
  const outputDirectory = path.join(root, "public", "avatars", "aligned", category);
  await fs.mkdir(outputDirectory, { recursive: true });

  for (let index = 1; index <= 16; index += 1) {
    const filename = `${String(index).padStart(2, "0")}.png`;
    const input = path.join(inputDirectory, filename);
    const output = path.join(outputDirectory, filename);
    const { data, info } = await sharp(input).ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
    const scale = Math.min(layout.width / info.width, layout.height / info.height);
    const width = Math.max(1, Math.round(info.width * scale));
    const height = Math.max(1, Math.round(info.height * scale));
    const resized = await sharp(data).resize(width, height, { fit: "fill" }).png().toBuffer();
    const left = Math.round((canvas - width) / 2);
    const top = layout.top + Math.round((layout.height - height) / 2);
    await sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: resized, left, top }])
      .png()
      .toFile(output);
  }
}

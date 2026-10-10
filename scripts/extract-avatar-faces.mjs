import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sources = [
  "tichu-avatar-presets-v4.png", "tichu-avatar-presets-wink-v4.png",
  "tichu-avatar-presets-laugh-v4.png", "tichu-avatar-presets-surprised-v4.png",
  "tichu-avatar-presets-angry-v4.png", "tichu-avatar-presets-sad-v4.png",
  "tichu-avatar-presets-playful-v4.png", "tichu-avatar-presets-sleepy-v4.png",
];
const outputDirectory = path.join(root, "public", "avatars", "faces");
await fs.mkdir(outputDirectory, { recursive: true });

for (let index = 0; index < sources.length; index += 1) {
  const input = path.join(root, "public", sources[index]);
  const metadata = await sharp(input).metadata();
  const cellLeft = Math.floor((3 * metadata.width) / 4);
  const cellRight = metadata.width;
  const face = await sharp(input)
    .extract({ left: cellLeft + 58, top: 103, width: cellRight - cellLeft - 116, height: 142 })
    .resize(150, 108, { fit: "fill" })
    .composite([{ input: Buffer.from(`<svg width="150" height="108"><ellipse cx="75" cy="54" rx="73" ry="52" fill="white"/></svg>`), blend: "dest-in" }])
    .png()
    .toBuffer();
  await sharp({ create: { width: 384, height: 384, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: face, left: 117, top: 52 }])
    .png()
    .toFile(path.join(outputDirectory, `${String(index + 1).padStart(2, "0")}.png`));
}

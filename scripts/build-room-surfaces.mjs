import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const themes = ["walnut-parquet", "forest-oak", "cream-stone"];
const wallsDirectory = path.join(root, "public", "hideout", "walls");
const floorsDirectory = path.join(root, "public", "hideout", "floors");
await fs.mkdir(wallsDirectory, { recursive: true });
await fs.mkdir(floorsDirectory, { recursive: true });

for (const theme of themes) {
  const input = path.join(root, "public", "hideout", "rooms", `${theme}.png`);
  const { width = 1254, height = 1254 } = await sharp(input).metadata();
  const floorPoints = `0,${height * .68} ${width * .03},${height * .515} ${width * .5},${height * .34} ${width * .97},${height * .515} ${width},${height * .68} ${width * .56},${height * .955} ${width * .44},${height * .955}`;
  const wallPoints = `${width * .002},${height * .16} ${width * .5},0 ${width * .998},${height * .16} ${width * .97},${height * .515} ${width * .5},${height * .34} ${width * .03},${height * .515}`;
  const mask = (points) => Buffer.from(`<svg width="${width}" height="${height}"><polygon points="${points}" fill="white"/></svg>`);
  await sharp(input).ensureAlpha().composite([{ input: mask(floorPoints), blend: "dest-in" }]).png().toFile(path.join(floorsDirectory, `${theme}.png`));
  await sharp(input).ensureAlpha().composite([{ input: mask(wallPoints), blend: "dest-in" }]).png().toFile(path.join(wallsDirectory, `${theme}.png`));
}

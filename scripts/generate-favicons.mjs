import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import toIco from "to-ico";

const root = process.cwd();
const srcSvgPath = path.join(root, "public", "fieldbase-logo-mark.svg");
const outDir = path.join(root, "public");

async function buildPng(size, fileName) {
  const input = await readFile(srcSvgPath);
  const output = await sharp(input, { density: 512 })
    .resize(size, size, { fit: "contain" })
    .png({ compressionLevel: 9, quality: 100, adaptiveFiltering: true })
    .toBuffer();

  const outPath = path.join(outDir, fileName);
  await writeFile(outPath, output);
  return output;
}

async function main() {
  const png16 = await buildPng(16, "favicon-16x16.png");
  const png32 = await buildPng(32, "favicon-32x32.png");
  await buildPng(180, "apple-touch-icon.png");

  const icoBuffer = await toIco([png16, png32]);
  await writeFile(path.join(outDir, "favicon.ico"), icoBuffer);

  console.log("Generated favicon.ico, favicon-32x32.png, favicon-16x16.png, apple-touch-icon.png");
}

main().catch((error) => {
  console.error("Favicon generation failed:", error);
  process.exitCode = 1;
});

#!/usr/bin/env node
/**
 * Generate public/og-default.png (1200x630) for Open Graph / Twitter cards.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const logoPath = path.join(root, "public", "fieldbase-logo-mark.svg");
const outPath = path.join(root, "public", "og-default.png");

const svgOverlay = `
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a"/>
      <stop offset="100%" style="stop-color:#1e3a5f"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="600" y="280" text-anchor="middle" font-family="system-ui,sans-serif" font-size="72" font-weight="800" fill="#ffffff">FieldBase</text>
  <text x="600" y="360" text-anchor="middle" font-family="system-ui,sans-serif" font-size="32" font-weight="500" fill="#94a3b8">Run your contracting business in one place</text>
</svg>`;

async function main() {
  const logo = await readFile(logoPath);
  const logoPng = await sharp(logo, { density: 300 })
    .resize(140, 140)
    .png()
    .toBuffer();

  const base = await sharp(Buffer.from(svgOverlay)).png().toBuffer();

  await sharp(base)
    .composite([{ input: logoPng, top: 120, left: 530 }])
    .png()
    .toFile(outPath);

  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

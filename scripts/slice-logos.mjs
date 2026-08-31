import sharp from "sharp";

/**
 * Slices public/brand/company-logos.png (a 3x2 contact sheet on white) into
 * per-entity logo PNGs. Grid bounds were detected by scripts/analyze-logos.mjs.
 * Re-run after replacing the source sheet:  node scripts/slice-logos.mjs
 */

const SRC = "public/brand/company-logos.png";
const COLS = [
  [143, 690], // RGL tagline "Experience makes perfect" runs past the detected ink edge
  [773, 1164],
  [1319, 1774],
];
const ROWS = [
  [206, 531],
  [617, 858],
];
const PAD = 14;

const CELLS = [
  { code: "pre", col: 0, row: 0 },
  { code: "iws-wordmark", col: 1, row: 0 },
  { code: "port", col: 2, row: 0 },
  { code: "rgl", col: 0, row: 1 },
  { code: "ggb", col: 1, row: 1 },
  { code: "rgt", col: 2, row: 1 },
];

const meta = await sharp(SRC).metadata();

for (const { code, col, row } of CELLS) {
  const [x0, x1] = COLS[col];
  const [y0, y1] = ROWS[row];
  const left = Math.max(0, x0 - PAD);
  const top = Math.max(0, y0 - PAD);
  const width = Math.min(meta.width - left, x1 - x0 + PAD * 2);
  const height = Math.min(meta.height - top, y1 - y0 + PAD * 2);

  // Two stages: sharp's .trim() misbehaves when chained straight after .extract().
  const cell = await sharp(SRC).extract({ left, top, width, height }).png().toBuffer();

  await sharp(cell)
    .trim({ threshold: 12 })
    .resize({ width: 640, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(`public/brand/${code}.png`);

  console.log(`public/brand/${code}.png`);
}

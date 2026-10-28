// Regenerates the installable-app icons from the IWS logo:  node scripts/make-pwa-icons.mjs
import sharp from "sharp";

const SRC = "public/brand/iws.png";
const BG = "#ffffff";

/** Logo centred on a solid square. `fill` = how much of the square the logo takes. */
async function icon(size, fill, out) {
  const inner = Math.round(size * fill);
  const logo = await sharp(SRC).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(out);
  console.log("wrote", out);
}

await icon(192, 0.8, "public/icons/icon-192.png");
await icon(512, 0.8, "public/icons/icon-512.png");
// Maskable: Android may crop to a circle — keep the logo inside the central 60% safe zone.
await icon(512, 0.6, "public/icons/icon-maskable-512.png");
// iOS ignores transparency (paints black), so it gets a solid background too.
await icon(180, 0.8, "public/icons/apple-touch-icon.png");

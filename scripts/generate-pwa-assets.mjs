// One-time PWA asset generator. Rasterises public/logo.svg into the PNG icons,
// maskable icon, apple-touch-icon, favicons and iOS splash screens that iOS/Android
// home-screen installs need. Re-run with: bun run scripts/generate-pwa-assets.mjs
import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const iconsDir = join(pub, "icons");
const splashDir = join(pub, "splash");

const LIGHT_BG = { r: 255, g: 255, b: 255, alpha: 1 };

const svg = await readFile(join(pub, "logo.svg"));
await mkdir(iconsDir, { recursive: true });
await mkdir(splashDir, { recursive: true });

// Render the logo (transparent background) at an exact pixel size.
async function logoAt(size) {
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// Logo centred on a solid background, at `ratio` of the canvas.
async function padded(canvas, ratio, bg = LIGHT_BG) {
  const logo = await logoAt(Math.round(canvas * ratio));
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
}

// Transparent-corner icons (manifest "any" + standalone use).
for (const size of [192, 512]) {
  await writeFile(join(iconsDir, `icon-${size}.png`), await logoAt(size));
}
// Maskable: full-bleed background, logo inside the safe zone (~72%).
await writeFile(join(iconsDir, "maskable-512.png"), await padded(512, 0.72));
// Apple touch icon: opaque (iOS dislikes transparency), iOS rounds it itself.
await writeFile(join(pub, "apple-touch-icon.png"), await padded(180, 0.8));
// Favicons.
for (const size of [16, 32]) {
  await writeFile(join(iconsDir, `favicon-${size}.png`), await logoAt(size));
}

// iOS splash screens. width/height are device pixels; dw/dh are CSS points
// (used to build the media query). Logo is centred on a white canvas.
const splashes = [
  { w: 1320, h: 2868, dw: 440, dh: 956, dpr: 3 }, // 16 Pro Max
  { w: 1206, h: 2622, dw: 402, dh: 874, dpr: 3 }, // 16 Pro
  { w: 1290, h: 2796, dw: 430, dh: 932, dpr: 3 }, // 15/14 Pro Max
  { w: 1179, h: 2556, dw: 393, dh: 852, dpr: 3 }, // 15/14 Pro
  { w: 1170, h: 2532, dw: 390, dh: 844, dpr: 3 }, // 14/13/12
  { w: 1125, h: 2436, dw: 375, dh: 812, dpr: 3 }, // 13 mini/X/XS
  { w: 1242, h: 2688, dw: 414, dh: 896, dpr: 3 }, // XS Max/11 Pro Max
  { w: 828, h: 1792, dw: 414, dh: 896, dpr: 2 }, // XR/11
  { w: 750, h: 1334, dw: 375, dh: 667, dpr: 2 }, // SE/8/7/6s
  { w: 1242, h: 2208, dw: 414, dh: 736, dpr: 3 }, // 8 Plus
  { w: 2048, h: 2732, dw: 1024, dh: 1366, dpr: 2 }, // iPad Pro 12.9
  { w: 1668, h: 2388, dw: 834, dh: 1194, dpr: 2 }, // iPad Pro 11
  { w: 1640, h: 2360, dw: 820, dh: 1180, dpr: 2 }, // iPad Air
  { w: 1536, h: 2048, dw: 768, dh: 1024, dpr: 2 }, // iPad 10.2
];

const links = [];
for (const s of splashes) {
  const file = `apple-splash-${s.w}x${s.h}.png`;
  const logoPx = Math.round(Math.min(s.w, s.h) * 0.28);
  const logo = await logoAt(logoPx);
  await sharp({ create: { width: s.w, height: s.h, channels: 4, background: LIGHT_BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(join(splashDir, file));
  links.push(
    `<link rel="apple-touch-startup-image" href="/splash/${file}" ` +
      `media="(device-width: ${s.dw}px) and (device-height: ${s.dh}px) and ` +
      `(-webkit-device-pixel-ratio: ${s.dpr}) and (orientation: portrait)" />`
  );
}

// Emit the startup-image data so layout.tsx metadata can be wired by hand.
await writeFile(
  join(root, "scripts", "apple-splash-links.html"),
  links.join("\n") + "\n"
);

console.log(
  `Generated icons (192/512/maskable/apple-touch/favicons) and ${splashes.length} splash screens.`
);

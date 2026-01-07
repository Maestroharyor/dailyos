// Script to generate PWA icons
// Run: node scripts/generate-icons.js
// Requires: npm install sharp (optional, for production icons)

const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, '../public/icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Generate SVG template
function generateSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#gradient)"/>
  <text x="${size / 2}" y="${size * 0.6}" font-family="Arial, sans-serif" font-size="${size * 0.375}" font-weight="bold" fill="white" text-anchor="middle">OS</text>
  <defs>
    <linearGradient id="gradient" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3B82F6"/>
      <stop offset="1" stop-color="#8B5CF6"/>
    </linearGradient>
  </defs>
</svg>`;
}

// Generate placeholder icons as SVG files (can be converted to PNG later)
sizes.forEach(size => {
  const svg = generateSVG(size);
  const filename = `icon-${size}x${size}.svg`;
  fs.writeFileSync(path.join(iconsDir, filename), svg);
  console.log(`Generated ${filename}`);
});

console.log('\nPlaceholder icons generated!');
console.log('For production, convert SVGs to PNGs using tools like sharp, ImageMagick, or online converters.');

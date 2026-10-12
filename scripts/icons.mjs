// Render the PNG app icons from public/icon.svg. Run with: npm run icons
// sharp is not a project dependency; it comes with wrangler. Use any copy.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url));
const out = [
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512], // same art; it already fits the safe zone
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180]   // iOS rounds the corners itself
];
for (const [name, size] of out) {
  await sharp(svg, { density: 300 }).resize(size, size).png({ compressionLevel: 9 })
    .toFile(new URL(`../public/${name}`, import.meta.url).pathname);
  console.log(`public/${name} ${size}px`);
}

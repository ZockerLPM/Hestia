// Erzeugt PNG-Icons aus public/icons/source.svg.
// Einmal aufrufen: `npm run icons` (oder `node scripts/generate-icons.mjs`).
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(here, '..', 'public', 'icons');
const svg = readFileSync(resolve(iconsDir, 'source.svg'));

async function render(size, name, options = {}) {
  const out = resolve(iconsDir, name);
  const pipeline = sharp(svg, { density: 384 }).resize(size, size);
  if (options.padding) {
    const padded = Math.round(size * (1 - options.padding));
    await sharp({
      create: {
        width: size, height: size, channels: 4,
        background: { r: 99, g: 102, b: 241, alpha: 1 },
      },
    })
      .composite([{ input: await pipeline.resize(padded, padded).png().toBuffer(), gravity: 'center' }])
      .png()
      .toFile(out);
  } else {
    await pipeline.png().toFile(out);
  }
  console.log(`✓ ${name}`);
}

await Promise.all([
  render(192, 'icon-192.png'),
  render(512, 'icon-512.png'),
  render(512, 'icon-512-maskable.png', { padding: 0.2 }),
  render(180, 'apple-touch-icon.png'),
]);

console.log('Done.');

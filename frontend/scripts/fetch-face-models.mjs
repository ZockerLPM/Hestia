// Lädt die face-api.js Modelle nach public/models/.
// Nur einmal nötig: `npm run face:models`
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '..', 'public', 'models');
if (!existsSync(target)) await mkdir(target, { recursive: true });

const BASE = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model';
const files = [
  // Tiny Face Detector — ~190 KB, RPi-tauglich
  'tiny_face_detector_model-weights_manifest.json',
  'tiny_face_detector_model.bin',
  // Landmarks 68 (kompakt)
  'face_landmark_68_model-weights_manifest.json',
  'face_landmark_68_model.bin',
  // Recognition (für Descriptor-Vergleich)
  'face_recognition_model-weights_manifest.json',
  'face_recognition_model.bin',
];

for (const f of files) {
  const out = resolve(target, f);
  if (existsSync(out)) {
    console.log(`✓ ${f} (existiert)`);
    continue;
  }
  process.stdout.write(`↓ ${f}…`);
  const resp = await fetch(`${BASE}/${f}`);
  if (!resp.ok) {
    console.error(` Fehler: ${resp.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile(out, buf);
  console.log(` (${(buf.length / 1024).toFixed(1)} KB)`);
}
console.log('Fertig — Modelle liegen in public/models/');

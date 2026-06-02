#!/usr/bin/env node
/* BLOCKPOSE build — inlines the skinview3d bundle + app.js into template.html
   to produce a single self-contained blockpose.html (no build step, no deps
   at runtime). Run:  node build.js                                          */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

const template = fs.readFileSync(path.join(root, 'src', 'template.html'), 'utf8');
const bundle   = fs.readFileSync(path.join(root, 'vendor', 'skinview3d.bundle.js'), 'utf8');
const app      = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');

// split/join (not String.replace) so '$' sequences in the bundle aren't treated
// as replacement patterns
let out = template.split('__SKINVIEW3D_BUNDLE__').join(bundle);
out = out.split('__APP_JS__').join(app);

if (out.includes('__SKINVIEW3D_BUNDLE__') || out.includes('__APP_JS__')) {
  console.error('Build failed: placeholder tokens still present.');
  process.exit(1);
}

const dest = path.join(root, 'blockpose.html');
fs.writeFileSync(dest, out);
console.log('Built', dest, '(' + Buffer.byteLength(out) + ' bytes)');

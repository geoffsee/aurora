#!/usr/bin/env bun
/** Assemble the isolated Worker-hosted audience renderer under dist/viewer. */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const out = join(root, 'dist', 'viewer');
mkdirSync(out, { recursive: true });

let html = readFileSync(join(root, 'web', 'index.html'), 'utf8');
html = html
  .replaceAll('./dist/pkg/', './pkg/')
  .replaceAll('./dist/projector-bridge.js', './projector-bridge.js')
  .replaceAll('./dist/vendor/', './vendor/');
writeFileSync(join(out, 'index.html'), html);
cpSync(join(root, 'web', 'styles.css'), join(out, 'styles.css'));

for (const relative of ['pkg', 'vendor', 'api', 'assets']) {
  const source = join(root, 'dist', relative);
  if (existsSync(source)) cpSync(source, join(out, relative), { recursive: true });
}

console.log('[viewer] staged isolated renderer in dist/viewer');

#!/usr/bin/env bun
/** Assemble the isolated Worker-hosted audience renderer under dist/viewer. */

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const out = join(root, 'dist', 'viewer');
const runtimeOut = join(root, 'dist', 'viewer-runtime');
const wasmSource = join(root, 'dist', 'pkg', 'aurora_bg.wasm');
const glueSource = join(root, 'dist', 'pkg', 'aurora.js');

if (!existsSync(wasmSource) || !existsSync(glueSource)) {
  throw new Error('viewer staging requires a completed `bun run build:web`');
}

rmSync(out, { recursive: true, force: true });
rmSync(runtimeOut, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(runtimeOut, { recursive: true });

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

// Cloudflare Static Assets rejects individual files above 25 MiB. Bevy's WASM
// runtime is larger, so keep it in R2 and let the Worker stream it from a
// content-addressed route. The JS glue stays in isolated static assets.
const wasm = readFileSync(wasmSource);
const hash = createHash('sha256').update(wasm).digest('hex').slice(0, 16);
const wasmFile = `aurora-${hash}.wasm`;
const objectKey = `viewer-runtime/${wasmFile}`;
cpSync(wasmSource, join(runtimeOut, wasmFile));
rmSync(join(out, 'pkg', 'aurora_bg.wasm'), { force: true });

const gluePath = join(out, 'pkg', 'aurora.js');
const defaultWasmUrl = "new URL('aurora_bg.wasm', import.meta.url)";
const runtimeWasmUrl = `new URL('/viewer/runtime/${wasmFile}', globalThis.location.origin)`;
const glue = readFileSync(gluePath, 'utf8');
if (!glue.includes(defaultWasmUrl)) {
  throw new Error('wasm-bindgen glue no longer contains the expected default WASM URL');
}
writeFileSync(gluePath, glue.replace(defaultWasmUrl, runtimeWasmUrl));
writeFileSync(
  join(root, 'dist', 'viewer-runtime.json'),
  `${JSON.stringify({ file: wasmFile, objectKey }, null, 2)}\n`,
);

console.log(`[viewer] staged isolated renderer; ${wasmFile} will be served from R2`);

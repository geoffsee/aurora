#!/usr/bin/env bun
/** Build and deploy the relay plus its oversized, content-addressed WASM runtime. */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const bucket = 'aurora-live-show-assets';

async function run(command: string[]): Promise<void> {
  const process = Bun.spawn(command, {
    cwd: root,
    env: Bun.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const status = await process.exited;
  if (status !== 0) throw new Error(`${command.join(' ')} exited with status ${status}`);
}

await run(['bun', 'run', 'build:viewer']);

const manifest = JSON.parse(readFileSync(join(root, 'dist', 'viewer-runtime.json'), 'utf8')) as {
  file: string;
  objectKey: string;
};
const wasmPath = join(root, 'dist', 'viewer-runtime', manifest.file);

await run([
  'bunx',
  'wrangler',
  'r2',
  'object',
  'put',
  `${bucket}/${manifest.objectKey}`,
  '--file',
  wasmPath,
  '--content-type',
  'application/wasm',
  '--cache-control',
  'public, max-age=31536000, immutable',
  '--remote',
  '--force',
]);
await run(['bunx', 'wrangler', 'deploy', '--config', 'worker/wrangler.toml']);

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const destination = join(root, 'dist', 'vendor', 'three-v1');
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(
  join(root, 'node_modules', 'three', 'build', 'three.module.js'),
  join(destination, 'three.module.js'),
);
cpSync(
  join(root, 'node_modules', 'three', 'build', 'three.webgpu.js'),
  join(destination, 'three.webgpu.js'),
);
cpSync(
  join(root, 'node_modules', 'three', 'build', 'three.tsl.js'),
  join(destination, 'three.tsl.js'),
);
cpSync(join(root, 'node_modules', 'three', 'examples', 'jsm'), join(destination, 'addons'), {
  recursive: true,
});

console.log(`staged pinned Three.js vendor modules in ${destination}`);

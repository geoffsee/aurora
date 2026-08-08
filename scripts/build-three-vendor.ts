import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { AURORA_THREE_ALLOWED_IMPORTS } from '../shared/aurora-package.ts';

export const THREE_BUILD_MODULES = [
  'three.core.js',
  'three.module.js',
  'three.webgpu.js',
  'three.tsl.js',
] as const;

const RELATIVE_STATIC_IMPORT = /\b(?:from\s+|import\s+)['"](\.\.?\/[^'"]+)['"]/g;

function javascriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

/** Return relative ESM dependencies that were referenced but not staged. */
export function findMissingRelativeModuleImports(
  root: string,
  entryFiles: string[] = javascriptFiles(root),
): string[] {
  const missing = new Set<string>();
  const pending = entryFiles.map((file) => resolve(root, file));
  const visited = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(RELATIVE_STATIC_IMPORT)) {
      const specifier = match[1];
      if (!specifier) continue;
      const dependency = resolve(dirname(file), specifier);
      if (!existsSync(dependency)) {
        missing.add(`${relative(root, file)} -> ${specifier}`);
      } else if (dependency.endsWith('.js')) {
        pending.push(dependency);
      }
    }
  }
  return [...missing].sort();
}

export function stageThreeVendor(root = resolve(import.meta.dirname, '..')): string {
  const destination = join(root, 'dist', 'vendor', 'three-v1');
  const buildRoot = join(root, 'node_modules', 'three', 'build');
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const file of THREE_BUILD_MODULES) {
    cpSync(join(buildRoot, file), join(destination, file));
  }
  cpSync(join(root, 'node_modules', 'three', 'examples', 'jsm'), join(destination, 'addons'), {
    recursive: true,
  });

  const addonEntries = [...AURORA_THREE_ALLOWED_IMPORTS]
    .filter((specifier) => specifier.startsWith('three/addons/'))
    .map((specifier) => specifier.slice('three/'.length));
  const missing = findMissingRelativeModuleImports(destination, [
    ...THREE_BUILD_MODULES,
    ...addonEntries,
  ]);
  if (missing.length > 0) {
    throw new Error(`incomplete Three.js vendor module graph:\n${missing.join('\n')}`);
  }
  return destination;
}

if (import.meta.main) {
  console.log(`staged pinned Three.js vendor modules in ${stageThreeVendor()}`);
}

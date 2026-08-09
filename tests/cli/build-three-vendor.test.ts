import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  findMissingRelativeModuleImports,
  THREE_BUILD_MODULES,
} from '../../scripts/build-three-vendor.ts';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Three.js vendor staging', () => {
  test('includes the core module required by the browser entry points', () => {
    expect(THREE_BUILD_MODULES).toContain('three.core.js');
  });

  test('detects an incomplete relative module graph', () => {
    const root = mkdtempSync(join(tmpdir(), 'aurora-three-vendor-'));
    temporaryRoots.push(root);
    mkdirSync(join(root, 'nested'));
    writeFileSync(join(root, 'entry.js'), `export { value } from './nested/dependency.js';`);

    expect(findMissingRelativeModuleImports(root)).toEqual(['entry.js -> ./nested/dependency.js']);

    writeFileSync(join(root, 'nested', 'dependency.js'), `export const value = 1;`);
    expect(findMissingRelativeModuleImports(root)).toEqual([]);
  });
});

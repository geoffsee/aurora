/**
 * Guard the single-Three.js-instance invariant.
 *
 * Sketches import `three` through the page import map (dist/vendor/three-v1).
 * If a bundle inlines its own copy too, the page runs two Three.js instances:
 * no error, but constructor identity stops matching across the boundary and the
 * WebGPU renderer's light registry (keyed by `light.constructor`) misses, so
 * lit materials render black. Regression for the imported-Three.js-deck bug.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

/** Bundles that pull in web/three-runtime.ts and therefore must externalize three. */
const THREE_BEARING_BUILDS = ['build:web', 'build:studio'] as const;

describe('three.js is never bundled twice', () => {
  test.each(THREE_BEARING_BUILDS)('%s externalizes three', (script) => {
    const command = pkg.scripts[script];
    expect(command).toBeDefined();
    expect(command).toContain('--external three');
    // `three/webgpu` and `three/tsl` are separate specifiers — the bare
    // `--external three` does not cover them.
    expect(command).toContain('--external three/*');
  });

  test('build:controls stays free of three entirely', () => {
    // The console never mounts a deck; if it starts importing three-runtime it
    // needs the same externals and this test should be updated deliberately.
    expect(pkg.scripts['build:controls']).not.toContain('three');
  });

  test('the runtime imports three by bare specifier so the import map resolves it', () => {
    const source = readFileSync(resolve(REPO_ROOT, 'web/three-runtime.ts'), 'utf8');
    expect(source).toMatch(/^import \{[\s\S]*?\} from 'three';$/m);
    expect(source).toContain("from 'three/webgpu'");
    // A relative or absolute path here would bypass the import map and
    // reintroduce the second copy no matter how the bundle is configured.
    expect(source).not.toMatch(/from '\.[^']*three[^']*'/);
  });

  test('both pages map the bare specifiers to the same vendor tree', () => {
    const projector = readFileSync(resolve(REPO_ROOT, 'web/index.html'), 'utf8');
    const studio = readFileSync(resolve(REPO_ROOT, 'web/studio/index.html'), 'utf8');
    for (const specifier of ['"three"', '"three/webgpu"', '"three/tsl"', '"three/addons/"']) {
      expect(projector).toContain(specifier);
      expect(studio).toContain(specifier);
    }
    // Same tree, different depth: projector is served at the site root, studio
    // one level down at /studio/.
    expect(projector).toContain('"three": "./dist/vendor/three-v1/three.module.js"');
    expect(studio).toContain('"three": "../vendor/three-v1/three.module.js"');
  });

  test('the Pages deploy rewrites the projector map to its flattened layout', () => {
    // On Pages dist/ IS the site root, so ./dist/vendor/ would 404. The deploy
    // workflow seds it to ./vendor/. Now that projector-bridge.js imports three
    // by bare specifier, a broken map fails the page at load, not just when a
    // Three deck is selected — so the two strings have to stay in lockstep.
    const workflow = readFileSync(resolve(REPO_ROOT, '.github/workflows/deploy.yml'), 'utf8');
    expect(workflow).toContain("sed -i 's|./dist/vendor/|./vendor/|g' dist/index.html");
  });
});

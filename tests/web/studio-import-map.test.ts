import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

function readSource(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

function studioImportMap(): Record<string, string> {
  const html = readSource('web/studio/index.html');
  const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (!match?.[1]) throw new Error('web/studio/index.html has no import map');
  return JSON.parse(match[1]).imports as Record<string, string>;
}

/**
 * Three.js sketches are compiled to Blob modules whose `three` imports are
 * rewritten through the document import map (see resolveThreeModuleImports).
 * A vendor URL the studio host does not serve therefore surfaces as
 * "Failed to fetch dynamically imported module: blob:…" rather than a 404, so
 * pin the map to a shape every host actually serves.
 */
describe('studio Three.js import map', () => {
  test('covers the specifiers authored sketches may import', () => {
    expect(Object.keys(studioImportMap()).sort()).toEqual([
      'three',
      'three/addons/',
      'three/tsl',
      'three/webgpu',
    ]);
  });

  test('stays relative so Pages resolves it under the repo subpath', () => {
    for (const target of Object.values(studioImportMap())) {
      expect(target.startsWith('../vendor/three-v1/')).toBe(true);
    }
    // Pages publishes dist/ as the site root: /aurora/studio/ -> /aurora/vendor/.
    expect(
      new URL('../vendor/three-v1/three.module.js', 'https://geoffsee.github.io/aurora/studio/')
        .pathname,
    ).toBe('/aurora/vendor/three-v1/three.module.js');
  });

  test('resolves to /vendor/ when a server hosts the studio at /studio/', () => {
    for (const target of Object.values(studioImportMap())) {
      expect(new URL(target, 'https://localhost:8443/studio/').pathname).toMatch(
        /^\/vendor\/three-v1\//,
      );
    }
  });

  test('every studio host serves /vendor/ from the staged vendor tree', () => {
    // Docker/Caddy and `aurora dev` both proxy the bridge, where dist/ is not
    // the document root — it has to mirror dist/vendor at /vendor/ explicitly.
    const bridge = readSource('bridge/index.ts');
    expect(bridge).toContain('const vendorDistRoot = `${root}/dist/vendor`');
    expect(bridge).toContain("pathname.startsWith('/vendor/')");

    // `bun run studio` serves the same tree from its own dev server.
    expect(readSource('scripts/studio-serve.ts')).toContain("'/vendor/*'");

    // …and both point at what build-three-vendor stages.
    expect(readSource('scripts/build-three-vendor.ts')).toContain(
      "join(root, 'dist', 'vendor', 'three-v1')",
    );
  });
});

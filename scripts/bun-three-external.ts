/**
 * Keep Three.js out of dev-server bundles.
 *
 * `bun build` takes `--external three --external three/*` (see build:web /
 * build:studio in package.json), but Bun's HTML dev server — `import homepage
 * from '...index.html'` in scripts/studio-serve.ts — has no equivalent flag. It
 * would inline its own Three.js while authored sketches resolve `three` through
 * the page import map to dist/vendor/three-v1, giving the page two instances.
 *
 * Two instances render without erroring, but constructor identity stops
 * matching across them, so the WebGPU light registry (keyed by
 * `light.constructor`) misses and lit materials go black. See
 * tests/web/three-dedupe.test.ts and the note atop web/three-runtime.ts.
 *
 * Wired up by bunfig.toml `[serve.static] plugins`.
 */

import type { BunPlugin } from 'bun';

/** `three`, `three/webgpu`, `three/tsl`, `three/addons/…` — nothing else. */
const THREE_SPECIFIER = /^three(\/.*)?$/;

const threeExternal: BunPlugin = {
  name: 'aurora:three-external',
  setup(build) {
    build.onResolve({ filter: THREE_SPECIFIER }, (args) => ({
      path: args.path,
      external: true,
    }));
  },
};

export default threeExternal;

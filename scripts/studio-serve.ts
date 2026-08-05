/**
 * Serve Aurora Preset Studio (React + WebGPU look authoring).
 *
 * Dev:  bun run studio          → http://127.0.0.1:3010 with HMR when supported
 * Build: bun run build:studio   → dist/studio
 *
 * Export writes .aurora-look locally. "Import to Aurora" POSTs to the bridge
 * (default http://127.0.0.1:3000/api/looks/import) — requires AURORA_DATA_DIR.
 */

import homepage from '../web/studio/index.html';

const port = Number(Bun.env.STUDIO_PORT ?? 3010);
const hostname = Bun.env.STUDIO_HOST ?? '127.0.0.1';

const server = Bun.serve({
  port,
  hostname,
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    '/': homepage,
  },
  fetch() {
    return new Response('Not found', { status: 404 });
  },
});

console.log(`Aurora Preset Studio → ${server.url}`);
console.log('Export .aurora-look from the toolbar; Import needs bridge + AURORA_DATA_DIR.');

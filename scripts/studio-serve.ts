/**
 * Serve Aurora Preset Studio (React + WebGPU package authoring).
 *
 * Dev:  bun run studio          → http://127.0.0.1:3010 with HMR when supported
 * Build: bun run build:studio   → dist/studio
 *
 * Export downloads `.aurora-package`. "Import to Aurora" POSTs to the bridge
 * (default http://127.0.0.1:3000/api/packages/import) — requires AURORA_DATA_DIR.
 */

import { join, resolve } from 'node:path';
import homepage from '../web/studio/index.html';

const port = Number(Bun.env.STUDIO_PORT ?? 3010);
const hostname = Bun.env.STUDIO_HOST ?? '127.0.0.1';
const vendorRoot = resolve(import.meta.dirname, '../dist/vendor');

const server = Bun.serve({
  port,
  hostname,
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    '/': homepage,
    '/vendor/*': (request) => {
      const relative = new URL(request.url).pathname.slice('/vendor/'.length);
      if (!relative || relative.includes('..') || relative.includes('\\')) {
        return new Response('Bad path', { status: 400 });
      }
      return new Response(Bun.file(join(vendorRoot, ...relative.split('/'))));
    },
  },
  fetch() {
    return new Response('Not found', { status: 404 });
  },
});

console.log(`Aurora Preset Studio → ${server.url}`);
console.log('Export .aurora-package from the toolbar; Import needs bridge + AURORA_DATA_DIR.');

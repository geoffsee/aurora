import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  BRIDGE_CONTROLS_PORT,
  BRIDGE_PROJECTOR_PORT,
  CONTROLS_SITE_PROXIED_PATHS,
  renderCaddyfile,
} from '../../cli/caddyfile.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const ENTRYPOINT = readFileSync(resolve(REPO_ROOT, 'deploy/entrypoint.sh'), 'utf8');

/** Body of the `$ctrl { … }` site block in the rendered Caddyfile. */
function controlsSiteBlock(body: string): string {
  const start = body.indexOf(':8444');
  expect(start).toBeGreaterThan(-1);
  const open = body.indexOf('{', start);
  const close = body.indexOf('\n}', open);
  return body.slice(open, close);
}

describe('controls-origin API routing', () => {
  test('the Console fetches these same-origin, so both proxies must forward them', () => {
    // Regression: the Console reads /api/modes/* from its own origin because the
    // bridge sends no CORS headers. Dropping these routes makes the mode catalog
    // 404 on :8444 and the launchpad comes up empty.
    expect(CONTROLS_SITE_PROXIED_PATHS).toEqual([
      '/api/modes/*',
      '/api/packages/import',
      '/api/auth/*',
    ]);
  });

  test('native Caddyfile sends them to the visual server, not the controls server', () => {
    const block = controlsSiteBlock(renderCaddyfile(['192.168.1.10']));
    for (const path of CONTROLS_SITE_PROXIED_PATHS) {
      expect(block).toContain(`handle ${path} {`);
    }
    // Everything else still belongs to the controls server.
    expect(block).toContain(`handle {\n\t\treverse_proxy 127.0.0.1:${BRIDGE_CONTROLS_PORT}`);
    expect(block.match(/reverse_proxy 127\.0\.0\.1:13000/g)).toHaveLength(
      CONTROLS_SITE_PROXIED_PATHS.length,
    );
  });

  test('the Docker entrypoint renders the same routes', () => {
    // deploy/entrypoint.sh writes its own Caddyfile at container start, so it
    // does not import cli/caddyfile.ts — the two drift silently otherwise.
    for (const path of CONTROLS_SITE_PROXIED_PATHS) {
      expect(ENTRYPOINT).toContain(`handle ${path} {`);
    }
    expect(ENTRYPOINT).toContain(`reverse_proxy 127.0.0.1:${BRIDGE_PROJECTOR_PORT}`);
    expect(ENTRYPOINT).toContain(`reverse_proxy 127.0.0.1:${BRIDGE_CONTROLS_PORT}`);
  });

  test('the projector site stays a plain passthrough', () => {
    const body = renderCaddyfile([]);
    const projectorSite = body.slice(body.indexOf(':8443'), body.indexOf(':8444'));
    expect(projectorSite).toContain(`reverse_proxy 127.0.0.1:${BRIDGE_PROJECTOR_PORT}`);
    expect(projectorSite).not.toContain('handle ');
  });
});

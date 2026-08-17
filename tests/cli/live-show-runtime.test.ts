import { describe, expect, test } from 'vitest';
import {
  CLOUDFLARED_IMAGE,
  cloudflaredDockerArgs,
  externalGatewayDockerArgs,
} from '../../cli/aurora.ts';
import { renderCaddyfile } from '../../cli/caddyfile.ts';
import {
  CLOUDFLARED_VERSION,
  cloudflaredAssetForHost,
  cloudflaredDownloadUrl,
} from '../../cli/vendor-cloudflared.ts';

describe('live-show tunnel runtime', () => {
  test('pins the same cloudflared release for Docker and native assets', () => {
    expect(CLOUDFLARED_IMAGE).toBe(`cloudflare/cloudflared:${CLOUDFLARED_VERSION}`);
    const darwin = cloudflaredAssetForHost('darwin', 'arm64');
    const linux = cloudflaredAssetForHost('linux', 'x64');
    expect(darwin.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(linux.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(cloudflaredDownloadUrl(linux)).toContain(CLOUDFLARED_VERSION);
  });

  test('Docker connector joins the dedicated network and uses a token-driven named tunnel', () => {
    const args = cloudflaredDockerArgs('tunnel-token');
    expect(args).toContain('--network');
    expect(args).toContain('aurora-live');
    expect(args).toContain('--no-autoupdate');
    expect(args.slice(-2)).toEqual(['--token', 'tunnel-token']);
    expect(args.join(' ')).not.toContain('latest');
  });

  test('external ingress publishes only the read-only gateway on loopback by default', () => {
    expect(externalGatewayDockerArgs()).toEqual(['-p', '127.0.0.1:18080:18080']);
    expect(externalGatewayDockerArgs('10.20.0.2:18080')).toEqual(['-p', '10.20.0.2:18080:18080']);
  });

  test('gateway is read-only and does not proxy Console, websocket, or write endpoints', () => {
    const body = renderCaddyfile([]);
    const gateway = body.slice(body.indexOf(':18080'));
    expect(gateway).toContain('@write not method GET HEAD');
    expect(gateway).toContain('handle /.well-known/aurora-live-show');
    expect(gateway).toContain('handle /api/modes/*');
    expect(gateway).not.toContain('handle /ws');
    expect(gateway).not.toContain('handle /controls');
    expect(gateway).not.toContain('handle /studio');
    expect(gateway).not.toContain('handle /dist/*');
    expect(gateway).toContain('handle /dist/pkg/*');
    expect(gateway).not.toContain('handle /api/packages/import');
  });
});

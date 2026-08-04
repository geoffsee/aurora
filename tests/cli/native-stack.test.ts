import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parseArgs } from '../../cli/args';
import { normalizeTlsHosts, renderCaddyfile } from '../../cli/caddyfile';
import { resolveAppRoot } from '../../cli/native-stack';
import { CADDY_VERSION, caddyAssetForHost, caddyDownloadUrl } from '../../cli/vendor-caddy';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

describe('parseArgs runtimes', () => {
  test('defaults to docker', () => {
    expect(parseArgs(['bun', 'aurora'])).toEqual({
      mode: 'run',
      daemon: false,
      runtime: 'docker',
    });
  });

  test('accepts --native / -n and --daemon together', () => {
    expect(parseArgs(['bun', 'aurora', '--native', '-d'])).toMatchObject({
      mode: 'run',
      daemon: true,
      runtime: 'native',
    });
    expect(parseArgs(['bun', 'aurora', '-n'])).toMatchObject({ runtime: 'native' });
  });

  test('--docker clears native if both appear last-wins', () => {
    expect(parseArgs(['bun', 'aurora', '-n', '--docker']).runtime).toBe('docker');
  });

  test('down command', () => {
    expect(parseArgs(['bun', 'aurora', 'down']).mode).toBe('down');
  });
});

describe('renderCaddyfile', () => {
  test('includes localhost and LAN hosts on 8443/8444', () => {
    const body = renderCaddyfile(['192.168.1.10']);
    expect(body).toContain('https://localhost:8443');
    expect(body).toContain('https://127.0.0.1:8443');
    expect(body).toContain('https://192.168.1.10:8443');
    expect(body).toContain('https://192.168.1.10:8444');
    expect(body).toContain('reverse_proxy 127.0.0.1:13000');
    expect(body).toContain('reverse_proxy 127.0.0.1:13001');
    expect(body).toContain('tls internal');
  });

  test('normalizeTlsHosts dedupes and always keeps loopback', () => {
    expect(normalizeTlsHosts(['localhost', '10.0.0.2', '10.0.0.2'])).toEqual([
      'localhost',
      '127.0.0.1',
      '10.0.0.2',
    ]);
  });
});

describe('vendor-caddy assets', () => {
  test.each([
    ['darwin', 'arm64', `caddy_${CADDY_VERSION}_darwin_arm64.tar.gz`],
    ['darwin', 'x64', `caddy_${CADDY_VERSION}_darwin_amd64.tar.gz`],
    ['linux', 'x64', `caddy_${CADDY_VERSION}_linux_amd64.tar.gz`],
    ['linux', 'arm64', `caddy_${CADDY_VERSION}_linux_arm64.tar.gz`],
    ['win32', 'x64', `caddy_${CADDY_VERSION}_windows_amd64.zip`],
  ] as const)('%s/%s → %s', (platform, arch, filename) => {
    const asset = caddyAssetForHost(platform, arch);
    expect(asset.filename).toBe(filename);
    expect(caddyDownloadUrl(asset)).toContain(filename);
  });

  test('rejects unknown platform', () => {
    expect(() => caddyAssetForHost('freebsd', 'x64')).toThrow(/no vendored Caddy/);
  });
});

describe('resolveAppRoot', () => {
  test('finds the repo from cliDir', () => {
    expect(resolveAppRoot({ cliDir: resolve(REPO_ROOT, 'cli') })).toBe(REPO_ROOT);
  });

  test('honors AURORA_ROOT', () => {
    expect(
      resolveAppRoot({
        cwd: '/tmp',
        cliDir: '/tmp',
        env: { AURORA_ROOT: REPO_ROOT },
      }),
    ).toBe(REPO_ROOT);
  });
});

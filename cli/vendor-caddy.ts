/**
 * Resolve a host-native Caddy binary: reuse cache under cli/.vendor, or download
 * the pinned release for the current os.platform / os.arch.
 */

import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { arch as osArch, platform as osPlatform, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Keep in sync with `caddy:2.10.0-alpine` in the Dockerfile. */
export const CADDY_VERSION = '2.10.0';

export type CaddyAsset = {
  /** GitHub release asset filename (no path). */
  filename: string;
  /** Archive kind after download. */
  kind: 'tar.gz' | 'zip';
  /** Binary name inside the archive / on disk. */
  binaryName: string;
};

const PLATFORM_ASSETS: Record<string, CaddyAsset> = {
  'darwin-arm64': {
    filename: `caddy_${CADDY_VERSION}_darwin_arm64.tar.gz`,
    kind: 'tar.gz',
    binaryName: 'caddy',
  },
  'darwin-x64': {
    filename: `caddy_${CADDY_VERSION}_darwin_amd64.tar.gz`,
    kind: 'tar.gz',
    binaryName: 'caddy',
  },
  'linux-arm64': {
    filename: `caddy_${CADDY_VERSION}_linux_arm64.tar.gz`,
    kind: 'tar.gz',
    binaryName: 'caddy',
  },
  'linux-x64': {
    filename: `caddy_${CADDY_VERSION}_linux_amd64.tar.gz`,
    kind: 'tar.gz',
    binaryName: 'caddy',
  },
  'win32-x64': {
    filename: `caddy_${CADDY_VERSION}_windows_amd64.zip`,
    kind: 'zip',
    binaryName: 'caddy.exe',
  },
  'win32-arm64': {
    filename: `caddy_${CADDY_VERSION}_windows_arm64.zip`,
    kind: 'zip',
    binaryName: 'caddy.exe',
  },
};

export function caddyAssetForHost(
  platform: string = osPlatform(),
  arch: string = osArch(),
): CaddyAsset {
  const key = `${platform}-${arch}`;
  const asset = PLATFORM_ASSETS[key];
  if (!asset) {
    throw new Error(
      `no vendored Caddy build for ${key} (expected ${Object.keys(PLATFORM_ASSETS).join(', ')})`,
    );
  }
  return asset;
}

export function caddyDownloadUrl(asset: CaddyAsset, version = CADDY_VERSION): string {
  return `https://github.com/caddyserver/caddy/releases/download/v${version}/${asset.filename}`;
}

export function caddyVendorPath(
  vendorDir: string,
  asset: CaddyAsset = caddyAssetForHost(),
): string {
  return join(vendorDir, asset.binaryName);
}

/**
 * Ensure `vendorDir/<caddy>` exists, downloading the pinned release if needed.
 * Returns the absolute path to the executable.
 */
export async function ensureVendoredCaddy(
  vendorDir: string,
  opts?: { platform?: string; arch?: string; version?: string },
): Promise<string> {
  const asset = caddyAssetForHost(opts?.platform, opts?.arch);
  const dest = caddyVendorPath(vendorDir, asset);
  if (existsSync(dest)) return dest;

  mkdirSync(vendorDir, { recursive: true });
  const version = opts?.version ?? CADDY_VERSION;
  const url = caddyDownloadUrl(asset, version);
  console.log(`[aurora] downloading Caddy v${version} (${asset.filename})…`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`failed to download Caddy: ${url} → HTTP ${res.status}`);
  }
  const archivePath = join(tmpdir(), asset.filename);
  await Bun.write(archivePath, res);

  if (asset.kind === 'tar.gz') {
    const tar = Bun.spawnSync(['tar', '-xzf', archivePath, '-C', vendorDir, asset.binaryName], {
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (tar.exitCode !== 0) {
      // Some archives nest the binary; extract all then rely on dest path.
      const tarAll = Bun.spawnSync(['tar', '-xzf', archivePath, '-C', vendorDir], {
        stdout: 'inherit',
        stderr: 'inherit',
      });
      if (tarAll.exitCode !== 0) {
        throw new Error(`tar extract failed for ${archivePath}`);
      }
    }
  } else {
    const unzip = Bun.spawnSync(
      ['unzip', '-o', '-q', archivePath, asset.binaryName, '-d', vendorDir],
      {
        stdout: 'inherit',
        stderr: 'inherit',
      },
    );
    if (unzip.exitCode !== 0) {
      const unzipAll = Bun.spawnSync(['unzip', '-o', '-q', archivePath, '-d', vendorDir], {
        stdout: 'inherit',
        stderr: 'inherit',
      });
      if (unzipAll.exitCode !== 0) {
        throw new Error(`unzip failed for ${archivePath}`);
      }
    }
  }

  if (!existsSync(dest)) {
    throw new Error(`Caddy binary missing after extract: expected ${dest}`);
  }
  try {
    chmodSync(dest, 0o755);
  } catch {
    /* windows */
  }
  return dest;
}

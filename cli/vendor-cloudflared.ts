/** Checksum-verified, pinned native Cloudflare Tunnel connector. */

import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { arch as osArch, platform as osPlatform, tmpdir } from 'node:os';
import { join } from 'node:path';

/** Keep in sync with the Docker sidecar tag in cli/aurora.ts. */
export const CLOUDFLARED_VERSION = '2026.7.2';

export type CloudflaredAsset = {
  filename: string;
  kind: 'raw' | 'tar.gz';
  binaryName: string;
  sha256: string;
};

const ASSETS: Record<string, CloudflaredAsset> = {
  'darwin-arm64': {
    filename: 'cloudflared-darwin-arm64.tgz',
    kind: 'tar.gz',
    binaryName: 'cloudflared',
    sha256: '0588df58494a6cadd38b9deb6078908a5054063c80784d92fdb8d4a5f3de1c67',
  },
  'darwin-x64': {
    filename: 'cloudflared-darwin-amd64.tgz',
    kind: 'tar.gz',
    binaryName: 'cloudflared',
    sha256: 'a5afb0ba3da859da47bebc9a918d5b196bf7e4aec23589419b46356731bcc75f',
  },
  'linux-arm64': {
    filename: 'cloudflared-linux-arm64',
    kind: 'raw',
    binaryName: 'cloudflared',
    sha256: '405df476437e027fc6d18729a5a77155c0a33a6082aeee60a799a688f3052e66',
  },
  'linux-x64': {
    filename: 'cloudflared-linux-amd64',
    kind: 'raw',
    binaryName: 'cloudflared',
    sha256: 'ec905ea7b7e327ff8abdde8cb64697a2152de74dbcdbf6aec9db8364eb3886cd',
  },
  'win32-x64': {
    filename: 'cloudflared-windows-amd64.exe',
    kind: 'raw',
    binaryName: 'cloudflared.exe',
    sha256: 'cdb5d4432f6ae1595654a692a51308b69d2bf7af961f5578d9391837cf072df9',
  },
};

export function cloudflaredAssetForHost(
  platform: string = osPlatform(),
  arch: string = osArch(),
): CloudflaredAsset {
  const key = `${platform}-${arch}`;
  const asset = ASSETS[key];
  if (!asset) throw new Error(`no vendored cloudflared build for ${key}`);
  return asset;
}

export function cloudflaredDownloadUrl(
  asset: CloudflaredAsset,
  version = CLOUDFLARED_VERSION,
): string {
  return `https://github.com/cloudflare/cloudflared/releases/download/${version}/${asset.filename}`;
}

export async function ensureVendoredCloudflared(
  vendorDir: string,
  opts?: { platform?: string; arch?: string; version?: string },
): Promise<string> {
  const asset = cloudflaredAssetForHost(opts?.platform, opts?.arch);
  const dest = join(vendorDir, asset.binaryName);
  if (existsSync(dest)) return dest;
  mkdirSync(vendorDir, { recursive: true });
  const url = cloudflaredDownloadUrl(asset, opts?.version);
  console.log(`[aurora] downloading cloudflared ${opts?.version ?? CLOUDFLARED_VERSION}…`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`failed to download cloudflared: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== asset.sha256) {
    throw new Error(`cloudflared checksum mismatch for ${asset.filename}`);
  }
  if (asset.kind === 'raw') {
    await Bun.write(dest, bytes);
  } else {
    const archive = join(tmpdir(), `aurora-${asset.filename}`);
    await Bun.write(archive, bytes);
    const extracted = Bun.spawnSync(['tar', '-xzf', archive, '-C', vendorDir, asset.binaryName], {
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (extracted.exitCode !== 0) throw new Error(`could not extract ${asset.filename}`);
  }
  if (!existsSync(dest)) throw new Error(`cloudflared binary missing after download: ${dest}`);
  try {
    chmodSync(dest, 0o755);
  } catch {
    /* Windows */
  }
  return dest;
}

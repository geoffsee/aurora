/**
 * Native show stack: vendor Caddy + Bun.spawn the bridge (no Docker / muxox).
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, resolve } from 'node:path';
import { renderCaddyfile } from './caddyfile';
import { ensureVendoredCaddy } from './vendor-caddy';

const PROJECTOR_PORT = 8443;
const CONTROLS_PORT = 8444;

export function hostLanIps(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      const family = a.family;
      const isV4 = family === 'IPv4';
      if (isV4 && !a.internal) out.push(a.address);
    }
  }
  return out;
}

/** Locate the aurora repo root (bridge/ + package.json). */
export function resolveAppRoot(opts?: {
  cwd?: string;
  cliDir?: string;
  env?: Record<string, string | undefined>;
}): string {
  const env = opts?.env ?? process.env;
  if (env.AURORA_ROOT?.trim()) return resolve(env.AURORA_ROOT.trim());

  const candidates = [
    opts?.cwd ?? process.cwd(),
    opts?.cliDir ? resolve(opts.cliDir, '..') : null,
  ].filter((p): p is string => Boolean(p));

  for (const root of candidates) {
    if (existsSync(join(root, 'bridge', 'index.ts')) && existsSync(join(root, 'package.json'))) {
      return root;
    }
  }
  throw new Error(
    'cannot find aurora app root (expected bridge/index.ts). ' +
      'Run from the repo, or set AURORA_ROOT.',
  );
}

export function printNativeUrls(lan: string[] = hostLanIps()) {
  const host = process.env.AURORA_HOST ?? 'localhost';
  console.log('');
  console.log(`  projector  https://${host}:${PROJECTOR_PORT}`);
  console.log(`  controls   https://${host}:${CONTROLS_PORT}`);
  console.log(`  runtime    native (vendored Caddy + Bun bridge)`);
  if (lan.length > 0) {
    console.log(
      `  LAN        https://${lan[0]}:${PROJECTOR_PORT}  /  https://${lan[0]}:${CONTROLS_PORT}`,
    );
  }
  console.log('');
  console.log('  Accept the Caddy TLS warning once if prompted (tls internal).');
  console.log('');
}

function bunExecutable(): string {
  return process.env.AURORA_BUN ?? 'bun';
}

function pidFilePath(appRoot: string): string {
  return join(appRoot, '.aurora', 'native.pids');
}

export function stopNativeStack(appRoot: string): void {
  const file = pidFilePath(appRoot);
  if (!existsSync(file)) return;
  const raw = readFileSync(file, 'utf8').trim();
  for (const line of raw.split(/\n+/)) {
    const pid = Number(line.trim());
    if (!Number.isFinite(pid) || pid <= 0) continue;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already dead */
    }
  }
  try {
    unlinkSync(file);
  } catch {
    /* ignore */
  }
}

function writePidFile(appRoot: string, pids: number[]) {
  const dir = join(appRoot, '.aurora');
  mkdirSync(dir, { recursive: true });
  writeFileSync(pidFilePath(appRoot), `${pids.join('\n')}\n`);
}

export type NativeRunOptions = {
  daemon?: boolean;
  cliDir?: string;
  cwd?: string;
  /** Overlay data dir (sets AURORA_DATA_DIR for the bridge). */
  dataDir?: string;
};

/**
 * Start Caddy + bridge. Foreground: stream logs until signal / child exit.
 * Daemon: detach and write `.aurora/native.pids`.
 */
export async function runNativeStack(opts: NativeRunOptions = {}): Promise<number> {
  const appRoot = resolveAppRoot({ cwd: opts.cwd, cliDir: opts.cliDir ?? import.meta.dir });
  const vendorDir = join(appRoot, 'cli', '.vendor');
  const stateDir = join(appRoot, '.aurora');
  mkdirSync(stateDir, { recursive: true });

  stopNativeStack(appRoot);

  const lan = hostLanIps();
  const tlsHosts = ['localhost', '127.0.0.1', ...(process.env.AURORA_TLS_HOSTS?.split(',') ?? lan)];
  const caddyfilePath = join(stateDir, 'Caddyfile');
  writeFileSync(caddyfilePath, renderCaddyfile(tlsHosts));

  const caddyBin = await ensureVendoredCaddy(vendorDir);
  const bunBin = bunExecutable();

  const bridgeEnv: Record<string, string> = {
    ...process.env,
    PORT: '13000',
    CONTROLS_PORT: '13001',
    HOST: '127.0.0.1',
    LIVE_HOST: process.env.LIVE_HOST ?? '127.0.0.1',
  };
  for (const key of [
    'LIVE_SEND_PORT',
    'LIVE_RECV_PORT',
    'VST_CONTROL_RECV_PORT',
    'MIDI_CLOCK_DEVICE',
    'ABLETON_LINK_ENABLED',
    'AURORA_DATA_DIR',
  ] as const) {
    const v = process.env[key];
    if (v !== undefined && v !== '') bridgeEnv[key] = v;
  }
  // CLI --data-dir wins over a pre-existing env value for this process tree.
  if (opts.dataDir !== undefined && opts.dataDir.trim() !== '') {
    bridgeEnv.AURORA_DATA_DIR = resolve(opts.dataDir.trim());
  }

  if (
    !existsSync(join(appRoot, 'dist', 'pkg')) &&
    !existsSync(join(appRoot, 'web', 'index.html'))
  ) {
    console.warn('[aurora] warning: dist/pkg missing — run `bun run build:web` for projector WASM');
  }

  console.log(`[aurora] native stack — Caddy ${caddyBin}`);
  console.log(`[aurora] bridge via ${bunBin} (cwd ${appRoot})`);

  const spawnOpts = {
    cwd: appRoot,
    stdout: 'inherit' as const,
    stderr: 'inherit' as const,
    env: bridgeEnv,
  };

  const bridge = Bun.spawn(
    [bunBin, 'run', 'bridge/index.ts'],
    opts.daemon ? { ...spawnOpts, stdout: 'ignore', stderr: 'ignore' } : spawnOpts,
  );
  const caddy = Bun.spawn(
    [caddyBin, 'run', '--config', caddyfilePath, '--adapter', 'caddyfile'],
    opts.daemon
      ? { cwd: appRoot, stdout: 'ignore', stderr: 'ignore', env: process.env }
      : { cwd: appRoot, stdout: 'inherit', stderr: 'inherit', env: process.env },
  );

  const pids = [bridge.pid, caddy.pid].filter((p): p is number => typeof p === 'number');
  writePidFile(appRoot, pids);
  printNativeUrls(lan);

  if (opts.daemon) {
    console.log(`[aurora] detached — stop with: aurora down`);
    return 0;
  }

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[aurora] shutting down native stack…');
    try {
      bridge.kill();
    } catch {
      /* */
    }
    try {
      caddy.kill();
    } catch {
      /* */
    }
    stopNativeStack(appRoot);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[aurora] streaming logs (Ctrl+C to stop)…`);
  await Promise.race([bridge.exited, caddy.exited]);
  if (!shuttingDown) {
    console.log(`\n[aurora] a process exited — cleaning up…`);
    shutdown();
  }
  return 0;
}

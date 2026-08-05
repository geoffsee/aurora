#!/usr/bin/env bun
/**
 * Aurora show-stack CLI — two runtimes:
 *
 *   Docker (default)  build/run the muxox+Caddy+bridge image
 *   Native (--native) vendor Caddy + Bun.spawn the bridge (no Docker)
 *
 *   aurora                 docker: build, run, stream logs; Ctrl+C tears down
 *   aurora -d              docker: build and detach
 *   aurora --native        native: Caddy + bridge in the foreground
 *   aurora -n -d           native: detach (pids in .aurora/native.pids)
 *   aurora down            stop docker container and/or native pids
 */

import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs, usage } from './args';
import { type DockerArch, dockerArchFromHost, dockerPlatform } from './docker-platform';
import { EMBEDDED_DOCKER_CONTEXT_PATH } from './embedded-context';
import { resolveAppRoot, runNativeStack, stopNativeStack } from './native-stack';

const IMAGE = process.env.AURORA_IMAGE ?? 'ghcr.io/geoffsee/aurora:latest';
const CONTAINER = process.env.AURORA_CONTAINER ?? 'aurora';
const DOCKER_ARCH: DockerArch = dockerArchFromHost();
const DOCKER_PLATFORM = dockerPlatform(DOCKER_ARCH);

const PROJECTOR_PORT = 8443;
const CONTROLS_PORT = 8444;
const MUXOX_UI_PORT = 8450;

function hostLanIps(): string[] {
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

function dockerAvailable(): boolean {
  const r = Bun.spawnSync(['docker', 'info'], { stdout: 'ignore', stderr: 'ignore' });
  return r.exitCode === 0;
}

function run(cmd: string[], opts: { inherit?: boolean } = {}): number {
  const proc = Bun.spawnSync(cmd, {
    stdout: opts.inherit === false ? 'pipe' : 'inherit',
    stderr: opts.inherit === false ? 'pipe' : 'inherit',
    stdin: 'inherit',
  });
  return proc.exitCode ?? 1;
}

function printDockerUrls() {
  const host = process.env.AURORA_HOST ?? 'localhost';
  const lan = hostLanIps();
  console.log('');
  console.log(`  projector  https://${host}:${PROJECTOR_PORT}`);
  console.log(`  controls   https://${host}:${CONTROLS_PORT}`);
  console.log(`  muxox UI   http://${host}:${MUXOX_UI_PORT}`);
  console.log(`  runtime    docker (${DOCKER_PLATFORM})`);
  if (lan.length > 0) {
    console.log(
      `  LAN        https://${lan[0]}:${PROJECTOR_PORT}  /  https://${lan[0]}:${CONTROLS_PORT}`,
    );
  }
  console.log('');
  console.log('  Accept the Caddy TLS warning once if prompted (tls internal).');
  console.log('');
}

function stopContainer() {
  run(['docker', 'rm', '-f', CONTAINER], { inherit: false });
}

async function loadEmbeddedDockerContext(): Promise<Uint8Array | null> {
  if (!EMBEDDED_DOCKER_CONTEXT_PATH) return null;
  const file = Bun.file(EMBEDDED_DOCKER_CONTEXT_PATH);
  if (!(await file.exists())) return null;
  return new Uint8Array(await file.arrayBuffer());
}

async function buildImageFromTar(tar: Uint8Array): Promise<number> {
  console.log(
    `[aurora] building ${IMAGE} from embedded context ` +
      `(${(tar.byteLength / 1024 ** 2).toFixed(1)} MiB tar, ${DOCKER_PLATFORM})…`,
  );
  const proc = Bun.spawn(
    ['docker', 'build', '--platform', DOCKER_PLATFORM, '-t', IMAGE, '-f', 'Dockerfile', '-'],
    {
      stdin: tar,
      stdout: 'inherit',
      stderr: 'inherit',
    },
  );
  return (await proc.exited) ?? 1;
}

async function buildImageFromWorktree(): Promise<number> {
  console.log(`[aurora] building ${IMAGE} from working tree (BuildKit, ${DOCKER_PLATFORM})…`);
  return run([
    'docker',
    'build',
    '--platform',
    DOCKER_PLATFORM,
    '-t',
    IMAGE,
    '-f',
    'Dockerfile',
    '.',
  ]);
}

async function buildImage(): Promise<number> {
  const embedded = await loadEmbeddedDockerContext();
  if (embedded) return buildImageFromTar(embedded);
  return buildImageFromWorktree();
}

/** In-container mount path for operator overlay (see data/README.md). */
const CONTAINER_DATA_DIR = '/override';

function startContainer(dataDir?: string): number {
  stopContainer();
  console.log(`[aurora] starting ${CONTAINER}…`);
  const tlsHosts = ['localhost', '127.0.0.1', ...hostLanIps()].join(',');
  const envArgs: string[] = [
    '-e',
    `LIVE_HOST=${process.env.LIVE_HOST ?? 'host.docker.internal'}`,
    '-e',
    `AURORA_TLS_HOSTS=${process.env.AURORA_TLS_HOSTS ?? tlsHosts}`,
  ];
  for (const key of [
    'LIVE_SEND_PORT',
    'LIVE_RECV_PORT',
    'VST_CONTROL_RECV_PORT',
    'MIDI_CLOCK_DEVICE',
    'ABLETON_LINK_ENABLED',
  ] as const) {
    const v = process.env[key];
    if (v !== undefined && v !== '') {
      envArgs.push('-e', `${key}=${v}`);
    }
  }

  // Overlay catalog: CLI --data-dir wins over AURORA_DATA_DIR env.
  const hostDataDir =
    dataDir !== undefined && dataDir.trim() !== ''
      ? resolve(dataDir.trim())
      : process.env.AURORA_DATA_DIR?.trim()
        ? resolve(process.env.AURORA_DATA_DIR.trim())
        : null;
  const volumeArgs: string[] = [];
  if (hostDataDir) {
    volumeArgs.push('-v', `${hostDataDir}:${CONTAINER_DATA_DIR}`);
    envArgs.push('-e', `AURORA_DATA_DIR=${CONTAINER_DATA_DIR}`);
    console.log(`[aurora] data overlay ${hostDataDir} → ${CONTAINER_DATA_DIR}`);
  }

  return run([
    'docker',
    'run',
    '-d',
    '--name',
    CONTAINER,
    '--platform',
    DOCKER_PLATFORM,
    '--add-host',
    'host.docker.internal:host-gateway',
    ...envArgs,
    ...volumeArgs,
    '-p',
    `${PROJECTOR_PORT}:8443`,
    '-p',
    `${CONTROLS_PORT}:8444`,
    '-p',
    `${MUXOX_UI_PORT}:8450`,
    '-p',
    '11001:11001/udp',
    '-p',
    '12000:12000/udp',
    IMAGE,
  ]);
}

async function attachLogsUntilExit(): Promise<number> {
  let shuttingDown = false;
  let logs: ReturnType<typeof Bun.spawn> | undefined;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n[aurora] shutting down…');
    try {
      logs?.kill();
    } catch {
      /* already exited */
    }
    stopContainer();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(`[aurora] streaming logs (Ctrl+C to stop and remove ${CONTAINER})…`);
  logs = Bun.spawn(['docker', 'logs', '-f', '--tail', '200', CONTAINER], {
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const wait = Bun.spawn(['docker', 'wait', CONTAINER], {
    stdout: 'pipe',
    stderr: 'ignore',
  });

  await Promise.race([logs.exited, wait.exited]);

  if (!shuttingDown) {
    console.log(`\n[aurora] container exited — cleaning up…`);
    try {
      logs.kill();
    } catch {
      /* already exited */
    }
    stopContainer();
  }
  return 0;
}

async function runDocker(daemon: boolean, dataDir?: string): Promise<number> {
  if (!dockerAvailable()) {
    console.error(
      '[aurora] Docker is not available. Start Docker Desktop (or the Engine) and retry.\n' +
        '         Or use native mode: aurora --native',
    );
    return 1;
  }

  process.env.DOCKER_BUILDKIT = '1';

  const buildCode = await buildImage();
  if (buildCode !== 0) return buildCode;

  const startCode = startContainer(dataDir);
  if (startCode !== 0) return startCode;

  printDockerUrls();

  if (daemon) {
    console.log(`[aurora] detached — stop with: aurora down`);
    return 0;
  }

  return attachLogsUntilExit();
}

async function main(): Promise<number> {
  const { mode, daemon, runtime, dataDir, error } = parseArgs(process.argv);

  if (error) {
    console.error(`[aurora] ${error}`);
    console.log(usage());
    return 1;
  }

  if (mode === 'help') {
    console.log(usage());
    return 0;
  }

  if (mode === 'down') {
    let appRoot: string | undefined;
    try {
      appRoot = resolveAppRoot({ cliDir: import.meta.dir });
    } catch {
      appRoot = undefined;
    }
    if (appRoot) {
      stopNativeStack(appRoot);
      console.log(`[aurora] stopped native stack (if any)`);
    }
    if (dockerAvailable()) {
      stopContainer();
      console.log(`[aurora] stopped ${CONTAINER}`);
    }
    return 0;
  }

  if (runtime === 'native') {
    return runNativeStack({ daemon, cliDir: import.meta.dir, dataDir });
  }

  return runDocker(daemon, dataDir);
}

if (import.meta.main) {
  process.exit(await main());
}

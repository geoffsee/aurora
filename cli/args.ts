/** CLI argv parsing for `aurora` — kept Bun-free so vitest can import it. */

export type RuntimeKind = 'docker' | 'native';

export function parseArgs(argv: string[]): {
  mode: 'run' | 'down' | 'help';
  daemon: boolean;
  runtime: RuntimeKind;
  /** Absolute or relative path for AURORA_DATA_DIR overlay (optional). */
  dataDir?: string;
  error?: string;
} {
  const args = argv.slice(2);
  let daemon = false;
  let runtime: RuntimeKind = 'docker';
  let mode: 'run' | 'down' | 'help' = 'run';
  let dataDir: string | undefined;
  let positional: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) break;
    if (a === '-d' || a === '--daemon') {
      daemon = true;
      continue;
    }
    if (a === '-n' || a === '--native') {
      runtime = 'native';
      continue;
    }
    if (a === '--docker') {
      runtime = 'docker';
      continue;
    }
    if (a === '-h' || a === '--help') {
      mode = 'help';
      continue;
    }
    if (a === '--data-dir') {
      const next = args[i + 1];
      if (next === undefined || next.startsWith('-')) {
        return {
          mode: 'help',
          daemon: false,
          runtime,
          error: '--data-dir requires a path argument',
        };
      }
      dataDir = next;
      i++;
      continue;
    }
    if (a.startsWith('--data-dir=')) {
      const value = a.slice('--data-dir='.length);
      if (value === '') {
        return {
          mode: 'help',
          daemon: false,
          runtime,
          error: '--data-dir requires a path argument',
        };
      }
      dataDir = value;
      continue;
    }
    if (a.startsWith('-')) {
      return { mode: 'help', daemon: false, runtime, error: `unknown flag: ${a}` };
    }
    if (positional !== undefined) {
      return {
        mode: 'help',
        daemon: false,
        runtime,
        error: `unexpected argument: ${a}`,
      };
    }
    positional = a;
  }

  if (positional === 'down') {
    return { mode: 'down', daemon, runtime, dataDir };
  }
  if (positional === 'help') {
    return { mode: 'help', daemon, runtime, dataDir };
  }
  if (positional !== undefined) {
    return {
      mode: 'help',
      daemon: false,
      runtime,
      error: `unknown command: ${positional}`,
    };
  }
  return { mode, daemon, runtime, dataDir };
}

export function usage(): string {
  return `Usage:
  aurora                 docker: build, run, stream logs; Ctrl+C tears down
  aurora -d              docker: build and run detached (--daemon)
  aurora --native / -n   native: vendored Caddy + Bun bridge (no Docker)
  aurora -n -d           native detached (pids in .aurora/native.pids)
  aurora --data-dir DIR  overlay preset catalog (also: AURORA_DATA_DIR)
  aurora down            stop docker container and/or native processes
`;
}

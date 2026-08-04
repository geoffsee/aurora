/** CLI argv parsing for `aurora` — kept Bun-free so vitest can import it. */

export type RuntimeKind = 'docker' | 'native';

export function parseArgs(argv: string[]): {
  mode: 'run' | 'down' | 'help';
  daemon: boolean;
  runtime: RuntimeKind;
  error?: string;
} {
  const args = argv.slice(2);
  let daemon = false;
  let runtime: RuntimeKind = 'docker';
  let mode: 'run' | 'down' | 'help' = 'run';
  let positional: string | undefined;

  for (const a of args) {
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
    return { mode: 'down', daemon, runtime };
  }
  if (positional === 'help') {
    return { mode: 'help', daemon, runtime };
  }
  if (positional !== undefined) {
    return {
      mode: 'help',
      daemon: false,
      runtime,
      error: `unknown command: ${positional}`,
    };
  }
  return { mode, daemon, runtime };
}

export function usage(): string {
  return `Usage:
  aurora                 docker: build, run, stream logs; Ctrl+C tears down
  aurora -d              docker: build and run detached (--daemon)
  aurora --native / -n   native: vendored Caddy + Bun bridge (no Docker)
  aurora -n -d           native detached (pids in .aurora/native.pids)
  aurora down            stop docker container and/or native processes
`;
}

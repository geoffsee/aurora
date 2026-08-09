/**
 * Where the bridge's writable overlay lives inside the container.
 *
 * The overlay backs two things: the preset catalog overlay read by
 * `bridge/mode-catalog.ts`, and `POST /api/packages/import`, which writes
 * imported `.aurora-package` bundles under `<root>/decks/<deck>/<slug>`.
 * Import is *disabled* when AURORA_DATA_DIR is unset, so a container started
 * with no mount answers 503 — which is what `bun dev` used to do.
 *
 * So there is always a mount now. An explicit `--data-dir` (or AURORA_DATA_DIR)
 * binds a host directory; otherwise a named Docker volume is used, giving the
 * dev stack a writable overlay that survives `docker rm -f` without putting
 * operator imports in the working tree.
 *
 * Kept Bun-free so vitest can import it.
 */

import { resolve } from 'node:path';

/** In-container mount path for the operator overlay (see data/README.md). */
export const CONTAINER_DATA_DIR = '/override';

/** Named volume used when no host directory was requested. */
export const DEFAULT_DATA_VOLUME = 'aurora-data';

/** Docker's own constraint on volume names. */
const VOLUME_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

export type DataMount = {
  /** `bind` = host directory; `volume` = Docker-managed named volume. */
  kind: 'bind' | 'volume';
  /** Left side of `-v`: an absolute host path, or a volume name. */
  source: string;
  containerPath: string;
  /** Non-fatal problem the caller should surface (e.g. a bad volume name). */
  warning?: string;
};

/**
 * Decide what to mount at {@link CONTAINER_DATA_DIR}.
 *
 * Precedence: `--data-dir` → `AURORA_DATA_DIR` → named volume
 * (`AURORA_DATA_VOLUME`, default {@link DEFAULT_DATA_VOLUME}).
 */
export function resolveDockerDataMount(
  opts: { dataDir?: string; env?: Record<string, string | undefined>; cwd?: string } = {},
): DataMount {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();

  const hostDir = firstNonBlank(opts.dataDir, env.AURORA_DATA_DIR);
  if (hostDir !== null) {
    return { kind: 'bind', source: resolve(cwd, hostDir), containerPath: CONTAINER_DATA_DIR };
  }

  const requested = firstNonBlank(env.AURORA_DATA_VOLUME);
  if (requested !== null && !VOLUME_NAME_RE.test(requested)) {
    return {
      kind: 'volume',
      source: DEFAULT_DATA_VOLUME,
      containerPath: CONTAINER_DATA_DIR,
      warning: `ignoring AURORA_DATA_VOLUME=${requested} (not a valid Docker volume name); using ${DEFAULT_DATA_VOLUME}`,
    };
  }

  return {
    kind: 'volume',
    source: requested ?? DEFAULT_DATA_VOLUME,
    containerPath: CONTAINER_DATA_DIR,
  };
}

/** `docker run` arguments for a mount. Both kinds share `-v src:dest`. */
export function dockerMountArgs(mount: DataMount): string[] {
  return ['-v', `${mount.source}:${mount.containerPath}`];
}

/** One-line log describing where the overlay came from and how to reset it. */
export function describeDataMount(mount: DataMount): string {
  if (mount.kind === 'bind') return `data overlay ${mount.source} → ${mount.containerPath}`;
  return (
    `data volume ${mount.source} → ${mount.containerPath} ` +
    `(persists across restarts; reset with: docker volume rm ${mount.source})`
  );
}

function firstNonBlank(...values: (string | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

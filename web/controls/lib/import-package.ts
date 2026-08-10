/**
 * Console-side `.aurora-package` import — the counterpart to Studio's export.
 *
 * Two destinations, picked by how the console is hosted:
 *
 * - **Bridged** (Docker/Caddy, `aurora dev`): POST to the bridge, which writes
 *   the package under AURORA_DATA_DIR and rescans its catalog. Every client of
 *   that bridge sees it, including the projector — which matters because the
 *   Docker layout serves the projector from :8443 and the console from :8444,
 *   so anything the console stores in its own origin is invisible over there.
 * - **Static** (GitHub Pages, `?static=1`): there is no bridge, but projector
 *   and console share one origin, so the same-origin authored store is both
 *   available and sufficient.
 */

import {
  AURORA_PACKAGE_MAX_ARCHIVE_BYTES,
  parseAuroraPackageArchive,
} from '../../../shared/aurora-package.ts';
import {
  type InstanceTarget,
  instanceLocationFor,
  loadInstanceTarget,
} from '../../../shared/instance-target.ts';
import { importPackageToBridge } from '../../../shared/package-import-client.ts';
import { installAuthoredPackageBundle } from '../../../shared/package-install.ts';
import { isStaticHosting } from '../../../shared/static-hosting.ts';

export const AURORA_PACKAGE_FILE_EXTENSION = '.aurora-package';

export type PackageImportVia = 'bridge' | 'local';

export type ConsoleImportResult =
  | {
      ok: true;
      via: PackageImportVia;
      slug: string;
      label: string;
      overwritten: boolean;
      /** Operator-facing summary of where the package landed. */
      message: string;
    }
  | { ok: false; via: PackageImportVia; message: string };

type ImportLoc = Parameters<typeof isStaticHosting>[0] & { origin: string };

function joinErrors(errors: { path: string; message: string }[]): string {
  if (errors.length === 0) return 'import rejected';
  return errors.map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)).join('; ');
}

/** Install into the same-origin authored store (localStorage + IndexedDB). */
async function importLocally(bytes: Uint8Array): Promise<ConsoleImportResult> {
  const parsed = parseAuroraPackageArchive(bytes, { remapAuthoring: true });
  if (!parsed.ok) return { ok: false, via: 'local', message: joinErrors(parsed.errors) };
  try {
    const record = await installAuthoredPackageBundle(parsed.bundle);
    return {
      ok: true,
      via: 'local',
      slug: record.slug,
      label: record.label,
      overwritten: false,
      message: `Imported “${record.label}” (${record.slug}) into this browser — pick it on the launchpad`,
    };
  } catch (error) {
    return {
      ok: false,
      via: 'local',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Import archive bytes exported from Preset Studio.
 *
 * `loc` decides the destination; `fetchImpl` is injectable for tests.
 */
export async function importAuroraPackageArchive(
  bytes: Uint8Array,
  opts?: {
    loc?: ImportLoc;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    /** Defaults to the stored instance target; injectable for tests. */
    target?: InstanceTarget;
  },
): Promise<ConsoleImportResult> {
  const target = opts?.target ?? loadInstanceTarget();
  // A remote instance owns the destination disk, so the archive goes there —
  // not to whichever origin happens to have served this console.
  const loc = (opts?.loc ?? instanceLocationFor(target)) as ImportLoc;
  if (bytes.byteLength === 0) {
    return { ok: false, via: 'local', message: 'file is empty' };
  }
  if (bytes.byteLength > AURORA_PACKAGE_MAX_ARCHIVE_BYTES) {
    return {
      ok: false,
      via: 'local',
      message: `file exceeds the ${Math.round(AURORA_PACKAGE_MAX_ARCHIVE_BYTES / (1024 * 1024))} MB package limit`,
    };
  }

  if (isStaticHosting(loc)) return importLocally(bytes);

  // Caddy routes /api/packages/import on the console origin straight to the
  // bridge, so same-origin is correct here and avoids a CORS preflight.
  // (A remote instance target is cross-origin by definition — the bridge
  // answers the preflight for /api/*.)
  const result = await importPackageToBridge(bytes, {
    bridgeOrigin: loc.origin,
    fetchImpl: opts?.fetchImpl,
    signal: opts?.signal,
    token: target.token,
  });
  if (result.ok) {
    return {
      ok: true,
      via: 'bridge',
      slug: result.slug,
      label: result.label ?? result.slug,
      overwritten: Boolean(result.overwritten),
      message: `${result.overwritten ? 'Replaced' : 'Imported'} “${result.label ?? result.slug}” (${result.slug}) on the bridge`,
    };
  }
  if (result.status === 503) {
    return {
      ok: false,
      via: 'bridge',
      message:
        'Bridge has no writable data dir — restart the stack with `aurora dev --data-dir ./data-overlay`',
    };
  }
  return { ok: false, via: 'bridge', message: joinErrors(result.errors) };
}

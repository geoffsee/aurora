/**
 * Build / download `.aurora-look` from a studio sketch.
 */

import {
  type AuroraLookBundle,
  type AuroraLookValidationError,
  auroraLookFileName,
  buildAuroraLookArchive,
  buildManifest,
} from '../../../shared/aurora-look.ts';
import { knobsToLookDefaults, type StudioSketch } from './sketch-store.ts';

export type ExportLookResult =
  | { ok: true; bytes: Uint8Array; fileName: string; bundle: AuroraLookBundle }
  | { ok: false; errors: AuroraLookValidationError[] };

/**
 * Detect whether sketch WGSL looks like show-form (Bevy) vs authoring.
 * Ignores comments so authoring templates that mention @group(2) stay authoring.
 */
export function detectWgslForm(wgsl: string): 'show' | 'authoring' {
  // Strip // line comments and /* */ blocks for detection only.
  const code = wgsl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (/#import\s+bevy_sprite::mesh2d_vertex_output::VertexOutput/.test(code)) {
    return 'show';
  }
  if (/\bfrag\s*:\s*VertexOutput\b/.test(code) && /@group\(\s*2\s*\)/.test(code)) {
    return 'show';
  }
  if (/@group\(\s*2\s*\)/.test(code) && /\bVertexOutput\b/.test(code)) {
    return 'show';
  }
  return 'authoring';
}

/** Build a validated archive for a sketch (does not touch the DOM). */
export function exportSketchToLook(sketch: StudioSketch): ExportLookResult {
  const form = detectWgslForm(sketch.wgsl);
  try {
    const bundle: AuroraLookBundle = {
      manifest: buildManifest({
        slug: sketch.slug,
        label: sketch.label,
        character: sketch.character || undefined,
        uiGroup: sketch.uiGroup,
        wgslForm: form,
        studioVersion: 1,
      }),
      wgsl: sketch.wgsl,
      defaults: knobsToLookDefaults(sketch.knobs),
    };
    const bytes = buildAuroraLookArchive(bundle);
    return {
      ok: true,
      bytes,
      fileName: auroraLookFileName(sketch.slug),
      bundle,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // buildAuroraLookArchive throws with joined validation errors.
    return {
      ok: false,
      errors: [{ path: 'export', message }],
    };
  }
}

/** Trigger a browser download of the archive bytes. */
export function downloadLookArchive(bytes: Uint8Array, fileName: string): void {
  // Copy into a fresh ArrayBuffer-backed view for Blob typing across DOM libs.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export type BridgeImportResult =
  | {
      ok: true;
      slug: string;
      label?: string;
      overwritten?: boolean;
      catalog?: { epoch: number; contentHash: string };
    }
  | { ok: false; errors: { path: string; message: string }[]; status: number };

/**
 * POST archive bytes to the Aurora bridge look-import endpoint.
 * Requires bridge running with AURORA_DATA_DIR set.
 */
export async function importLookToBridge(
  bytes: Uint8Array,
  opts?: { bridgeOrigin?: string; signal?: AbortSignal },
): Promise<BridgeImportResult> {
  const origin = (opts?.bridgeOrigin ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const url = `${origin}/api/looks/import`;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const requestBody = new Blob([copy], { type: 'application/zip' });
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: requestBody,
      signal: opts?.signal,
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      errors: [
        {
          path: 'bridge',
          message: e instanceof Error ? e.message : 'failed to reach bridge',
        },
      ],
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return {
      ok: false,
      status: res.status,
      errors: [{ path: 'bridge', message: `non-JSON response (${res.status})` }],
    };
  }

  if (!res.ok || !payload || typeof payload !== 'object') {
    const errors =
      payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { errors?: unknown }).errors)
        ? (payload as { errors: { path: string; message: string }[] }).errors
        : [
            {
              path: 'bridge',
              message: `import failed (${res.status})`,
            },
          ];
    return { ok: false, status: res.status, errors };
  }

  const o = payload as Record<string, unknown>;
  if (o.ok !== true) {
    const errors = Array.isArray(o.errors)
      ? (o.errors as { path: string; message: string }[])
      : [{ path: 'bridge', message: 'import rejected' }];
    return { ok: false, status: res.status, errors };
  }

  return {
    ok: true,
    slug: typeof o.slug === 'string' ? o.slug : 'unknown',
    label: typeof o.label === 'string' ? o.label : undefined,
    overwritten: Boolean(o.overwritten),
    catalog:
      o.catalog && typeof o.catalog === 'object'
        ? {
            epoch: Number((o.catalog as { epoch?: number }).epoch) || 0,
            contentHash: String((o.catalog as { contentHash?: string }).contentHash ?? ''),
          }
        : undefined,
  };
}

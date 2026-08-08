/**
 * Build / download `.aurora-package` from a studio sketch.
 */

import {
  type AuroraPackageBundle,
  type AuroraPackageValidationError,
  auroraPackageFileName,
  buildAuroraPackageArchive,
  buildManifest,
  buildThreeManifest,
  isThreePackageBundle,
  parseAuroraPackageArchive,
} from '../../../shared/aurora-package.ts';
import { upsertAuthoredPackage } from '../../../shared/package-channel.ts';
import { putThreePackageBundle } from '../../../shared/three-package-store.ts';
import { compileThreeSource } from './compile-three.ts';
import { knobsToLookDefaults, type StudioSketch } from './sketch-store.ts';

export type ExportLookResult =
  | { ok: true; bytes: Uint8Array; fileName: string; bundle: AuroraPackageBundle }
  | { ok: false; errors: AuroraPackageValidationError[] };

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
export function exportSketchToPackage(sketch: StudioSketch): ExportLookResult {
  if (sketch.backend === 'threejs') {
    const source = sketch.source ?? '';
    const compiled = compileThreeSource(source);
    if (!compiled.ok) return { ok: false, errors: compiled.errors };
    try {
      const bundle: AuroraPackageBundle = {
        manifest: buildThreeManifest({
          slug: sketch.slug,
          label: sketch.label,
          character: sketch.character || undefined,
          uiGroup: sketch.uiGroup,
          renderer: sketch.renderer ?? 'webgl2',
          requiresNativeWebGPU: sketch.requiresNativeWebGPU,
          assets: [],
          studioVersion: 2,
        }),
        source,
        javascript: compiled.javascript,
        sourceMap: compiled.sourceMap,
        assets: {},
        defaults: knobsToLookDefaults(sketch.knobs),
      };
      const bytes = buildAuroraPackageArchive(bundle);
      return { ok: true, bytes, fileName: auroraPackageFileName(sketch.slug), bundle };
    } catch (error) {
      return {
        ok: false,
        errors: [
          { path: 'export', message: error instanceof Error ? error.message : String(error) },
        ],
      };
    }
  }
  const form = detectWgslForm(sketch.wgsl);
  try {
    const bundle: AuroraPackageBundle = {
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
    const bytes = buildAuroraPackageArchive(bundle);
    return {
      ok: true,
      bytes,
      fileName: auroraPackageFileName(sketch.slug),
      bundle,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // buildAuroraPackageArchive throws with joined validation errors.
    return {
      ok: false,
      errors: [{ path: 'export', message }],
    };
  }
}

/** Trigger a browser download of the archive bytes. */
export function downloadPackageArchive(bytes: Uint8Array, fileName: string): void {
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

export type PublishPackageResult =
  | { ok: true; slug: string; label: string }
  | { ok: false; errors: AuroraPackageValidationError[] };

/**
 * Publish sketch to same-origin authored package store + BroadcastChannel.
 * Console/projector pick this up without the bridge (GitHub Pages path).
 */
export function publishSketchToChannel(sketch: StudioSketch): PublishPackageResult {
  if (sketch.backend === 'threejs') {
    return {
      ok: false,
      errors: [
        {
          path: 'publish',
          message:
            'Three.js Publish to Console requires IndexedDB support; export or bridge import is available.',
        },
      ],
    };
  }
  const built = exportSketchToPackage(sketch);
  if (!built.ok) return built;
  try {
    const parsed = parseAuroraPackageArchive(built.bytes, { remapAuthoring: true });
    if (!parsed.ok) return { ok: false, errors: parsed.errors };
    if (parsed.bundle.manifest.target !== 'pack-fullscreen' || !parsed.bundle.wgsl) {
      return { ok: false, errors: [{ path: 'publish', message: 'expected a WGSL package' }] };
    }
    const m = parsed.bundle.manifest;
    const record = upsertAuthoredPackage({
      slug: m.slug,
      label: m.label,
      character: m.character,
      uiGroup: m.uiGroup,
      wgsl: parsed.bundle.wgsl,
      defaults: parsed.bundle.defaults,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, slug: record.slug, label: record.label };
  } catch (e) {
    return {
      ok: false,
      errors: [{ path: 'publish', message: e instanceof Error ? e.message : String(e) }],
    };
  }
}

export async function publishSketchToChannelAsync(
  sketch: StudioSketch,
): Promise<PublishPackageResult> {
  if (sketch.backend !== 'threejs') return publishSketchToChannel(sketch);
  const built = exportSketchToPackage(sketch);
  if (!built.ok) return built;
  if (!isThreePackageBundle(built.bundle)) {
    return { ok: false, errors: [{ path: 'publish', message: 'expected a Three.js bundle' }] };
  }
  try {
    await putThreePackageBundle(built.bundle);
    const manifest = built.bundle.manifest;
    const record = upsertAuthoredPackage({
      slug: manifest.slug,
      label: manifest.label,
      character: manifest.character,
      uiGroup: manifest.uiGroup,
      target: 'threejs',
      renderer: manifest.renderer,
      requiresNativeWebGPU: manifest.requiresNativeWebGPU,
      assets: manifest.assets,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, slug: record.slug, label: record.label };
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          path: 'publish',
          message: `Three.js Publish to Console requires IndexedDB: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
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
 * POST archive bytes to the Aurora bridge package-import endpoint.
 * Requires bridge running with AURORA_DATA_DIR set.
 */
export async function importPackageToBridge(
  bytes: Uint8Array,
  opts?: { bridgeOrigin?: string; signal?: AbortSignal },
): Promise<BridgeImportResult> {
  const origin = (opts?.bridgeOrigin ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const url = `${origin}/api/packages/import`;
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

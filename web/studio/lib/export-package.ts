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
import {
  installAuthoredPackageBundle,
  installWgslAuthoredPackage,
} from '../../../shared/package-install.ts';
import { compileThreeSource } from './compile-three.ts';
import { knobsToLookDefaults, type StudioSketch } from './sketch-store.ts';

// Relocated to shared/ so the Console's package import can reuse it; re-exported
// here because Studio callers and tests import it from this module.
export {
  type BridgeImportResult,
  importPackageToBridge,
} from '../../../shared/package-import-client.ts';

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
        audioMappings: sketch.audioMappings,
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
      audioMappings: sketch.audioMappings,
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
    // parseAuroraPackageArchive already remapped to show form, so the installer
    // has nothing left to convert.
    const record = installWgslAuthoredPackage(parsed.bundle);
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
    const record = await installAuthoredPackageBundle(built.bundle);
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

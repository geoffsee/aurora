/**
 * `.aurora-package` archive format — Preset Studio export / Aurora import contract.
 *
 * See docs/aurora-package.md.
 */

import { MODE_PRESET_SLUG_RE } from './mode-preset-schema.ts';
import { unzipTextEntries, zipStore, zipTextEntries } from './zip-store.ts';

export const AURORA_PACKAGE_KIND = 'aurora-package' as const;
export const AURORA_PACKAGE_SCHEMA_VERSION = 1 as const;
export const AURORA_PACKAGE_UNIFORM_BUS = 'pack-v1' as const;

/** Max sizes for import safety. */
export const AURORA_PACKAGE_MAX_WGSL_BYTES = 256 * 1024;
export const AURORA_PACKAGE_MAX_ARCHIVE_BYTES = 1024 * 1024;

export const AURORA_PACKAGE_TARGETS = ['pack-fullscreen'] as const;
export type AuroraPackageTarget = (typeof AURORA_PACKAGE_TARGETS)[number];

export const AURORA_PACKAGE_WGSL_FORMS = ['show', 'authoring'] as const;
export type AuroraPackageWgslForm = (typeof AURORA_PACKAGE_WGSL_FORMS)[number];

export type AuroraPackageDefaults = {
  intensity?: number;
  depth?: number;
  feedback?: number;
  speed?: number;
  hue?: number;
  sat?: number;
  bright?: number;
};

export type AuroraPackageManifest = {
  schemaVersion: typeof AURORA_PACKAGE_SCHEMA_VERSION;
  kind: typeof AURORA_PACKAGE_KIND;
  slug: string;
  label: string;
  character?: string;
  target: AuroraPackageTarget;
  uniformBus: typeof AURORA_PACKAGE_UNIFORM_BUS;
  disposition: 'fullscreen-primary';
  suppressLegacyField: boolean;
  uiGroup?: string;
  /** show = Bevy @group(2) + import; authoring = Studio @group(0) (remap on import). */
  wgslForm: AuroraPackageWgslForm;
  createdAt?: string;
  studioVersion?: number;
};

export type AuroraPackageBundle = {
  manifest: AuroraPackageManifest;
  /** WGSL source as stored in the archive (may be authoring or show form). */
  wgsl: string;
  defaults?: AuroraPackageDefaults;
};

export type AuroraPackageValidationError = { path: string; message: string };

export type AuroraPackageValidationResult =
  | { ok: true; bundle: AuroraPackageBundle }
  | { ok: false; errors: AuroraPackageValidationError[] };

const BEVY_IMPORT = '#import bevy_sprite::mesh2d_vertex_output::VertexOutput';

const SHOW_UNIFORMS = `// pack-v1 bus (show form) — bindings match VjPackFullscreen*Material
@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@group(2) @binding(4) var<uniform> pack_drive: vec4<f32>;
`;

/** Minimal authoring template (WebGPU-friendly @group(0)). */
export const PACK_V1_AUTHORING_TEMPLATE = `// Preset Studio authoring template — pack-v1 bus (@group(0) for WebGPU preview).
// Export remaps to Bevy @group(2) + VertexOutput import for the show.

@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(0) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(0) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@group(0) @binding(4) var<uniform> pack_drive: vec4<f32>;

@fragment
fn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let t = params.y;
  let aspect = max(params.w, 0.01);
  let intensity = clamp(pack_drive.x, 0.0, 1.0);
  let energy_raw = audio_uniforms.x;
  let live = select(0.0, 1.0, energy_raw >= 0.0);
  let p = (uv - vec2(0.5)) * vec2(aspect, 1.0);
  let r = length(p);
  let pulse = clamp(palette_extra.z, 0.0, 1.0);
  let body = exp(-r * r * (2.0 + intensity * 4.0)) * (0.4 + intensity * 0.6 + pulse * 0.2);
  let base = max(palette_rgb.xyz, vec3(0.05));
  let a = body * clamp(palette_extra.w, 0.0, 1.0) * mix(0.85, 1.0, 0.5 + 0.5 * live);
  // Touch all uniforms so bindings stay live.
  let keep = params.x + audio_uniforms.y + pack_drive.y + pack_drive.z + pack_drive.w + t * 0.0;
  return vec4(base * body + keep * 0.0, a);
}
`;

/** Show-form template (Bevy Material2d). */
export const PACK_V1_SHOW_TEMPLATE = `${BEVY_IMPORT}

${SHOW_UNIFORMS}
@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let t = params.y;
  let aspect = max(params.w, 0.01);
  let intensity = clamp(pack_drive.x, 0.0, 1.0);
  let energy_raw = audio_uniforms.x;
  let live = select(0.0, 1.0, energy_raw >= 0.0);
  let uv = frag.uv;
  let p = (uv - vec2<f32>(0.5)) * vec2<f32>(aspect, 1.0);
  let r = length(p);
  let pulse = clamp(palette_extra.z, 0.0, 1.0);
  let body = exp(-r * r * (2.0 + intensity * 4.0)) * (0.4 + intensity * 0.6 + pulse * 0.2);
  let base = max(palette_rgb.xyz, vec3<f32>(0.05));
  let a = body * clamp(palette_extra.w, 0.0, 1.0) * mix(0.85, 1.0, 0.5 + 0.5 * live);
  let keep = params.x + audio_uniforms.y + pack_drive.y + pack_drive.z + pack_drive.w + t * 0.0;
  return vec4<f32>(base * body + vec3<f32>(keep * 0.0), a);
}
`;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** kebab-case slug from a display label. */
export function slugifyPackageLabel(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  return s || 'untitled-package';
}

export function buildManifest(input: {
  slug: string;
  label: string;
  character?: string;
  uiGroup?: string;
  wgslForm?: AuroraPackageWgslForm;
  createdAt?: string;
  studioVersion?: number;
}): AuroraPackageManifest {
  return {
    schemaVersion: AURORA_PACKAGE_SCHEMA_VERSION,
    kind: AURORA_PACKAGE_KIND,
    slug: input.slug,
    label: input.label,
    character: input.character,
    target: 'pack-fullscreen',
    uniformBus: AURORA_PACKAGE_UNIFORM_BUS,
    disposition: 'fullscreen-primary',
    suppressLegacyField: true,
    uiGroup: input.uiGroup ?? 'field-motion',
    wgslForm: input.wgslForm ?? 'show',
    createdAt: input.createdAt ?? new Date().toISOString(),
    studioVersion: input.studioVersion ?? 1,
  };
}

/**
 * Remap Studio authoring WGSL (@group(0), free fragment args) to Bevy show form.
 * Best-effort text transform; authors can export wgslForm "show" for full control.
 */
export function remapAuthoringWgslToShow(source: string): string {
  let s = source.replace(/\r\n/g, '\n');

  // Strip existing Bevy import; we re-add once at top.
  s = s.replace(/^\s*#import\s+bevy_sprite::mesh2d_vertex_output::VertexOutput\s*\n/gm, '');

  // @group(0) → @group(2) for pack bindings.
  s = s.replace(/@group\(\s*0\s*\)/g, '@group(2)');

  // Authoring entry: @fragment fn fragment(@builtin(position) …, @location(0) uv: vec2) -> …
  // → Bevy Material2d entry + local uv from frag.uv
  const authoringEntry =
    /@fragment\s+fn\s+fragment\s*\(\s*@builtin\(\s*position\s*\)\s+\w+\s*:\s*vec4\s*<\s*f32\s*>\s*,\s*@location\(\s*0\s*\)\s+(\w+)\s*:\s*vec2\s*<\s*f32\s*>\s*\)\s*->\s*@location\(\s*0\s*\)\s*vec4\s*<\s*f32\s*>\s*\{/;

  if (authoringEntry.test(s)) {
    s = s.replace(
      authoringEntry,
      (_m, uvName: string) =>
        `@fragment\nfn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {\n  let ${uvName} = frag.uv;`,
    );
  } else if (!/\bfrag\s*:\s*VertexOutput\b/.test(s)) {
    // Fallback: any @fragment fn fragment(...) that is not already VertexOutput
    s = s.replace(
      /@fragment\s+fn\s+fragment\s*\([^)]*\)\s*->\s*@location\(\s*0\s*\)\s*vec4\s*<\s*f32\s*>\s*\{/,
      `@fragment\nfn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {\n  let uv = frag.uv;`,
    );
  }

  if (!s.includes(BEVY_IMPORT)) {
    s = `${BEVY_IMPORT}\n\n${s}`;
  }

  return `${s.trim()}\n`;
}

function validateWgslShape(
  wgsl: string,
  form: AuroraPackageWgslForm,
): AuroraPackageValidationError[] {
  const errors: AuroraPackageValidationError[] = [];
  if (!wgsl.trim()) {
    errors.push({ path: 'package.wgsl', message: 'empty WGSL' });
    return errors;
  }
  if (new TextEncoder().encode(wgsl).length > AURORA_PACKAGE_MAX_WGSL_BYTES) {
    errors.push({
      path: 'package.wgsl',
      message: `WGSL exceeds ${AURORA_PACKAGE_MAX_WGSL_BYTES} bytes`,
    });
  }
  if (!/@fragment/.test(wgsl) || !/\bfn\s+fragment\b/.test(wgsl)) {
    errors.push({ path: 'package.wgsl', message: 'must define @fragment fn fragment' });
  }
  // Pack bus names must appear so bindings are intentional.
  for (const name of ['params', 'palette_extra', 'audio_uniforms', 'palette_rgb', 'pack_drive']) {
    if (!wgsl.includes(name)) {
      errors.push({ path: 'package.wgsl', message: `missing pack-v1 uniform name "${name}"` });
    }
  }
  if (form === 'show') {
    if (!wgsl.includes('@group(2)')) {
      errors.push({ path: 'package.wgsl', message: 'show form requires @group(2) bindings' });
    }
    if (!wgsl.includes('VertexOutput')) {
      errors.push({
        path: 'package.wgsl',
        message: 'show form requires bevy VertexOutput fragment input',
      });
    }
  }
  return errors;
}

export function validateManifest(raw: unknown): AuroraPackageValidationResult {
  const errors: AuroraPackageValidationError[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: [{ path: 'manifest.json', message: 'must be an object' }] };
  }
  if (raw.schemaVersion !== AURORA_PACKAGE_SCHEMA_VERSION) {
    errors.push({
      path: 'manifest.schemaVersion',
      message: `expected ${AURORA_PACKAGE_SCHEMA_VERSION}`,
    });
  }
  if (raw.kind !== AURORA_PACKAGE_KIND) {
    errors.push({ path: 'manifest.kind', message: `expected "${AURORA_PACKAGE_KIND}"` });
  }
  if (typeof raw.slug !== 'string' || !MODE_PRESET_SLUG_RE.test(raw.slug)) {
    errors.push({ path: 'manifest.slug', message: 'must be kebab-case slug' });
  }
  if (typeof raw.label !== 'string' || !raw.label.trim()) {
    errors.push({ path: 'manifest.label', message: 'required non-empty string' });
  }
  if (raw.target !== 'pack-fullscreen') {
    errors.push({ path: 'manifest.target', message: 'v1 only supports pack-fullscreen' });
  }
  if (raw.uniformBus !== AURORA_PACKAGE_UNIFORM_BUS) {
    errors.push({
      path: 'manifest.uniformBus',
      message: `expected "${AURORA_PACKAGE_UNIFORM_BUS}"`,
    });
  }
  if (raw.disposition !== 'fullscreen-primary') {
    errors.push({ path: 'manifest.disposition', message: 'expected fullscreen-primary' });
  }
  if (raw.suppressLegacyField !== true) {
    errors.push({
      path: 'manifest.suppressLegacyField',
      message: 'must be true for pack-fullscreen',
    });
  }
  if (raw.wgslForm !== 'show' && raw.wgslForm !== 'authoring') {
    errors.push({ path: 'manifest.wgslForm', message: 'must be "show" or "authoring"' });
  }

  if (errors.length) return { ok: false, errors };

  const manifest: AuroraPackageManifest = {
    schemaVersion: AURORA_PACKAGE_SCHEMA_VERSION,
    kind: AURORA_PACKAGE_KIND,
    slug: raw.slug as string,
    label: (raw.label as string).trim(),
    character: typeof raw.character === 'string' ? raw.character : undefined,
    target: 'pack-fullscreen',
    uniformBus: AURORA_PACKAGE_UNIFORM_BUS,
    disposition: 'fullscreen-primary',
    suppressLegacyField: true,
    uiGroup: typeof raw.uiGroup === 'string' ? raw.uiGroup : 'field-motion',
    wgslForm: raw.wgslForm as AuroraPackageWgslForm,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    studioVersion: typeof raw.studioVersion === 'number' ? raw.studioVersion : undefined,
  };

  // Placeholder wgsl; full validate uses validateBundle
  return { ok: true, bundle: { manifest, wgsl: '' } };
}

export function validateDefaults(
  raw: unknown,
): AuroraPackageDefaults | AuroraPackageValidationError[] {
  if (raw === undefined || raw === null) return {};
  if (!isRecord(raw)) return [{ path: 'defaults.json', message: 'must be an object' }];
  const out: AuroraPackageDefaults = {};
  for (const key of ['intensity', 'depth', 'feedback', 'speed', 'hue', 'sat', 'bright'] as const) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key])) {
      return [{ path: `defaults.${key}`, message: 'must be a finite number' }];
    }
    out[key] = clamp01(raw[key] as number);
  }
  return out;
}

export function validateBundle(bundle: AuroraPackageBundle): AuroraPackageValidationResult {
  const man = validateManifest(bundle.manifest);
  if (!man.ok) return man;
  const errors = validateWgslShape(bundle.wgsl, bundle.manifest.wgslForm);
  if (bundle.defaults) {
    const d = validateDefaults(bundle.defaults);
    if (Array.isArray(d)) errors.push(...d);
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    bundle: {
      manifest: man.bundle.manifest,
      wgsl: bundle.wgsl,
      defaults: bundle.defaults,
    },
  };
}

/** Build zip bytes for a validated (or pre-validation) bundle. */
export function buildAuroraPackageArchive(bundle: AuroraPackageBundle): Uint8Array {
  const checked = validateBundle(bundle);
  if (!checked.ok) {
    throw new Error(
      `aurora-package build failed: ${checked.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
  const files: Record<string, string> = {
    'manifest.json': `${JSON.stringify(checked.bundle.manifest, null, 2)}\n`,
    'package.wgsl': checked.bundle.wgsl.endsWith('\n')
      ? checked.bundle.wgsl
      : `${checked.bundle.wgsl}\n`,
  };
  if (checked.bundle.defaults && Object.keys(checked.bundle.defaults).length > 0) {
    files['defaults.json'] = `${JSON.stringify(checked.bundle.defaults, null, 2)}\n`;
  }
  const archive = zipTextEntries(files);
  if (archive.byteLength > AURORA_PACKAGE_MAX_ARCHIVE_BYTES) {
    throw new Error(`aurora-package archive exceeds ${AURORA_PACKAGE_MAX_ARCHIVE_BYTES} bytes`);
  }
  return archive;
}

/** Parse + validate an archive. Optionally remaps authoring WGSL to show form. */
export function parseAuroraPackageArchive(
  bytes: Uint8Array,
  opts?: { remapAuthoring?: boolean },
): AuroraPackageValidationResult {
  if (bytes.byteLength > AURORA_PACKAGE_MAX_ARCHIVE_BYTES) {
    return {
      ok: false,
      errors: [
        {
          path: 'archive',
          message: `exceeds ${AURORA_PACKAGE_MAX_ARCHIVE_BYTES} bytes`,
        },
      ],
    };
  }

  let files: Record<string, string>;
  try {
    files = unzipTextEntries(bytes);
  } catch (e) {
    return {
      ok: false,
      errors: [{ path: 'archive', message: e instanceof Error ? e.message : String(e) }],
    };
  }

  if (!files['manifest.json']) {
    return { ok: false, errors: [{ path: 'manifest.json', message: 'missing from archive' }] };
  }
  if (!files['package.wgsl']) {
    return { ok: false, errors: [{ path: 'package.wgsl', message: 'missing from archive' }] };
  }

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(files['manifest.json']);
  } catch {
    return { ok: false, errors: [{ path: 'manifest.json', message: 'invalid JSON' }] };
  }

  const man = validateManifest(manifestRaw);
  if (!man.ok) return man;

  let defaults: AuroraPackageDefaults | undefined;
  if (files['defaults.json']) {
    try {
      const d = validateDefaults(JSON.parse(files['defaults.json']));
      if (Array.isArray(d)) return { ok: false, errors: d };
      defaults = d;
    } catch {
      return { ok: false, errors: [{ path: 'defaults.json', message: 'invalid JSON' }] };
    }
  }

  let wgsl = files['package.wgsl'];
  let form = man.bundle.manifest.wgslForm;
  if (opts?.remapAuthoring !== false && form === 'authoring') {
    wgsl = remapAuthoringWgslToShow(wgsl);
    form = 'show';
  }

  const bundle: AuroraPackageBundle = {
    manifest: { ...man.bundle.manifest, wgslForm: form },
    wgsl,
    defaults,
  };
  return validateBundle(bundle);
}

/**
 * ModePreset-shaped object for installing under data/decks/.../preset.json.
 * Pure data — does not write disk.
 */
export function auroraPackageToModePreset(bundle: AuroraPackageBundle): {
  schemaVersion: 1;
  id: string;
  slug: string;
  label: string;
  character?: string;
  uiGroup?: string;
  disposition: 'fullscreen-primary';
  layers: [{ kind: 'fullscreen'; ref: string }];
  suppressLegacyField: true;
  engineMinCapabilities: ['dual-fullscreen'];
} {
  const { manifest } = bundle;
  const ref = `${manifest.slug.replace(/-/g, '_')}.wgsl`;
  return {
    schemaVersion: 1,
    id: manifest.slug,
    slug: manifest.slug,
    label: manifest.label,
    character: manifest.character,
    uiGroup: manifest.uiGroup ?? 'field-motion',
    disposition: 'fullscreen-primary',
    layers: [{ kind: 'fullscreen', ref }],
    suppressLegacyField: true,
    engineMinCapabilities: ['dual-fullscreen'],
  };
}

/** Filename for the WGSL asset next to preset.json. */
export function auroraPackageWgslFileName(slug: string): string {
  return `${slug.replace(/-/g, '_')}.wgsl`;
}

/** Download-friendly archive name. */
export function auroraPackageFileName(slug: string): string {
  return `${slug}.aurora-package`;
}

// Re-export zip helpers for Studio/bridge without reaching into zip-store.
export { unzipTextEntries, zipStore, zipTextEntries };

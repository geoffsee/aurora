/**
 * `.aurora-package` archive format — Preset Studio export / Aurora import contract.
 *
 * See docs/aurora-package.md.
 */

import { MODE_PRESET_SLUG_RE } from './mode-preset-schema.ts';
import {
  unzipStore,
  unzipTextEntries,
  type ZipEntry,
  zipStore,
  zipTextEntries,
} from './zip-store.ts';

export const AURORA_PACKAGE_KIND = 'aurora-package' as const;
/** The legacy WGSL schema remains the default for existing callers. */
export const AURORA_PACKAGE_SCHEMA_VERSION = 1 as const;
export const AURORA_THREE_PACKAGE_SCHEMA_VERSION = 2 as const;
export const AURORA_PACKAGE_UNIFORM_BUS = 'pack-v1' as const;
export const AURORA_THREE_RUNTIME = 'three-v1' as const;
export const AURORA_THREE_INPUT_BUS = 'aurora-frame-v1' as const;

/** Max sizes for import safety. */
export const AURORA_PACKAGE_MAX_WGSL_BYTES = 256 * 1024;
export const AURORA_PACKAGE_MAX_SOURCE_BYTES = 512 * 1024;
export const AURORA_PACKAGE_MAX_JAVASCRIPT_BYTES = 512 * 1024;
export const AURORA_PACKAGE_MAX_ASSET_BYTES = 32 * 1024 * 1024;
export const AURORA_PACKAGE_MAX_ASSETS = 64;
export const AURORA_PACKAGE_MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

export const AURORA_PACKAGE_TARGETS = ['pack-fullscreen', 'threejs'] as const;
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

export type AuroraWgslPackageManifest = {
  schemaVersion: typeof AURORA_PACKAGE_SCHEMA_VERSION;
  kind: typeof AURORA_PACKAGE_KIND;
  slug: string;
  label: string;
  character?: string;
  target: 'pack-fullscreen';
  uniformBus: typeof AURORA_PACKAGE_UNIFORM_BUS;
  disposition: 'fullscreen-primary';
  suppressLegacyField: boolean;
  uiGroup?: string;
  /** show = Bevy @group(2) + import; authoring = Studio @group(0) (remap on import). */
  wgslForm: AuroraPackageWgslForm;
  createdAt?: string;
  studioVersion?: number;
};

export type AuroraThreeRenderer = 'webgl2' | 'webgpu';

export type AuroraThreeAssetManifestEntry = {
  path: `assets/${string}`;
  mediaType: string;
  bytes: number;
};

export type AuroraThreePackageManifest = {
  schemaVersion: typeof AURORA_THREE_PACKAGE_SCHEMA_VERSION;
  kind: typeof AURORA_PACKAGE_KIND;
  slug: string;
  label: string;
  character?: string;
  target: 'threejs';
  runtime: typeof AURORA_THREE_RUNTIME;
  renderer: AuroraThreeRenderer;
  requiresNativeWebGPU: boolean;
  entry: 'visualization.js';
  source: 'visualization.ts';
  inputBus: typeof AURORA_THREE_INPUT_BUS;
  disposition: 'fullscreen-primary';
  suppressLegacyField: true;
  uiGroup?: string;
  assets: AuroraThreeAssetManifestEntry[];
  createdAt?: string;
  studioVersion?: number;
  /** Absent on v2; retained as an optional key for source compatibility. */
  wgslForm?: undefined;
};

export type AuroraPackageManifest = AuroraWgslPackageManifest | AuroraThreePackageManifest;

export type AuroraWgslPackageBundle = {
  manifest: AuroraWgslPackageManifest;
  /** WGSL source as stored in the archive (may be authoring or show form). */
  wgsl: string;
  defaults?: AuroraPackageDefaults;
  source?: undefined;
  javascript?: undefined;
  sourceMap?: undefined;
  assets?: undefined;
};

export type AuroraThreePackageBundle = {
  manifest: AuroraThreePackageManifest;
  source: string;
  javascript: string;
  sourceMap?: string;
  assets: Record<string, Uint8Array>;
  defaults?: AuroraPackageDefaults;
  wgsl?: undefined;
};

export type AuroraPackageBundle = AuroraWgslPackageBundle | AuroraThreePackageBundle;

export function isThreePackageBundle(
  bundle: AuroraPackageBundle,
): bundle is AuroraThreePackageBundle {
  return bundle.manifest.target === 'threejs';
}

export function isWgslPackageBundle(
  bundle: AuroraPackageBundle,
): bundle is AuroraWgslPackageBundle {
  return bundle.manifest.target === 'pack-fullscreen';
}

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
export const PACK_V1_AUTHORING_TEMPLATE = `// Point Cloud Waves — monochrome particle heightfield horizon (authoring pack-v1).
// Reference: sparse-to-dense white dots forming rolling hills over pure black.
// Studio UV: y=0 top, y=1 bottom.

@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(0) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(0) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@group(0) @binding(4) var<uniform> pack_drive: vec4<f32>;

const TAU: f32 = 6.283185307179586;

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn noise2(p: vec2<f32>) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(p: vec2<f32>) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p;
  for (var n = 0; n < 5; n = n + 1) {
    v = v + a * noise2(q);
    q = q * 2.03 + vec2<f32>(13.0, -8.0);
    a = a * 0.5;
  }
  return v;
}

fn terrain_height(xz: vec2<f32>, t: f32, wave: f32, bass: f32, mid: f32) -> f32 {
  let p = xz * 0.28 + vec2<f32>(t * 0.14, t * 0.05);
  var h = fbm(p) * 1.05;
  h = h + 0.38 * fbm(p * 2.0 + vec2<f32>(2.7, -1.4));
  h = h + wave * 0.62 * sin(xz.y * 0.55 - t * 0.75 + xz.x * 0.1);
  h = h + wave * 0.32 * sin(xz.x * 0.48 + t * 0.5 + xz.y * 0.18);
  h = h + wave * 0.2 * sin(xz.y * 1.15 + xz.x * 0.75 - t * 1.05);
  h = h + bass * 0.22 * sin(xz.y * 1.1 - t * 1.55);
  h = h + mid * 0.1 * sin(xz.x * 1.6 + t * 1.2);
  return h * 0.9;
}

@fragment
fn fragment(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let t0 = params.y;
  let aspect = max(params.w, 0.01);
  let intensity = clamp(pack_drive.x, 0.0, 1.0);
  let depth_k = clamp(pack_drive.y, 0.0, 1.0);
  let feedback = clamp(pack_drive.z, 0.0, 1.0);
  let speed = clamp(pack_drive.w, 0.0, 1.0);

  let energy_raw = audio_uniforms.x;
  let live = select(0.0, 1.0, energy_raw >= 0.0);
  let energy = select(0.2, clamp(energy_raw, 0.0, 1.0), energy_raw >= 0.0);
  let bass = select(0.12, clamp(audio_uniforms.y, 0.0, 1.0), energy_raw >= 0.0);
  let mid = select(0.1, clamp(audio_uniforms.z, 0.0, 1.0), energy_raw >= 0.0);
  let high = select(0.08, clamp(audio_uniforms.w, 0.0, 1.0), energy_raw >= 0.0);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.5);
  let pulse = clamp(palette_extra.z, 0.0, 1.0);
  let alpha = clamp(palette_extra.w, 0.0, 1.0);

  if (alpha < 0.001) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  let t = t0 * (0.5 + speed * 0.95);
  let wave = 0.55 + intensity * 0.4 + energy * 0.22 + pulse * 0.12;

  let horizon = mix(0.28, 0.34, depth_k);
  if (uv.y < horizon) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  // Higher camera → more sky / less solid near-field wall.
  let cam_h = mix(1.7, 2.3, depth_k) + bass * 0.1;
  let fov = mix(1.15, 1.55, depth_k);

  // World lattice density. Higher intensity = more dots.
  let dens = mix(4.0, 11.0, clamp(0.2 + intensity * 0.75 + energy * 0.1, 0.0, 1.0));
  let dens_z = dens * mix(1.35, 1.85, depth_k);

  let far_z = mix(20.0, 34.0, depth_k);
  let near_z = 1.2;
  let layers = i32(mix(80.0, 130.0, 0.35 + depth_k * 0.45 + intensity * 0.2));

  // Max-blend so dots stay discrete (no white sheet).
  var acc = 0.0;

  for (var i = 0; i < 140; i = i + 1) {
    if (i >= layers) {
      break;
    }
    let fi = f32(i) / max(f32(layers - 1), 1.0);
    let zz = mix(near_z, far_z, pow(fi, mix(0.88, 0.7, depth_k)));
    let xx = (uv.x - 0.5) * aspect * zz * fov;

    let base_cell = vec2<f32>(floor(xx * dens + 0.5), floor(zz * dens_z + 0.5));

    for (var ox = -1; ox <= 1; ox = ox + 1) {
      let cell = base_cell + vec2<f32>(f32(ox), 0.0);
      let rnd = hash21(cell);
      // Keep most cells lit at high intensity; thin when low.
      let emit = mix(0.55, 0.92, intensity) + high * 0.03;
      if (rnd > emit) {
        continue;
      }

      let jx = hash21(cell + vec2<f32>(3.3, 5.7)) - 0.5;
      let jz = hash21(cell + vec2<f32>(8.2, 1.1)) - 0.5;
      let xz = vec2<f32>(
        (cell.x + jx * 0.4) / dens,
        max((cell.y + jz * 0.4) / dens_z, 1.0),
      );

      let h = terrain_height(xz, t, wave, bass, mid);
      let py = horizon + (cam_h - h) / xz.y * 0.7;
      let px = 0.5 + xz.x / (xz.y * fov * aspect);

      if (py < horizon || py > 1.02) {
        continue;
      }

      let d = distance(uv, vec2<f32>(px, py));
      // Small, crisp dots — scale with perspective but stay sparse.
      let persp = clamp(1.6 / xz.y, 0.35, 2.2);
      let radius = (0.0022 + 0.0028 * intensity) * persp * (1.0 + feedback * 0.45 + pulse * 0.08);
      let core = 1.0 - smoothstep(radius * 0.25, radius, d);
      let halo = (1.0 - smoothstep(radius, radius * 1.9, d)) * 0.25;
      let point = max(core, halo);

      // Distance fade (far rows dimmer, still visible).
      let fade = exp(-xz.y * mix(0.04, 0.022, depth_k));
      // Slight crest emphasis without filling valleys solid.
      let crest = 0.75 + 0.25 * smoothstep(0.2, 0.9, h);
      let twinkle = 0.92 + 0.08 * sin(t * mix(1.6, 0.6, feedback) + rnd * TAU + high * 2.5);
      acc = max(acc, point * fade * crest * twinkle);
    }
  }

  // Keep black between dots.
  var body = smoothstep(0.05, 0.9, acc);
  body = body * (0.55 + intensity * 0.55);

  let base = max(palette_rgb.xyz, vec3<f32>(0.05));
  let gray = vec3<f32>(dot(base, vec3<f32>(0.299, 0.587, 0.114)));
  var col = mix(vec3<f32>(1.0), mix(gray, base, sat), clamp(sat * 1.2, 0.0, 1.0));
  col = col * bri * body * (1.05 + energy * 0.1);
  col = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));

  let a = body * alpha * mix(0.92, 1.0, 0.5 + 0.5 * live);
  // Premultiply for studio canvas alphaMode.
  return vec4<f32>(col * a, a);
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
}): AuroraWgslPackageManifest {
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

export function buildThreeManifest(input: {
  slug: string;
  label: string;
  renderer: AuroraThreeRenderer;
  requiresNativeWebGPU?: boolean;
  character?: string;
  uiGroup?: string;
  assets?: AuroraThreeAssetManifestEntry[];
  createdAt?: string;
  studioVersion?: number;
}): AuroraThreePackageManifest {
  return {
    schemaVersion: AURORA_THREE_PACKAGE_SCHEMA_VERSION,
    kind: AURORA_PACKAGE_KIND,
    slug: input.slug,
    label: input.label,
    character: input.character,
    target: 'threejs',
    runtime: AURORA_THREE_RUNTIME,
    renderer: input.renderer,
    requiresNativeWebGPU: input.requiresNativeWebGPU ?? false,
    entry: 'visualization.js',
    source: 'visualization.ts',
    inputBus: AURORA_THREE_INPUT_BUS,
    disposition: 'fullscreen-primary',
    suppressLegacyField: true,
    uiGroup: input.uiGroup ?? 'field-motion',
    assets: input.assets ?? [],
    createdAt: input.createdAt ?? new Date().toISOString(),
    studioVersion: input.studioVersion ?? 2,
  };
}

export const AURORA_THREE_ALLOWED_IMPORTS = new Set([
  'three',
  'three/webgpu',
  'three/tsl',
  'three/addons/controls/OrbitControls.js',
  'three/addons/loaders/GLTFLoader.js',
  'three/addons/loaders/DRACOLoader.js',
  'three/addons/loaders/KTX2Loader.js',
  'three/addons/loaders/RGBELoader.js',
  'three/addons/loaders/EXRLoader.js',
  'three/addons/loaders/FontLoader.js',
  'three/addons/utils/BufferGeometryUtils.js',
  'three/addons/geometries/TextGeometry.js',
  'three/addons/objects/Sky.js',
  'three/addons/postprocessing/EffectComposer.js',
  'three/addons/postprocessing/RenderPass.js',
  'three/addons/postprocessing/ShaderPass.js',
  'three/addons/postprocessing/OutputPass.js',
  'three/addons/postprocessing/UnrealBloomPass.js',
  'three/addons/shaders/FXAAShader.js',
  'three/addons/tsl/display/BloomNode.js',
  'three/addons/tsl/display/GTAONode.js',
  'three/addons/tsl/display/DepthOfFieldNode.js',
  'three/addons/tsl/display/OutlineNode.js',
]);

/** Validate static source imports before Studio compilation or archive import. */
export function validateThreeImports(source: string): AuroraPackageValidationError[] {
  const errors: AuroraPackageValidationError[] = [];
  const dynamic = /\bimport\s*\(/g;
  if (dynamic.test(source)) {
    errors.push({ path: 'visualization.ts', message: 'dynamic import() is not allowed' });
  }
  const imports = /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(imports)) {
    const specifier = match[1] ?? '';
    if (!AURORA_THREE_ALLOWED_IMPORTS.has(specifier)) {
      errors.push({
        path: 'visualization.ts',
        message: `import "${specifier}" is not in the three-v1 allowlist`,
      });
    }
  }
  return errors;
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
    /@fragment\s+fn\s+fragment\s*\(\s*@builtin\(\s*position\s*\)\s+\w+\s*:\s*vec4\s*<\s*f32\s*>\s*,\s*@location\(\s*0\s*\)\s+(\w+)\s*:\s*vec2\s*<\s*f32\s*>\s*,?\s*\)\s*->\s*@location\(\s*0\s*\)\s*vec4\s*<\s*f32\s*>\s*\{/;

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
  if (raw.kind !== AURORA_PACKAGE_KIND) {
    errors.push({ path: 'manifest.kind', message: `expected "${AURORA_PACKAGE_KIND}"` });
  }
  if (typeof raw.slug !== 'string' || !MODE_PRESET_SLUG_RE.test(raw.slug)) {
    errors.push({ path: 'manifest.slug', message: 'must be kebab-case slug' });
  }
  if (typeof raw.label !== 'string' || !raw.label.trim()) {
    errors.push({ path: 'manifest.label', message: 'required non-empty string' });
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
  if (raw.schemaVersion === AURORA_PACKAGE_SCHEMA_VERSION) {
    if (raw.target !== 'pack-fullscreen') {
      errors.push({ path: 'manifest.target', message: 'v1 only supports pack-fullscreen' });
    }
    if (raw.uniformBus !== AURORA_PACKAGE_UNIFORM_BUS) {
      errors.push({
        path: 'manifest.uniformBus',
        message: `expected "${AURORA_PACKAGE_UNIFORM_BUS}"`,
      });
    }
    if (raw.wgslForm !== 'show' && raw.wgslForm !== 'authoring') {
      errors.push({ path: 'manifest.wgslForm', message: 'must be "show" or "authoring"' });
    }
    if (errors.length) return { ok: false, errors };
    const manifest: AuroraWgslPackageManifest = {
      schemaVersion: 1,
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
    return { ok: true, bundle: { manifest, wgsl: '' } };
  }

  if (raw.schemaVersion !== AURORA_THREE_PACKAGE_SCHEMA_VERSION) {
    errors.push({ path: 'manifest.schemaVersion', message: 'expected 1 or 2' });
    return { ok: false, errors };
  }
  if (raw.target !== 'threejs')
    errors.push({ path: 'manifest.target', message: 'v2 requires threejs' });
  if (raw.runtime !== AURORA_THREE_RUNTIME)
    errors.push({ path: 'manifest.runtime', message: `expected "${AURORA_THREE_RUNTIME}"` });
  if (raw.renderer !== 'webgl2' && raw.renderer !== 'webgpu')
    errors.push({ path: 'manifest.renderer', message: 'must be "webgl2" or "webgpu"' });
  if (typeof raw.requiresNativeWebGPU !== 'boolean')
    errors.push({ path: 'manifest.requiresNativeWebGPU', message: 'must be a boolean' });
  if (raw.requiresNativeWebGPU === true && raw.renderer !== 'webgpu')
    errors.push({ path: 'manifest.requiresNativeWebGPU', message: 'requires renderer "webgpu"' });
  if (raw.entry !== 'visualization.js')
    errors.push({ path: 'manifest.entry', message: 'expected "visualization.js"' });
  if (raw.source !== 'visualization.ts')
    errors.push({ path: 'manifest.source', message: 'expected "visualization.ts"' });
  if (raw.inputBus !== AURORA_THREE_INPUT_BUS)
    errors.push({ path: 'manifest.inputBus', message: `expected "${AURORA_THREE_INPUT_BUS}"` });
  if (!Array.isArray(raw.assets)) {
    errors.push({ path: 'manifest.assets', message: 'must be an array' });
  } else if (raw.assets.length > AURORA_PACKAGE_MAX_ASSETS) {
    errors.push({
      path: 'manifest.assets',
      message: `at most ${AURORA_PACKAGE_MAX_ASSETS} assets`,
    });
  }
  const assets: AuroraThreeAssetManifestEntry[] = [];
  const assetPaths = new Set<string>();
  if (Array.isArray(raw.assets)) {
    raw.assets.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push({ path: `manifest.assets[${index}]`, message: 'must be an object' });
        return;
      }
      const path = typeof item.path === 'string' ? item.path : '';
      if (
        !/^assets\/[A-Za-z0-9._/-]+$/.test(path) ||
        path.split('/').some((p) => p === '' || p === '..' || p === '.')
      ) {
        errors.push({
          path: `manifest.assets[${index}].path`,
          message: 'must be a safe path under assets/',
        });
      } else if (assetPaths.has(path)) {
        errors.push({ path: `manifest.assets[${index}].path`, message: 'duplicate asset path' });
      } else assetPaths.add(path);
      if (typeof item.mediaType !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(item.mediaType))
        errors.push({
          path: `manifest.assets[${index}].mediaType`,
          message: 'must be a media type',
        });
      if (
        !Number.isInteger(item.bytes) ||
        (item.bytes as number) < 0 ||
        (item.bytes as number) > AURORA_PACKAGE_MAX_ASSET_BYTES
      )
        errors.push({
          path: `manifest.assets[${index}].bytes`,
          message: `must be 0..${AURORA_PACKAGE_MAX_ASSET_BYTES}`,
        });
      if (path)
        assets.push({
          path: path as `assets/${string}`,
          mediaType: item.mediaType as string,
          bytes: item.bytes as number,
        });
    });
  }
  if (errors.length) return { ok: false, errors };
  const manifest: AuroraThreePackageManifest = {
    schemaVersion: 2,
    kind: AURORA_PACKAGE_KIND,
    slug: raw.slug as string,
    label: (raw.label as string).trim(),
    character: typeof raw.character === 'string' ? raw.character : undefined,
    target: 'threejs',
    runtime: AURORA_THREE_RUNTIME,
    renderer: raw.renderer as AuroraThreeRenderer,
    requiresNativeWebGPU: raw.requiresNativeWebGPU as boolean,
    entry: 'visualization.js',
    source: 'visualization.ts',
    inputBus: AURORA_THREE_INPUT_BUS,
    disposition: 'fullscreen-primary',
    suppressLegacyField: true,
    uiGroup: typeof raw.uiGroup === 'string' ? raw.uiGroup : 'field-motion',
    assets,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    studioVersion: typeof raw.studioVersion === 'number' ? raw.studioVersion : undefined,
  };
  return { ok: true, bundle: { manifest, source: '', javascript: '', assets: {} } };
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
  const errors: AuroraPackageValidationError[] = [];
  if (isWgslPackageBundle(bundle)) {
    if (!('wgsl' in bundle))
      return { ok: false, errors: [{ path: 'package.wgsl', message: 'missing' }] };
    errors.push(...validateWgslShape(bundle.wgsl, bundle.manifest.wgslForm));
  } else {
    if (!('source' in bundle) || !('javascript' in bundle) || !('assets' in bundle)) {
      return { ok: false, errors: [{ path: 'archive', message: 'incomplete Three.js bundle' }] };
    }
    const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;
    if (!bundle.source.trim())
      errors.push({ path: 'visualization.ts', message: 'empty TypeScript source' });
    if (byteLength(bundle.source) > AURORA_PACKAGE_MAX_SOURCE_BYTES)
      errors.push({
        path: 'visualization.ts',
        message: `exceeds ${AURORA_PACKAGE_MAX_SOURCE_BYTES} bytes`,
      });
    if (!bundle.javascript.trim())
      errors.push({ path: 'visualization.js', message: 'empty JavaScript module' });
    if (byteLength(bundle.javascript) > AURORA_PACKAGE_MAX_JAVASCRIPT_BYTES)
      errors.push({
        path: 'visualization.js',
        message: `exceeds ${AURORA_PACKAGE_MAX_JAVASCRIPT_BYTES} bytes`,
      });
    if (
      !/\bexport\s+default\b/.test(bundle.source) ||
      !/\bexport\s+default\b/.test(bundle.javascript)
    )
      errors.push({
        path: 'visualization.js',
        message: 'source and executable must default-export a factory',
      });
    errors.push(...validateThreeImports(bundle.source));
    const declared = new Map(bundle.manifest.assets.map((asset) => [asset.path, asset]));
    for (const [path, bytes] of Object.entries(bundle.assets)) {
      const asset = declared.get(path as `assets/${string}`);
      if (!asset) errors.push({ path, message: 'asset is not declared in manifest' });
      else if (asset.bytes !== bytes.byteLength)
        errors.push({
          path,
          message: `byte count mismatch (${bytes.byteLength} != ${asset.bytes})`,
        });
      if (bytes.byteLength > AURORA_PACKAGE_MAX_ASSET_BYTES)
        errors.push({ path, message: `exceeds ${AURORA_PACKAGE_MAX_ASSET_BYTES} bytes` });
    }
    for (const asset of bundle.manifest.assets)
      if (!(asset.path in bundle.assets))
        errors.push({ path: asset.path, message: 'declared asset missing from archive' });
  }
  if (bundle.defaults) {
    const d = validateDefaults(bundle.defaults);
    if (Array.isArray(d)) errors.push(...d);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, bundle };
}

/** Build zip bytes for a validated (or pre-validation) bundle. */
export function buildAuroraPackageArchive(bundle: AuroraPackageBundle): Uint8Array {
  const checked = validateBundle(bundle);
  if (!checked.ok) {
    throw new Error(
      `aurora-package build failed: ${checked.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
  const encode = (text: string) => new TextEncoder().encode(text);
  const entries: ZipEntry[] = [
    {
      name: 'manifest.json',
      data: encode(`${JSON.stringify(checked.bundle.manifest, null, 2)}\n`),
    },
  ];
  if (isWgslPackageBundle(checked.bundle)) {
    entries.push({
      name: 'package.wgsl',
      data: encode(
        checked.bundle.wgsl.endsWith('\n') ? checked.bundle.wgsl : `${checked.bundle.wgsl}\n`,
      ),
    });
  } else {
    entries.push({ name: 'visualization.ts', data: encode(checked.bundle.source) });
    entries.push({ name: 'visualization.js', data: encode(checked.bundle.javascript) });
    if (checked.bundle.sourceMap)
      entries.push({ name: 'visualization.js.map', data: encode(checked.bundle.sourceMap) });
    for (const asset of checked.bundle.manifest.assets)
      entries.push({ name: asset.path, data: checked.bundle.assets[asset.path] as Uint8Array });
  }
  if (checked.bundle.defaults && Object.keys(checked.bundle.defaults).length > 0)
    entries.push({
      name: 'defaults.json',
      data: encode(`${JSON.stringify(checked.bundle.defaults, null, 2)}\n`),
    });
  const archive = zipStore(entries);
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

  let entries: ReturnType<typeof unzipStore>;
  try {
    entries = unzipStore(bytes);
  } catch (e) {
    return {
      ok: false,
      errors: [{ path: 'archive', message: e instanceof Error ? e.message : String(e) }],
    };
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const byName = new Map(entries.map((entry) => [entry.name, entry.data]));
  const text = (name: string): string | undefined => {
    const data = byName.get(name);
    return data ? decoder.decode(data) : undefined;
  };
  if (!byName.has('manifest.json')) {
    return { ok: false, errors: [{ path: 'manifest.json', message: 'missing from archive' }] };
  }
  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(text('manifest.json') as string);
  } catch {
    return { ok: false, errors: [{ path: 'manifest.json', message: 'invalid JSON' }] };
  }

  const man = validateManifest(manifestRaw);
  if (!man.ok) return man;

  const allowed = new Set(['manifest.json', 'defaults.json']);
  if (man.bundle.manifest.target === 'pack-fullscreen') allowed.add('package.wgsl');
  else {
    allowed.add('visualization.ts');
    allowed.add('visualization.js');
    allowed.add('visualization.js.map');
    for (const asset of man.bundle.manifest.assets) allowed.add(asset.path);
  }
  const undeclared = entries.find((entry) => !allowed.has(entry.name));
  if (undeclared)
    return {
      ok: false,
      errors: [{ path: undeclared.name, message: 'undeclared file in archive' }],
    };

  let defaults: AuroraPackageDefaults | undefined;
  if (byName.has('defaults.json')) {
    try {
      const d = validateDefaults(JSON.parse(text('defaults.json') as string));
      if (Array.isArray(d)) return { ok: false, errors: d };
      defaults = d;
    } catch {
      return { ok: false, errors: [{ path: 'defaults.json', message: 'invalid JSON' }] };
    }
  }

  if (man.bundle.manifest.target === 'threejs') {
    for (const name of ['visualization.ts', 'visualization.js'])
      if (!byName.has(name))
        return { ok: false, errors: [{ path: name, message: 'missing from archive' }] };
    try {
      const bundle: AuroraThreePackageBundle = {
        manifest: man.bundle.manifest,
        source: text('visualization.ts') as string,
        javascript: text('visualization.js') as string,
        sourceMap: byName.has('visualization.js.map') ? text('visualization.js.map') : undefined,
        assets: Object.fromEntries(
          man.bundle.manifest.assets.map((asset) => [
            asset.path,
            byName.get(asset.path) as Uint8Array,
          ]),
        ),
        defaults,
      };
      return validateBundle(bundle);
    } catch (error) {
      return {
        ok: false,
        errors: [
          { path: 'archive', message: error instanceof Error ? error.message : String(error) },
        ],
      };
    }
  }
  if (!byName.has('package.wgsl'))
    return { ok: false, errors: [{ path: 'package.wgsl', message: 'missing from archive' }] };
  let wgsl = text('package.wgsl') as string;
  let form = man.bundle.manifest.wgslForm;
  if (opts?.remapAuthoring !== false && form === 'authoring') {
    wgsl = remapAuthoringWgslToShow(wgsl);
    form = 'show';
  }

  const bundle: AuroraWgslPackageBundle = {
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
export function auroraPackageToModePreset(bundle: AuroraPackageBundle) {
  const { manifest } = bundle;
  if (manifest.target === 'threejs') {
    return {
      schemaVersion: 1 as const,
      id: manifest.slug,
      slug: manifest.slug,
      label: manifest.label,
      character: manifest.character,
      uiGroup: manifest.uiGroup ?? 'field-motion',
      disposition: 'fullscreen-primary' as const,
      layers: [
        {
          kind: 'threejs' as const,
          ref: manifest.entry,
          renderer: manifest.renderer,
          requiresNativeWebGPU: manifest.requiresNativeWebGPU,
          sourceRef: manifest.source,
          assets: manifest.assets,
        },
      ],
      suppressLegacyField: true as const,
      engineMinCapabilities: ['threejs-runtime-v1'] as string[],
    };
  }
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
    engineMinCapabilities: ['dual-fullscreen'] as string[],
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

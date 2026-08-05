/**
 * Pack fullscreen GLSL → WGSL compile helpers (bridge-side).
 *
 * WASM receives WGSL only. Bridge uses naga-cli via the same path as Shadertoy
 * import (`transformShadertoyGlsl`). Fail-closed when naga is missing or the
 * source exceeds size caps — soft UX mirrors Shadertoy import failures.
 *
 * Pages / static hosting: no runtime pack GLSL path; builtins only.
 */

import { extname } from 'node:path';
import type { CompiledModeLayer, CompiledModeWire } from './compiled-mode-wire.ts';
import { MAX_PACK_SHADER_SOURCE_BYTES } from './mode-preset-schema.ts';
import { transformShadertoyGlsl } from './shadertoy-import.ts';

export {
  MAX_FULLSCREEN_LAYERS_PER_PACK,
  MAX_PACK_SHADER_SOURCE_BYTES,
} from './mode-preset-schema.ts';

export type PackShaderReadResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; error: string };

export type EnrichFullscreenResult =
  | { ok: true; wire: CompiledModeWire }
  | { ok: false; errors: string[] };

const GLSL_EXTS = new Set(['.glsl', '.frag', '.fs', '.pixel']);
const WGSL_EXTS = new Set(['.wgsl']);

export function isPackGlslRef(ref: string): boolean {
  return GLSL_EXTS.has(extname(ref).toLowerCase());
}

export function isPackWgslRef(ref: string): boolean {
  return WGSL_EXTS.has(extname(ref).toLowerCase());
}

/** True when the layer ref looks like a shader source asset we should compile/attach. */
export function isPackShaderRef(ref: string): boolean {
  return isPackGlslRef(ref) || isPackWgslRef(ref);
}

/**
 * Validate UTF-8 shader source size before naga / wire attach.
 * Returns the text or a soft-fail error string (Shadertoy-style).
 */
export function validatePackShaderSource(
  raw: string | Uint8Array,
  opts: { maxBytes?: number; label?: string } = {},
): PackShaderReadResult {
  const maxBytes = opts.maxBytes ?? MAX_PACK_SHADER_SOURCE_BYTES;
  const label = opts.label ?? 'pack shader';
  let text: string;
  let bytes: number;
  if (typeof raw === 'string') {
    text = raw;
    bytes = new TextEncoder().encode(raw).byteLength;
  } else {
    bytes = raw.byteLength;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    } catch {
      return { ok: false, error: `${label}: source is not valid UTF-8` };
    }
  }
  if (bytes === 0) {
    return { ok: false, error: `${label}: source is empty` };
  }
  if (bytes > maxBytes) {
    return {
      ok: false,
      error: `${label}: source exceeds size cap (${bytes} > ${maxBytes} bytes)`,
    };
  }
  return { ok: true, text, bytes };
}

/**
 * Compile a single pack fullscreen source to Bevy-ready WGSL.
 * - `.wgsl` → pass-through after size check (no naga).
 * - `.glsl` / `.frag` → `transformShadertoyGlsl` (requires naga-cli on PATH).
 * Fail-closed with a clear error when naga is missing or compile fails.
 */
export async function compilePackFullscreenSource(
  ref: string,
  source: string | Uint8Array,
): Promise<{ ok: true; wgsl: string } | { ok: false; error: string }> {
  const checked = validatePackShaderSource(source, { label: `fullscreen layer ref ${ref}` });
  if (!checked.ok) return checked;

  if (isPackWgslRef(ref)) {
    // Lightweight shape check — full Bevy validation happens at material load.
    if (!/\bfn\s+fragment\b/.test(checked.text) && !/@fragment\b/.test(checked.text)) {
      return {
        ok: false,
        error: `fullscreen layer ref ${ref}: WGSL must define a @fragment entry (fn fragment)`,
      };
    }
    return { ok: true, wgsl: checked.text };
  }

  if (isPackGlslRef(ref)) {
    const transformed = await transformShadertoyGlsl(checked.text);
    if (!transformed.ok) {
      return {
        ok: false,
        error: `fullscreen layer ref ${ref}: ${transformed.error}`,
      };
    }
    return { ok: true, wgsl: transformed.wgsl };
  }

  return {
    ok: false,
    error: `fullscreen layer ref ${ref}: unsupported shader extension (use .wgsl, .glsl, or .frag)`,
  };
}

export type ReadPackAsset = (ref: string) => Promise<PackShaderReadResult>;

/**
 * For each fullscreen layer on a pure-compiled wire, read the asset, compile
 * GLSL→WGSL (or pass WGSL), and attach `layer.wgsl`. No-op when there are no
 * fullscreen layers. Fail-closed on any layer error (live-show safety).
 *
 * Pure `compileModePreset` does not call this — only the bridge compile cache
 * after disk read. Static/Pages never invoke this path.
 */
export async function enrichPackFullscreenLayers(
  wire: CompiledModeWire,
  readAsset: ReadPackAsset,
): Promise<EnrichFullscreenResult> {
  const fullscreenIdx = wire.layers
    .map((layer, i) => (layer.kind === 'fullscreen' ? i : -1))
    .filter((i) => i >= 0);

  if (fullscreenIdx.length === 0) {
    return { ok: true, wire };
  }

  // Defense in depth (pure compile already rejects >1).
  if (fullscreenIdx.length > 1) {
    return {
      ok: false,
      errors: [
        `at most 1 fullscreen layer per pack (got ${fullscreenIdx.length}); dual-deck slots are one per deck`,
      ],
    };
  }

  const layers: CompiledModeLayer[] = wire.layers.map((l) => ({ ...l }));
  const errors: string[] = [];

  for (const i of fullscreenIdx) {
    const layer = layers[i];
    if (layer === undefined) continue;
    if (!isPackShaderRef(layer.ref)) {
      // Opaque ref (e.g. future builtin id) — leave without wgsl; engine may skip.
      continue;
    }
    const read = await readAsset(layer.ref);
    if (!read.ok) {
      errors.push(read.error);
      continue;
    }
    const compiled = await compilePackFullscreenSource(layer.ref, read.text);
    if (!compiled.ok) {
      errors.push(compiled.error);
      continue;
    }
    layers[i] = { ...layer, wgsl: compiled.wgsl };
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, wire: { ...wire, layers } };
}

/** First fullscreen layer with attached WGSL (one per pack by contract). */
export function firstFullscreenWgsl(wire: CompiledModeWire): string | undefined {
  for (const layer of wire.layers) {
    if (layer.kind === 'fullscreen' && typeof layer.wgsl === 'string' && layer.wgsl.length > 0) {
      return layer.wgsl;
    }
  }
  return undefined;
}

/**
 * Mode preset authoring schema (preset.json) + pure compile → CompiledModeWire.
 *
 * # Three version axes
 *
 * 1. **Authoring `schemaVersion`** (`MODE_PRESET_SCHEMA_VERSION`) — the on-disk
 *    `preset.json` shape validated by `validateModePreset`. Bump when authoring
 *    fields change; migrate old packs in a future `migrateModePreset`.
 * 2. **Wire `wireVersion`** (`COMPILED_MODE_WIRE_VERSION` in compiled-mode-wire.ts)
 *    — the CompiledModeWire payload sent over HTTP/WS to projectors / WASM.
 *    Independent of authoring: a v1 preset may compile to wire v2 later.
 * 3. **Engine min/capabilities** — optional string tags on the preset/wire
 *    (`engineMinCapabilities`) describing WASM/runtime features required to
 *    render the pack (e.g. `"field-runtime"`, `"dual-fullscreen"`). Not a
 *    single integer; packs declare what they need, engine reports what it has.
 *
 * See also `docs/mode-protocol.md`.
 *
 * Pure TypeScript — no disk scan, no HTTP, no WASM (those land in later PRs).
 */

import {
  COMPILED_MODE_WIRE_VERSION,
  type CompiledModeDeck,
  type CompiledModeLayer,
  type CompiledModeLayerKind,
  type CompiledModeWire,
  type ModeDisposition,
} from './compiled-mode-wire.ts';
import {
  type FieldPrimitiveName,
  fieldPrimitiveId,
  isFieldPrimitiveName,
} from './field-primitive-ids.ts';
import { MAX_VISUAL_MODE_INDEX } from './visual-mode-catalog.ts';

export type {
  CompiledModeDeck,
  CompiledModeWire,
  ModeDisposition,
} from './compiled-mode-wire.ts';
// Re-export for single-import convenience in tests / loaders.
export { COMPILED_MODE_WIRE_VERSION } from './compiled-mode-wire.ts';
export {
  FIELD_PRIMITIVE_IDS,
  type FieldPrimitiveId,
  type FieldPrimitiveName,
  fieldPrimitiveId,
  fieldPrimitiveName,
  isFieldPrimitiveName,
  listFieldPrimitiveNames,
} from './field-primitive-ids.ts';

/** Authoring schema version for on-disk preset.json. */
export const MODE_PRESET_SCHEMA_VERSION = 1 as const;

/** kebab-case slug: one or more [a-z0-9] segments joined by single hyphens. */
export const MODE_PRESET_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const MODE_DISPOSITIONS = [
  'field-primitive',
  'fullscreen-primary',
  'mesh-primary',
  'engine-module',
  'retire/merge',
] as const satisfies readonly ModeDisposition[];

export type ModePresetLayerKind = CompiledModeLayerKind;

export type ModePresetLayer = {
  kind: ModePresetLayerKind;
  /** Asset path relative to the preset folder / catalog id / shader ref. */
  ref: string;
  weight?: number;
};

export type ModePresetField = {
  primitive: FieldPrimitiveName;
  /** Author-supplied params; may include unknown keys (stripped at compile). */
  params?: Record<string, number | boolean | string>;
};

/**
 * Authoring shape for `preset.json` (schemaVersion 1).
 * `id` must equal `slug` (folder name convention: `<slug>/preset.json`).
 */
export type ModePreset = {
  schemaVersion: typeof MODE_PRESET_SCHEMA_VERSION;
  id: string;
  slug: string;
  label: string;
  character?: string;
  /** Operator UI grouping hint (ModeCategory-ish string; freeform in v1). */
  uiGroup?: string;
  /** Legacy control-bus index 0–MAX_VISUAL_MODE_INDEX; omit for non-legacy packs. */
  legacyIndex?: number;
  disposition: ModeDisposition;
  engineModule?: string;
  field?: ModePresetField;
  layers?: ModePresetLayer[];
  suppressLegacyField?: boolean;
  engineMinCapabilities?: string[];
};

export type ValidateModePresetResult =
  | { ok: true; value: ModePreset }
  | { ok: false; errors: string[] };

export type CompileModePresetContext = {
  epoch: number;
  deck: CompiledModeDeck;
  assetBase: string;
};

export type CompileModePresetResult =
  | { ok: true; value: CompiledModeWire }
  | { ok: false; errors: string[] };

// ── Param registry (per-primitive clamps + defaults) ─────────────────────────

export type FieldParamSpec = {
  /** Default when authoring omits the key. */
  default: number;
  min: number;
  max: number;
  /** When true, compile fails if the author omitted this key (no default fill). */
  required?: boolean;
};

/**
 * Known params for each registered primitive.
 * Only keys listed here survive compile; others are stripped.
 * PR6 FieldRuntime should treat these clamps as the TS-side source of truth
 * until a Rust mirror lands.
 */
export const FIELD_PRIMITIVE_PARAM_SPECS: Readonly<
  Record<FieldPrimitiveName, Readonly<Record<string, FieldParamSpec>>>
> = {
  supernova_burst: {
    intensity: { default: 0.85, min: 0, max: 1, required: true },
    spin: { default: 0.4, min: -2, max: 2 },
    decay: { default: 0.55, min: 0.01, max: 1 },
  },
  // Family A stubs — minimal intensity so compile has a real clamp surface.
  // Deepen param surfaces in Family migration PRs (#242–#244).
  beams: { intensity: { default: 1, min: 0, max: 1 } },
  tunnel: { intensity: { default: 1, min: 0, max: 1 }, depth: { default: 0.5, min: 0, max: 1 } },
  burst: { intensity: { default: 1, min: 0, max: 1 } },
  mirror: { intensity: { default: 1, min: 0, max: 1 } },
  wash: { intensity: { default: 1, min: 0, max: 1 } },
  strobe: { intensity: { default: 1, min: 0, max: 1 } },
  swarm: { intensity: { default: 1, min: 0, max: 1 } },
  orbit: { intensity: { default: 1, min: 0, max: 1 }, spin: { default: 0.3, min: -2, max: 2 } },
  pulse: { intensity: { default: 1, min: 0, max: 1 } },
  spiral: { intensity: { default: 1, min: 0, max: 1 }, spin: { default: 0.3, min: -2, max: 2 } },
  ripple: { intensity: { default: 1, min: 0, max: 1 } },
  shatter: { intensity: { default: 1, min: 0, max: 1 } },
  flux: { intensity: { default: 1, min: 0, max: 1 } },
  lattice: { intensity: { default: 1, min: 0, max: 1 } },
  drift: { intensity: { default: 1, min: 0, max: 1 } },
  storm: { intensity: { default: 1, min: 0, max: 1 } },
  echo: { intensity: { default: 1, min: 0, max: 1 } },
  vortex: { intensity: { default: 1, min: 0, max: 1 }, spin: { default: 0.5, min: -2, max: 2 } },
  fracture: { intensity: { default: 1, min: 0, max: 1 } },
  nebula: { intensity: { default: 1, min: 0, max: 1 } },
  prism: { intensity: { default: 1, min: 0, max: 1 } },
  scanner: { intensity: { default: 1, min: 0, max: 1 } },
  comet: { intensity: { default: 1, min: 0, max: 1 } },
  bloom: { intensity: { default: 1, min: 0, max: 1 } },
};

const LAYER_KINDS = new Set<ModePresetLayerKind>(['mesh', 'fullscreen', 'field', 'accent']);

/**
 * N=2 engine slots are one fullscreen material per deck. Each pack may own at
 * most one fullscreen layer; a third layer (second in one pack) fails compile.
 * See PR13 / #247.
 */
export const MAX_FULLSCREEN_LAYERS_PER_PACK = 1;

/** Soft cap on pack shader source (GLSL or WGSL) before bridge naga / wire attach. */
export const MAX_PACK_SHADER_SOURCE_BYTES = 256 * 1024;

function isModeDisposition(v: unknown): v is ModeDisposition {
  return typeof v === 'string' && (MODE_DISPOSITIONS as readonly string[]).includes(v);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clampNumber(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function coerceParamNumber(raw: number | boolean | string): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ── validateModePreset ───────────────────────────────────────────────────────

/**
 * Validate raw JSON as a ModePreset (authoring schema).
 * Does not compile; does not strip unknown field params (compile does that).
 */
export function validateModePreset(raw: unknown): ValidateModePresetResult {
  const errors: string[] = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: ['preset must be a JSON object'] };
  }

  if (raw.schemaVersion !== MODE_PRESET_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${MODE_PRESET_SCHEMA_VERSION} (got ${String(raw.schemaVersion)})`,
    );
  }

  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (typeof raw.slug !== 'string' || raw.slug.length === 0) {
    errors.push('slug must be a non-empty string');
  } else if (!MODE_PRESET_SLUG_RE.test(raw.slug)) {
    errors.push(
      `slug must be kebab-case [a-z0-9]+(?:-[a-z0-9]+)* (got ${JSON.stringify(raw.slug)})`,
    );
  }
  if (
    typeof raw.id === 'string' &&
    typeof raw.slug === 'string' &&
    raw.id.length > 0 &&
    raw.slug.length > 0 &&
    raw.id !== raw.slug
  ) {
    errors.push(
      `id must equal slug (id=${JSON.stringify(raw.id)}, slug=${JSON.stringify(raw.slug)})`,
    );
  }

  if (typeof raw.label !== 'string' || raw.label.trim().length === 0) {
    errors.push('label must be a non-empty string');
  }

  if (raw.character !== undefined && typeof raw.character !== 'string') {
    errors.push('character must be a string when present');
  }
  if (raw.uiGroup !== undefined && typeof raw.uiGroup !== 'string') {
    errors.push('uiGroup must be a string when present');
  }

  if (raw.legacyIndex !== undefined) {
    const li = raw.legacyIndex;
    if (typeof li !== 'number' || !Number.isInteger(li) || li < 0 || li > MAX_VISUAL_MODE_INDEX) {
      errors.push(
        `legacyIndex must be an integer 0–${MAX_VISUAL_MODE_INDEX} when present (got ${String(li)})`,
      );
    }
  }

  if (!isModeDisposition(raw.disposition)) {
    errors.push(
      `disposition must be one of ${MODE_DISPOSITIONS.join(', ')} (got ${String(raw.disposition)})`,
    );
  }

  if (raw.engineModule !== undefined && typeof raw.engineModule !== 'string') {
    errors.push('engineModule must be a string when present');
  }
  if (raw.disposition === 'engine-module' && typeof raw.engineModule !== 'string') {
    errors.push('engineModule is required when disposition is engine-module');
  }

  if (raw.suppressLegacyField !== undefined && typeof raw.suppressLegacyField !== 'boolean') {
    errors.push('suppressLegacyField must be a boolean when present');
  }

  if (raw.engineMinCapabilities !== undefined) {
    if (
      !Array.isArray(raw.engineMinCapabilities) ||
      !raw.engineMinCapabilities.every((c) => typeof c === 'string')
    ) {
      errors.push('engineMinCapabilities must be an array of strings when present');
    }
  }

  // field block
  if (raw.disposition === 'field-primitive') {
    if (!isPlainObject(raw.field)) {
      errors.push('field is required when disposition is field-primitive');
    }
  }

  if (raw.field !== undefined) {
    if (!isPlainObject(raw.field)) {
      errors.push('field must be an object when present');
    } else {
      if (!isFieldPrimitiveName(raw.field.primitive)) {
        errors.push(
          `field.primitive must be a known FieldPrimitiveName (got ${String(raw.field.primitive)})`,
        );
      }
      if (raw.field.params !== undefined && !isPlainObject(raw.field.params)) {
        errors.push('field.params must be an object when present');
      } else if (isFieldPrimitiveName(raw.field.primitive) && isPlainObject(raw.field.params)) {
        // Validate required params are present at authoring time (fail-fast).
        const specs = FIELD_PRIMITIVE_PARAM_SPECS[raw.field.primitive];
        for (const [key, spec] of Object.entries(specs)) {
          if (spec.required && !(key in raw.field.params)) {
            errors.push(`field.params.${key} is required for primitive ${raw.field.primitive}`);
          }
        }
        for (const [key, val] of Object.entries(raw.field.params)) {
          if (!(key in specs)) continue; // unknown keys: compile strips; authoring allows
          if (coerceParamNumber(val as number | boolean | string) === null) {
            errors.push(`field.params.${key} must be a finite number (or boolean/numeric string)`);
          }
        }
      }
    }
  }

  // layers
  if (raw.layers !== undefined) {
    if (!Array.isArray(raw.layers)) {
      errors.push('layers must be an array when present');
    } else {
      raw.layers.forEach((layer, i) => {
        if (!isPlainObject(layer)) {
          errors.push(`layers[${i}] must be an object`);
          return;
        }
        if (typeof layer.kind !== 'string' || !LAYER_KINDS.has(layer.kind as ModePresetLayerKind)) {
          errors.push(
            `layers[${i}].kind must be one of mesh|fullscreen|field|accent (got ${String(layer.kind)})`,
          );
        }
        if (typeof layer.ref !== 'string' || layer.ref.length === 0) {
          errors.push(`layers[${i}].ref must be a non-empty string`);
        }
        if (layer.weight !== undefined) {
          if (typeof layer.weight !== 'number' || !Number.isFinite(layer.weight)) {
            errors.push(`layers[${i}].weight must be a finite number when present`);
          }
        }
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: ModePreset = {
    schemaVersion: MODE_PRESET_SCHEMA_VERSION,
    id: raw.id as string,
    slug: raw.slug as string,
    label: (raw.label as string).trim(),
    disposition: raw.disposition as ModeDisposition,
  };
  if (typeof raw.character === 'string') value.character = raw.character;
  if (typeof raw.uiGroup === 'string') value.uiGroup = raw.uiGroup;
  if (typeof raw.legacyIndex === 'number') value.legacyIndex = raw.legacyIndex;
  if (typeof raw.engineModule === 'string') value.engineModule = raw.engineModule;
  if (typeof raw.suppressLegacyField === 'boolean') {
    value.suppressLegacyField = raw.suppressLegacyField;
  }
  if (Array.isArray(raw.engineMinCapabilities)) {
    value.engineMinCapabilities = raw.engineMinCapabilities as string[];
  }
  if (isPlainObject(raw.field)) {
    const params = isPlainObject(raw.field.params)
      ? ({ ...raw.field.params } as Record<string, number | boolean | string>)
      : undefined;
    value.field = {
      primitive: raw.field.primitive as FieldPrimitiveName,
      ...(params !== undefined ? { params } : {}),
    };
  }
  if (Array.isArray(raw.layers)) {
    value.layers = (raw.layers as Record<string, unknown>[]).map((layer) => {
      const out: ModePresetLayer = {
        kind: layer.kind as ModePresetLayerKind,
        ref: layer.ref as string,
      };
      if (typeof layer.weight === 'number') out.weight = layer.weight;
      return out;
    });
  }

  return { ok: true, value };
}

// ── compileModePreset ────────────────────────────────────────────────────────

/**
 * Compile a validated ModePreset into CompiledModeWire.
 *
 * - Strips unknown field param keys.
 * - Fails if a required param is missing (after strip).
 * - Clamps known params into their declared ranges; fills non-required defaults.
 * - Resolves primitive name → permanent numeric ID.
 */
export function compileModePreset(
  preset: ModePreset,
  ctx: CompileModePresetContext,
): CompileModePresetResult {
  const errors: string[] = [];

  if (!Number.isFinite(ctx.epoch) || ctx.epoch < 0) {
    errors.push(`epoch must be a non-negative finite number (got ${String(ctx.epoch)})`);
  }
  if (ctx.deck !== 'deck-a' && ctx.deck !== 'deck-b') {
    errors.push(`deck must be 'deck-a' or 'deck-b' (got ${String(ctx.deck)})`);
  }
  if (typeof ctx.assetBase !== 'string') {
    errors.push('assetBase must be a string');
  }

  let fieldWire: CompiledModeWire['field'];

  if (preset.disposition === 'field-primitive' && !preset.field) {
    errors.push('field is required when disposition is field-primitive');
  }

  if (preset.field) {
    const name = preset.field.primitive;
    if (!isFieldPrimitiveName(name)) {
      errors.push(`unknown field.primitive ${String(name)}`);
    } else {
      const specs = FIELD_PRIMITIVE_PARAM_SPECS[name];
      const rawParams = preset.field.params ?? {};
      const compiled: Record<string, number> = {};

      // Required: present after strip, or fail.
      for (const [key, spec] of Object.entries(specs)) {
        if (spec.required && !(key in rawParams)) {
          errors.push(`missing required field param "${key}" for primitive ${name}`);
        }
      }

      for (const [key, spec] of Object.entries(specs)) {
        if (!(key in rawParams)) {
          if (!spec.required) {
            compiled[key] = clampNumber(spec.default, spec.min, spec.max);
          }
          continue;
        }
        const coerced = coerceParamNumber(rawParams[key] as number | boolean | string);
        if (coerced === null) {
          errors.push(`field.params.${key} is not a finite number`);
          continue;
        }
        compiled[key] = clampNumber(coerced, spec.min, spec.max);
      }
      // Unknown keys intentionally omitted (stripped).

      if (errors.length === 0) {
        fieldWire = {
          primitiveId: fieldPrimitiveId(name),
          primitiveName: name,
          params: compiled,
        };
      }
    }
  }

  const layers: CompiledModeLayer[] = (preset.layers ?? []).map((layer) => {
    const out: CompiledModeLayer = { kind: layer.kind, ref: layer.ref };
    if (typeof layer.weight === 'number' && Number.isFinite(layer.weight)) {
      out.weight = clampNumber(layer.weight, 0, 1);
    }
    return out;
  });

  // N=2 slots = one fullscreen material per deck. Reject >1 fullscreen layer
  // per pack at pure compile (soft-fail UX aligns with Shadertoy import).
  const fullscreenCount = layers.filter((l) => l.kind === 'fullscreen').length;
  if (fullscreenCount > MAX_FULLSCREEN_LAYERS_PER_PACK) {
    errors.push(
      `at most ${MAX_FULLSCREEN_LAYERS_PER_PACK} fullscreen layer per pack (got ${fullscreenCount}); dual-deck slots are one per deck, not stacked per pack`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  const wire: CompiledModeWire = {
    wireVersion: COMPILED_MODE_WIRE_VERSION,
    epoch: ctx.epoch,
    deck: ctx.deck,
    slug: preset.slug,
    label: preset.label,
    legacyIndex: preset.legacyIndex ?? null,
    disposition: preset.disposition,
    assetBase: ctx.assetBase,
    layers,
    suppressLegacyField: preset.suppressLegacyField ?? false,
  };
  if (fieldWire) wire.field = fieldWire;
  if (preset.engineMinCapabilities && preset.engineMinCapabilities.length > 0) {
    wire.engineMinCapabilities = [...preset.engineMinCapabilities];
  }
  if (preset.engineModule) wire.engineModule = preset.engineModule;

  return { ok: true, value: wire };
}

/**
 * Validate then compile in one step (handy for fixtures / loaders).
 */
export function validateAndCompileModePreset(
  raw: unknown,
  ctx: CompileModePresetContext,
): CompileModePresetResult {
  const validated = validateModePreset(raw);
  if (!validated.ok) return validated;
  return compileModePreset(validated.value, ctx);
}

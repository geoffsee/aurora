/**
 * CompiledModeWire — versioned runtime payload for a single deck mode selection.
 *
 * Three version axes (see also docs/mode-protocol.md and mode-preset-schema.ts):
 * 1. authoring `schemaVersion` — on-disk preset.json (ModePreset)
 * 2. wire `wireVersion` — this CompiledModeWire shape over HTTP/WS
 * 3. engine min/capabilities — WASM/runtime feature flags the pack requires
 *
 * Pure types + constants. No I/O. Consumers (PR3 compile cache, PR6 FieldRuntime)
 * treat this as JSON-serializable.
 */

import type { FieldPrimitiveId, FieldPrimitiveName } from './field-primitive-ids.ts';

/** Wire protocol version for CompiledModeWire. Bump only on breaking shape changes. */
export const COMPILED_MODE_WIRE_VERSION = 1 as const;

export type CompiledModeDeck = 'deck-a' | 'deck-b';

/**
 * How the pack intends to own the look. Mirrored on authoring ModePreset.
 * Kept here (not imported from mode-preset-schema) to avoid a cycle.
 */
export type ModeDisposition =
  | 'field-primitive'
  | 'fullscreen-primary'
  | 'mesh-primary'
  | 'engine-module'
  | 'retire/merge';

export type CompiledModeLayerKind = 'mesh' | 'fullscreen' | 'field' | 'accent';

/**
 * Optional layer descriptor compiled from authoring `layers`.
 * Mesh refs stay opaque (catalog ids / asset-relative). Fullscreen layers may
 * carry bridge-compiled `wgsl` (WASM never receives pack GLSL).
 */
export type CompiledModeLayer = {
  kind: CompiledModeLayerKind;
  /** Asset path relative to assetBase, catalog id, or shader ref. */
  ref: string;
  /** Optional weight in [0, 1]; omitted → runtime default. */
  weight?: number;
  /**
   * Compiled WGSL for `kind: "fullscreen"` only (bridge naga path).
   * Absent on pure `compileModePreset` until `enrichPackFullscreenLayers` runs.
   * Pages/static never require this — builtins ship without pack GLSL.
   */
  wgsl?: string;
};

export type CompiledFieldParams = Record<string, number>;

export type CompiledFieldWire = {
  /** Stable permanent ID from FIELD_PRIMITIVE_IDS. */
  primitiveId: FieldPrimitiveId;
  /** Name retained for diagnostics / human logs (engine keys on primitiveId). */
  primitiveName: FieldPrimitiveName;
  /** Known params only, clamped to numbers. Unknown keys stripped at compile. */
  params: CompiledFieldParams;
};

/**
 * Fully compiled mode payload ready for bridge→WASM / HTTP cache (PR3+).
 * JSON-serializable; no functions or class instances.
 */
export type CompiledModeWire = {
  wireVersion: typeof COMPILED_MODE_WIRE_VERSION;
  /** Catalog epoch from the data-dir scan (PR1); 0 when compiling offline/tests. */
  epoch: number;
  deck: CompiledModeDeck;
  slug: string;
  label: string;
  /** Legacy control-bus index 0–48, or null for non-legacy packs. */
  legacyIndex: number | null;
  disposition: ModeDisposition;
  /** Base URL/path for resolving relative layer/asset refs for this compile. */
  assetBase: string;
  field?: CompiledFieldWire;
  layers: CompiledModeLayer[];
  suppressLegacyField: boolean;
  /**
   * Optional engine capability tags the runtime must support before applying
   * this wire (axis 3). Empty/omitted → no extra requirements.
   */
  engineMinCapabilities?: string[];
  /** Optional engine module name when disposition is engine-module. */
  engineModule?: string;
};

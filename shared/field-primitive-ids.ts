/**
 * Stable numeric registry for field primitives.
 *
 * **IDs are permanent.** Once shipped, a numeric ID must never be reassigned to a
 * different primitive. Deprecate (leave the name/id pair reserved, stop emitting
 * it from new packs) rather than reuse. Future Rust FieldRuntime parity must
 * mirror this table exactly — keep names and numbers in lockstep across TS/Rust.
 *
 * Reserved ranges (documentation only; not enforced):
 * - 1–99:   shipped / in-flight field primitives (Family A + vertical slices)
 * - 100–199: Family B/C mesh-primary helpers (future)
 * - 200+:    experimental / pack-local (avoid until protocol allows)
 */

/**
 * Permanent name → numeric ID map.
 * Append only. Never renumber, never reuse a freed ID.
 */
export const FIELD_PRIMITIVE_IDS = {
  // PR6 vertical slice — novel pack example (not a legacy catalog index).
  supernova_burst: 1,
  // Reserved permanent id. Shipped "point-cloud" pack is GPU fullscreen WGSL,
  // not a FieldRuntime CPU pose — do not reassign this number.
  point_cloud: 2,

  // Family A (legacy modes 0–23) — registered early so PR5/PR8–10 can compile
  // builtins without renumbering. Order follows control-bus index, not ID order.
  beams: 10,
  tunnel: 11,
  burst: 12,
  mirror: 13,
  wash: 14,
  strobe: 15,
  swarm: 16,
  orbit: 17,
  pulse: 18,
  spiral: 19,
  ripple: 20,
  shatter: 21,
  flux: 22,
  lattice: 23,
  drift: 24,
  storm: 25,
  echo: 26,
  vortex: 27,
  fracture: 28,
  nebula: 29,
  prism: 30,
  scanner: 31,
  comet: 32,
  bloom: 33,
} as const;

export type FieldPrimitiveName = keyof typeof FIELD_PRIMITIVE_IDS;
export type FieldPrimitiveId = (typeof FIELD_PRIMITIVE_IDS)[FieldPrimitiveName];

const NAME_BY_ID: ReadonlyMap<number, FieldPrimitiveName> = new Map(
  (Object.entries(FIELD_PRIMITIVE_IDS) as [FieldPrimitiveName, FieldPrimitiveId][]).map(
    ([name, id]) => [id, name],
  ),
);

export function isFieldPrimitiveName(value: unknown): value is FieldPrimitiveName {
  return typeof value === 'string' && Object.hasOwn(FIELD_PRIMITIVE_IDS, value);
}

export function fieldPrimitiveId(name: FieldPrimitiveName): FieldPrimitiveId {
  return FIELD_PRIMITIVE_IDS[name];
}

export function fieldPrimitiveName(id: number): FieldPrimitiveName | undefined {
  return NAME_BY_ID.get(id);
}

/** All registered primitive names (stable Object.keys order of the registry). */
export function listFieldPrimitiveNames(): readonly FieldPrimitiveName[] {
  return Object.keys(FIELD_PRIMITIVE_IDS) as FieldPrimitiveName[];
}

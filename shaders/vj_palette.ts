import { geometryField } from './geometry_field.ts';
import { paletteFragment } from './palette_fragment.ts';
import {
  bear_ellipsoid,
  bear_line_distance,
  bear_model_sdf,
  bear_normal,
  bear_rot_y,
  bear_smin,
  bear_surface_mesh,
  bear_tri_wire_2d,
} from './shared/bear_sdf.ts';
import { BevyVertexOutput } from './shared/bevy_vertex.ts';
import { audioCurve, duotoneAccent, vjDuotone } from './shared/duotone.ts';
import { vjPaletteLayout } from './shared/layout.ts';
import { crispRing, fbm, hash21, kaleidoscope, noise } from './shared/math.ts';
import {
  wolf_capsule_2d,
  wolf_ellipse_2d,
  wolf_leg_2d_sdf,
  wolf_triangle_2d,
} from './shared/wolf_sdf.ts';
import { paletteVariantFns } from './variants/index.ts';

/** Single resolve batch: layout, helpers, SDF libs, variants, geometry fallback, fragment entry. */
export const paletteResolveAll = [
  vjPaletteLayout,
  vjDuotone,
  duotoneAccent,
  audioCurve,
  hash21,
  noise,
  fbm,
  kaleidoscope,
  crispRing,
  bear_rot_y,
  bear_smin,
  bear_ellipsoid,
  bear_model_sdf,
  bear_normal,
  bear_line_distance,
  bear_tri_wire_2d,
  bear_surface_mesh,
  wolf_ellipse_2d,
  wolf_capsule_2d,
  wolf_triangle_2d,
  wolf_leg_2d_sdf,
  ...paletteVariantFns,
  geometryField,
  paletteFragment,
  BevyVertexOutput,
] as const;

import tgpu, { std } from 'typegpu';
import { vjPaletteLayout } from './shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from './shared/constants.ts';
import { noise, fbm, kaleidoscope } from './shared/math.ts';
import { vjDuotone } from './shared/duotone.ts';

export const geometryField = tgpu.fn(
  [vec2f, f32, f32, f32, f32, f32, f32, f32, f32],
  vec4f,
)((uv, time, hue_shift, variant, pulse, energy, bass, mid, high) => {
  'use gpu';
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  const center = uv;
  const radius = std.length(center);
  const angle = std.atan2(center.y, center.x);

  const grain = noise(center.mul(4.0).add(vec2f(time * 0.22, energy * 1.3)));
  const drift = fbm(center.mul(2.2).add(vec2f(grain, bass * 0.35)));

  const vRound = std.round(variant);

  const kal_slices = 6.0 + std.floor(bass * 8.0);
  const kal_uv = std.select(
    center,
    kaleidoscope(center, kal_slices, time * 0.1 + bass * 0.15),
    vRound === 0.0,
  );
  const kal_radius = std.length(kal_uv);
  const kal_angle = std.atan2(kal_uv.y, kal_uv.x);

  const spoke_count = std.select(18.0, 9.0, vRound === 1.0) + std.floor(drift * 8.0);
  const spoke_angle = std.select(angle, kal_angle, vRound === 0.0);
  const spoke = 1.0 - std.smoothstep(
    0.0,
    0.055 + 0.015 * mid,
    std.abs(std.fract(spoke_angle / TAU * spoke_count + time * 0.08 + grain * 0.4) - 0.5) * 2.0,
  );

  const ring_density = std.select(16.0, 8.0, vRound === 2.0);
  const ring_radius = std.select(radius, kal_radius, vRound === 0.0);
  const ring_wave = std.fract(
    ring_radius * (ring_density + high * 12.0) + time * (0.22 + bass * 0.18) + grain,
  );
  const ring = 1.0 - std.smoothstep(0.0, 0.16 - 0.06 * bass, std.abs(ring_wave - 0.5) * 2.0);

  const lattice_uv = kal_uv.mul(8.0 + mid * 6.0 + bass * 2.0);
  const lattice_grid = std.abs(std.fract(lattice_uv).sub(vec2f(0.5)));
  const lattice = 1.0 - std.smoothstep(
    0.0,
    0.06 + 0.02 * (1.0 - mid),
    std.min(lattice_grid.x, lattice_grid.y),
  );

  const core = std.exp(-std.pow(radius * 2.2, 2.0)) * (0.9 + 0.1 * bass);
  const pulse_wave = 0.72 + 0.28 * pulse;

  let dw_q = vec2f(0.0);
  let plasma = f32(0.0);
  if (vRound === 3.0) {
    const dw_p = center.mul(1.6).add(vec2f(time * 0.05, time * 0.04));
    dw_q = vec2f(
      fbm(dw_p.add(vec2f(bass * 0.8))),
      fbm(dw_p.add(vec2f(5.2 + high * 0.6, 1.3 + high * 0.6))),
    );
    const dw_r = vec2f(
      fbm(dw_p.add(dw_q.mul(4.0)).add(vec2f(1.7 + time * 0.15, 9.2))),
      fbm(dw_p.add(dw_q.mul(4.0)).add(vec2f(8.3, 2.8 + time * 0.13))),
    );
    const plasma_field = fbm(dw_p.add(dw_r.mul(4.0)).add(vec2f(bass * 0.8)));
    plasma = std.clamp(plasma_field * 1.4 + dw_q.x * 0.4 + 0.2, 0.0, 1.4);
  }

  let geometry = std.max(
    spoke,
    std.max(ring * (0.75 + 0.25 * energy), lattice * (0.35 + 0.35 * high)) * 0.75,
  );
  if (vRound === 1.0) {
    geometry = spoke;
  } else if (vRound === 2.0) {
    geometry = ring * (0.85 + 0.15 * energy);
  } else if (vRound === 3.0) {
    geometry = plasma;
  }

  const layer = geometry * pulse_wave;
  const enabled = std.select(1.0, 0.0, energy < 0.0);

  const vignette = 1.0 - std.smoothstep(0.2, 1.0, radius);
  const line_glow = 0.12 * std.pow(1.0 - std.clamp(radius, 0.0, 1.0), 2.8);

  const sat = std.clamp(palette_extra.x, 0.0, 1.0);
  const bri = std.clamp(palette_extra.y, 0.0, 1.0);
  const hue_bias = std.select(0.0, dw_q.x * 0.45, vRound === 3.0);
  const hue_phase = angle / TAU * 0.42 + radius * 0.52 + time * 0.03 + 0.21 * drift + hue_bias;
  const baseRgb = vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z);
  const base = vjDuotone(baseRgb, hue_phase, 0.62 * sat, 0.82 * bri);
  const accent = vjDuotone(baseRgb, hue_phase + 0.33 + 0.45 * grain, 0.74 * sat, bri);
  const fill = std.mix(base, accent, 0.38 + 0.35 * energy);
  const color = fill.mul(std.clamp(0.32 + layer, 0.0, 1.0))
    .add(vec3f(line_glow).mul(accent))
    .add(vec3f(core * 0.45));
  const alpha = std.clamp(
    (layer + core + pulse * 0.15 + 0.5 * line_glow) * (0.35 + 0.65 * layer) * vignette * enabled,
    0.0,
    1.0,
  );

  return vec4f(color.mul(enabled), alpha);
});

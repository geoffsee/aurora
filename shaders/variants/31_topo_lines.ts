// @ts-nocheck
import { std } from 'typegpu';
import { vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { fbm, hash21 } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 31, fn: 'topo_lines_variant' } as const;

export const topo_linesVariant = paletteVariantShell(
  (uv, time, hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const q = vec2f(p.x * 1.12 + p.y * 0.28, p.y * 0.92 - p.x * 0.18);
    const drift = vec2f(time * 0.032 + bass * 0.12, -time * 0.026 + mid * 0.08);
    const large = fbm(q * (1.18 + mid * 0.35) + drift);
    const detail = fbm(q * (3.4 + high * 1.7) - drift * 1.6) * (0.22 + high * 0.16);
    const slope = q.x * (0.18 + bass * 0.08) - q.y * 0.11;
    const terrace = std.sin(q.x * 2.7 + q.y * 1.4 + time * (0.14 + mid * 0.22)) * 0.055;
    const elevation = large * 0.78 + detail + slope + terrace + pulse * 0.045;
    const bands = 11.0 + std.floor(mid * 16.0);
    const contour_wave =
      std.abs(std.fract(elevation * bands + time * (0.018 + bass * 0.035)) - 0.5) * 2.0;
    const contour = 1.0 - std.smoothstep(0.0, 0.055 + high * 0.045, contour_wave);
    const major_wave = std.abs(std.fract(elevation * (bands * 0.25)) - 0.5) * 2.0;
    const major = 1.0 - std.smoothstep(0.0, 0.045 + pulse * 0.055, major_wave);
    const grid_x =
      1.0 - std.smoothstep(0.0, 0.012, std.abs(std.fract((q.x + 1.2) * 4.0) - 0.5) * 2.0);
    const grid_y =
      1.0 - std.smoothstep(0.0, 0.012, std.abs(std.fract((q.y + 1.0) * 3.5) - 0.5) * 2.0);
    const tick_cells = std.floor(q * vec2f(5.0, 4.0));
    const tick_seed = hash21(tick_cells);
    const tick_local = std.fract(q * vec2f(5.0, 4.0)) - vec2f(0.5);
    const tick =
      std.step(0.82 - high * 0.12, tick_seed) *
      (1.0 - std.smoothstep(0.0, 0.025 + pulse * 0.015, std.abs(tick_local.y))) *
      (1.0 - std.smoothstep(0.18, 0.42, std.abs(tick_local.x)));
    const fill = std.smoothstep(0.18, 1.12, elevation) * 0.22;
    const layer =
      fill +
      contour * (0.58 + high * 0.42) +
      major * (0.55 + pulse * 0.5) +
      (grid_x + grid_y) * 0.08 * energy +
      tick * 0.35;

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const base = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_shift * 0.12 + elevation * 0.28 + time * 0.008,
      0.6 * sat,
      0.72 * bri,
    );
    const line = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_shift * 0.12 + elevation * 0.42 + 0.22,
      sat,
      bri,
    );
    const map_fill = std.mix(base * 0.32, base, std.smoothstep(0.08, 0.9, elevation));
    const color =
      std.mix(map_fill, line, std.clamp(contour + major + tick, 0.0, 1.0)) *
      std.clamp(0.48 + layer, 0.0, 1.58);
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * enabled, std.clamp(layer * 0.78 * enabled, 0.0, 1.0));
  },
);

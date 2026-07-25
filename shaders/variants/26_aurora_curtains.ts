// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { fbm, noise, hash21 } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 26, fn: 'aurora_curtains_variant' } as const;

/**
 * Deck A — northern lights curtains.
 * Tall vertical spectral sheets that billow on bass, fold on mids, and fringe on highs.
 * Paired with Aurora Crown (36) on Deck B for a full polar sky at crossfade 0.5.
 */
export const aurora_curtainsVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
  // Screen space: x left→right, y bottom→top in -1..1-ish after UV remap.
  let p = vec2f(uv.x * aspect, uv.y);

  // Slow magnetic wind — multi-scale so sheets feel deep, not flat wallpaper.
  let wind = fbm(vec2f(p.x * 0.55 + time * 0.028, p.y * 0.22 - time * 0.018));
  let wind2 = fbm(vec2f(p.x * 1.35 - time * 0.04, p.y * 0.55 + wind * 0.8 + time * 0.012));
  let wind3 = noise(vec2f(p.x * 3.2 + wind2 * 1.4, p.y * 1.1 - time * 0.07));

  // Vertical fold displacement (classic curtain undulation).
  let fold = std.sin(p.y * (1.65 + mid * 2.4) + time * (0.22 + high * 0.45) + wind * 3.1)
    * (0.14 + bass * 0.22 + mid * 0.1)
    + std.sin(p.y * (4.2 + high * 2.0) - time * 0.55 + wind2 * 2.0) * (0.04 + high * 0.06);

  // Three curtain layers at different densities / speeds.
  let phase1 = (p.x + fold + wind * 0.32) * (1.9 + mid * 1.6);
  let phase2 = (p.x * 1.35 + fold * 0.7 - wind2 * 0.28 + 0.37) * (2.8 + bass * 1.4);
  let phase3 = (p.x * 0.72 + fold * 1.2 + wind3 * 0.18 - 0.21) * (3.6 + high * 2.2);

  let sheet1 = std.pow(0.5 + 0.5 * std.cos(phase1 * TAU), 1.9 + high * 1.1);
  let sheet2 = std.pow(0.5 + 0.5 * std.cos(phase2 * TAU), 2.4 + mid * 1.2);
  let sheet3 = std.pow(0.5 + 0.5 * std.cos(phase3 * TAU), 3.0 + high * 1.8);

  // Bright fringes along sheet edges.
  let edge1 = 1.0 - std.smoothstep(0.0, 0.18 + high * 0.1, std.abs(std.fract(phase1 + wind * 0.12) - 0.5) * 2.0);
  let edge2 = 1.0 - std.smoothstep(0.0, 0.14 + pulse * 0.08, std.abs(std.fract(phase2 + 0.22) - 0.5) * 2.0);

  // Vertical silk grain (raylets along the curtain).
  let silk = fbm(vec2f(phase1 * 0.55 + wind2, p.y * 3.4 - time * 0.08));
  let rays = std.pow(std.max(0.0, 1.0 - std.abs(std.sin(p.y * (18.0 + high * 22.0) + phase1 * 2.0 + time * 0.9))), 6.0)
    * (0.12 + high * 0.35 + pulse * 0.2);

  // Horizon window: strongest mid-sky, soft ground fade, open above.
  let sky = std.smoothstep(-1.15, -0.05, p.y) * (1.0 - std.smoothstep(0.55, 1.35, p.y));
  let ground = std.smoothstep(-1.2, -0.55, p.y) * 0.08;

  // Ambient floor so idle (no audio) still glows; audio lifts brightness.
  let ambient = 0.55 + energy * 0.55 + pulse * 0.18;
  let sheets = sheet1 * 0.55 + sheet2 * 0.38 + sheet3 * 0.28;
  let layer = (sheets * ambient + edge1 * (0.14 + high * 0.28) + edge2 * (0.1 + mid * 0.18)
    + silk * 0.14 + rays + ground)
    * sky
    * (0.72 + bass * 0.35 + energy * 0.25);

  let sat = std.clamp(palette_extra.x, 0.0, 1.0);
  let bri = std.clamp(palette_extra.y, 0.0, 1.0);

  // Bias toward classic aurora greens while still tracking the picked palette.
  let aurora_green = vec3f(0.12, 0.78, 0.42);
  let aurora_cyan = vec3f(0.18, 0.92, 0.72);
  let pick = vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z);
  let base_tint = std.mix(aurora_green, pick, 0.42);
  let edge_tint = std.mix(aurora_cyan, pick, 0.28);

  let hue_flow = hue_shift * 0.12 + phase1 * 0.05 + wind * 0.35 + time * 0.008;
  let base = vjDuotone(base_tint, hue_flow, 0.82 * sat, bri);
  let accent = vjDuotone(edge_tint, hue_flow + 0.08 + p.y * 0.12, sat, bri * 1.05);
  let tip = vjDuotone(vec3f(0.55, 0.95, 0.62), hue_flow + edge1 * 0.15, 0.7 * sat, bri);

  let color = std.mix(base * 0.45, accent, std.clamp(sheets * 0.85 + edge1 * 0.35, 0.0, 1.0));
  color = std.mix(color, tip, std.clamp(edge2 * 0.45 + rays * 0.8, 0.0, 1.0));
  color = color * std.clamp(0.35 + layer * 1.55, 0.0, 1.85);

  // Sparse distant stars peeking through dark gaps.
  let star_cell = std.floor(p * vec2f(42.0, 28.0));
  let star_h = hash21(star_cell);
  let star_local = std.fract(p * vec2f(42.0, 28.0)) - 0.5;
  let star = std.step(0.97, star_h)
    * (1.0 - std.smoothstep(0.0, 0.08, std.length(star_local)))
    * (1.0 - std.clamp(sheets * 1.4, 0.0, 1.0))
    * std.smoothstep(0.1, 0.9, p.y);
  color = color + vec3f(0.75, 0.85, 1.0) * star * (0.35 + high * 0.4);

  let enabled = std.select(1.0, 0.0, energy < 0.0);
  let alpha = std.clamp(layer * 0.92 + star * 0.4, 0.0, 1.0) * enabled;
  return vec4f(color * enabled, alpha);
});

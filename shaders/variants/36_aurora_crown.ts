// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { fbm, hash21, noise } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 36, fn: 'aurora_crown_variant' } as const;

/**
 * Deck B — polar crown / arched aurora.
 * Horizontal ribbons and coronal arcs that complement vertical Aurora Curtains (26).
 * Magenta–violet tips + cool base so the two decks paint a full borealis sky together.
 */
export const aurora_crownVariant = paletteVariantShell(
  (uv, time, hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);

    // Drift field orthogonal to curtains (more horizontal motion).
    const flow = fbm(vec2f(p.x * 0.35 - time * 0.022, p.y * 0.9 + time * 0.03));
    const flow2 = fbm(vec2f(p.x * 1.1 + flow * 0.6, p.y * 1.6 - time * 0.045));

    // Parabolic arcs / crown bands across the sky.
    const arc_y =
      p.y +
      0.15 * std.cos(p.x * 1.1 + time * 0.18 + flow * 1.4) +
      0.06 * std.sin(p.x * 2.8 - time * 0.31 + flow2);
    const band_phase = (arc_y + flow * 0.18) * (3.4 + mid * 2.6) + time * (0.12 + bass * 0.2);
    const bands = std.pow(0.5 + 0.5 * std.cos(band_phase * TAU), 2.0 + high * 1.4);

    // Second set of thinner high-altitude ribbons.
    const ribbon_phase =
      (arc_y * 1.45 - p.x * 0.08 + flow2 * 0.25) * (5.2 + high * 3.0) - time * 0.2;
    const ribbons = std.pow(0.5 + 0.5 * std.cos(ribbon_phase * TAU), 3.2 + pulse * 1.5);

    // Soft coronal glow rising from horizon center.
    const crown_r = std.length(vec2f(p.x * 0.55, std.max(p.y + 0.35, 0.0) * 1.15));
    const corona =
      std.exp(-crown_r * (2.4 - bass * 0.8 - energy * 0.5)) *
      (0.35 + bass * 0.45 + pulse * 0.25) *
      std.smoothstep(-0.9, 0.2, p.y);

    // Upward ray spikes on pulse (magnetic field lines).
    const ray_a = std.atan2(p.y + 0.4, p.x + 0.0001);
    const spike =
      std.pow(std.max(0.0, std.cos(ray_a * (7.0 + std.floor(mid * 5.0)) + time * 0.4)), 10.0) *
      std.smoothstep(0.0, 0.85, p.y + 0.35) *
      (0.08 + pulse * 0.55 + high * 0.2) *
      (1.0 - std.smoothstep(0.6, 1.5, crown_r));

    // Horizon band window.
    const sky = std.smoothstep(-1.05, 0.05, p.y) * (1.0 - std.smoothstep(0.65, 1.4, p.y));
    const ambient = 0.5 + energy * 0.55 + mid * 0.2;
    const layer =
      (bands * 0.55 * ambient +
        ribbons * 0.4 +
        corona +
        spike +
        noise(vec2f(band_phase, p.x * 2.0 + time * 0.05)) * 0.1) *
      sky *
      (0.7 + energy * 0.3 + pulse * 0.2);

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const pick = vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z);

    // Complementary palette: cool teal body + magenta / violet tips.
    const body = std.mix(vec3f(0.15, 0.55, 0.62), pick, 0.35);
    const tip = std.mix(vec3f(0.78, 0.28, 0.85), pick, 0.22);
    const rose = vec3f(0.92, 0.42, 0.62);

    const hue_flow = hue_shift * 0.1 + band_phase * 0.04 + flow * 0.3 + time * 0.01;
    const base = vjDuotone(body, hue_flow, 0.78 * sat, bri);
    const accent = vjDuotone(tip, hue_flow + 0.18 + ribbons * 0.12, sat, bri);
    const blush = vjDuotone(rose, hue_flow + pulse * 0.1, 0.85 * sat, bri);

    let color = std.mix(
      base * 0.5,
      accent,
      std.clamp(bands * 0.7 + ribbons * 0.55 + corona * 0.4, 0.0, 1.0),
    );
    color = std.mix(color, blush, std.clamp(spike * 1.2 + pulse * ribbons * 0.5, 0.0, 1.0));
    color = color * std.clamp(0.32 + layer * 1.6, 0.0, 1.9);

    // Starfield denser than curtains so B reads as deep polar night between arcs.
    const star_cell = std.floor(p * vec2f(36.0, 24.0) + vec2f(time * 0.02, 0.0));
    const star_h = hash21(star_cell);
    const star_local = std.fract(p * vec2f(36.0, 24.0) + vec2f(time * 0.02, 0.0)) - 0.5;
    const tw = 0.55 + 0.45 * std.sin(time * (2.5 + star_h * 6.0) + star_h * 20.0);
    const star =
      std.step(0.93 - high * 0.04, star_h) *
      (1.0 - std.smoothstep(0.0, 0.07 + high * 0.03, std.length(star_local))) *
      tw *
      (1.0 - std.clamp(bands * 1.1 + corona * 0.8, 0.0, 1.0)) *
      std.smoothstep(-0.1, 0.85, p.y);
    color = color + vec3f(0.7, 0.8, 1.0) * star * (0.45 + high * 0.35);

    const enabled = std.select(1.0, 0.0, energy < 0.0);
    const alpha = std.clamp(layer * 0.9 + star * 0.55, 0.0, 1.0) * enabled;
    return vec4f(color * enabled, alpha);
  },
);

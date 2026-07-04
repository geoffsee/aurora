// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { crispRing, fbm } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 0, fn: 'rehoboam_variant' } as const;

export const rehoboamVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y);
    let r = std.length(p);
    let angle = std.atan2(p.y, p.x);

    let breathe = 0.015 * std.sin(time * 0.55);
    let ring_r = 0.52 + breathe + bass * 0.055;
    let dist = std.abs(r - ring_r);

    // Sample the rim texture on the unit circle so it wraps seamlessly. Feeding
    // the raw atan2 `angle` here jumped from +pi to -pi across the -x axis, which
    // tore a hard break into the ring at the 270deg / left side.
    let ring_dir = vec2f(std.cos(angle), std.sin(angle)) * 0.75;
    let rim_noise = fbm(ring_dir + vec2f(0.0, time * 0.035) + p * 1.8);
    let broken = std.smoothstep(0.22 - high * 0.08, 0.82, rim_noise);

    // Crisp main ring: tight band with a thin soft edge, still textured by `broken`.
    let band = crispRing(r, ring_r, 0.012 + bass * 0.012, 0.018) * broken;

    // Two concentric rings bracketing the main one (one inner, one outer). These
    // stay clean/continuous so they read as defined rings around the halo.
    let ring_gap = 0.13;
    let ring_inner = crispRing(r, ring_r - ring_gap, 0.008, 0.014);
    let ring_outer = crispRing(r, ring_r + ring_gap, 0.008, 0.014);
    let rings = ring_inner + ring_outer;

    // Keep animated fill inside the inner ring; fade out before the band.
    let inner_edge = ring_r - ring_gap;
    let inner_mask = 1.0 - std.smoothstep(inner_edge - 0.035, inner_edge + 0.008, r);

    let halo = std.exp(-dist * 9.5) * (0.12 + 0.08 * bass);

    // Audio-reactive drive only — no beat pulse or time-based sine breathing.
    let audio_drive = bass * 0.5 + mid * 0.3 + high * 0.2;
    let inner = std.exp(-r * r * 3.8) * (0.06 + 0.12 * energy * (0.35 + 0.65 * audio_drive));

    // Slow envelope-driven core motion — no beat-frequency sine churn.
    let spoke_count = 12.0 + std.floor(bass * 10.0);
    let spoke_phase = std.fract(angle / TAU * spoke_count + mid * 0.45 + bass * 0.35);
    let spokes = (1.0 - std.smoothstep(0.0, 0.055 + high * 0.035, std.abs(spoke_phase - 0.5) * 2.0))
      * std.exp(-r * r * (4.5 - bass * 1.2))
      * (0.12 + 0.22 * audio_drive);

    let drift_uv = p * (2.6 + bass * 0.8) + vec2f(mid * 0.25, high * 0.2);
    let inner_texture = fbm(drift_uv + vec2f(std.sin(bass * 3.0), std.cos(mid * 2.5)) * 0.2)
      * std.exp(-r * r * 5.0)
      * (0.15 + 0.25 * energy);

    let core = std.exp(-r * r * (11.0 - audio_drive * 2.8)) * (0.08 + 0.24 * audio_drive);

    let inner_anim = (inner + spokes + inner_texture + core) * inner_mask;
    let sweep = std.pow(0.5 + 0.5 * std.cos(angle - time * (0.22 + mid * 0.5)), 3.0);
    let sweep_inner = sweep * inner_mask * (0.35 + 0.35 * energy);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    // std.sin(angle) keeps the same +-0.06 angular hue drift but is continuous across
    // the atan2 seam, so the colour no longer steps at the 270deg break.
    let hue_phase = std.sin(angle) * 0.06 + r * 0.38 + time * 0.012;
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase, 0.55 * sat, bri);
    let accent = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_phase + 0.23, 0.78 * sat, bri);
    let color = base * (halo + inner_anim * (0.7 + 0.3 * sweep_inner))
      + accent * (band * (0.7 + 0.3 * sweep) + rings * (0.5 + 0.25 * sweep) + core * inner_mask);

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    let alpha = std.clamp(
      (halo * 0.42 + band * 0.78 + rings * 0.6 + inner_anim * 0.55 + core * inner_mask * 0.38) * enabled,
      0.0,
      0.9
    );
    return vec4f(color.mul(enabled), alpha);
});

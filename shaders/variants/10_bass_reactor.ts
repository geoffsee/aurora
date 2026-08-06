// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { crispRing, fbm } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 10, fn: 'bass_reactor_variant' } as const;

export const bass_reactorVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, mid, _high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const r = std.length(p);
    const a = std.atan2(p.y, p.x);

    // Combined low-end drive: bass when available, otherwise energy/pulse.
    const drive = std.clamp(std.max(bass, energy * 0.6 + pulse * 0.4), 0.0, 1.0);

    const lobes = 5.0 + std.floor((bass + pulse) * 6.0);
    const membrane = 0.32 + drive * 0.36 + 0.05 * std.sin(a * lobes + time * (0.6 + drive * 1.8));
    const band_w = 0.09 + drive * 0.22;
    const body = 1.0 - std.smoothstep(0.0, band_w, std.abs(r - membrane));
    // Core blob swells and brightens hard with the low end.
    const core = std.exp(-r * r * (6.5 - drive * 3.8)) * (0.18 + 1.25 * drive);
    // Beat shockwave: each pulse launches an outward ring that fades with radius.
    const shock_r = std.fract(time * 0.4);
    const shock = crispRing(r, shock_r, 0.01 + drive * 0.03, 0.045) * pulse * (1.0 - shock_r) * 1.6;
    const texture = fbm(p * (2.0 + mid * 3.0) + vec2f(time * 0.08, -time * 0.05));

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const hue_phase = (a / TAU) * 0.25 + texture * 0.3 + time * 0.02 + drive * 0.2;
    const base = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_phase,
      0.8 * sat,
      bri,
    );
    const accent = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_phase + 0.22,
      sat,
      bri,
    );
    const layer = body * (0.38 + drive * 0.95 + texture * 0.3) + core + shock;
    const color =
      std.mix(base, accent, std.clamp(body + shock, 0.0, 1.0)) *
      std.clamp(layer * (0.6 + drive), 0.0, 1.7);
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * enabled, std.clamp(layer * enabled, 0.0, 1.0));
  },
);

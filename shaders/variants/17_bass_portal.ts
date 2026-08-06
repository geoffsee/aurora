// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { crispRing } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 17, fn: 'bass_portal_variant' } as const;

export const bass_portalVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, _mid, high) => {
    'use gpu';
    const _params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const r = std.max(std.length(uv), 0.001);
    const a = std.atan2(uv.y, uv.x);
    const depth = 1.0 / r + time * (0.9 + bass * 2.2);
    const band = std.abs(std.fract(depth * (1.8 + bass * 1.6)) - 0.5) * 2.0;
    const portal = 1.0 - std.smoothstep(0.0, 0.16 + bass * 0.1, band);
    const spokes =
      1.0 -
      std.smoothstep(
        0.0,
        0.04 + high * 0.06,
        std.abs(std.fract((a / TAU) * (8.0 + high * 20.0) + time * 0.5) - 0.5) * 2.0,
      );
    const pulse_ring =
      crispRing(r, std.fract(time * (1.2 + bass * 1.8)) * 0.9 + 0.08, 0.015 + pulse * 0.025, 0.02) *
      pulse;
    const layer = portal * (0.55 + bass * 0.9) + spokes * (0.35 + high * 0.5) + pulse_ring * 1.6;

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const hue_phase = depth * 0.04 + a * 0.3 + time * 0.03;
    const base = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      hue_phase,
      0.8 * sat,
      bri,
    );
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(base * layer * enabled, std.clamp(layer * enabled * (1.0 - r * 0.3), 0.0, 1.0));
  },
);

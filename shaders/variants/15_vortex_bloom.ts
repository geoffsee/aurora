// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { fbm } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 15, fn: 'vortex_bloom_variant' } as const;

export const vortex_bloomVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y);
    const r = std.max(std.length(p), 0.001);
    const a = std.atan2(p.y, p.x);
    const drive = std.clamp(std.max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
    const arm_drive = std.clamp(std.max(mid, energy * 0.4 + pulse * 0.35), 0.0, 1.0);
    const arms = 3.0 + std.floor(arm_drive * 8.0);
    const swirl = a * arms + std.log(r + 0.08) * (5.5 + drive * 7.0) - time * (0.9 + drive * 2.4);
    const spiral =
      1.0 -
      std.smoothstep(
        0.0,
        0.22 + std.max(high, drive * 0.55) * 0.12,
        std.abs(std.fract(swirl / TAU) - 0.5) * 2.0,
      );
    const bloom = std.exp(-r * (1.7 - drive * 0.65)) * (0.2 + 0.9 * drive);
    const core =
      std.exp(-r * r * (9.0 - pulse * 3.0 - drive * 1.8)) * (0.25 + pulse * 0.8 + drive * 0.45);
    const dust = fbm(p * (2.0 + high * 5.0) + vec2f(time * 0.04, -time * 0.03));
    const layer = spiral * bloom * (0.7 + 0.3 * dust) + core;

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const color = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      (a / TAU) * 0.35 + r * 0.3 + time * 0.025 + dust * 0.18 + drive * 0.2,
      0.85 * sat,
      bri,
    );
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * layer * enabled, std.clamp(layer * enabled, 0.0, 1.0));
  },
);

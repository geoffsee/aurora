// @ts-nocheck
import { std } from 'typegpu';
import { TAU, vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { hash21 } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 14, fn: 'strobe_shards_variant' } as const;

export const strobe_shardsVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, _mid, high) => {
    'use gpu';
    const _params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const drive = std.clamp(std.max(pulse, energy * 0.45 + high * 0.55), 0.0, 1.0);
    const scale = 4.0 + drive * 12.0;
    const cell = std.floor((uv + vec2f(0.04 * std.sin(time), 0.03 * std.cos(time * 0.8))) * scale);
    const local = std.fract(uv * scale) - vec2f(0.5);
    const seed = hash21(cell);
    const angle = seed * TAU + time * (0.12 + std.max(bass, drive * 0.5) * 0.4);
    const axis = vec2f(std.cos(angle), std.sin(angle));
    const cut = std.abs(std.dot(local, axis));
    const shard = 1.0 - std.smoothstep(0.08 + drive * 0.12, 0.34, cut + std.length(local) * 0.15);
    const gate = std.step(0.58 - drive * 0.5 - energy * 0.2, seed);
    const edge = 1.0 - std.smoothstep(0.0, 0.04 + drive * 0.04, std.abs(cut - 0.16));
    const layer = gate * (shard * (0.35 + drive) + edge * drive * 0.85);

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const color = vjDuotone(
      vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z),
      seed + std.dot(local, axis) * 0.5 + drive * 0.16,
      sat,
      bri,
    );
    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color * layer * enabled, std.clamp(layer * enabled, 0.0, 1.0));
  },
);

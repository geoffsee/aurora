// @ts-nocheck
import { std } from 'typegpu';
import { f32, vec2f, vec3f, vec4f } from '../shared/constants.ts';
import { vjDuotone } from '../shared/duotone.ts';
import { vjPaletteLayout } from '../shared/layout.ts';
import { hash21 } from '../shared/math.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';

export const meta = { index: 20, fn: 'starweb_variant' } as const;

export const starwebVariant = paletteVariantShell(
  (uv, time, _hue_shift, pulse, energy, bass, mid, high) => {
    'use gpu';
    const params = vjPaletteLayout.$.params;
    const palette_extra = vjPaletteLayout.$.palette_extra;
    const palette_rgb = vjPaletteLayout.$.palette_rgb;

    const aspect = std.max(params.w, 0.1);
    const p = vec2f(uv.x * aspect, uv.y) * 1.6;
    const t = time * 0.2;

    const grid = std.floor(p * 1.8 + vec2f(t * 0.3, -t * 0.2));
    const local = std.fract(p * 1.8 + vec2f(t * 0.3, -t * 0.2)) - 0.5;

    // Each cell has a star if seed high enough; audio biases probability
    const seed = hash21(grid);
    const alive = std.step(0.72 - mid * 0.25 - energy * 0.1, seed);
    const tw = std.sin(time * (3.0 + seed * 7.0) + seed * 19.0) * 0.5 + 0.5;
    const star =
      (1.0 - std.smoothstep(0.02 + high * 0.02, 0.09 + pulse * 0.05, std.length(local))) *
      alive *
      (0.6 + 0.8 * tw);

    // Connect to neighbors with faint lines when both alive
    let links = 0.0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) {
          continue;
        }
        const ncell = grid + vec2f(f32(dx), f32(dy));
        const nseed = hash21(ncell);
        const nlive = std.step(0.72 - mid * 0.25 - energy * 0.1, nseed);
        const npos = std.fract(p * 1.8 + vec2f(t * 0.3, -t * 0.2) + vec2f(f32(dx), f32(dy))) - 0.5;
        const d = std.distance(local, npos);
        const w = (1.0 - std.smoothstep(0.6, 1.4, d)) * alive * nlive * (0.25 + mid * 0.5);
        links += w;
      }
    }

    const sat = std.clamp(palette_extra.x, 0.0, 1.0);
    const bri = std.clamp(palette_extra.y, 0.0, 1.0);
    const hue = hash21(grid) + time * 0.02 + bass * 0.1;
    const col = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue, sat, bri);
    const layer = star * (1.0 + pulse) + links * 0.6;

    const enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(col * layer * enabled, std.clamp(layer * 0.85 * enabled, 0.0, 1.0));
  },
);

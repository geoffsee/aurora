// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { hash21 } from '../shared/math.ts';
import { vjDuotone } from '../shared/duotone.ts';

export const meta = { index: 20, fn: 'starweb_variant' } as const;

export const starwebVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 0.1);
    let p = vec2f(uv.x * aspect, uv.y) * 1.6;
    let t = time * 0.2;

    let grid = std.floor(p * 1.8 + vec2f(t * 0.3, -t * 0.2));
    let local = std.fract(p * 1.8 + vec2f(t * 0.3, -t * 0.2)) - 0.5;

    // Each cell has a star if seed high enough; audio biases probability
    let seed = hash21(grid);
    let alive = std.step(0.72 - mid * 0.25 - energy * 0.1, seed);
    let tw = std.sin(time * (3.0 + seed * 7.0) + seed * 19.0) * 0.5 + 0.5;
    let star = (1.0 - std.smoothstep(0.02 + high * 0.02, 0.09 + pulse * 0.05, std.length(local))) * alive * (0.6 + 0.8 * tw);

    // Connect to neighbors with faint lines when both alive
    let links = 0.0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) { continue; }
        let ncell = grid + vec2f(f32(dx), f32(dy));
        let nseed = hash21(ncell);
        let nlive = std.step(0.72 - mid * 0.25 - energy * 0.1, nseed);
        let npos = (std.fract(p * 1.8 + vec2f(t * 0.3, -t * 0.2) + vec2f(f32(dx), f32(dy))) - 0.5);
        let d = std.distance(local, npos);
        let w = (1.0 - std.smoothstep(0.6, 1.4, d)) * alive * nlive * (0.25 + mid * 0.5);
        links += w;
      }
    }

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let hue = hash21(grid) + time * 0.02 + bass * 0.1;
    let col = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue, sat, bri);
    let layer = star * (1.0 + pulse) + links * 0.6;

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(col * layer * enabled, std.clamp(layer * 0.85 * enabled, 0.0, 1.0));
});

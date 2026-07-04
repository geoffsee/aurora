import tgpu, { std } from 'typegpu';
import * as d from 'typegpu/data';
import { vjDuotone } from './shared/duotone.ts';
import { vjGridLayout } from './shared/layout.ts';
import { BevyVertexOutput } from './shared/bevy_vertex.ts';

const vec4f = d.vec4f;
const vec3f = d.vec3f;
const vec2f = d.vec2f;
const f32 = d.f32;

export { vjGridLayout, BevyVertexOutput };

export const mainShader = tgpu.fn([BevyVertexOutput], vec4f)((frag) => {
  'use gpu';

  const params = vjGridLayout.$.params;
  const palette_extra = vjGridLayout.$.palette_extra;
  const audio_uniforms = vjGridLayout.$.audio_uniforms;
  const grid_extra = vjGridLayout.$.grid_extra;

  const uv = frag.uv.sub(vec2f(0.5)).mul(2.0);

  const base = vec3f(params.x, params.y, params.w);
  const time = params.z;
  const pulse = palette_extra.z;
  const energy = audio_uniforms.x;
  const bass = audio_uniforms.y;
  const mid = audio_uniforms.z;
  const high = audio_uniforms.w;

  const enabled = std.select(1.0, 0.0, energy < 0.0);

  const density = grid_extra.x;
  const cols = (4.0 + std.floor(density * 16.0)) + std.floor(bass * 8.0);
  const rows = (3.0 + std.floor(density * 12.0)) + std.floor(mid * 6.0);

  const cell = vec2f(uv.x * cols * 0.5 + cols * 0.5, uv.y * rows * 0.5 + rows * 0.5);
  const cell_id = std.floor(cell);
  const cell_uv = std.fract(cell).sub(vec2f(0.5));

  const tile_seed = cell_id.x * 1.618 + cell_id.y * 2.414;
  const tile_phase = std.sin(tile_seed + time * 1.1 + pulse * 4.0);
  const tile_beat = std.sin(tile_seed * 0.5 + time * 2.6 + bass * 5.0);

  const diamond_r = std.mix(0.10, 0.46, grid_extra.y) + high * 0.14 + pulse * 0.08;
  const diamond = 1.0 - std.smoothstep(diamond_r - 0.03, diamond_r + 0.03, std.abs(cell_uv.x) + std.abs(cell_uv.y));

  const line_w = std.mix(0.005, 0.12, grid_extra.z) + mid * 0.04;
  const cross_h = 1.0 - std.smoothstep(line_w, line_w + 0.03, std.abs(cell_uv.y));
  const cross_v = 1.0 - std.smoothstep(line_w, line_w + 0.03, std.abs(cell_uv.x));
  const cross = std.max(cross_h, cross_v);

  const mix_t = grid_extra.w;
  const diamond_only = diamond * std.clamp(0.5 + 0.5 * tile_phase, 0.0, 1.0);
  const cross_only = cross * std.clamp(0.25 + 0.35 * tile_beat, 0.0, 1.0);
  const balanced = std.max(diamond_only, cross_only);
  const shape = std.mix(
    std.mix(diamond_only, balanced, std.clamp(mix_t * 2.0, 0.0, 1.0)),
    cross_only,
    std.clamp(mix_t * 2.0 - 1.0, 0.0, 1.0)
  );

  const hue_phase = (cell_id.x + cell_id.y) / (cols + rows) * 0.5
                + time * 0.04
                + tile_phase * 0.1;
  const sat = std.clamp(palette_extra.x, 0.0, 1.0);
  const bri = std.clamp(palette_extra.y, 0.0, 1.0);
  const color = vjDuotone(base, hue_phase, sat * 0.72, bri);

  const vignette = 1.0 - std.smoothstep(0.55, 1.0, std.length(uv) * 0.75);
  const alpha = std.clamp(shape * (0.55 + 0.45 * pulse) * vignette * enabled, 0.0, 1.0);

  return vec4f(color.mul(shape), alpha);
});

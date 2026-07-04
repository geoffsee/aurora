import tgpu, { std } from 'typegpu';
import * as d from 'typegpu/data';
import { vjPaletteLayout } from './layout.ts';
import { vjDuotone } from './duotone.ts';

const vec4f = d.vec4f;
const vec3f = d.vec3f;
const vec2f = d.vec2f;
const f32 = d.f32;

export const TAU = 6.283185307179586;

export const paletteSat = tgpu.fn([], f32)(() => {
  'use gpu';
  return std.clamp(vjPaletteLayout.$.palette_extra.x, 0.0, 1.0);
});

export const paletteBri = tgpu.fn([], f32)(() => {
  'use gpu';
  return std.clamp(vjPaletteLayout.$.palette_extra.y, 0.0, 1.0);
});

export const paletteRgb = tgpu.fn([], vec3f)(() => {
  'use gpu';
  const c = vjPaletteLayout.$.palette_rgb;
  return vec3f(c.x, c.y, c.z);
});

export const variantEnabled = tgpu.fn([f32], f32)((energy) => {
  'use gpu';
  return std.select(1.0, 0.0, energy < 0.0);
});

export const aspectUv = tgpu.fn([vec2f], vec2f)((uv) => {
  'use gpu';
  const aspect = std.max(vjPaletteLayout.$.params.w, 0.1);
  return vec2f(uv.x * aspect, uv.y);
});

export const paletteTone = tgpu.fn([f32, f32, f32], vec3f)((huePhase, satMul, briMul) => {
  'use gpu';
  return vjDuotone(paletteRgb(), huePhase, paletteSat() * satMul, paletteBri() * briMul);
});

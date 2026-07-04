import tgpu from 'typegpu';
import { f32, vec2f, vec4f } from './constants.ts';

/** Shared shell — call as `paletteVariantShell((uv, time, ...) => { 'use gpu'; ... })`. */
export const paletteVariantShell = tgpu.fn(
  [vec2f, f32, f32, f32, f32, f32, f32, f32],
  vec4f,
);

import tgpu, { std } from 'typegpu';
import * as d from 'typegpu/data';

const vec3f = d.vec3f;
const f32 = d.f32;

// Prevent tree-shaking of type constructors in bundled environment
export const keepAlive = [vec3f, f32];

export const duotoneAccent = tgpu.fn([vec3f], vec3f)((base) => {
  'use gpu';
  return std.clamp(base.mul(1.35).add(vec3f(0.18)), vec3f(0.0), vec3f(1.0));
});

export const vjDuotone = tgpu.fn([vec3f, f32, f32, f32], vec3f)((base, phase, saturation, value) => {
  'use gpu';
  const accent = duotoneAccent(base);
  const local = std.fract(phase) - 0.5;
  const t = std.abs(local) * 2.0;
  const rgb = std.mix(base, accent, t);
  const grayscale = vec3f(std.dot(rgb, vec3f(0.299, 0.587, 0.114)));
  return std.mix(grayscale, rgb, saturation).mul(value);
});

export const audioCurve = tgpu.fn([f32], f32)((x) => {
  'use gpu';
  return 1.0 - std.exp(-3.0 * x);
});

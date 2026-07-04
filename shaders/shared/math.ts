import tgpu, { std } from 'typegpu';
import * as d from 'typegpu/data';

const vec2f = d.vec2f;
const f32 = d.f32;

// Prevent tree-shaking of type constructors
export const keepAlive = [vec2f, f32];

export const hash21 = tgpu.fn([vec2f], f32)((st) => {
  'use gpu';
  return std.fract(std.sin(std.dot(st, vec2f(127.1, 311.7))) * 43758.5453123);
});

export const noise = tgpu.fn([vec2f], f32)((st) => {
  'use gpu';
  const i = std.floor(st);
  const f = std.fract(st);
  const a = hash21(i);
  const b = hash21(i.add(vec2f(1.0, 0.0)));
  const c = hash21(i.add(vec2f(0.0, 1.0)));
  const dVal = hash21(i.add(vec2f(1.0, 1.0)));
  const u = f.mul(f).mul(vec2f(3.0).sub(f.mul(2.0)));
  return std.mix(std.mix(a, b, u.x), std.mix(c, dVal, u.x), u.y);
});

export const fbm = tgpu.fn([vec2f], f32)((st) => {
  'use gpu';
  let value = f32(0.0);
  let amp = 0.5;
  let freq = f32(1.0);

  for (let i = 0; i < 4; i = i + 1) {
    value = value + noise(st.mul(freq)) * amp;
    freq = freq * 1.8;
    amp = amp * 0.5;
  }

  return value;
});

export const kaleidoscope = tgpu.fn([vec2f, f32, f32], vec2f)((p, slices, rotation) => {
  'use gpu';
  const a0 = std.atan2(p.y, p.x) + rotation;
  const seg = 6.283185307179586 / slices;
  const folded = std.abs(((a0 % seg) + seg) % seg - seg * 0.5);
  const r = std.length(p);
  return vec2f(std.cos(folded), std.sin(folded)).mul(r);
});

export const crispRing = tgpu.fn([f32, f32, f32, f32], f32)((r, radius, halfWidth, softness) => {
  'use gpu';
  return 1.0 - std.smoothstep(halfWidth, halfWidth + softness, std.abs(r - radius));
});

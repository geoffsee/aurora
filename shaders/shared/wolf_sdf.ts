import tgpu, { std } from 'typegpu';
import { f32, vec2f } from './constants.ts';

export const wolf_ellipse_2d = tgpu.fn([vec2f, vec2f, vec2f], f32)((p, center, radius) => {
  'use gpu';
  return (std.length((p.sub(center)).div(radius)) - 1.0) * std.min(radius.x, radius.y);
});

export const wolf_capsule_2d = tgpu.fn([vec2f, vec2f, vec2f, f32], f32)((p, a, b, r) => {
  'use gpu';
  const pa = p.sub(a);
  const ba = b.sub(a);
  const h = std.clamp(std.dot(pa, ba) / std.max(std.dot(ba, ba), 0.0001), 0.0, 1.0);
  return std.length(pa.sub(ba.mul(h))) - r;
});

export const wolf_triangle_2d = tgpu.fn([vec2f, vec2f, vec2f, f32], f32)((p, base, tip, width) => {
  'use gpu';
  const axis = std.normalize(tip.sub(base));
  const perp = vec2f(-axis.y, axis.x);
  const len = std.max(std.length(tip.sub(base)), 0.001);
  const q = p.sub(base);
  const along = std.dot(q, axis);
  const lateral = std.abs(std.dot(q, perp));
  const taper = width * (1.0 - along / len);
  return std.max(std.max(-along, along - len), lateral - taper);
});

export const wolf_leg_2d_sdf = tgpu.fn([vec2f, vec2f, f32, f32], f32)((p, hip, phase, stride) => {
  'use gpu';
  const swing = std.sin(phase);
  const lift = std.max(std.cos(phase), 0.0);
  const knee = hip.add(vec2f(0.11 * swing * stride, -0.32 + lift * 0.05));
  const ankle = hip.add(vec2f(-0.11 * swing * stride, -0.62 + lift * 0.08));
  const paw = hip.add(vec2f(-0.21 * swing * stride, -0.76 + lift * 0.10));
  let d = wolf_capsule_2d(p, hip, knee, 0.055);
  d = std.min(d, wolf_capsule_2d(p, knee, ankle, 0.047));
  d = std.min(d, wolf_capsule_2d(p, ankle, paw, 0.038));
  d = std.min(d, wolf_ellipse_2d(p, paw.add(vec2f(0.055, -0.008)), vec2f(0.13, 0.045)));
  return d;
});

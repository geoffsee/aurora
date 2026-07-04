import tgpu, { std } from 'typegpu';
import { f32, vec2f, vec3f } from './constants.ts';

export const bear_rot_y = tgpu.fn([vec3f, f32], vec3f)((p, a) => {
  'use gpu';
  const c = std.cos(a);
  const s = std.sin(a);
  return vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
});

export const bear_smin = tgpu.fn([f32, f32, f32], f32)((a, b, k) => {
  'use gpu';
  const h = std.clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return std.mix(b, a, h) - k * h * (1.0 - h);
});

export const bear_ellipsoid = tgpu.fn([vec3f, vec3f, vec3f], f32)((p, center, radius) => {
  'use gpu';
  const q = (p.sub(center)).div(radius);
  return (std.length(q) - 1.0) * std.min(radius.x, std.min(radius.y, radius.z));
});

export const bear_model_sdf = tgpu.fn([vec3f], f32)((p) => {
  'use gpu';
  let d = bear_ellipsoid(p, vec3f(0.0, -0.26, 0.0), vec3f(0.48, 0.68, 0.34));
  d = bear_smin(d, bear_ellipsoid(p, vec3f(0.0, 0.55, 0.0), vec3f(0.37, 0.34, 0.31)), 0.18);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(-0.26, 0.86, 0.0), vec3f(0.17, 0.17, 0.14)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(0.26, 0.86, 0.0), vec3f(0.17, 0.17, 0.14)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(0.0, 0.47, 0.28), vec3f(0.18, 0.12, 0.14)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(0.0, -0.22, 0.25), vec3f(0.34, 0.45, 0.13)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(-0.46, -0.13, 0.03), vec3f(0.15, 0.42, 0.16)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(0.46, -0.13, 0.03), vec3f(0.15, 0.42, 0.16)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(-0.50, -0.46, 0.12), vec3f(0.15, 0.13, 0.15)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(0.50, -0.46, 0.12), vec3f(0.15, 0.13, 0.15)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(-0.22, -0.83, 0.02), vec3f(0.19, 0.30, 0.18)), 0.13);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(0.22, -0.83, 0.02), vec3f(0.19, 0.30, 0.18)), 0.13);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(-0.22, -1.05, 0.18), vec3f(0.24, 0.13, 0.20)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3f(0.22, -1.05, 0.18), vec3f(0.24, 0.13, 0.20)), 0.10);
  return d;
});

export const bear_normal = tgpu.fn([vec3f], vec3f)((p) => {
  'use gpu';
  const e = 0.003;
  return std.normalize(vec3f(
    bear_model_sdf(p.add(vec3f(e, 0.0, 0.0))) - bear_model_sdf(p.sub(vec3f(e, 0.0, 0.0))),
    bear_model_sdf(p.add(vec3f(0.0, e, 0.0))) - bear_model_sdf(p.sub(vec3f(0.0, e, 0.0))),
    bear_model_sdf(p.add(vec3f(0.0, 0.0, e))) - bear_model_sdf(p.sub(vec3f(0.0, 0.0, e))),
  ));
});

export const bear_line_distance = tgpu.fn([f32], f32)((x) => {
  'use gpu';
  const f = std.fract(x);
  return std.min(f, 1.0 - f);
});

export const bear_tri_wire_2d = tgpu.fn([vec2f, f32, f32, f32], f32)((uv, freq, thickness, softness) => {
  'use gpu';
  const s = vec3f(
    uv.x,
    uv.x * 0.5 + uv.y * 0.8660254,
    -uv.x * 0.5 + uv.y * 0.8660254,
  ).mul(freq);
  const d = std.min(
    bear_line_distance(s.x),
    std.min(bear_line_distance(s.y), bear_line_distance(s.z)),
  );
  return 1.0 - std.smoothstep(thickness, thickness + softness, d);
});

export const bear_surface_mesh = tgpu.fn([vec3f, vec3f, f32, f32], f32)((p, n, pulse, high) => {
  'use gpu';
  const freq = 13.0 + std.floor(high * 9.0);
  const thin = 0.018 + pulse * 0.004;
  const soft = 0.018;
  const weights_raw = std.pow(std.abs(n).add(vec3f(0.025)), vec3f(3.0));
  const weights = weights_raw.div(std.max(std.dot(weights_raw, vec3f(1.0)), 0.001));

  const xy = bear_tri_wire_2d(vec2f(p.x, p.y).add(vec2f(0.03 * std.sin(p.z * 2.1), 0.0)), freq, thin, soft);
  const yz = bear_tri_wire_2d(vec2f(p.y, p.z).add(vec2f(0.0, 0.025 * std.sin(p.x * 2.6))), freq * 0.95, thin, soft);
  const xz = bear_tri_wire_2d(vec2f(p.x, p.z).add(vec2f(0.02 * std.sin(p.y * 2.9), 0.0)), freq * 1.05, thin, soft);
  const fine = std.clamp(xy * weights.z + yz * weights.x + xz * weights.y, 0.0, 1.0);

  const major_xy = bear_tri_wire_2d(vec2f(p.x, p.y), freq * 0.34, 0.015, 0.012);
  const major_yz = bear_tri_wire_2d(vec2f(p.y, p.z), freq * 0.32, 0.015, 0.012);
  const major_xz = bear_tri_wire_2d(vec2f(p.x, p.z), freq * 0.36, 0.015, 0.012);
  const major = std.clamp(major_xy * weights.z + major_yz * weights.x + major_xz * weights.y, 0.0, 1.0);

  const silhouette = std.pow(
    1.0 - std.clamp(std.abs(std.dot(n, std.normalize(p.mul(-1.0).add(vec3f(0.0, 0.0, 3.0))))), 0.0, 1.0),
    4.0,
  );
  return std.clamp(fine * 0.95 + major * 0.28 + silhouette * 0.35, 0.0, 1.0);
});

// === Variant 32: Glass Ribbons ===
// Flowing translucent ribbons with moire interference and glossy high glints.
fn glass_ribbons_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let warp = fbm(p * 1.35 + vec2<f32>(time * 0.055, -time * 0.04));
  let wave_a = sin(p.y * (2.4 + mid * 4.5) + time * (0.5 + bass * 0.8) + warp * 2.6) * (0.24 + bass * 0.12);
  let wave_b = cos((p.y + p.x * 0.35) * (3.4 + high * 5.0) - time * (0.4 + mid * 0.7) + warp * 1.8) * (0.18 + mid * 0.1);
  let width = 0.08 + bass * 0.055 + pulse * 0.035;
  let ribbon_a = 1.0 - smoothstep(0.0, width, abs(p.x - wave_a));
  let ribbon_b = 1.0 - smoothstep(0.0, width * 0.85, abs(p.x + wave_b));
  let moire = 1.0 - smoothstep(0.0, 0.13 + high * 0.06, abs(fract((p.x + p.y + warp * 0.35) * (9.0 + mid * 8.0) + time * 0.1) - 0.5) * 2.0);
  let glint = pow(max(0.0, 1.0 - abs(p.x - wave_a) / max(width, 0.001)), 3.0 + high * 4.0) * (0.35 + high * 1.1);
  let depth = exp(-abs(p.y) * 0.45) * (0.18 + energy * 0.35);
  let layer = ribbon_a * (0.55 + glint) + ribbon_b * (0.42 + mid * 0.45) + moire * (ribbon_a + ribbon_b) * 0.24 + depth;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vjDuotone(palette_rgb.xyz, hue_shift * 0.15 + warp * 0.5 + p.y * 0.12 + time * 0.015, 0.68 * sat, bri);
  let highlight = clamp(vjDuotone(palette_rgb.xyz, hue_shift * 0.15 + warp * 0.5 + 0.28, sat, bri) * 1.28 + vec3<f32>(0.12), vec3<f32>(0.0), vec3<f32>(1.0));
  let color = mix(base, highlight, clamp(glint + moire * 0.3, 0.0, 1.0)) * clamp(layer, 0.0, 1.75);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.72 * enabled, 0.0, 1.0));
}

fn bear_rot_y(p: vec3<f32>, a: f32) -> vec3<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec3<f32>(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

fn bear_smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn bear_ellipsoid(p: vec3<f32>, center: vec3<f32>, radius: vec3<f32>) -> f32 {
  let q = (p - center) / radius;
  return (length(q) - 1.0) * min(radius.x, min(radius.y, radius.z));
}

fn bear_model_sdf(p: vec3<f32>) -> f32 {
  var d = bear_ellipsoid(p, vec3<f32>(0.0, -0.26, 0.0), vec3<f32>(0.48, 0.68, 0.34));
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.0, 0.55, 0.0), vec3<f32>(0.37, 0.34, 0.31)), 0.18);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.26, 0.86, 0.0), vec3<f32>(0.17, 0.17, 0.14)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.26, 0.86, 0.0), vec3<f32>(0.17, 0.17, 0.14)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.0, 0.47, 0.28), vec3<f32>(0.18, 0.12, 0.14)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.0, -0.22, 0.25), vec3<f32>(0.34, 0.45, 0.13)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.46, -0.13, 0.03), vec3<f32>(0.15, 0.42, 0.16)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.46, -0.13, 0.03), vec3<f32>(0.15, 0.42, 0.16)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.50, -0.46, 0.12), vec3<f32>(0.15, 0.13, 0.15)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.50, -0.46, 0.12), vec3<f32>(0.15, 0.13, 0.15)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.22, -0.83, 0.02), vec3<f32>(0.19, 0.30, 0.18)), 0.13);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.22, -0.83, 0.02), vec3<f32>(0.19, 0.30, 0.18)), 0.13);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.22, -1.05, 0.18), vec3<f32>(0.24, 0.13, 0.20)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.22, -1.05, 0.18), vec3<f32>(0.24, 0.13, 0.20)), 0.10);
  return d;
}

fn bear_normal(p: vec3<f32>) -> vec3<f32> {
  let e = 0.003;
  return normalize(vec3<f32>(
    bear_model_sdf(p + vec3<f32>(e, 0.0, 0.0)) - bear_model_sdf(p - vec3<f32>(e, 0.0, 0.0)),
    bear_model_sdf(p + vec3<f32>(0.0, e, 0.0)) - bear_model_sdf(p - vec3<f32>(0.0, e, 0.0)),
    bear_model_sdf(p + vec3<f32>(0.0, 0.0, e)) - bear_model_sdf(p - vec3<f32>(0.0, 0.0, e))
  ));
}

fn bear_line_distance(x: f32) -> f32 {
  let f = fract(x);
  return min(f, 1.0 - f);
}

fn bear_tri_wire_2d(uv: vec2<f32>, freq: f32, thickness: f32, softness: f32) -> f32 {
  let s = vec3<f32>(
    uv.x,
    uv.x * 0.5 + uv.y * 0.8660254,
    -uv.x * 0.5 + uv.y * 0.8660254
  ) * freq;
  let d = min(
    bear_line_distance(s.x),
    min(bear_line_distance(s.y), bear_line_distance(s.z))
  );
  return 1.0 - smoothstep(thickness, thickness + softness, d);
}

fn bear_surface_mesh(p: vec3<f32>, n: vec3<f32>, pulse: f32, high: f32) -> f32 {
  let freq = 13.0 + floor(high * 9.0);
  let thin = 0.018 + pulse * 0.004;
  let soft = 0.018;
  let weights_raw = pow(abs(n) + vec3<f32>(0.025), vec3<f32>(3.0));
  let weights = weights_raw / max(dot(weights_raw, vec3<f32>(1.0)), 0.001);

  let xy = bear_tri_wire_2d(p.xy + vec2<f32>(0.03 * sin(p.z * 2.1), 0.0), freq, thin, soft);
  let yz = bear_tri_wire_2d(p.yz + vec2<f32>(0.0, 0.025 * sin(p.x * 2.6)), freq * 0.95, thin, soft);
  let xz = bear_tri_wire_2d(p.xz + vec2<f32>(0.02 * sin(p.y * 2.9), 0.0), freq * 1.05, thin, soft);
  let fine = clamp(xy * weights.z + yz * weights.x + xz * weights.y, 0.0, 1.0);

  let major_xy = bear_tri_wire_2d(p.xy, freq * 0.34, 0.015, 0.012);
  let major_yz = bear_tri_wire_2d(p.yz, freq * 0.32, 0.015, 0.012);
  let major_xz = bear_tri_wire_2d(p.xz, freq * 0.36, 0.015, 0.012);
  let major = clamp(major_xy * weights.z + major_yz * weights.x + major_xz * weights.y, 0.0, 1.0);

  let silhouette = pow(1.0 - clamp(abs(dot(n, normalize(-p + vec3<f32>(0.0, 0.0, 3.0)))), 0.0, 1.0), 4.0);
  return clamp(fine * 0.95 + major * 0.28 + silhouette * 0.35, 0.0, 1.0);
}

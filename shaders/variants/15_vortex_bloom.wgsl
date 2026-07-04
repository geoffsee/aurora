// === Variant 15: Vortex Bloom ===
// Spiral bloom field: bass controls swirl speed, mid controls arm count.
fn vortex_bloom_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);
  let drive = clamp(max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
  let arm_drive = clamp(max(mid, energy * 0.4 + pulse * 0.35), 0.0, 1.0);
  let arms = 3.0 + floor(arm_drive * 8.0);
  let swirl = a * arms + log(r + 0.08) * (5.5 + drive * 7.0) - time * (0.9 + drive * 2.4);
  let spiral = 1.0 - smoothstep(0.0, 0.22 + max(high, drive * 0.55) * 0.12, abs(fract(swirl / TAU) - 0.5) * 2.0);
  let bloom = exp(-r * (1.7 - drive * 0.65)) * (0.2 + 0.9 * drive);
  let core = exp(-r * r * (9.0 - pulse * 3.0 - drive * 1.8)) * (0.25 + pulse * 0.8 + drive * 0.45);
  let dust = fbm(p * (2.0 + high * 5.0) + vec2<f32>(time * 0.04, -time * 0.03));
  let layer = spiral * bloom * (0.7 + 0.3 * dust) + core;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let color = vjDuotone(palette_rgb.xyz, a / TAU * 0.35 + r * 0.3 + time * 0.025 + dust * 0.18 + drive * 0.2, 0.85 * sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * layer * enabled, clamp(layer * enabled, 0.0, 1.0));
}

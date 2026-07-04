// === Variant 12: Kick Rings ===
// Concentric impact rings with low-end thickness and pulse-driven bloom.
fn kick_rings_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);
  let drive = clamp(max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
  let wave = fract(r * (5.0 + drive * 8.0) - time * (0.75 + drive * 1.7));
  let rings = 1.0 - smoothstep(0.0, 0.12 + drive * 0.12, abs(wave - 0.5) * 2.0);
  let burst_r = 0.12 + fract(time * 0.42) * 0.74;
  let burst = crispRing(r, burst_r, 0.018 + drive * 0.04, 0.04) * pulse * (1.0 - burst_r);
  let spokes = 1.0 - smoothstep(0.0, 0.08 + high * 0.08, abs(fract(a / TAU * (10.0 + floor(mid * 14.0))) - 0.5) * 2.0);
  let layer = rings * (0.35 + 0.95 * drive) + burst * (1.0 + pulse) + spokes * drive * 0.35;
  let vignette = 1.0 - smoothstep(0.72, 1.35, r);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let color = vjDuotone(
    palette_rgb.xyz,
    hue_shift * 0.3 + r * 0.42 + time * 0.03 + drive * 0.18,
    sat,
    bri,
  ) * clamp(layer * (0.75 + drive), 0.0, 1.7);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * vignette * enabled, clamp(layer * vignette * enabled, 0.0, 1.0));
}

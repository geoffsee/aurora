// === Variant 22: Inkbloom ===
// Turbulent ink in water. Bass stirs the pot; mids create rising plumes;
// highs add fine sediment. Soft, organic, and moody.
fn inkbloom_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let t = time * 0.35;

  // Large scale flow
  let flow = vec2<f32>(
    fbm(p * 0.7 + vec2<f32>(t * 0.4, 0.0)) - 0.5,
    fbm(p * 0.7 + vec2<f32>(0.0, t * 0.33)) - 0.5
  ) * (0.6 + bass * 1.0);

  // Mid-frequency plumes
  let plume = fbm(p * 2.4 + flow * 1.5 + vec2<f32>(t * 0.6, -t * 0.5) + mid * 0.8);

  // Fine sediment
  let sediment = fbm(p * 7.0 + flow * 3.0 + vec2<f32>(-t * 1.1, t * 0.8)) * (0.4 + high * 0.9);

  let density = clamp(plume * 1.1 + sediment * 0.6 - r * 0.3, 0.0, 1.6);
  let edge = 1.0 - smoothstep(0.6, 1.1, density);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = density * 0.8 + time * 0.02 + flow.x * 0.5;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.9 * sat, bri);
  let color = mix(base * 0.2, base, edge);

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp((0.55 + 0.45 * density) * (0.6 + bass * 0.3) * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

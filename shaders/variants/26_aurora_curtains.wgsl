// === Variant 26: Aurora Curtains ===
// Vertical spectral ribbons with smooth mid/high movement and soft bass billow.
fn aurora_curtains_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let flow = fbm(p * 0.72 + vec2<f32>(time * 0.035, -time * 0.028));
  let fold = sin(p.y * (2.2 + mid * 2.6) + time * (0.32 + high * 0.55) + flow * 2.8)
    * (0.18 + bass * 0.16 + mid * 0.08);
  let sheet_phase = (p.x + fold + flow * 0.24) * (2.7 + mid * 2.8);
  let sheets = pow(0.5 + 0.5 * cos(sheet_phase * TAU), 2.2 + high * 1.6);
  let lower_glow = smoothstep(-1.1, -0.15, p.y) * (1.0 - smoothstep(0.35, 1.25, p.y));
  let edge_light = 1.0 - smoothstep(0.0, 0.22 + high * 0.08, abs(fract(sheet_phase + 0.18 * flow) - 0.5) * 2.0);
  let silk = fbm(vec2<f32>(sheet_phase * 0.35, p.y * 1.8 - time * 0.05));
  let layer = (sheets * (0.42 + energy * 0.5) + edge_light * high * 0.18 + silk * 0.16) *
    lower_glow * (0.7 + pulse * 0.25);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vjDuotone(palette_rgb.xyz, hue_shift * 0.18 + sheet_phase * 0.08 + flow * 0.48 + time * 0.012, 0.74 * sat, bri);
  let accent = vjDuotone(palette_rgb.xyz, hue_shift * 0.18 + p.y * 0.16 + flow * 0.62 + 0.24, sat, bri);
  let color = mix(base * 0.55, accent, clamp(sheets + edge_light * 0.25, 0.0, 1.0)) *
    clamp(0.42 + layer * 1.35, 0.0, 1.58);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.82 * enabled, 0.0, 1.0));
}

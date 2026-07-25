// === Variant 26: Aurora Curtains (Deck A) ===
// Tall vertical spectral sheets. Pair with Aurora Crown (36) on Deck B.
fn aurora_curtains_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let wind = fbm(vec2<f32>(p.x * 0.55 + time * 0.028, p.y * 0.22 - time * 0.018));
  let wind2 = fbm(vec2<f32>(p.x * 1.35 - time * 0.04, p.y * 0.55 + wind * 0.8 + time * 0.012));
  let wind3 = noise(vec2<f32>(p.x * 3.2 + wind2 * 1.4, p.y * 1.1 - time * 0.07));
  let fold = sin(p.y * (1.65 + mid * 2.4) + time * (0.22 + high * 0.45) + wind * 3.1)
    * (0.14 + bass * 0.22 + mid * 0.1)
    + sin(p.y * (4.2 + high * 2.0) - time * 0.55 + wind2 * 2.0) * (0.04 + high * 0.06);
  let phase1 = (p.x + fold + wind * 0.32) * (1.9 + mid * 1.6);
  let phase2 = (p.x * 1.35 + fold * 0.7 - wind2 * 0.28 + 0.37) * (2.8 + bass * 1.4);
  let phase3 = (p.x * 0.72 + fold * 1.2 + wind3 * 0.18 - 0.21) * (3.6 + high * 2.2);
  let sheet1 = pow(0.5 + 0.5 * cos(phase1 * TAU), 1.9 + high * 1.1);
  let sheet2 = pow(0.5 + 0.5 * cos(phase2 * TAU), 2.4 + mid * 1.2);
  let sheet3 = pow(0.5 + 0.5 * cos(phase3 * TAU), 3.0 + high * 1.8);
  let edge1 = 1.0 - smoothstep(0.0, 0.18 + high * 0.1, abs(fract(phase1 + wind * 0.12) - 0.5) * 2.0);
  let edge2 = 1.0 - smoothstep(0.0, 0.14 + pulse * 0.08, abs(fract(phase2 + 0.22) - 0.5) * 2.0);
  let silk = fbm(vec2<f32>(phase1 * 0.55 + wind2, p.y * 3.4 - time * 0.08));
  let rays = pow(max(0.0, 1.0 - abs(sin(p.y * (18.0 + high * 22.0) + phase1 * 2.0 + time * 0.9))), 6.0)
    * (0.12 + high * 0.35 + pulse * 0.2);
  let sky = smoothstep(-1.15, -0.05, p.y) * (1.0 - smoothstep(0.55, 1.35, p.y));
  let ground = smoothstep(-1.2, -0.55, p.y) * 0.08;
  let ambient = 0.55 + energy * 0.55 + pulse * 0.18;
  let sheets = sheet1 * 0.55 + sheet2 * 0.38 + sheet3 * 0.28;
  let layer = (sheets * ambient + edge1 * (0.14 + high * 0.28) + edge2 * (0.1 + mid * 0.18)
    + silk * 0.14 + rays + ground) * sky * (0.72 + bass * 0.35 + energy * 0.25);
  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let aurora_green = vec3<f32>(0.12, 0.78, 0.42);
  let aurora_cyan = vec3<f32>(0.18, 0.92, 0.72);
  let pick = palette_rgb.xyz;
  let base_tint = mix(aurora_green, pick, 0.42);
  let edge_tint = mix(aurora_cyan, pick, 0.28);
  let hue_flow = hue_shift * 0.12 + phase1 * 0.05 + wind * 0.35 + time * 0.008;
  let base = vjDuotone(base_tint, hue_flow, 0.82 * sat, bri);
  let accent = vjDuotone(edge_tint, hue_flow + 0.08 + p.y * 0.12, sat, bri * 1.05);
  let tip = vjDuotone(vec3<f32>(0.55, 0.95, 0.62), hue_flow + edge1 * 0.15, 0.7 * sat, bri);
  var color = mix(base * 0.45, accent, clamp(sheets * 0.85 + edge1 * 0.35, 0.0, 1.0));
  color = mix(color, tip, clamp(edge2 * 0.45 + rays * 0.8, 0.0, 1.0));
  color = color * clamp(0.35 + layer * 1.55, 0.0, 1.85);
  let star_cell = floor(p * vec2<f32>(42.0, 28.0));
  let star_h = hash21(star_cell);
  let star_local = fract(p * vec2<f32>(42.0, 28.0)) - 0.5;
  let star = step(0.97, star_h) * (1.0 - smoothstep(0.0, 0.08, length(star_local)))
    * (1.0 - clamp(sheets * 1.4, 0.0, 1.0)) * smoothstep(0.1, 0.9, p.y);
  color = color + vec3<f32>(0.75, 0.85, 1.0) * star * (0.35 + high * 0.4);
  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(layer * 0.92 + star * 0.4, 0.0, 1.0) * enabled;
  return vec4<f32>(color * enabled, alpha);
}

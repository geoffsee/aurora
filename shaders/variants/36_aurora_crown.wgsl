// === Variant 36: Aurora Crown (Deck B) ===
// Arched ribbons + coronal rays. Pair with Aurora Curtains (26) on Deck A.
fn aurora_crown_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let flow = fbm(vec2<f32>(p.x * 0.35 - time * 0.022, p.y * 0.9 + time * 0.03));
  let flow2 = fbm(vec2<f32>(p.x * 1.1 + flow * 0.6, p.y * 1.6 - time * 0.045));
  let arc_y = p.y + 0.15 * cos(p.x * 1.1 + time * 0.18 + flow * 1.4)
    + 0.06 * sin(p.x * 2.8 - time * 0.31 + flow2);
  let band_phase = (arc_y + flow * 0.18) * (3.4 + mid * 2.6) + time * (0.12 + bass * 0.2);
  let bands = pow(0.5 + 0.5 * cos(band_phase * TAU), 2.0 + high * 1.4);
  let ribbon_phase = (arc_y * 1.45 - p.x * 0.08 + flow2 * 0.25) * (5.2 + high * 3.0) - time * 0.2;
  let ribbons = pow(0.5 + 0.5 * cos(ribbon_phase * TAU), 3.2 + pulse * 1.5);
  let crown_r = length(vec2<f32>(p.x * 0.55, max(p.y + 0.35, 0.0) * 1.15));
  let corona = exp(-crown_r * (2.4 - bass * 0.8 - energy * 0.5))
    * (0.35 + bass * 0.45 + pulse * 0.25) * smoothstep(-0.9, 0.2, p.y);
  let ray_a = atan2(p.y + 0.4, p.x + 0.0001);
  let spike = pow(max(0.0, cos(ray_a * (7.0 + floor(mid * 5.0)) + time * 0.4)), 10.0)
    * smoothstep(0.0, 0.85, p.y + 0.35) * (0.08 + pulse * 0.55 + high * 0.2)
    * (1.0 - smoothstep(0.6, 1.5, crown_r));
  let sky = smoothstep(-1.05, 0.05, p.y) * (1.0 - smoothstep(0.65, 1.4, p.y));
  let ambient = 0.5 + energy * 0.55 + mid * 0.2;
  let layer = (bands * 0.55 * ambient + ribbons * 0.4 + corona + spike
    + noise(vec2<f32>(band_phase, p.x * 2.0 + time * 0.05)) * 0.1)
    * sky * (0.7 + energy * 0.3 + pulse * 0.2);
  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let pick = palette_rgb.xyz;
  let body = mix(vec3<f32>(0.15, 0.55, 0.62), pick, 0.35);
  let tip = mix(vec3<f32>(0.78, 0.28, 0.85), pick, 0.22);
  let rose = vec3<f32>(0.92, 0.42, 0.62);
  let hue_flow = hue_shift * 0.1 + band_phase * 0.04 + flow * 0.3 + time * 0.01;
  let base = vjDuotone(body, hue_flow, 0.78 * sat, bri);
  let accent = vjDuotone(tip, hue_flow + 0.18 + ribbons * 0.12, sat, bri);
  let blush = vjDuotone(rose, hue_flow + pulse * 0.1, 0.85 * sat, bri);
  var color = mix(base * 0.5, accent, clamp(bands * 0.7 + ribbons * 0.55 + corona * 0.4, 0.0, 1.0));
  color = mix(color, blush, clamp(spike * 1.2 + pulse * ribbons * 0.5, 0.0, 1.0));
  color = color * clamp(0.32 + layer * 1.6, 0.0, 1.9);
  let star_cell = floor(p * vec2<f32>(36.0, 24.0) + vec2<f32>(time * 0.02, 0.0));
  let star_h = hash21(star_cell);
  let star_local = fract(p * vec2<f32>(36.0, 24.0) + vec2<f32>(time * 0.02, 0.0)) - 0.5;
  let tw = 0.55 + 0.45 * sin(time * (2.5 + star_h * 6.0) + star_h * 20.0);
  let star = step(0.93 - high * 0.04, star_h)
    * (1.0 - smoothstep(0.0, 0.07 + high * 0.03, length(star_local)))
    * tw * (1.0 - clamp(bands * 1.1 + corona * 0.8, 0.0, 1.0)) * smoothstep(-0.1, 0.85, p.y);
  color = color + vec3<f32>(0.7, 0.8, 1.0) * star * (0.45 + high * 0.35);
  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(layer * 0.9 + star * 0.55, 0.0, 1.0) * enabled;
  return vec4<f32>(color * enabled, alpha);
}

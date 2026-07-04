// === Variant 34: Fierce Walking Wolf ===
// Graphic side-profile wolf with animated stride, pointed ears, raised hackles, and snarl details.
fn fierce_walking_wolf_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 1.0);
  let audio = max(energy, 0.0);
  let gait = time * (2.45 + bass * 1.15) + pulse * 0.45;
  let stride = 1.0 + bass * 0.45;
  let p = vec2<f32>(uv.x * aspect, -uv.y);
  let shift = vec2<f32>(sin(time * 0.16) * 0.075, sin(gait * 2.0) * (0.026 + bass * 0.016));
  let q = p * 1.58 - shift;

  let leg_front_a = wolf_leg_2d_sdf(q, vec2<f32>(0.44, -0.33), gait, stride);
  let leg_front_b = wolf_leg_2d_sdf(q, vec2<f32>(0.26, -0.34), gait + TAU * 0.50, stride);
  let leg_hind_a = wolf_leg_2d_sdf(q, vec2<f32>(-0.45, -0.34), gait + TAU * 0.52, stride);
  let leg_hind_b = wolf_leg_2d_sdf(q, vec2<f32>(-0.62, -0.33), gait + TAU * 0.02, stride);

  var wolf_d = wolf_ellipse_2d(q, vec2<f32>(-0.18, -0.12), vec2<f32>(0.72, 0.25));
  wolf_d = min(wolf_d, wolf_ellipse_2d(q, vec2<f32>(0.40, -0.07), vec2<f32>(0.34, 0.31)));
  wolf_d = min(wolf_d, wolf_capsule_2d(q, vec2<f32>(0.48, 0.06), vec2<f32>(0.80, 0.24), 0.13));
  wolf_d = min(wolf_d, wolf_ellipse_2d(q, vec2<f32>(0.97, 0.25), vec2<f32>(0.25, 0.16)));
  wolf_d = min(wolf_d, wolf_triangle_2d(q, vec2<f32>(1.03, 0.19), vec2<f32>(1.40, 0.23), 0.105));
  wolf_d = min(wolf_d, wolf_ellipse_2d(q, vec2<f32>(1.14, 0.10), vec2<f32>(0.13, 0.07)));
  wolf_d = min(wolf_d, wolf_triangle_2d(q, vec2<f32>(0.78, 0.36), vec2<f32>(0.70, 0.67), 0.085));
  wolf_d = min(wolf_d, wolf_triangle_2d(q, vec2<f32>(0.92, 0.35), vec2<f32>(1.03, 0.62), 0.078));
  wolf_d = min(wolf_d, wolf_capsule_2d(q, vec2<f32>(-0.78, -0.07), vec2<f32>(-1.35, 0.22), 0.125));
  wolf_d = min(wolf_d, wolf_ellipse_2d(q, vec2<f32>(-1.42, 0.26), vec2<f32>(0.17, 0.105)));
  wolf_d = min(wolf_d, leg_front_a);
  wolf_d = min(wolf_d, leg_front_b);
  wolf_d = min(wolf_d, leg_hind_a);
  wolf_d = min(wolf_d, leg_hind_b);

  let silhouette = 1.0 - smoothstep(0.0, 0.028, wolf_d);
  let outline = (1.0 - smoothstep(0.0, 0.028, abs(wolf_d))) * (0.55 + pulse * 0.28);

  let floor_y = uv.y - 0.77;
  let floor_shadow = exp(-pow((uv.x * aspect - shift.x) / 1.18, 2.0) - pow(floor_y / 0.15, 2.0)) * (0.18 + bass * 0.20);
  let ground_line = (1.0 - smoothstep(0.0, 0.018, abs(floor_y + sin(uv.x * 7.0 + time * 0.8) * 0.008))) * (0.14 + audio * 0.18);
  let track = (1.0 - smoothstep(0.0, 0.022, abs(fract((uv.x * aspect + time * (0.22 + bass * 0.35)) * 5.6) - 0.5) * 2.0)) *
    smoothstep(0.66, 0.95, uv.y) * (0.12 + pulse * 0.16);
  let wire = bear_tri_wire_2d(q * vec2<f32>(1.12, 1.0) + vec2<f32>(time * 0.015, sin(q.x * 3.0) * 0.02), 15.0 + floor(high * 8.0), 0.018, 0.018) * silhouette;
  let back_y = 0.19 + sin(q.x * 17.0 + time * 1.1) * (0.018 + high * 0.016);
  let hackle = (1.0 - smoothstep(0.0, 0.034, abs(q.y - back_y))) *
    smoothstep(-0.62, -0.42, q.x) * (1.0 - smoothstep(0.26, 0.48, q.x)) * silhouette;
  let chest_ruff = (1.0 - smoothstep(0.0, 0.045, abs(q.x - (0.50 + sin(q.y * 12.0) * 0.025)))) *
    smoothstep(-0.34, 0.16, q.y) * (1.0 - smoothstep(0.16, 0.38, q.y)) * silhouette;

  let eye_v = (q - vec2<f32>(1.02, 0.30)) * vec2<f32>(28.0, 32.0);
  let eye = exp(-dot(eye_v, eye_v)) * silhouette;
  let mouth_span = smoothstep(1.03, 1.10, q.x) * (1.0 - smoothstep(1.34, 1.43, q.x)) * silhouette;
  let mouth_y = 0.14 - (q.x - 1.04) * 0.09;
  let snarl = (1.0 - smoothstep(0.0, 0.018, abs(q.y - mouth_y))) * mouth_span;
  let fang_a = (1.0 - smoothstep(0.0, 0.018, wolf_triangle_2d(q, vec2<f32>(1.13, 0.11), vec2<f32>(1.16, 0.005), 0.026))) * mouth_span;
  let fang_b = (1.0 - smoothstep(0.0, 0.018, wolf_triangle_2d(q, vec2<f32>(1.24, 0.105), vec2<f32>(1.27, 0.015), 0.023))) * mouth_span;
  let teeth = clamp(fang_a + fang_b, 0.0, 1.0);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let fur_base = vjDuotone(palette_rgb.xyz, hue_shift * 0.15 + q.x * 0.12 + q.y * 0.16 + time * 0.009, 0.74 * sat, bri);
  let fur_hot = clamp(duotoneAccent(fur_base) + vec3<f32>(0.05, 0.045, 0.055), vec3<f32>(0.0), vec3<f32>(1.0));
  let flank = smoothstep(-0.72, 0.42, q.x) * (1.0 - smoothstep(0.18, 0.56, q.y)) * silhouette;
  var color = fur_base * (floor_shadow + ground_line + track + silhouette * (0.34 + audio * 0.18) + flank * 0.18);
  color = color + fur_hot * (wire * 0.95 + outline * 0.62 + hackle * 0.68 + chest_ruff * 0.35 + pulse * silhouette * 0.08);
  color = mix(color, vec3<f32>(0.96, 0.94, 0.78) * bri, teeth * 0.86);
  color = mix(color, vec3<f32>(0.035, 0.025, 0.035) * bri, clamp(snarl * 0.82, 0.0, 1.0));
  color = mix(color, vec3<f32>(1.0, 0.08 + high * 0.16, 0.025) * bri, clamp(eye * (1.2 + pulse * 0.9 + high * 0.8), 0.0, 1.0));

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp((silhouette * 0.76 + outline * 0.34 + floor_shadow * 0.35 + ground_line * 0.22 + track * 0.18) * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

fn ghost_capsule_2d(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

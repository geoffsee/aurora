// === Variant 35: Spectral Ghost ===
// Floating translucent apparition with torn cloth, drifting fog, and hollow face cavities.
fn spectral_ghost_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 1.0);
  let p = vec2<f32>(uv.x * aspect, -uv.y);
  let hover = vec2<f32>(sin(time * 0.19) * 0.12, sin(time * (0.74 + bass * 0.45)) * 0.065);
  var q = p - hover;
  let flow = vec2<f32>(
    fbm(q * 1.7 + vec2<f32>(time * 0.05, -time * 0.03)),
    fbm(q.yx * 1.55 + vec2<f32>(-time * 0.04, time * 0.06))
  ) - vec2<f32>(0.5);
  let w = q + flow * (0.075 + energy * 0.075);

  let head = 1.0 - smoothstep(0.43, 0.49, length((w - vec2<f32>(0.0, 0.34)) * vec2<f32>(0.92, 1.08)));
  let bottom_swell = 1.0 - smoothstep(-0.72, 0.42, w.y);
  let body_width = 0.27 + bottom_swell * 0.38 + sin(w.y * 8.0 + time * 0.7) * 0.025;
  let side = 1.0 - smoothstep(body_width, body_width + 0.055, abs(w.x));
  let top_gate = 1.0 - smoothstep(0.16, 0.38, w.y);
  let hem_wave = sin(w.x * 17.0 + time * (1.1 + mid * 0.8)) * (0.055 + high * 0.035);
  let bottom_gate = smoothstep(-0.88 + hem_wave, -0.69 + hem_wave, w.y);
  let sheet = side * top_gate * bottom_gate;

  let left_arm = 1.0 - smoothstep(0.0, 0.085, ghost_capsule_2d(
    w,
    vec2<f32>(-0.26, 0.03),
    vec2<f32>(-0.76, -0.05 + sin(time * 1.0) * 0.065),
    0.075 + pulse * 0.012
  ));
  let right_arm = 1.0 - smoothstep(0.0, 0.085, ghost_capsule_2d(
    w,
    vec2<f32>(0.26, 0.02),
    vec2<f32>(0.70, 0.10 + cos(time * 0.92) * 0.07),
    0.068 + pulse * 0.012
  ));
  let silhouette = clamp(max(head, max(sheet, max(left_arm * 0.72, right_arm * 0.68))), 0.0, 1.0);

  let eye_l_v = (w - vec2<f32>(-0.12, 0.38)) * vec2<f32>(13.0, 18.0);
  let eye_r_v = (w - vec2<f32>(0.12, 0.38)) * vec2<f32>(13.0, 18.0);
  let mouth_v = (w - vec2<f32>(0.0, 0.16 + sin(time * 1.1) * 0.02)) * vec2<f32>(7.0, 12.0);
  let eyes = clamp(exp(-dot(eye_l_v, eye_l_v)) + exp(-dot(eye_r_v, eye_r_v)), 0.0, 1.0) * head;
  let mouth = exp(-dot(mouth_v, mouth_v)) * head;
  let face_void = clamp(eyes + mouth * 0.88, 0.0, 1.0);

  let rib_phase = abs(fract((w.y + flow.x * 0.13 + time * 0.045) * (7.5 + mid * 7.0)) - 0.5) * 2.0;
  let rib = (1.0 - smoothstep(0.0, 0.18 + high * 0.08, rib_phase)) * silhouette * (0.16 + energy * 0.22);
  let edge = pow(1.0 - smoothstep(0.0, 0.11, abs(abs(w.x) - body_width)), 1.6) * sheet;
  let aura = exp(-length((q + flow * 0.2) * vec2<f32>(0.72, 0.92)) * (1.25 - energy * 0.25)) * (0.24 + pulse * 0.22);
  let vapor = fbm((p + flow * 0.42) * vec2<f32>(2.4, 2.0) + vec2<f32>(time * 0.09, -time * 0.12));
  let fog = smoothstep(0.42, 0.86, vapor) * aura * (0.26 + high * 0.2);
  let floor_mist = exp(-pow((uv.y + 0.82) / 0.13, 2.0)) *
    (0.12 + bass * 0.24) *
    (0.55 + 0.45 * sin(uv.x * aspect * 7.0 - time * 1.1));

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vjDuotone(palette_rgb.xyz, hue_shift * 0.14 + w.y * 0.12 + flow.x * 0.5 + time * 0.01, 0.56 * sat, bri);
  let spectral = clamp(duotoneAccent(base) + vec3<f32>(0.09, 0.11, 0.14), vec3<f32>(0.0), vec3<f32>(1.0));
  var color = mix(base * 0.38, spectral, clamp(silhouette * 0.58 + edge * 0.34 + rib, 0.0, 1.0));
  color = color * (0.18 + silhouette * 0.74 + aura * 0.58 + rib + fog);
  color = mix(color, vec3<f32>(0.015, 0.018, 0.026) * bri, face_void * 0.92);
  color = color + spectral * (fog + floor_mist) * 0.72;

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp((silhouette * 0.58 + edge * 0.24 + aura * 0.30 + fog + floor_mist * 0.55) * enabled, 0.0, 0.88);
  return vec4<f32>(color * enabled, alpha);
}

// === Variant 7: Ambient Fluid ===
// Three-level nested domain warp at large scale + IQ cosine palette. Slower
// and smoother than the Plasma variant (which uses small-scale 2-level warp).
// hue_shift cycles between three palette presets so the user can sweep through
// completely different color moods with the existing Palette knob.
fn fluid_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let t = time * 0.06;
  let p = uv * 0.6;
  let q = vec2<f32>(fbm(p + vec2<f32>(0.0, 0.0)), fbm(p + vec2<f32>(3.1, 7.2)));
  let r = vec2<f32>(
    fbm(p + 2.4 * q + vec2<f32>(t,  1.7)),
    fbm(p + 2.4 * q + vec2<f32>(-t, 8.3))
  );
  let s = vec2<f32>(
    fbm(p + 3.6 * r + vec2<f32>(t * 1.3 + bass * 0.5, 5.5)),
    fbm(p + 3.6 * r + vec2<f32>(high * 0.4, t * 1.7))
  );
  let field = fbm(p + 4.5 * s + pulse * 0.6);

  let base = palette_rgb.xyz;
  let accent = duotoneAccent(base);
  let raw = mix(base, accent, field);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let gray = vec3<f32>(dot(raw, vec3<f32>(0.299, 0.587, 0.114)));
  let color = mix(gray, raw, sat) * bri;

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp((0.65 + 0.35 * field) * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

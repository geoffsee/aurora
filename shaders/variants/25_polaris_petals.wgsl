// === Variant 25: Polaris Petals ===
// Radial petals that open/close with bass, shear with mids, and shatter on pulse.
// Center corona reacts to highs.
fn polaris_petals_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);

  let petals = 5.0 + floor(mid * 7.0);
  let open = 0.6 + bass * 0.9 + pulse * 0.3;
  let lobe = pow(abs(cos(a * petals + time * (0.6 + bass * 0.8))), 1.6 / open);
  let petal = 1.0 - smoothstep(0.35, 0.95 + high * 0.2, r / (0.55 + lobe * 0.45));

  // Shear / twist
  let twist = sin(a * 2.0 + time * 1.1) * (0.2 + mid * 0.5);
  let shear = 1.0 - smoothstep(0.0, 0.08 + high * 0.06, abs(fract((a + twist) / TAU * (petals * 2.0)) - 0.5) * 2.0);

  // Shatter on pulse
  let crack = step(0.6 - pulse * 0.7, hash21(floor(vec2<f32>(a * 9.0, r * 11.0) + floor(time * 4.0))));
  let burst = crispRing(r, fract(time * 1.8) * 0.9 + 0.05, 0.01 + pulse * 0.04, 0.05) * pulse * 1.8;

  let corona = exp(-r * (4.0 - high * 2.0)) * (0.4 + high * 0.8);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a * 0.08 + time * 0.025 + r * 0.5;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.9 * sat, bri);
  let layer = petal * 0.9 + shear * 0.5 + corona + burst + crack * pulse * 0.6;
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * 0.7 * enabled, 0.0, 1.0));
}

// === Variant 30: Solar Flare ===
// Radial arcs, coronal rays, and pulse bloom for drops and big transitions.
fn solar_flare_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);
  let drive = clamp(max(pulse, energy * 0.45 + bass * 0.45), 0.0, 1.0);
  let arms = 4.0 + floor(mid * 8.0);
  let arc_phase = a / TAU * arms + r * (2.2 + bass * 2.8) - time * (0.22 + drive * 0.75);
  let arcs = 1.0 - smoothstep(0.0, 0.12 + high * 0.06, abs(fract(arc_phase) - 0.5) * 2.0);
  let rays = pow(0.5 + 0.5 * cos(a * (10.0 + high * 18.0) + time * (0.8 + bass * 1.5)), 4.0 - high * 1.6);
  let corona = exp(-r * (1.9 - drive * 0.7)) * (0.28 + drive * 1.05);
  let bloom = crispRing(r, fract(time * (0.55 + drive * 1.1)) * 0.75 + 0.1, 0.022 + pulse * 0.045, 0.055) * pulse * 1.9;
  let granules = fbm(p * (4.0 + high * 5.0) + vec2<f32>(time * 0.12, -time * 0.08));
  let layer = corona + arcs * (0.5 + drive * 0.8) + rays * (0.22 + high * 0.55) + bloom + granules * drive * 0.18;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let core = vjDuotone(palette_rgb.xyz, hue_shift * 0.2 + r * 0.35 + time * 0.02, 0.82 * sat, bri);
  let hot = clamp(core * 1.35 + vec3<f32>(0.22, 0.18, 0.1), vec3<f32>(0.0), vec3<f32>(1.0));
  let color = mix(core, hot, clamp(corona + bloom, 0.0, 1.0)) * clamp(layer, 0.0, 1.95);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * (1.0 - smoothstep(0.95, 1.45, r)) * enabled, 0.0, 1.0));
}

// === Variant 16: Crystal Core ===
// Faceted radial crystals. Highs carve more facets and sharpen rims; bass
// swells the core and drives rotation speed. Fully audio-reactive.
fn crystal_core_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);
  let drive = clamp(max(bass, energy * 0.5 + pulse * 0.5), 0.0, 1.0);
  let facets = 6.0 + floor(high * 18.0);
  let fa = abs(fract(a / TAU * facets + time * (0.3 + drive * 0.6)) - 0.5) * 2.0;
  let crystal = 1.0 - smoothstep(0.0, 0.06 + high * 0.05, fa);
  let ring = crispRing(r, 0.38 + drive * 0.18 + sin(time * 0.7) * 0.02, 0.03 + drive * 0.02, 0.03);
  let core = exp(-r * r * (7.0 - drive * 4.0)) * (0.3 + 1.1 * drive);
  let layer = crystal * (0.45 + high * 0.7) + ring * (0.6 + drive) + core;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a / TAU * 0.2 + r * 0.6 + time * 0.02 + drive * 0.15;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.9 * sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * enabled, 0.0, 1.0));
}

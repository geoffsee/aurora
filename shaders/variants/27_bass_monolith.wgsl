// === Variant 27: Bass Monolith ===
// Heavy central slabs with low-end bloom, pressure waves, and blocky strata.
fn bass_monolith_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let drive = clamp(max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
  let wobble = fbm(vec2<f32>(p.y * 0.8, time * 0.08)) * (0.08 + drive * 0.14);
  let center_width = 0.22 + drive * 0.16 + wobble;
  let core_slab = 1.0 - smoothstep(center_width, center_width + 0.055 + high * 0.04, abs(p.x));
  let side_dist = abs(abs(p.x) - (0.42 + drive * 0.14));
  let side_slab = 1.0 - smoothstep(0.06 + drive * 0.03, 0.16 + high * 0.05, side_dist);
  let strata_wave = abs(fract((p.y + time * (0.18 + drive * 0.42)) * (4.0 + drive * 9.0)) - 0.5) * 2.0;
  let strata = 1.0 - smoothstep(0.0, 0.16 + drive * 0.1, strata_wave);
  let impact = crispRing(r, fract(time * (0.75 + drive * 1.55)) * 0.92 + 0.04, 0.018 + drive * 0.035, 0.045) * pulse * 1.65;
  let glow = exp(-r * (2.1 - drive * 0.9)) * (0.18 + drive * 0.72);
  let layer = core_slab * (0.78 + drive * 1.1) + side_slab * (0.35 + drive * 0.55) + strata * core_slab * 0.42 + impact + glow;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vjDuotone(palette_rgb.xyz, hue_shift * 0.12 + p.y * 0.17 + drive * 0.18, 0.78 * sat, bri);
  let edge = vjDuotone(palette_rgb.xyz, hue_shift * 0.12 + r * 0.42 + 0.25 + high * 0.1, sat, bri);
  let color = mix(base * 0.55, edge, clamp(strata + side_slab + impact, 0.0, 1.0)) * clamp(layer, 0.0, 1.85);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.68 * enabled, 0.0, 1.0));
}

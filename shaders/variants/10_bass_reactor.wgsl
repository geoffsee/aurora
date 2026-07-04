// === Variant 10: Bass Reactor ===
// Heavy low-end blob field. `drive` keys the whole shape off the bass band but
// falls back to overall energy/pulse so it still pumps when no dedicated bass
// track is mapped — otherwise a flat bass meter leaves it looking static.
fn bass_reactor_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);

  // Combined low-end drive: bass when available, otherwise energy/pulse.
  let drive = clamp(max(bass, energy * 0.6 + pulse * 0.4), 0.0, 1.0);

  let lobes = 5.0 + floor((bass + pulse) * 6.0);
  let membrane = 0.32 + drive * 0.36 + 0.05 * sin(a * lobes + time * (0.6 + drive * 1.8));
  let band_w = 0.09 + drive * 0.22;
  let body = 1.0 - smoothstep(0.0, band_w, abs(r - membrane));
  // Core blob swells and brightens hard with the low end.
  let core = exp(-r * r * (6.5 - drive * 3.8)) * (0.18 + 1.25 * drive);
  // Beat shockwave: each pulse launches an outward ring that fades with radius.
  let shock_r = fract(time * 0.4);
  let shock = crispRing(r, shock_r, 0.01 + drive * 0.03, 0.045)
    * pulse * (1.0 - shock_r) * 1.6;
  let texture = fbm(p * (2.0 + mid * 3.0) + vec2<f32>(time * 0.08, -time * 0.05));

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a / TAU * 0.25 + texture * 0.3 + time * 0.02 + drive * 0.2;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.8 * sat, bri);
  let accent = vjDuotone(palette_rgb.xyz, hue_phase + 0.22, sat, bri);
  let layer = body * (0.38 + drive * 0.95 + texture * 0.3) + core + shock;
  let color = mix(base, accent, clamp(body + shock, 0.0, 1.0))
    * clamp(layer * (0.6 + drive), 0.0, 1.7);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * enabled, 0.0, 1.0));
}

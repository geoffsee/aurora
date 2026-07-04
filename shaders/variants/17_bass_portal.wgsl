// === Variant 17: Bass Portal ===
// Receding ring throat. Bass accelerates depth travel and widens the maw;
// highs etch sharp spokes; pulse throws impact rings. Heavy audio drive.
fn bass_portal_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let r = max(length(uv), 0.001);
  let a = atan2(uv.y, uv.x);
  let depth = 1.0 / r + time * (0.9 + bass * 2.2);
  let band = abs(fract(depth * (1.8 + bass * 1.6)) - 0.5) * 2.0;
  let portal = 1.0 - smoothstep(0.0, 0.16 + bass * 0.1, band);
  let spokes = 1.0 - smoothstep(0.0, 0.04 + high * 0.06, abs(fract(a / TAU * (8.0 + high * 20.0) + time * 0.5) - 0.5) * 2.0);
  let pulse_ring = crispRing(r, fract(time * (1.2 + bass * 1.8)) * 0.9 + 0.08, 0.015 + pulse * 0.025, 0.02) * pulse;
  let layer = portal * (0.55 + bass * 0.9) + spokes * (0.35 + high * 0.5) + pulse_ring * 1.6;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = depth * 0.04 + a * 0.3 + time * 0.03;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.8 * sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * enabled * (1.0 - r * 0.3), 0.0, 1.0));
}

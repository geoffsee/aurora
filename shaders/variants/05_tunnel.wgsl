// === Variant 5: Cyberpunk Tunnel ===
// Classic IQ tunnel: polar reproject so u = angle, v = 1/radius. As you walk
// "into" the screen the depth coordinate v grows without bound, giving an
// infinite hallway. Bass speeds up the forward velocity; high frequencies
// thicken the ring bands.
fn tunnel_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let r = max(length(uv), 0.001);
  let a = atan2(uv.y, uv.x);
  let u = a / TAU + time * 0.04;
  let depth = 1.0 / r + time * (0.5 + bass * 0.9);

  let band = abs(fract(depth * 1.5) - 0.5) * 2.0;
  let band_glow = 1.0 - smoothstep(0.0, 0.22 + high * 0.22, band);

  let spoke_count = 12.0 + floor(bass * 16.0);
  let spoke = abs(fract(u * spoke_count) - 0.5) * 2.0;
  let spoke_glow = 1.0 - smoothstep(0.0, 0.18 + mid * 0.14, spoke);

  let neon = max(band_glow, spoke_glow * 0.85);
  let fog = clamp(r * 1.15, 0.0, 1.0);
  let core = exp(-r * 1.5) * (0.9 + 0.1 * pulse);
  let layer = neon * (1.0 - fog * 0.6) + core * 0.55;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = depth * 0.05 + u * 0.4 + time * 0.04;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.85 * sat, bri);
  let accent = vjDuotone(palette_rgb.xyz, hue_phase + 0.5, sat, bri);
  let color = mix(base, accent, neon) * clamp(0.2 + layer, 0.0, 1.6);

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(layer * (0.6 + 0.4 * pulse) * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

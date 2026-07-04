// === Variant 28: Prism Tunnel ===
// Kaleidoscopic tunnel with faceted spokes and crossfade-friendly forward motion.
fn prism_tunnel_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p0 = vec2<f32>(uv.x * aspect, uv.y);
  let slices = 5.0 + floor(mid * 9.0);
  let p = kaleidoscope(p0, slices, time * (0.08 + bass * 0.12));
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);
  let depth = 1.0 / r + time * (0.55 + bass * 1.15);
  let facet = 1.0 - smoothstep(0.0, 0.08 + high * 0.05, abs(fract(a / TAU * slices + depth * 0.16) - 0.5) * 2.0);
  let rings = 1.0 - smoothstep(0.0, 0.17 + bass * 0.08, abs(fract(depth * (1.45 + mid * 0.8)) - 0.5) * 2.0);
  let prism = 1.0 - smoothstep(0.0, 0.12 + high * 0.07, abs(fract((p.x - p.y) * (4.0 + high * 8.0) + time * 0.16) - 0.5) * 2.0);
  let core = exp(-r * (1.25 - bass * 0.35)) * (0.22 + pulse * 0.55 + energy * 0.25);
  let layer = max(facet * 0.85, rings) * (0.65 + bass * 0.75) + prism * high * 0.42 + core;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vjDuotone(palette_rgb.xyz, hue_shift * 0.16 + depth * 0.045 + a * 0.18, 0.88 * sat, bri);
  let accent = vjDuotone(palette_rgb.xyz, hue_shift * 0.16 + depth * 0.055 + 0.33 + high * 0.12, sat, bri);
  let color = mix(base, accent, clamp(prism + facet * 0.45, 0.0, 1.0)) * clamp(layer * (0.75 + energy * 0.35), 0.0, 1.8);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * (1.0 - r * 0.22) * enabled, 0.0, 1.0));
}

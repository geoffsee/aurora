// === Variant 13: Laser Lattice ===
// Perspective laser plane; bass pushes depth, highs sharpen the beams.
fn laser_lattice_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let drive = clamp(max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
  let sharpen = clamp(max(high, energy * 0.35 + pulse * 0.65), 0.0, 1.0);
  let y = uv.y + 0.72;
  let persp = 1.0 / max(y + 1.05, 0.18);
  let p = vec2<f32>(uv.x * persp * (1.0 + drive), y * persp + time * (0.6 + drive * 1.5));
  let grid_x = abs(fract(p.x * (5.0 + mid * 9.0)) - 0.5) * 2.0;
  let grid_y = abs(fract(p.y * (4.0 + drive * 7.0)) - 0.5) * 2.0;
  let line_w = 0.028 + sharpen * 0.09 + pulse * 0.035;
  let beams = max(1.0 - smoothstep(0.0, line_w, grid_x), 1.0 - smoothstep(0.0, line_w, grid_y));
  let horizon = exp(-abs(uv.y + 0.34) * (7.0 - drive * 2.0));
  let sweep = 1.0 - smoothstep(0.0, 0.05 + sharpen * 0.04, abs(fract((uv.x + time * (0.2 + pulse * 0.25)) * 2.0) - 0.5) * 2.0);
  let layer = beams * (0.45 + 0.85 * drive) + horizon * (0.25 + pulse * 0.7) + sweep * sharpen * 0.5;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vjDuotone(palette_rgb.xyz, p.y * 0.08 + time * 0.03 + drive * 0.18, sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * enabled, 0.0, 1.0));
}

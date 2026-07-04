// === Variant 29: Data Rain ===
// Falling scan-glyph cells with high-frequency sparkle and bass-driven speed.
fn data_rain_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect * 0.72 + 0.5, uv.y * 0.5 + 0.5);
  let columns = 24.0 + floor(high * 22.0);
  let rows = 30.0 + floor(mid * 18.0);
  let column = floor(p.x * columns);
  let column_seed = hash21(vec2<f32>(column, 3.7));
  let speed = 0.8 + bass * 3.8 + column_seed * 1.4;
  let fall = time * speed + column_seed * rows;
  let grid = vec2<f32>(p.x * columns, p.y * rows + fall);
  let cell = floor(grid);
  let local = fract(grid) - vec2<f32>(0.5);
  let seed = hash21(cell + vec2<f32>(0.0, floor(time * 0.75)));
  let live = step(0.57 - energy * 0.18 - high * 0.2, seed);
  let head_pos = fract(p.y * 0.18 + time * (0.18 + bass * 0.42) + column_seed);
  let row_phase = fract(grid.y / rows);
  let head_band = 1.0 - smoothstep(0.0, 0.065 + pulse * 0.035, abs(row_phase - head_pos));
  let trail = exp(-fract(row_phase - head_pos + 1.0) * (5.0 - bass * 1.8)) * (0.3 + energy * 0.45);
  let box_mask = (1.0 - smoothstep(0.34, 0.47, abs(local.x))) *
    (1.0 - smoothstep(0.34, 0.47, abs(local.y)));
  let vertical = (1.0 - smoothstep(0.04, 0.09 + high * 0.03, abs(local.x))) *
    (1.0 - smoothstep(0.12, 0.44, abs(local.y)));
  let horizontal = (1.0 - smoothstep(0.04, 0.09 + high * 0.03, abs(local.y - (seed - 0.5) * 0.36))) *
    (1.0 - smoothstep(0.1, 0.4, abs(local.x)));
  let corner = step(0.86 - high * 0.18, seed) *
    (1.0 - smoothstep(0.08, 0.22, length(abs(local) - vec2<f32>(0.32))));
  let glyph = box_mask * (vertical * 0.5 + horizontal * 0.55 + corner * 0.45);
  let sparkle = step(0.96 - high * 0.24 - pulse * 0.16, hash21(cell + vec2<f32>(floor(time * 12.0) * 0.07, 4.2)));
  let scanline = 0.76 + 0.24 * step(0.5, fract((p.y + time * 0.05) * 90.0));
  let layer = live * glyph * (trail + head_band * (0.95 + pulse * 0.7)) * scanline + sparkle * (0.65 + pulse);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vjDuotone(palette_rgb.xyz, hue_shift * 0.14 + column_seed * 0.22 + p.y * 0.18, 0.78 * sat, bri);
  let hot = vjDuotone(palette_rgb.xyz, hue_shift * 0.14 + seed * 0.34 + 0.31, sat, bri);
  let color = mix(base * 0.32, hot, clamp(head_band + sparkle, 0.0, 1.0)) *
    clamp(layer * 1.35, 0.0, 1.85);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.8 * enabled, 0.0, 1.0));
}

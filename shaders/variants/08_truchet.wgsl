// === Variant 8: Truchet Geometric ===
// Truchet arcs — each cell randomly mirrors its local space so its two arcs
// connect to one of two adjacent-corner pairs. Tiles slowly re-roll their
// orientation over time. Bauhaus / Schotter feel.
fn truchet_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let tile_size = 0.22 - bass * 0.05;
  let cell = floor(uv / tile_size);
  let local = (uv / tile_size) - cell - vec2<f32>(0.5);

  let h = hash21(cell + vec2<f32>(floor(time * 0.3) * 0.017, 0.0));
  let flip = step(0.5, h);
  let lp = vec2<f32>(local.x, mix(local.y, -local.y, flip));

  let d1 = abs(length(lp - vec2<f32>(0.5,  0.5)) - 0.5);
  let d2 = abs(length(lp - vec2<f32>(-0.5, -0.5)) - 0.5);
  let arc_d = min(d1, d2);

  let line_w = 0.04 + high * 0.08 + pulse * 0.05;
  let arc = 1.0 - smoothstep(line_w, line_w + 0.04, arc_d);

  let in_c1 = step(length(lp - vec2<f32>(0.5,  0.5)),  0.5);
  let in_c2 = step(length(lp - vec2<f32>(-0.5, -0.5)), 0.5);
  let fill_mask = max(in_c1, in_c2);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_a = (cell.x + cell.y * 1.7) * 0.13 + time * 0.04;
  let line_col = vjDuotone(palette_rgb.xyz, hue_a + h * 0.3, sat, bri);
  let fill_col = vjDuotone(palette_rgb.xyz, hue_a + 0.5 + h * 0.2, 0.5 * sat, 0.6 * bri);

  let intensity = arc + fill_mask * (0.2 + 0.15 * pulse);
  let color = mix(fill_col, line_col, arc);

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(intensity * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

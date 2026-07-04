// === Variant 31: Topo Lines ===
// Oblique contour-map bands over a terrain field; no central organic symmetry.
fn topo_lines_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let q = vec2<f32>(p.x * 1.12 + p.y * 0.28, p.y * 0.92 - p.x * 0.18);
  let drift = vec2<f32>(time * 0.032 + bass * 0.12, -time * 0.026 + mid * 0.08);
  let large = fbm(q * (1.18 + mid * 0.35) + drift);
  let detail = fbm(q * (3.4 + high * 1.7) - drift * 1.6) * (0.22 + high * 0.16);
  let slope = q.x * (0.18 + bass * 0.08) - q.y * 0.11;
  let terrace = sin((q.x * 2.7 + q.y * 1.4) + time * (0.14 + mid * 0.22)) * 0.055;
  let elevation = large * 0.78 + detail + slope + terrace + pulse * 0.045;
  let bands = 11.0 + floor(mid * 16.0);
  let contour_wave = abs(fract(elevation * bands + time * (0.018 + bass * 0.035)) - 0.5) * 2.0;
  let contour = 1.0 - smoothstep(0.0, 0.055 + high * 0.045, contour_wave);
  let major_wave = abs(fract(elevation * (bands * 0.25)) - 0.5) * 2.0;
  let major = 1.0 - smoothstep(0.0, 0.045 + pulse * 0.055, major_wave);
  let grid_x = 1.0 - smoothstep(0.0, 0.012, abs(fract((q.x + 1.2) * 4.0) - 0.5) * 2.0);
  let grid_y = 1.0 - smoothstep(0.0, 0.012, abs(fract((q.y + 1.0) * 3.5) - 0.5) * 2.0);
  let tick_cells = floor(q * vec2<f32>(5.0, 4.0));
  let tick_seed = hash21(tick_cells);
  let tick_local = fract(q * vec2<f32>(5.0, 4.0)) - vec2<f32>(0.5);
  let tick = step(0.82 - high * 0.12, tick_seed) *
    (1.0 - smoothstep(0.0, 0.025 + pulse * 0.015, abs(tick_local.y))) *
    (1.0 - smoothstep(0.18, 0.42, abs(tick_local.x)));
  let fill = smoothstep(0.18, 1.12, elevation) * 0.22;
  let layer = fill + contour * (0.58 + high * 0.42) + major * (0.55 + pulse * 0.5) +
    (grid_x + grid_y) * 0.08 * energy + tick * 0.35;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vjDuotone(palette_rgb.xyz, hue_shift * 0.12 + elevation * 0.28 + time * 0.008, 0.6 * sat, 0.72 * bri);
  let line = vjDuotone(palette_rgb.xyz, hue_shift * 0.12 + elevation * 0.42 + 0.22, sat, bri);
  let map_fill = mix(base * 0.32, base, smoothstep(0.08, 0.9, elevation));
  let color = mix(map_fill, line, clamp(contour + major + tick, 0.0, 1.0)) *
    clamp(0.48 + layer, 0.0, 1.58);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.78 * enabled, 0.0, 1.0));
}

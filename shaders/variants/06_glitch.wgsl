// === Variant 6: Glitchy Y2K ===
// Block-displaced sampling: divide screen into tiles, a hash decides which
// tiles are "glitched" and shifts them horizontally. Per-channel hue offset
// gives RGB-split chromatic aberration. Scanlines on top for the CRT feel.
fn glitch_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let blk_size = 0.12;
  let blk_id = floor(uv / blk_size);
  let blk_seed = hash21(blk_id + vec2<f32>(floor(time * 6.0) * 0.013, 0.0));
  let blk_active = step(0.78 - high * 0.30, blk_seed);
  let blk_shift = (blk_seed * 2.0 - 1.0) * blk_active * (0.30 + bass * 0.40);
  let shifted = uv + vec2<f32>(blk_shift, 0.0);

  let scan = 0.55 + 0.45 * step(0.5, fract(uv.y * 90.0 + time * 0.4));

  let bar_a = fract(shifted.y * 6.0 + time * 0.6 + blk_seed);
  let bar_b = fract(shifted.x * 4.0 - time * 0.4 + blk_seed * 1.7);
  let bars = step(0.5, bar_a) * 0.6 + step(0.5, bar_b) * 0.4;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let split = 0.18 + 0.25 * blk_active + 0.20 * bass;
  let h_base = bars + shifted.x * 0.1 + time * 0.07;
  let r_col = vjDuotone(palette_rgb.xyz, h_base - split, sat, bri).r;
  let g_col = vjDuotone(palette_rgb.xyz, h_base,         sat, bri).g;
  let b_col = vjDuotone(palette_rgb.xyz, h_base + split, sat, bri).b;

  let color = vec3<f32>(r_col, g_col, b_col) * scan;
  let intensity = bars * (0.5 + 0.5 * blk_active) + 0.2 * pulse;
  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(intensity * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

// === Variant 11: High Spark Field ===
// A starfield of hashed cells where high frequencies reveal glitter density.
fn high_spark_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let sparkle = clamp(max(high, energy * 0.45 + pulse * 0.55), 0.0, 1.0);
  let p = uv + vec2<f32>(time * 0.035, -time * 0.02);
  let scale = 14.0 + sparkle * 42.0;
  let cell = floor(p * scale);
  let local = fract(p * scale) - vec2<f32>(0.5);
  let seed = hash21(cell);
  let twinkle = 0.5 + 0.5 * sin(time * (5.0 + sparkle * 12.0) + seed * TAU);
  let point = 1.0 - smoothstep(0.018 + sparkle * 0.018, 0.19, length(local));
  let visible = step(0.82 - sparkle * 0.45 - pulse * 0.2, seed);
  let streak = (1.0 - smoothstep(0.0, 0.05 + sparkle * 0.04, abs(local.y))) *
    (1.0 - smoothstep(0.0, 0.38, abs(local.x))) * step(0.88 - pulse * 0.3, seed);
  let glow = (point * (0.35 + 0.65 * twinkle) + streak * (0.45 + pulse * 0.5)) * visible;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let color = vjDuotone(palette_rgb.xyz, seed + time * 0.04 + sparkle * 0.12, sat, bri) * (0.45 + 1.1 * glow + sparkle * 0.35);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * glow * enabled, clamp(glow * (0.55 + sparkle), 0.0, 1.0) * enabled);
}

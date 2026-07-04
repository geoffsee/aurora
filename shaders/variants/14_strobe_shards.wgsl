// === Variant 14: Strobe Shards ===
// Angular fractured polygons. Pulse reveals shards; highs increase fragmentation.
fn strobe_shards_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let drive = clamp(max(pulse, energy * 0.45 + high * 0.55), 0.0, 1.0);
  let scale = 4.0 + drive * 12.0;
  let cell = floor((uv + vec2<f32>(0.04 * sin(time), 0.03 * cos(time * 0.8))) * scale);
  let local = fract(uv * scale) - vec2<f32>(0.5);
  let seed = hash21(cell);
  let angle = seed * TAU + time * (0.12 + max(bass, drive * 0.5) * 0.4);
  let axis = vec2<f32>(cos(angle), sin(angle));
  let cut = abs(dot(local, axis));
  let shard = 1.0 - smoothstep(0.08 + drive * 0.12, 0.34, cut + length(local) * 0.15);
  let gate = step(0.58 - drive * 0.5 - energy * 0.2, seed);
  let edge = 1.0 - smoothstep(0.0, 0.04 + drive * 0.04, abs(cut - 0.16));
  let layer = gate * (shard * (0.35 + drive) + edge * drive * 0.85);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let color = vjDuotone(palette_rgb.xyz, seed + dot(local, axis) * 0.5 + drive * 0.16, sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * layer * enabled, clamp(layer * enabled, 0.0, 1.0));
}

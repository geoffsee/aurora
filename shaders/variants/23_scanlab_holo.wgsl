// === Variant 23: Scanlab Holo ===
// Holographic scanline + hold wobble. RGB split increases with highs; bass
// modulates vertical phase slip. Retro-futurist monitor feel.
fn scanlab_holo_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);

  let wobble = sin(p.y * 22.0 + time * 6.0) * (0.003 + bass * 0.01);
  let slip = sin(time * 0.8) * (0.02 + bass * 0.03);
  let y = p.y + wobble + slip;

  let scan = 0.6 + 0.4 * step(0.5, fract(y * 38.0 + time * 1.4));
  let band = 0.7 + 0.3 * step(0.5, fract(y * 5.5 + time * 0.3));

  // RGB split grows with highs
  let split = (0.004 + high * 0.018) * (1.0 + pulse * 0.5);
  let r = vjDuotone(palette_rgb.xyz, p.x * 0.1 + y * 0.6 + time * 0.02 - split, palette_extra.x, palette_extra.y).r;
  let g = vjDuotone(palette_rgb.xyz, p.x * 0.1 + y * 0.6 + time * 0.02, palette_extra.x, palette_extra.y).g;
  let b = vjDuotone(palette_rgb.xyz, p.x * 0.1 + y * 0.6 + time * 0.02 + split, palette_extra.x, palette_extra.y).b;

  let glitch = step(0.82 - high * 0.35, hash21(floor(vec2<f32>(p.x * 9.0, y * 11.0) + floor(time * 7.0) * 0.07)));
  let tear = (1.0 - smoothstep(0.0, 0.03, abs(y + 0.1 - fract(time * 1.7) * 2.2))) * glitch * high;

  let col = vec3<f32>(r, g, b) * scan * band + vec3<f32>(tear * 0.8);
  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp((0.55 + 0.45 * scan) * enabled, 0.0, 1.0);
  return vec4<f32>(col * enabled, alpha);
}

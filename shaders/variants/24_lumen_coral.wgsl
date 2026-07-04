// === Variant 24: Lumen Coral ===
// Branching luminous structures. Bass grows the colony; mids add side branches;
// highs brighten the tips. Soft pulsing core.
fn lumen_coral_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  var p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);

  // Curved space for branching
  let bend = 0.6 + bass * 0.8;
  p = vec2<f32>(p.x * cos(p.y * bend), p.y);

  var acc = 0.0;
  var tip = 0.0;
  var q = p * 1.8;
  for (var i = 0; i < 5; i++) {
    let ang = a * (1.0 + f32(i) * 0.3) + time * (0.2 + f32(i) * 0.07) + mid * 0.6;
    let rad = 0.08 + f32(i) * 0.025 + bass * 0.02;
    let d = abs(length(q - vec2<f32>(sin(ang) * 0.6, cos(ang * 1.3) * 0.3)) - rad);
    acc += 1.0 - smoothstep(0.0, 0.035 + high * 0.02, d);
    // Tip brightening
    tip += (1.0 - smoothstep(0.0, 0.02 + high * 0.03, d)) * (0.6 + high * 0.8);
    q = q * 1.6 + vec2<f32>(sin(time * 0.4 + f32(i)), cos(time * 0.5)) * 0.15;
  }

  let core = exp(-r * (3.2 - bass * 1.0)) * (0.4 + pulse * 0.6);
  let layer = clamp(acc * 0.7 + tip * 0.9 + core, 0.0, 2.2);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a * 0.15 + time * 0.03 + layer * 0.2;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.85 * sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp((0.4 + 0.6 * layer) * enabled, 0.0, 1.0));
}

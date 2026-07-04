// === Variant 21: Recursive Maw ===
// Self-similar zoom tunnel. Bass pushes depth; high warps the fractal c seed.
// Looks like flying into a living recursive iris.
fn recursive_maw_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  var p = vec2<f32>(uv.x * aspect, uv.y);
  let r0 = length(p);
  var acc = 0.0;
  var wsum = 0.0;
  let cbase = vec2<f32>(-0.72, 0.18) + vec2<f32>(sin(time * 0.1) * 0.06, cos(time * 0.13) * 0.05);
  let cmod = vec2<f32>(high * 0.18, mid * 0.12) * sin(time * 0.7);
  let c = cbase + cmod;

  for (var i = 0; i < 6; i++) {
    let z = p * (1.6 + bass * 0.6);
    let z2 = dot(z, z);
    let inv = 1.0 / max(z2, 0.02);
    p = vec2<f32>(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) * inv + c;
    let contrib = exp(-z2 * (0.7 + f32(i) * 0.15)) * (0.8 + 0.4 * pulse);
    acc += contrib;
    wsum += 1.0;
  }
  let field = clamp(acc / wsum, 0.0, 2.0);

  let depth = 1.0 / max(r0, 0.001) + time * (1.2 + bass * 2.0);
  let ring = 1.0 - smoothstep(0.0, 0.14 + bass * 0.1, abs(fract(depth) - 0.5) * 2.0);
  let spokes = 1.0 - smoothstep(0.0, 0.05 + high * 0.08, abs(fract(atan2(p.y, p.x) / TAU * (6.0 + mid * 8.0) + time * 0.3) - 0.5) * 2.0);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = atan2(p.y, p.x) * 0.3 + depth * 0.03 + field * 0.4;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.85 * sat, bri);
  let layer = field * 0.9 + ring * (0.6 + bass * 0.6) + spokes * (0.35 + high * 0.5);

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * 0.75 * enabled, 0.0, 1.0));
}

// === Variant 19: Iridescent Veil ===
// Thin-film interference with view-dependent hue flips. Highs add micro-folds;
// bass swells the veil depth. Soft fresnel rim.
fn iridescent_veil_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);

  let warp = fbm(p * 1.2 + vec2<f32>(time * 0.08, time * -0.05)) + mid * 0.3;
  let folds = sin((p.y + p.x * 0.6) * (9.0 + high * 14.0) + time * 3.2) * (0.5 + high * 0.6);
  let depth = 1.8 + bass * 1.4 + warp * 0.8;

  // Thin film: oscillate hue by optical path difference
  let film = sin(depth * 6.2 + a * 1.3 + time * 1.1) * 0.5 + 0.5;
  let rim = pow(1.0 - clamp(r * 0.72, 0.0, 1.0), 1.6 + bass * 0.8);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  // Shift through three adjacent hues in the chosen palette family
  let h0 = vjDuotone(palette_rgb.xyz, film * 0.6 + time * 0.01, sat, bri);
  let h1 = vjDuotone(palette_rgb.xyz, film * 0.6 + 0.22, sat * 0.95, bri);
  let h2 = vjDuotone(palette_rgb.xyz, film * 0.6 + 0.46, sat, bri * 0.95);
  let irid = mix(mix(h0, h1, film), h2, clamp(folds * 0.5 + 0.5, 0.0, 1.0));

  let veil = (0.45 + 0.55 * film) * (0.5 + 0.5 * rim) + pulse * 0.25;
  let layer = veil * (0.7 + bass * 0.3) + folds * high * 0.2;

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(irid * layer * enabled, clamp(layer * 0.85 * enabled, 0.0, 1.0));
}

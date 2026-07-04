// === Variant 0: Soft Orbital Halo ===
// A restrained atmosphere around the centre, not a target outline. Bass gives
// the halo a slow breath, highs break up the rim texture, and pulse adds a
// short bloom without turning the shape into a hard neon circle.
fn rehoboam_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let angle = atan2(p.y, p.x);

  let breathe = 0.015 * sin(time * 0.55);
  let ring_r = 0.52 + breathe + bass * 0.055;
  let dist = abs(r - ring_r);

  // Sample the rim texture on the unit circle so it wraps seamlessly. Feeding
  // the raw atan2 `angle` here jumped from +pi to -pi across the -x axis, which
  // tore a hard break into the ring at the 270deg / left side.
  let ring_dir = vec2<f32>(cos(angle), sin(angle)) * 0.75;
  let rim_noise = fbm(ring_dir + vec2<f32>(0.0, time * 0.035) + p * 1.8);
  let broken = smoothstep(0.22 - high * 0.08, 0.82, rim_noise);

  // Crisp main ring: tight band with a thin soft edge, still textured by `broken`.
  let band = crispRing(r, ring_r, 0.012 + bass * 0.012, 0.018) * broken;

  // Two concentric rings bracketing the main one (one inner, one outer). These
  // stay clean/continuous so they read as defined rings around the halo.
  let ring_gap = 0.13;
  let ring_inner = crispRing(r, ring_r - ring_gap, 0.008, 0.014);
  let ring_outer = crispRing(r, ring_r + ring_gap, 0.008, 0.014);
  let rings = ring_inner + ring_outer;

  // Keep animated fill inside the inner ring; fade out before the band.
  let inner_edge = ring_r - ring_gap;
  let inner_mask = 1.0 - smoothstep(inner_edge - 0.035, inner_edge + 0.008, r);

  let halo = exp(-dist * 9.5) * (0.12 + 0.08 * bass);

  // Audio-reactive drive only — no beat pulse or time-based sine breathing.
  let audio_drive = bass * 0.5 + mid * 0.3 + high * 0.2;
  let inner = exp(-r * r * 3.8) * (0.06 + 0.12 * energy * (0.35 + 0.65 * audio_drive));

  // Slow envelope-driven core motion — no beat-frequency sine churn.
  let spoke_count = 12.0 + floor(bass * 10.0);
  let spoke_phase = fract(angle / TAU * spoke_count + mid * 0.45 + bass * 0.35);
  let spokes = (1.0 - smoothstep(0.0, 0.055 + high * 0.035, abs(spoke_phase - 0.5) * 2.0))
    * exp(-r * r * (4.5 - bass * 1.2))
    * (0.12 + 0.22 * audio_drive);

  let drift_uv = p * (2.6 + bass * 0.8) + vec2<f32>(mid * 0.25, high * 0.2);
  let inner_texture = fbm(drift_uv + vec2<f32>(sin(bass * 3.0), cos(mid * 2.5)) * 0.2)
    * exp(-r * r * 5.0)
    * (0.15 + 0.25 * energy);

  let core = exp(-r * r * (11.0 - audio_drive * 2.8)) * (0.08 + 0.24 * audio_drive);

  let inner_anim = (inner + spokes + inner_texture + core) * inner_mask;
  let sweep = pow(0.5 + 0.5 * cos(angle - time * (0.22 + mid * 0.5)), 3.0);
  let sweep_inner = sweep * inner_mask * (0.35 + 0.35 * energy);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  // sin(angle) keeps the same +-0.06 angular hue drift but is continuous across
  // the atan2 seam, so the colour no longer steps at the 270deg break.
  let hue_phase = sin(angle) * 0.06 + r * 0.38 + time * 0.012;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.55 * sat, bri);
  let accent = vjDuotone(palette_rgb.xyz, hue_phase + 0.23, 0.78 * sat, bri);
  let color = base * (halo + inner_anim * (0.7 + 0.3 * sweep_inner))
    + accent * (band * (0.7 + 0.3 * sweep) + rings * (0.5 + 0.25 * sweep) + core * inner_mask);

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(
    (halo * 0.42 + band * 0.78 + rings * 0.6 + inner_anim * 0.55 + core * inner_mask * 0.38) * enabled,
    0.0,
    0.9
  );
  return vec4<f32>(color * enabled, alpha);
}

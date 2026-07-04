fn geometry_field(
  uv: vec2<f32>,
  time: f32,
  hue_shift: f32,
  variant: f32,
  pulse: f32,
  energy: f32,
  bass: f32,
  mid: f32,
  high: f32
) -> vec4<f32> {
  let center = uv;
  let radius = length(center);
  let angle = atan2(center.y, center.x);

  let grain = noise(center * 4.0 + vec2<f32>(time * 0.22, energy * 1.3));
  let drift = fbm(center * 2.2 + vec2<f32>(grain, bass * 0.35));

  // Variant: 1=Spokes, 2=Rings, 3=Plasma (domain-warped FBM). Variant 0
  // (Rehoboam ring) is dispatched in fragment() before reaching here; the v==0
  // branches below remain only as the defensive fallback for unexpected values.
  let v = i32(round(variant));

  // Kaleidoscope-folded sampling space for Web variant. Slice count rises with bass,
  // axis rotates slowly with time + pulse — a classic VJ symmetry move.
  let kal_slices = 6.0 + floor(bass * 8.0);
  let kal_uv = select(center, kaleidoscope(center, kal_slices, time * 0.1 + bass * 0.15), v == 0);
  let kal_radius = length(kal_uv);
  let kal_angle = atan2(kal_uv.y, kal_uv.x);

  // Per-variant tuning: spokes thin out + ring count drops in Spokes/Rings modes
  // so they read as their own thing instead of a web.
  let spoke_count = select(18.0, 9.0, v == 1) + floor(drift * 8.0);
  let spoke_angle = select(angle, kal_angle, v == 0);
  let spoke = 1.0 - smoothstep(
    0.0,
    0.055 + 0.015 * mid,
    abs(fract(spoke_angle / TAU * spoke_count + time * 0.08 + grain * 0.4) - 0.5) * 2.0
  );

  let ring_density = select(16.0, 8.0, v == 2);
  let ring_radius = select(radius, kal_radius, v == 0);
  let ring_wave = fract(ring_radius * (ring_density + high * 12.0) + time * (0.22 + bass * 0.18) + grain);
  let ring = 1.0 - smoothstep(0.0, 0.16 - 0.06 * bass, abs(ring_wave - 0.5) * 2.0);

  let lattice_uv = kal_uv * (8.0 + mid * 6.0 + bass * 2.0);
  let lattice_grid = abs(fract(lattice_uv) - vec2<f32>(0.5));
  let lattice = 1.0 - smoothstep(0.0, 0.06 + 0.02 * (1.0 - mid), min(lattice_grid.x, lattice_grid.y));

  let core = exp(-pow(radius * 2.2, 2.0)) * (0.9 + 0.1 * bass);
  let pulse_wave = 0.72 + 0.28 * pulse;

  // Inigo Quilez domain warping: two nested FBM passes feed each other to
  // produce organic, evolving cloud-like fields. The intermediate warp vector
  // `dw_q` is exposed so the color step can shift hue along the swirl, not
  // just along radius. Reference: https://iquilezles.org/articles/warp/
  var dw_q: vec2<f32> = vec2<f32>(0.0);
  var plasma: f32 = 0.0;
  if (v == 3) {
    let dw_p = center * 1.6 + vec2<f32>(time * 0.05, time * 0.04);
    dw_q = vec2<f32>(
      fbm(dw_p + vec2<f32>(0.0, 0.0) + bass * 0.8),
      fbm(dw_p + vec2<f32>(5.2, 1.3) + high * 0.6)
    );
    let dw_r = vec2<f32>(
      fbm(dw_p + 4.0 * dw_q + vec2<f32>(1.7 + time * 0.15, 9.2)),
      fbm(dw_p + 4.0 * dw_q + vec2<f32>(8.3, 2.8 + time * 0.13))
    );
    let plasma_field = fbm(dw_p + 4.0 * dw_r + bass * 0.8);
    plasma = clamp(plasma_field * 1.4 + dw_q.x * 0.4 + 0.2, 0.0, 1.4);
  }

  var geometry: f32;
  if (v == 1) {
    geometry = spoke;
  } else if (v == 2) {
    geometry = ring * (0.85 + 0.15 * energy);
  } else if (v == 3) {
    geometry = plasma;
  } else {
    geometry = max(
      spoke,
      max(ring * (0.75 + 0.25 * energy), lattice * (0.35 + 0.35 * high)) * 0.75
    );
  }
  let layer = geometry * pulse_wave;
  let enabled = select(1.0, 0.0, energy < 0.0);

  let vignette = 1.0 - smoothstep(0.2, 1.0, radius);
  let line_glow = 0.12 * pow(1.0 - clamp(radius, 0.0, 1.0), 2.8);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_bias = select(0.0, dw_q.x * 0.45, v == 3);
  let hue_phase = angle / TAU * 0.42 + radius * 0.52 + time * 0.03 + 0.21 * drift + hue_bias;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.62 * sat, 0.82 * bri);
  let accent = vjDuotone(palette_rgb.xyz, hue_phase + 0.33 + 0.45 * grain, 0.74 * sat, bri);
  let fill = mix(base, accent, 0.38 + 0.35 * energy);
  let color = fill * clamp(0.32 + layer, 0.0, 1.0) + vec3<f32>(line_glow) * accent + vec3<f32>(core * 0.45);
  let alpha = clamp(
    (layer + core + pulse * 0.15 + 0.5 * line_glow) * (0.35 + 0.65 * layer) * vignette * enabled,
    0.0,
    1.0
  );

  return vec4<f32>(color * enabled, alpha);
}

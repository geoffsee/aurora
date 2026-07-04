// === Variant 18: Mercury Lake ===
// Liquid metal surface. Bass dents the mirror; mids/highs drive ripples and caustics.
// Specular glints ride the wave crests; duotone keeps it moody.
fn mercury_lake_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);

  // Low-frequency surface displacement from bass
  let surface = fbm(p * 1.6 + vec2<f32>(time * 0.11, -time * 0.07)) * (0.6 + bass * 1.4);
  let dent = bass * 0.28 * sin(a * 3.0 + time * 1.2) + bass * 0.18 * cos(r * 7.0 - time * 0.9);
  let h = 0.04 * surface + dent;

  // Normal from height field for specular
  let eps = 0.012;
  let hx = fbm((p + vec2<f32>(eps, 0.0)) * 1.6 + vec2<f32>(time * 0.11, -time * 0.07)) * (0.6 + bass * 1.4) * 0.04 + dent;
  let hy = fbm((p + vec2<f32>(0.0, eps)) * 1.6 + vec2<f32>(time * 0.11, -time * 0.07)) * (0.6 + bass * 1.4) * 0.04 + dent;
  let n = normalize(vec3<f32>(-(hx - h) / eps, -(hy - h) / eps, 1.0));

  // View direction (ortho-ish) + animated light
  let view = normalize(vec3<f32>(p * 0.6, 1.4));
  let lpos = vec3<f32>(cos(time * 0.7) * (0.6 + mid * 0.4), sin(time * 0.9) * 0.5 + high * 0.2, 1.2);
  let ldir = normalize(lpos - vec3<f32>(p, 0.0));
  let spec = pow(max(dot(reflect(-ldir, n), view), 0.0), 28.0 + high * 24.0);

  // Ripples on top (highs)
  let ripple = crispRing(r, fract(time * (1.6 + high * 2.2)) * 0.9 + 0.12, 0.008 + high * 0.012, 0.03);
  let ripple2 = crispRing(r, fract(time * (2.3 + mid * 1.1) + 1.7) * 0.7 + 0.3, 0.006, 0.02);
  let caustic = (ripple + ripple2 * 0.6) * (0.3 + high * 0.7);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a * 0.06 + r * 0.2 + time * 0.015 + h * 3.2;
  let base = vjDuotone(palette_rgb.xyz, hue_phase, 0.7 * sat, bri);
  let metal = mix(base, vec3<f32>(1.0), clamp(spec * (0.6 + pulse * 0.5) + caustic * 0.5, 0.0, 0.9));
  let layer = (0.35 + 0.9 * (spec + caustic * 0.7)) * (0.6 + bass * 0.3);

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(metal * layer * enabled, clamp((layer * 0.9 + spec * 0.6) * enabled, 0.0, 1.0));
}

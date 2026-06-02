#import bevy_sprite::mesh2d_vertex_output::VertexOutput

const TAU: f32 = 6.283185307179586;

@group(2) @binding(0) var<uniform> params: vec4<f32>;
// palette_extra.x = saturation (0..1), y = brightness (0..1), z = pulse (0..1)
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
// audio_uniforms.x = energy (-1.0 = inactive), y = bass, z = mid, w = high (0..1 when active)
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;

fn hue_to_rgb(hue: f32) -> vec3<f32> {
  let h = fract(hue);
  let r = abs(h * 6.0 - 3.0) - 1.0;
  let g = 2.0 - abs(h * 6.0 - 2.0);
  let b = 2.0 - abs(h * 6.0 - 4.0);
  return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn vj_palette(selector: f32, phase: f32, saturation: f32, value: f32) -> vec3<f32> {
  let local = fract(phase) - 0.5;
  let hue = selector + local * 0.11;
  let rgb = hue_to_rgb(hue);
  let grayscale = vec3<f32>(dot(rgb, vec3<f32>(0.299, 0.587, 0.114)));
  return mix(grayscale, rgb, saturation) * value;
}

// Exponential saturation curve: smooth onset, soft peak — prevents harsh linear jumps.
fn audio_curve(x: f32) -> f32 {
  return 1.0 - exp(-3.0 * x);
}

fn hash21(st: vec2<f32>) -> f32 {
  return fract(sin(dot(st, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn noise(st: vec2<f32>) -> f32 {
  let i = floor(st);
  let f = fract(st);
  let a = hash21(i);
  let b = hash21(i + vec2<f32>(1.0, 0.0));
  let c = hash21(i + vec2<f32>(0.0, 1.0));
  let d = hash21(i + vec2<f32>(1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm(st: vec2<f32>) -> f32 {
  var value = 0.0;
  var amp = 0.5;
  var freq = 1.0;

  for (var i: i32 = 0; i < 4; i = i + 1) {
    value = value + noise(st * freq) * amp;
    freq = freq * 1.8;
    amp = amp * 0.5;
  }

  return value;
}

// Kaleidoscope polar fold — mirrors `n` slices around a rotating axis.
// Used by the Web variant to upgrade the flat overlay into a symmetric pattern.
fn kaleidoscope(p: vec2<f32>, slices: f32, rotation: f32) -> vec2<f32> {
  let a0 = atan2(p.y, p.x) + rotation;
  let seg = TAU / slices;
  let folded = abs(((a0 % seg) + seg) % seg - seg * 0.5);
  let r = length(p);
  return vec2<f32>(cos(folded), sin(folded)) * r;
}

// Inigo Quilez cosine palette: a + b * cos(TAU * (c*t + d)).
// Different (a,b,c,d) tuples give radically different color schemes — far
// richer than the hue_to_rgb rainbow. Reference: iquilezles.org/articles/palettes
fn cosine_palette(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
  return a + b * cos(TAU * (c * t + d));
}

// === Variant 5: Cyberpunk Tunnel ===
// Classic IQ tunnel: polar reproject so u = angle, v = 1/radius. As you walk
// "into" the screen the depth coordinate v grows without bound, giving an
// infinite hallway. Bass speeds up the forward velocity; high frequencies
// thicken the ring bands.
fn tunnel_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let r = max(length(uv), 0.001);
  let a = atan2(uv.y, uv.x);
  let u = a / TAU + time * 0.04;
  let depth = 1.0 / r + time * (0.5 + bass * 0.9);

  let band = abs(fract(depth * 1.5) - 0.5) * 2.0;
  let band_glow = 1.0 - smoothstep(0.0, 0.22 + high * 0.22, band);

  let spoke_count = 12.0 + floor(bass * 16.0);
  let spoke = abs(fract(u * spoke_count) - 0.5) * 2.0;
  let spoke_glow = 1.0 - smoothstep(0.0, 0.18 + mid * 0.14, spoke);

  let neon = max(band_glow, spoke_glow * 0.85);
  let fog = clamp(r * 1.15, 0.0, 1.0);
  let core = exp(-r * 1.5) * (0.9 + 0.1 * pulse);
  let layer = neon * (1.0 - fog * 0.6) + core * 0.55;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = depth * 0.05 + u * 0.4 + time * 0.04;
  let base = vj_palette(hue_shift, hue_phase, 0.85 * sat, bri);
  let accent = vj_palette(hue_shift, hue_phase + 0.5, sat, bri);
  let color = mix(base, accent, neon) * clamp(0.2 + layer, 0.0, 1.6);

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(layer * (0.6 + 0.4 * pulse) * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

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
  let r_col = vj_palette(hue_shift, h_base - split, sat, bri).r;
  let g_col = vj_palette(hue_shift, h_base,         sat, bri).g;
  let b_col = vj_palette(hue_shift, h_base + split, sat, bri).b;

  let color = vec3<f32>(r_col, g_col, b_col) * scan;
  let intensity = bars * (0.5 + 0.5 * blk_active) + 0.2 * pulse;
  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(intensity * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

// === Variant 7: Ambient Fluid ===
// Three-level nested domain warp at large scale + IQ cosine palette. Slower
// and smoother than the Plasma variant (which uses small-scale 2-level warp).
// hue_shift cycles between three palette presets so the user can sweep through
// completely different color moods with the existing Palette knob.
fn fluid_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let t = time * 0.06;
  let p = uv * 0.6;
  let q = vec2<f32>(fbm(p + vec2<f32>(0.0, 0.0)), fbm(p + vec2<f32>(3.1, 7.2)));
  let r = vec2<f32>(
    fbm(p + 2.4 * q + vec2<f32>(t,  1.7)),
    fbm(p + 2.4 * q + vec2<f32>(-t, 8.3))
  );
  let s = vec2<f32>(
    fbm(p + 3.6 * r + vec2<f32>(t * 1.3 + bass * 0.5, 5.5)),
    fbm(p + 3.6 * r + vec2<f32>(high * 0.4, t * 1.7))
  );
  let field = fbm(p + 4.5 * s + pulse * 0.6);

  let pal_a = cosine_palette(field + q.x * 0.3,
    vec3<f32>(0.5, 0.5, 0.5),
    vec3<f32>(0.5, 0.5, 0.5),
    vec3<f32>(1.0, 1.0, 1.0),
    vec3<f32>(0.00, 0.33, 0.67));
  let pal_b = cosine_palette(field + r.y * 0.4,
    vec3<f32>(0.80, 0.50, 0.40),
    vec3<f32>(0.20, 0.40, 0.20),
    vec3<f32>(2.00, 1.00, 1.00),
    vec3<f32>(0.00, 0.25, 0.25));
  let pal_c = cosine_palette(field + s.x * 0.5,
    vec3<f32>(0.50, 0.50, 0.50),
    vec3<f32>(0.50, 0.50, 0.50),
    vec3<f32>(1.00, 0.70, 0.40),
    vec3<f32>(0.00, 0.15, 0.20));
  let pick = fract(hue_shift) * 3.0;
  let raw = select(
    select(pal_b, pal_c, pick >= 2.0),
    pal_a,
    pick < 1.0,
  );

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let gray = vec3<f32>(dot(raw, vec3<f32>(0.299, 0.587, 0.114)));
  let color = mix(gray, raw, sat) * bri;

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp((0.65 + 0.35 * field) * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

// === Variant 8: Truchet Geometric ===
// Truchet arcs — each cell randomly mirrors its local space so its two arcs
// connect to one of two adjacent-corner pairs. Tiles slowly re-roll their
// orientation over time. Bauhaus / Schotter feel.
fn truchet_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let tile_size = 0.22 - bass * 0.05;
  let cell = floor(uv / tile_size);
  let local = (uv / tile_size) - cell - vec2<f32>(0.5);

  let h = hash21(cell + vec2<f32>(floor(time * 0.3) * 0.017, 0.0));
  let flip = step(0.5, h);
  let lp = vec2<f32>(local.x, mix(local.y, -local.y, flip));

  let d1 = abs(length(lp - vec2<f32>(0.5,  0.5)) - 0.5);
  let d2 = abs(length(lp - vec2<f32>(-0.5, -0.5)) - 0.5);
  let arc_d = min(d1, d2);

  let line_w = 0.04 + high * 0.08 + pulse * 0.05;
  let arc = 1.0 - smoothstep(line_w, line_w + 0.04, arc_d);

  let in_c1 = step(length(lp - vec2<f32>(0.5,  0.5)),  0.5);
  let in_c2 = step(length(lp - vec2<f32>(-0.5, -0.5)), 0.5);
  let fill_mask = max(in_c1, in_c2);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_a = (cell.x + cell.y * 1.7) * 0.13 + time * 0.04;
  let line_col = vj_palette(hue_shift, hue_a + h * 0.3, sat, bri);
  let fill_col = vj_palette(hue_shift, hue_a + 0.5 + h * 0.2, 0.5 * sat, 0.6 * bri);

  let intensity = arc + fill_mask * (0.2 + 0.15 * pulse);
  let color = mix(fill_col, line_col, arc);

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(intensity * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

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
  let drift = fbm(center * 2.2 + vec2<f32>(grain, pulse * 1.5));

  // Variant: 0=Web (kaleidoscope), 1=Spokes, 2=Rings, 3=Plasma (domain-warped FBM).
  let v = i32(round(variant));

  // Kaleidoscope-folded sampling space for Web variant. Slice count rises with bass,
  // axis rotates slowly with time + pulse — a classic VJ symmetry move.
  let kal_slices = 6.0 + floor(bass * 8.0);
  let kal_uv = select(center, kaleidoscope(center, kal_slices, time * 0.13 + pulse * 0.6), v == 0);
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

  let core = exp(-pow(radius * 2.2, 2.0)) * (0.9 + 0.1 * pulse);
  let pulse_wave = 1.0 + 0.45 * sin(time * 1.3 + ring_wave * 6.28318 + pulse * 5.0);

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
    let plasma_field = fbm(dw_p + 4.0 * dw_r + 1.5 * pulse);
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
  let base = vj_palette(hue_shift, hue_phase, 0.62 * sat, 0.82 * bri);
  let accent = vj_palette(hue_shift, hue_phase + 0.33 + 0.45 * grain, 0.74 * sat, bri);
  let fill = mix(base, accent, 0.38 + 0.35 * energy);
  let color = fill * clamp(0.32 + layer, 0.0, 1.0) + vec3<f32>(line_glow) * accent + vec3<f32>(core * 0.45);
  let alpha = clamp(
    (layer + core + pulse * 0.4 + 0.5 * line_glow) * (0.35 + 0.65 * layer) * vignette * enabled,
    0.0,
    1.0
  );

  return vec4<f32>(color * enabled, alpha);
}

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let uv = (frag.uv - vec2<f32>(0.5)) * 2.0;

  // audio_uniforms.x < 0.0 means OSC is not connected; preserve the -1.0 sentinel.
  let inactive = audio_uniforms.x < 0.0;
  let energy = select(audio_curve(audio_uniforms.x), -1.0, inactive);
  let bass   = select(audio_curve(audio_uniforms.y), 0.0, inactive);
  let mid    = select(audio_curve(audio_uniforms.z), 0.0, inactive);
  let high   = select(audio_curve(audio_uniforms.w), 0.0, inactive);
  let pulse  = select(audio_curve(palette_extra.z),  0.0, inactive);

  let time = params.y;
  let hue = params.x;
  let v = i32(round(params.z));

  if (v == 5) { return tunnel_variant(uv, time, hue, pulse, energy, bass, mid, high); }
  if (v == 6) { return glitch_variant(uv, time, hue, pulse, energy, bass, mid, high); }
  if (v == 7) { return fluid_variant(uv, time, hue, pulse, energy, bass, mid, high); }
  if (v == 8) { return truchet_variant(uv, time, hue, pulse, energy, bass, mid, high); }

  return geometry_field(uv, time, hue, params.z, pulse, energy, bass, mid, high);
}

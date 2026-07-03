#import bevy_sprite::mesh2d_vertex_output::VertexOutput

const TAU: f32 = 6.283185307179586;

@group(2) @binding(0) var<uniform> params: vec4<f32>;
// palette_extra.x = saturation (0..1), y = brightness (0..1), z = pulse (0..1)
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
// audio_uniforms.x = energy (-1.0 = inactive), y = bass, z = mid, w = high (0..1 when active)
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
// palette_rgb.xyz = color-picker duotone base (0..1 per channel)
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;

// Accent stays in the picked color's hue family: a brighter tint, not a
// channel rotation (which yields jarring opposite hues, e.g. purple from green).
fn duotone_accent(base: vec3<f32>) -> vec3<f32> {
  return clamp(base * 1.35 + vec3<f32>(0.18), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn vj_duotone(base: vec3<f32>, phase: f32, saturation: f32, value: f32) -> vec3<f32> {
  let accent = duotone_accent(base);
  let local = fract(phase) - 0.5;
  let t = abs(local) * 2.0;
  let rgb = mix(base, accent, t);
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

// Crisp concentric ring band: full strength within `half_width` of `radius`,
// then a thin `softness` edge. Keeps rings sharp instead of bleeding into glow.
fn crisp_ring(r: f32, radius: f32, half_width: f32, softness: f32) -> f32 {
  return 1.0 - smoothstep(half_width, half_width + softness, abs(r - radius));
}

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
  let band = crisp_ring(r, ring_r, 0.012 + bass * 0.012, 0.018) * broken;

  // Two concentric rings bracketing the main one (one inner, one outer). These
  // stay clean/continuous so they read as defined rings around the halo.
  let ring_gap = 0.13;
  let ring_inner = crisp_ring(r, ring_r - ring_gap, 0.008, 0.014);
  let ring_outer = crisp_ring(r, ring_r + ring_gap, 0.008, 0.014);
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
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.55 * sat, bri);
  let accent = vj_duotone(palette_rgb.xyz, hue_phase + 0.23, 0.78 * sat, bri);
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
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.85 * sat, bri);
  let accent = vj_duotone(palette_rgb.xyz, hue_phase + 0.5, sat, bri);
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
  let r_col = vj_duotone(palette_rgb.xyz, h_base - split, sat, bri).r;
  let g_col = vj_duotone(palette_rgb.xyz, h_base,         sat, bri).g;
  let b_col = vj_duotone(palette_rgb.xyz, h_base + split, sat, bri).b;

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

  let base = palette_rgb.xyz;
  let accent = duotone_accent(base);
  let raw = mix(base, accent, field);

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
  let line_col = vj_duotone(palette_rgb.xyz, hue_a + h * 0.3, sat, bri);
  let fill_col = vj_duotone(palette_rgb.xyz, hue_a + 0.5 + h * 0.2, 0.5 * sat, 0.6 * bri);

  let intensity = arc + fill_mask * (0.2 + 0.15 * pulse);
  let color = mix(fill_col, line_col, arc);

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp(intensity * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

// === Variant 10: Bass Reactor ===
// Heavy low-end blob field. `drive` keys the whole shape off the bass band but
// falls back to overall energy/pulse so it still pumps when no dedicated bass
// track is mapped — otherwise a flat bass meter leaves it looking static.
fn bass_reactor_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);

  // Combined low-end drive: bass when available, otherwise energy/pulse.
  let drive = clamp(max(bass, energy * 0.6 + pulse * 0.4), 0.0, 1.0);

  let lobes = 5.0 + floor((bass + pulse) * 6.0);
  let membrane = 0.32 + drive * 0.36 + 0.05 * sin(a * lobes + time * (0.6 + drive * 1.8));
  let band_w = 0.09 + drive * 0.22;
  let body = 1.0 - smoothstep(0.0, band_w, abs(r - membrane));
  // Core blob swells and brightens hard with the low end.
  let core = exp(-r * r * (6.5 - drive * 3.8)) * (0.18 + 1.25 * drive);
  // Beat shockwave: each pulse launches an outward ring that fades with radius.
  let shock_r = fract(time * 0.4);
  let shock = crisp_ring(r, shock_r, 0.01 + drive * 0.03, 0.045)
    * pulse * (1.0 - shock_r) * 1.6;
  let texture = fbm(p * (2.0 + mid * 3.0) + vec2<f32>(time * 0.08, -time * 0.05));

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a / TAU * 0.25 + texture * 0.3 + time * 0.02 + drive * 0.2;
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.8 * sat, bri);
  let accent = vj_duotone(palette_rgb.xyz, hue_phase + 0.22, sat, bri);
  let layer = body * (0.38 + drive * 0.95 + texture * 0.3) + core + shock;
  let color = mix(base, accent, clamp(body + shock, 0.0, 1.0))
    * clamp(layer * (0.6 + drive), 0.0, 1.7);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * enabled, 0.0, 1.0));
}

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
  let color = vj_duotone(palette_rgb.xyz, seed + time * 0.04 + sparkle * 0.12, sat, bri) * (0.45 + 1.1 * glow + sparkle * 0.35);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * glow * enabled, clamp(glow * (0.55 + sparkle), 0.0, 1.0) * enabled);
}

// === Variant 12: Kick Rings ===
// Concentric impact rings with low-end thickness and pulse-driven bloom.
fn kick_rings_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);
  let drive = clamp(max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
  let wave = fract(r * (5.0 + drive * 8.0) - time * (0.75 + drive * 1.7));
  let rings = 1.0 - smoothstep(0.0, 0.12 + drive * 0.12, abs(wave - 0.5) * 2.0);
  let burst_r = 0.12 + fract(time * 0.42) * 0.74;
  let burst = crisp_ring(r, burst_r, 0.018 + drive * 0.04, 0.04) * pulse * (1.0 - burst_r);
  let spokes = 1.0 - smoothstep(0.0, 0.08 + high * 0.08, abs(fract(a / TAU * (10.0 + floor(mid * 14.0))) - 0.5) * 2.0);
  let layer = rings * (0.35 + 0.95 * drive) + burst * (1.0 + pulse) + spokes * drive * 0.35;
  let vignette = 1.0 - smoothstep(0.72, 1.35, r);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let color = vj_duotone(
    palette_rgb.xyz,
    hue_shift * 0.3 + r * 0.42 + time * 0.03 + drive * 0.18,
    sat,
    bri,
  ) * clamp(layer * (0.75 + drive), 0.0, 1.7);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * vignette * enabled, clamp(layer * vignette * enabled, 0.0, 1.0));
}

// === Variant 13: Laser Lattice ===
// Perspective laser plane; bass pushes depth, highs sharpen the beams.
fn laser_lattice_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let drive = clamp(max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
  let sharpen = clamp(max(high, energy * 0.35 + pulse * 0.65), 0.0, 1.0);
  let y = uv.y + 0.72;
  let persp = 1.0 / max(y + 1.05, 0.18);
  let p = vec2<f32>(uv.x * persp * (1.0 + drive), y * persp + time * (0.6 + drive * 1.5));
  let grid_x = abs(fract(p.x * (5.0 + mid * 9.0)) - 0.5) * 2.0;
  let grid_y = abs(fract(p.y * (4.0 + drive * 7.0)) - 0.5) * 2.0;
  let line_w = 0.028 + sharpen * 0.09 + pulse * 0.035;
  let beams = max(1.0 - smoothstep(0.0, line_w, grid_x), 1.0 - smoothstep(0.0, line_w, grid_y));
  let horizon = exp(-abs(uv.y + 0.34) * (7.0 - drive * 2.0));
  let sweep = 1.0 - smoothstep(0.0, 0.05 + sharpen * 0.04, abs(fract((uv.x + time * (0.2 + pulse * 0.25)) * 2.0) - 0.5) * 2.0);
  let layer = beams * (0.45 + 0.85 * drive) + horizon * (0.25 + pulse * 0.7) + sweep * sharpen * 0.5;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vj_duotone(palette_rgb.xyz, p.y * 0.08 + time * 0.03 + drive * 0.18, sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * enabled, 0.0, 1.0));
}

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
  let color = vj_duotone(palette_rgb.xyz, seed + dot(local, axis) * 0.5 + drive * 0.16, sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * layer * enabled, clamp(layer * enabled, 0.0, 1.0));
}

// === Variant 15: Vortex Bloom ===
// Spiral bloom field: bass controls swirl speed, mid controls arm count.
fn vortex_bloom_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);
  let drive = clamp(max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
  let arm_drive = clamp(max(mid, energy * 0.4 + pulse * 0.35), 0.0, 1.0);
  let arms = 3.0 + floor(arm_drive * 8.0);
  let swirl = a * arms + log(r + 0.08) * (5.5 + drive * 7.0) - time * (0.9 + drive * 2.4);
  let spiral = 1.0 - smoothstep(0.0, 0.22 + max(high, drive * 0.55) * 0.12, abs(fract(swirl / TAU) - 0.5) * 2.0);
  let bloom = exp(-r * (1.7 - drive * 0.65)) * (0.2 + 0.9 * drive);
  let core = exp(-r * r * (9.0 - pulse * 3.0 - drive * 1.8)) * (0.25 + pulse * 0.8 + drive * 0.45);
  let dust = fbm(p * (2.0 + high * 5.0) + vec2<f32>(time * 0.04, -time * 0.03));
  let layer = spiral * bloom * (0.7 + 0.3 * dust) + core;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let color = vj_duotone(palette_rgb.xyz, a / TAU * 0.35 + r * 0.3 + time * 0.025 + dust * 0.18 + drive * 0.2, 0.85 * sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * layer * enabled, clamp(layer * enabled, 0.0, 1.0));
}

// === Variant 16: Crystal Core ===
// Faceted radial crystals. Highs carve more facets and sharpen rims; bass
// swells the core and drives rotation speed. Fully audio-reactive.
fn crystal_core_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let a = atan2(p.y, p.x);
  let drive = clamp(max(bass, energy * 0.5 + pulse * 0.5), 0.0, 1.0);
  let facets = 6.0 + floor(high * 18.0);
  let fa = abs(fract(a / TAU * facets + time * (0.3 + drive * 0.6)) - 0.5) * 2.0;
  let crystal = 1.0 - smoothstep(0.0, 0.06 + high * 0.05, fa);
  let ring = crisp_ring(r, 0.38 + drive * 0.18 + sin(time * 0.7) * 0.02, 0.03 + drive * 0.02, 0.03);
  let core = exp(-r * r * (7.0 - drive * 4.0)) * (0.3 + 1.1 * drive);
  let layer = crystal * (0.45 + high * 0.7) + ring * (0.6 + drive) + core;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a / TAU * 0.2 + r * 0.6 + time * 0.02 + drive * 0.15;
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.9 * sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * enabled, 0.0, 1.0));
}

// === Variant 17: Bass Portal ===
// Receding ring throat. Bass accelerates depth travel and widens the maw;
// highs etch sharp spokes; pulse throws impact rings. Heavy audio drive.
fn bass_portal_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let r = max(length(uv), 0.001);
  let a = atan2(uv.y, uv.x);
  let depth = 1.0 / r + time * (0.9 + bass * 2.2);
  let band = abs(fract(depth * (1.8 + bass * 1.6)) - 0.5) * 2.0;
  let portal = 1.0 - smoothstep(0.0, 0.16 + bass * 0.1, band);
  let spokes = 1.0 - smoothstep(0.0, 0.04 + high * 0.06, abs(fract(a / TAU * (8.0 + high * 20.0) + time * 0.5) - 0.5) * 2.0);
  let pulse_ring = crisp_ring(r, fract(time * (1.2 + bass * 1.8)) * 0.9 + 0.08, 0.015 + pulse * 0.025, 0.02) * pulse;
  let layer = portal * (0.55 + bass * 0.9) + spokes * (0.35 + high * 0.5) + pulse_ring * 1.6;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = depth * 0.04 + a * 0.3 + time * 0.03;
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.8 * sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * enabled * (1.0 - r * 0.3), 0.0, 1.0));
}

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
  let ripple = crisp_ring(r, fract(time * (1.6 + high * 2.2)) * 0.9 + 0.12, 0.008 + high * 0.012, 0.03);
  let ripple2 = crisp_ring(r, fract(time * (2.3 + mid * 1.1) + 1.7) * 0.7 + 0.3, 0.006, 0.02);
  let caustic = (ripple + ripple2 * 0.6) * (0.3 + high * 0.7);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a * 0.06 + r * 0.2 + time * 0.015 + h * 3.2;
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.7 * sat, bri);
  let metal = mix(base, vec3<f32>(1.0), clamp(spec * (0.6 + pulse * 0.5) + caustic * 0.5, 0.0, 0.9));
  let layer = (0.35 + 0.9 * (spec + caustic * 0.7)) * (0.6 + bass * 0.3);

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(metal * layer * enabled, clamp((layer * 0.9 + spec * 0.6) * enabled, 0.0, 1.0));
}

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
  let h0 = vj_duotone(palette_rgb.xyz, film * 0.6 + time * 0.01, sat, bri);
  let h1 = vj_duotone(palette_rgb.xyz, film * 0.6 + 0.22, sat * 0.95, bri);
  let h2 = vj_duotone(palette_rgb.xyz, film * 0.6 + 0.46, sat, bri * 0.95);
  let irid = mix(mix(h0, h1, film), h2, clamp(folds * 0.5 + 0.5, 0.0, 1.0));

  let veil = (0.45 + 0.55 * film) * (0.5 + 0.5 * rim) + pulse * 0.25;
  let layer = veil * (0.7 + bass * 0.3) + folds * high * 0.2;

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(irid * layer * enabled, clamp(layer * 0.85 * enabled, 0.0, 1.0));
}

// === Variant 20: Starweb ===
// Sparse bright points that connect into a dynamic constellation. Mids add links;
// highs twinkle; bass gently warps the field.
fn starweb_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y) * 1.6;
  let t = time * 0.2;

  let grid = floor(p * 1.8 + vec2<f32>(t * 0.3, -t * 0.2));
  let local = fract(p * 1.8 + vec2<f32>(t * 0.3, -t * 0.2)) - 0.5;

  // Each cell has a star if seed high enough; audio biases probability
  let seed = hash21(grid);
  let alive = step(0.72 - mid * 0.25 - energy * 0.1, seed);
  let tw = sin(time * (3.0 + seed * 7.0) + seed * 19.0) * 0.5 + 0.5;
  let star = (1.0 - smoothstep(0.02 + high * 0.02, 0.09 + pulse * 0.05, length(local))) * alive * (0.6 + 0.8 * tw);

  // Connect to neighbors with faint lines when both alive
  var links = 0.0;
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      if (dx == 0 && dy == 0) { continue; }
      let ncell = grid + vec2<f32>(f32(dx), f32(dy));
      let nseed = hash21(ncell);
      let nlive = step(0.72 - mid * 0.25 - energy * 0.1, nseed);
      let npos = (fract(p * 1.8 + vec2<f32>(t * 0.3, -t * 0.2) + vec2<f32>(f32(dx), f32(dy))) - 0.5);
      let d = distance(local, npos);
      let w = (1.0 - smoothstep(0.6, 1.4, d)) * alive * nlive * (0.25 + mid * 0.5);
      links += w;
    }
  }

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue = hash21(grid) + time * 0.02 + bass * 0.1;
  let col = vj_duotone(palette_rgb.xyz, hue, sat, bri);
  let layer = star * (1.0 + pulse) + links * 0.6;

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(col * layer * enabled, clamp(layer * 0.85 * enabled, 0.0, 1.0));
}

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
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.85 * sat, bri);
  let layer = field * 0.9 + ring * (0.6 + bass * 0.6) + spokes * (0.35 + high * 0.5);

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * 0.75 * enabled, 0.0, 1.0));
}

// === Variant 22: Inkbloom ===
// Turbulent ink in water. Bass stirs the pot; mids create rising plumes;
// highs add fine sediment. Soft, organic, and moody.
fn inkbloom_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let t = time * 0.35;

  // Large scale flow
  let flow = vec2<f32>(
    fbm(p * 0.7 + vec2<f32>(t * 0.4, 0.0)) - 0.5,
    fbm(p * 0.7 + vec2<f32>(0.0, t * 0.33)) - 0.5
  ) * (0.6 + bass * 1.0);

  // Mid-frequency plumes
  let plume = fbm(p * 2.4 + flow * 1.5 + vec2<f32>(t * 0.6, -t * 0.5) + mid * 0.8);

  // Fine sediment
  let sediment = fbm(p * 7.0 + flow * 3.0 + vec2<f32>(-t * 1.1, t * 0.8)) * (0.4 + high * 0.9);

  let density = clamp(plume * 1.1 + sediment * 0.6 - r * 0.3, 0.0, 1.6);
  let edge = 1.0 - smoothstep(0.6, 1.1, density);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = density * 0.8 + time * 0.02 + flow.x * 0.5;
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.9 * sat, bri);
  let color = mix(base * 0.2, base, edge);

  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp((0.55 + 0.45 * density) * (0.6 + bass * 0.3) * enabled, 0.0, 1.0);
  return vec4<f32>(color * enabled, alpha);
}

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
  let r = vj_duotone(palette_rgb.xyz, p.x * 0.1 + y * 0.6 + time * 0.02 - split, palette_extra.x, palette_extra.y).r;
  let g = vj_duotone(palette_rgb.xyz, p.x * 0.1 + y * 0.6 + time * 0.02, palette_extra.x, palette_extra.y).g;
  let b = vj_duotone(palette_rgb.xyz, p.x * 0.1 + y * 0.6 + time * 0.02 + split, palette_extra.x, palette_extra.y).b;

  let glitch = step(0.82 - high * 0.35, hash21(floor(vec2<f32>(p.x * 9.0, y * 11.0) + floor(time * 7.0) * 0.07)));
  let tear = (1.0 - smoothstep(0.0, 0.03, abs(y + 0.1 - fract(time * 1.7) * 2.2))) * glitch * high;

  let col = vec3<f32>(r, g, b) * scan * band + vec3<f32>(tear * 0.8);
  let enabled = select(1.0, 0.0, energy < 0.0);
  let alpha = clamp((0.55 + 0.45 * scan) * enabled, 0.0, 1.0);
  return vec4<f32>(col * enabled, alpha);
}

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
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.85 * sat, bri);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp((0.4 + 0.6 * layer) * enabled, 0.0, 1.0));
}

// === Variant 25: Polaris Petals ===
// Radial petals that open/close with bass, shear with mids, and shatter on pulse.
// Center corona reacts to highs.
fn polaris_petals_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);

  let petals = 5.0 + floor(mid * 7.0);
  let open = 0.6 + bass * 0.9 + pulse * 0.3;
  let lobe = pow(abs(cos(a * petals + time * (0.6 + bass * 0.8))), 1.6 / open);
  let petal = 1.0 - smoothstep(0.35, 0.95 + high * 0.2, r / (0.55 + lobe * 0.45));

  // Shear / twist
  let twist = sin(a * 2.0 + time * 1.1) * (0.2 + mid * 0.5);
  let shear = 1.0 - smoothstep(0.0, 0.08 + high * 0.06, abs(fract((a + twist) / TAU * (petals * 2.0)) - 0.5) * 2.0);

  // Shatter on pulse
  let crack = step(0.6 - pulse * 0.7, hash21(floor(vec2<f32>(a * 9.0, r * 11.0) + floor(time * 4.0))));
  let burst = crisp_ring(r, fract(time * 1.8) * 0.9 + 0.05, 0.01 + pulse * 0.04, 0.05) * pulse * 1.8;

  let corona = exp(-r * (4.0 - high * 2.0)) * (0.4 + high * 0.8);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = a * 0.08 + time * 0.025 + r * 0.5;
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.9 * sat, bri);
  let layer = petal * 0.9 + shear * 0.5 + corona + burst + crack * pulse * 0.6;
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(base * layer * enabled, clamp(layer * 0.7 * enabled, 0.0, 1.0));
}

// === Variant 26: Aurora Curtains ===
// Vertical spectral ribbons with smooth mid/high movement and soft bass billow.
fn aurora_curtains_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let flow = fbm(p * 0.72 + vec2<f32>(time * 0.035, -time * 0.028));
  let fold = sin(p.y * (2.2 + mid * 2.6) + time * (0.32 + high * 0.55) + flow * 2.8)
    * (0.18 + bass * 0.16 + mid * 0.08);
  let sheet_phase = (p.x + fold + flow * 0.24) * (2.7 + mid * 2.8);
  let sheets = pow(0.5 + 0.5 * cos(sheet_phase * TAU), 2.2 + high * 1.6);
  let lower_glow = smoothstep(-1.1, -0.15, p.y) * (1.0 - smoothstep(0.35, 1.25, p.y));
  let edge_light = 1.0 - smoothstep(0.0, 0.22 + high * 0.08, abs(fract(sheet_phase + 0.18 * flow) - 0.5) * 2.0);
  let silk = fbm(vec2<f32>(sheet_phase * 0.35, p.y * 1.8 - time * 0.05));
  let layer = (sheets * (0.42 + energy * 0.5) + edge_light * high * 0.18 + silk * 0.16) *
    lower_glow * (0.7 + pulse * 0.25);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vj_duotone(palette_rgb.xyz, hue_shift * 0.18 + sheet_phase * 0.08 + flow * 0.48 + time * 0.012, 0.74 * sat, bri);
  let accent = vj_duotone(palette_rgb.xyz, hue_shift * 0.18 + p.y * 0.16 + flow * 0.62 + 0.24, sat, bri);
  let color = mix(base * 0.55, accent, clamp(sheets + edge_light * 0.25, 0.0, 1.0)) *
    clamp(0.42 + layer * 1.35, 0.0, 1.58);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.82 * enabled, 0.0, 1.0));
}

// === Variant 27: Bass Monolith ===
// Heavy central slabs with low-end bloom, pressure waves, and blocky strata.
fn bass_monolith_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = length(p);
  let drive = clamp(max(bass, energy * 0.55 + pulse * 0.45), 0.0, 1.0);
  let wobble = fbm(vec2<f32>(p.y * 0.8, time * 0.08)) * (0.08 + drive * 0.14);
  let center_width = 0.22 + drive * 0.16 + wobble;
  let core_slab = 1.0 - smoothstep(center_width, center_width + 0.055 + high * 0.04, abs(p.x));
  let side_dist = abs(abs(p.x) - (0.42 + drive * 0.14));
  let side_slab = 1.0 - smoothstep(0.06 + drive * 0.03, 0.16 + high * 0.05, side_dist);
  let strata_wave = abs(fract((p.y + time * (0.18 + drive * 0.42)) * (4.0 + drive * 9.0)) - 0.5) * 2.0;
  let strata = 1.0 - smoothstep(0.0, 0.16 + drive * 0.1, strata_wave);
  let impact = crisp_ring(r, fract(time * (0.75 + drive * 1.55)) * 0.92 + 0.04, 0.018 + drive * 0.035, 0.045) * pulse * 1.65;
  let glow = exp(-r * (2.1 - drive * 0.9)) * (0.18 + drive * 0.72);
  let layer = core_slab * (0.78 + drive * 1.1) + side_slab * (0.35 + drive * 0.55) + strata * core_slab * 0.42 + impact + glow;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vj_duotone(palette_rgb.xyz, hue_shift * 0.12 + p.y * 0.17 + drive * 0.18, 0.78 * sat, bri);
  let edge = vj_duotone(palette_rgb.xyz, hue_shift * 0.12 + r * 0.42 + 0.25 + high * 0.1, sat, bri);
  let color = mix(base * 0.55, edge, clamp(strata + side_slab + impact, 0.0, 1.0)) * clamp(layer, 0.0, 1.85);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.68 * enabled, 0.0, 1.0));
}

// === Variant 28: Prism Tunnel ===
// Kaleidoscopic tunnel with faceted spokes and crossfade-friendly forward motion.
fn prism_tunnel_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p0 = vec2<f32>(uv.x * aspect, uv.y);
  let slices = 5.0 + floor(mid * 9.0);
  let p = kaleidoscope(p0, slices, time * (0.08 + bass * 0.12));
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);
  let depth = 1.0 / r + time * (0.55 + bass * 1.15);
  let facet = 1.0 - smoothstep(0.0, 0.08 + high * 0.05, abs(fract(a / TAU * slices + depth * 0.16) - 0.5) * 2.0);
  let rings = 1.0 - smoothstep(0.0, 0.17 + bass * 0.08, abs(fract(depth * (1.45 + mid * 0.8)) - 0.5) * 2.0);
  let prism = 1.0 - smoothstep(0.0, 0.12 + high * 0.07, abs(fract((p.x - p.y) * (4.0 + high * 8.0) + time * 0.16) - 0.5) * 2.0);
  let core = exp(-r * (1.25 - bass * 0.35)) * (0.22 + pulse * 0.55 + energy * 0.25);
  let layer = max(facet * 0.85, rings) * (0.65 + bass * 0.75) + prism * high * 0.42 + core;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vj_duotone(palette_rgb.xyz, hue_shift * 0.16 + depth * 0.045 + a * 0.18, 0.88 * sat, bri);
  let accent = vj_duotone(palette_rgb.xyz, hue_shift * 0.16 + depth * 0.055 + 0.33 + high * 0.12, sat, bri);
  let color = mix(base, accent, clamp(prism + facet * 0.45, 0.0, 1.0)) * clamp(layer * (0.75 + energy * 0.35), 0.0, 1.8);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * (1.0 - r * 0.22) * enabled, 0.0, 1.0));
}

// === Variant 29: Data Rain ===
// Falling scan-glyph cells with high-frequency sparkle and bass-driven speed.
fn data_rain_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect * 0.72 + 0.5, uv.y * 0.5 + 0.5);
  let columns = 24.0 + floor(high * 22.0);
  let rows = 30.0 + floor(mid * 18.0);
  let column = floor(p.x * columns);
  let column_seed = hash21(vec2<f32>(column, 3.7));
  let speed = 0.8 + bass * 3.8 + column_seed * 1.4;
  let fall = time * speed + column_seed * rows;
  let grid = vec2<f32>(p.x * columns, p.y * rows + fall);
  let cell = floor(grid);
  let local = fract(grid) - vec2<f32>(0.5);
  let seed = hash21(cell + vec2<f32>(0.0, floor(time * 0.75)));
  let live = step(0.57 - energy * 0.18 - high * 0.2, seed);
  let head_pos = fract(p.y * 0.18 + time * (0.18 + bass * 0.42) + column_seed);
  let row_phase = fract(grid.y / rows);
  let head_band = 1.0 - smoothstep(0.0, 0.065 + pulse * 0.035, abs(row_phase - head_pos));
  let trail = exp(-fract(row_phase - head_pos + 1.0) * (5.0 - bass * 1.8)) * (0.3 + energy * 0.45);
  let box_mask = (1.0 - smoothstep(0.34, 0.47, abs(local.x))) *
    (1.0 - smoothstep(0.34, 0.47, abs(local.y)));
  let vertical = (1.0 - smoothstep(0.04, 0.09 + high * 0.03, abs(local.x))) *
    (1.0 - smoothstep(0.12, 0.44, abs(local.y)));
  let horizontal = (1.0 - smoothstep(0.04, 0.09 + high * 0.03, abs(local.y - (seed - 0.5) * 0.36))) *
    (1.0 - smoothstep(0.1, 0.4, abs(local.x)));
  let corner = step(0.86 - high * 0.18, seed) *
    (1.0 - smoothstep(0.08, 0.22, length(abs(local) - vec2<f32>(0.32))));
  let glyph = box_mask * (vertical * 0.5 + horizontal * 0.55 + corner * 0.45);
  let sparkle = step(0.96 - high * 0.24 - pulse * 0.16, hash21(cell + vec2<f32>(floor(time * 12.0) * 0.07, 4.2)));
  let scanline = 0.76 + 0.24 * step(0.5, fract((p.y + time * 0.05) * 90.0));
  let layer = live * glyph * (trail + head_band * (0.95 + pulse * 0.7)) * scanline + sparkle * (0.65 + pulse);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vj_duotone(palette_rgb.xyz, hue_shift * 0.14 + column_seed * 0.22 + p.y * 0.18, 0.78 * sat, bri);
  let hot = vj_duotone(palette_rgb.xyz, hue_shift * 0.14 + seed * 0.34 + 0.31, sat, bri);
  let color = mix(base * 0.32, hot, clamp(head_band + sparkle, 0.0, 1.0)) *
    clamp(layer * 1.35, 0.0, 1.85);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.8 * enabled, 0.0, 1.0));
}

// === Variant 30: Solar Flare ===
// Radial arcs, coronal rays, and pulse bloom for drops and big transitions.
fn solar_flare_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);
  let drive = clamp(max(pulse, energy * 0.45 + bass * 0.45), 0.0, 1.0);
  let arms = 4.0 + floor(mid * 8.0);
  let arc_phase = a / TAU * arms + r * (2.2 + bass * 2.8) - time * (0.22 + drive * 0.75);
  let arcs = 1.0 - smoothstep(0.0, 0.12 + high * 0.06, abs(fract(arc_phase) - 0.5) * 2.0);
  let rays = pow(0.5 + 0.5 * cos(a * (10.0 + high * 18.0) + time * (0.8 + bass * 1.5)), 4.0 - high * 1.6);
  let corona = exp(-r * (1.9 - drive * 0.7)) * (0.28 + drive * 1.05);
  let bloom = crisp_ring(r, fract(time * (0.55 + drive * 1.1)) * 0.75 + 0.1, 0.022 + pulse * 0.045, 0.055) * pulse * 1.9;
  let granules = fbm(p * (4.0 + high * 5.0) + vec2<f32>(time * 0.12, -time * 0.08));
  let layer = corona + arcs * (0.5 + drive * 0.8) + rays * (0.22 + high * 0.55) + bloom + granules * drive * 0.18;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let core = vj_duotone(palette_rgb.xyz, hue_shift * 0.2 + r * 0.35 + time * 0.02, 0.82 * sat, bri);
  let hot = clamp(core * 1.35 + vec3<f32>(0.22, 0.18, 0.1), vec3<f32>(0.0), vec3<f32>(1.0));
  let color = mix(core, hot, clamp(corona + bloom, 0.0, 1.0)) * clamp(layer, 0.0, 1.95);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * (1.0 - smoothstep(0.95, 1.45, r)) * enabled, 0.0, 1.0));
}

// === Variant 31: Topo Lines ===
// Oblique contour-map bands over a terrain field; no central organic symmetry.
fn topo_lines_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let q = vec2<f32>(p.x * 1.12 + p.y * 0.28, p.y * 0.92 - p.x * 0.18);
  let drift = vec2<f32>(time * 0.032 + bass * 0.12, -time * 0.026 + mid * 0.08);
  let large = fbm(q * (1.18 + mid * 0.35) + drift);
  let detail = fbm(q * (3.4 + high * 1.7) - drift * 1.6) * (0.22 + high * 0.16);
  let slope = q.x * (0.18 + bass * 0.08) - q.y * 0.11;
  let terrace = sin((q.x * 2.7 + q.y * 1.4) + time * (0.14 + mid * 0.22)) * 0.055;
  let elevation = large * 0.78 + detail + slope + terrace + pulse * 0.045;
  let bands = 11.0 + floor(mid * 16.0);
  let contour_wave = abs(fract(elevation * bands + time * (0.018 + bass * 0.035)) - 0.5) * 2.0;
  let contour = 1.0 - smoothstep(0.0, 0.055 + high * 0.045, contour_wave);
  let major_wave = abs(fract(elevation * (bands * 0.25)) - 0.5) * 2.0;
  let major = 1.0 - smoothstep(0.0, 0.045 + pulse * 0.055, major_wave);
  let grid_x = 1.0 - smoothstep(0.0, 0.012, abs(fract((q.x + 1.2) * 4.0) - 0.5) * 2.0);
  let grid_y = 1.0 - smoothstep(0.0, 0.012, abs(fract((q.y + 1.0) * 3.5) - 0.5) * 2.0);
  let tick_cells = floor(q * vec2<f32>(5.0, 4.0));
  let tick_seed = hash21(tick_cells);
  let tick_local = fract(q * vec2<f32>(5.0, 4.0)) - vec2<f32>(0.5);
  let tick = step(0.82 - high * 0.12, tick_seed) *
    (1.0 - smoothstep(0.0, 0.025 + pulse * 0.015, abs(tick_local.y))) *
    (1.0 - smoothstep(0.18, 0.42, abs(tick_local.x)));
  let fill = smoothstep(0.18, 1.12, elevation) * 0.22;
  let layer = fill + contour * (0.58 + high * 0.42) + major * (0.55 + pulse * 0.5) +
    (grid_x + grid_y) * 0.08 * energy + tick * 0.35;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vj_duotone(palette_rgb.xyz, hue_shift * 0.12 + elevation * 0.28 + time * 0.008, 0.6 * sat, 0.72 * bri);
  let line = vj_duotone(palette_rgb.xyz, hue_shift * 0.12 + elevation * 0.42 + 0.22, sat, bri);
  let map_fill = mix(base * 0.32, base, smoothstep(0.08, 0.9, elevation));
  let color = mix(map_fill, line, clamp(contour + major + tick, 0.0, 1.0)) *
    clamp(0.48 + layer, 0.0, 1.58);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.78 * enabled, 0.0, 1.0));
}

// === Variant 32: Glass Ribbons ===
// Flowing translucent ribbons with moire interference and glossy high glints.
fn glass_ribbons_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 0.1);
  let p = vec2<f32>(uv.x * aspect, uv.y);
  let warp = fbm(p * 1.35 + vec2<f32>(time * 0.055, -time * 0.04));
  let wave_a = sin(p.y * (2.4 + mid * 4.5) + time * (0.5 + bass * 0.8) + warp * 2.6) * (0.24 + bass * 0.12);
  let wave_b = cos((p.y + p.x * 0.35) * (3.4 + high * 5.0) - time * (0.4 + mid * 0.7) + warp * 1.8) * (0.18 + mid * 0.1);
  let width = 0.08 + bass * 0.055 + pulse * 0.035;
  let ribbon_a = 1.0 - smoothstep(0.0, width, abs(p.x - wave_a));
  let ribbon_b = 1.0 - smoothstep(0.0, width * 0.85, abs(p.x + wave_b));
  let moire = 1.0 - smoothstep(0.0, 0.13 + high * 0.06, abs(fract((p.x + p.y + warp * 0.35) * (9.0 + mid * 8.0) + time * 0.1) - 0.5) * 2.0);
  let glint = pow(max(0.0, 1.0 - abs(p.x - wave_a) / max(width, 0.001)), 3.0 + high * 4.0) * (0.35 + high * 1.1);
  let depth = exp(-abs(p.y) * 0.45) * (0.18 + energy * 0.35);
  let layer = ribbon_a * (0.55 + glint) + ribbon_b * (0.42 + mid * 0.45) + moire * (ribbon_a + ribbon_b) * 0.24 + depth;

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let base = vj_duotone(palette_rgb.xyz, hue_shift * 0.15 + warp * 0.5 + p.y * 0.12 + time * 0.015, 0.68 * sat, bri);
  let highlight = clamp(vj_duotone(palette_rgb.xyz, hue_shift * 0.15 + warp * 0.5 + 0.28, sat, bri) * 1.28 + vec3<f32>(0.12), vec3<f32>(0.0), vec3<f32>(1.0));
  let color = mix(base, highlight, clamp(glint + moire * 0.3, 0.0, 1.0)) * clamp(layer, 0.0, 1.75);
  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, clamp(layer * 0.72 * enabled, 0.0, 1.0));
}

fn bear_rot_y(p: vec3<f32>, a: f32) -> vec3<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec3<f32>(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

fn bear_smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn bear_ellipsoid(p: vec3<f32>, center: vec3<f32>, radius: vec3<f32>) -> f32 {
  let q = (p - center) / radius;
  return (length(q) - 1.0) * min(radius.x, min(radius.y, radius.z));
}

fn bear_model_sdf(p: vec3<f32>) -> f32 {
  var d = bear_ellipsoid(p, vec3<f32>(0.0, -0.26, 0.0), vec3<f32>(0.48, 0.68, 0.34));
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.0, 0.55, 0.0), vec3<f32>(0.37, 0.34, 0.31)), 0.18);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.26, 0.86, 0.0), vec3<f32>(0.17, 0.17, 0.14)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.26, 0.86, 0.0), vec3<f32>(0.17, 0.17, 0.14)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.0, 0.47, 0.28), vec3<f32>(0.18, 0.12, 0.14)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.0, -0.22, 0.25), vec3<f32>(0.34, 0.45, 0.13)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.46, -0.13, 0.03), vec3<f32>(0.15, 0.42, 0.16)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.46, -0.13, 0.03), vec3<f32>(0.15, 0.42, 0.16)), 0.12);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.50, -0.46, 0.12), vec3<f32>(0.15, 0.13, 0.15)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.50, -0.46, 0.12), vec3<f32>(0.15, 0.13, 0.15)), 0.08);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.22, -0.83, 0.02), vec3<f32>(0.19, 0.30, 0.18)), 0.13);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.22, -0.83, 0.02), vec3<f32>(0.19, 0.30, 0.18)), 0.13);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(-0.22, -1.05, 0.18), vec3<f32>(0.24, 0.13, 0.20)), 0.10);
  d = bear_smin(d, bear_ellipsoid(p, vec3<f32>(0.22, -1.05, 0.18), vec3<f32>(0.24, 0.13, 0.20)), 0.10);
  return d;
}

fn bear_normal(p: vec3<f32>) -> vec3<f32> {
  let e = 0.003;
  return normalize(vec3<f32>(
    bear_model_sdf(p + vec3<f32>(e, 0.0, 0.0)) - bear_model_sdf(p - vec3<f32>(e, 0.0, 0.0)),
    bear_model_sdf(p + vec3<f32>(0.0, e, 0.0)) - bear_model_sdf(p - vec3<f32>(0.0, e, 0.0)),
    bear_model_sdf(p + vec3<f32>(0.0, 0.0, e)) - bear_model_sdf(p - vec3<f32>(0.0, 0.0, e))
  ));
}

fn bear_line_distance(x: f32) -> f32 {
  let f = fract(x);
  return min(f, 1.0 - f);
}

fn bear_tri_wire_2d(uv: vec2<f32>, freq: f32, thickness: f32, softness: f32) -> f32 {
  let s = vec3<f32>(
    uv.x,
    uv.x * 0.5 + uv.y * 0.8660254,
    -uv.x * 0.5 + uv.y * 0.8660254
  ) * freq;
  let d = min(
    bear_line_distance(s.x),
    min(bear_line_distance(s.y), bear_line_distance(s.z))
  );
  return 1.0 - smoothstep(thickness, thickness + softness, d);
}

fn bear_surface_mesh(p: vec3<f32>, n: vec3<f32>, pulse: f32, high: f32) -> f32 {
  let freq = 13.0 + floor(high * 9.0);
  let thin = 0.018 + pulse * 0.004;
  let soft = 0.018;
  let weights_raw = pow(abs(n) + vec3<f32>(0.025), vec3<f32>(3.0));
  let weights = weights_raw / max(dot(weights_raw, vec3<f32>(1.0)), 0.001);

  let xy = bear_tri_wire_2d(p.xy + vec2<f32>(0.03 * sin(p.z * 2.1), 0.0), freq, thin, soft);
  let yz = bear_tri_wire_2d(p.yz + vec2<f32>(0.0, 0.025 * sin(p.x * 2.6)), freq * 0.95, thin, soft);
  let xz = bear_tri_wire_2d(p.xz + vec2<f32>(0.02 * sin(p.y * 2.9), 0.0), freq * 1.05, thin, soft);
  let fine = clamp(xy * weights.z + yz * weights.x + xz * weights.y, 0.0, 1.0);

  let major_xy = bear_tri_wire_2d(p.xy, freq * 0.34, 0.015, 0.012);
  let major_yz = bear_tri_wire_2d(p.yz, freq * 0.32, 0.015, 0.012);
  let major_xz = bear_tri_wire_2d(p.xz, freq * 0.36, 0.015, 0.012);
  let major = clamp(major_xy * weights.z + major_yz * weights.x + major_xz * weights.y, 0.0, 1.0);

  let silhouette = pow(1.0 - clamp(abs(dot(n, normalize(-p + vec3<f32>(0.0, 0.0, 3.0)))), 0.0, 1.0), 4.0);
  return clamp(fine * 0.95 + major * 0.28 + silhouette * 0.35, 0.0, 1.0);
}

// === Variant 33: Gummy Wire Bear ===
// Full-body 3D gummy-bear SDF with translucent gel shading and wrapped wireframe.
fn gummy_wire_bear_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 1.0);
  let wobble = sin(time * 1.15 + bass * 2.4) * 0.025;
  let spin = sin(time * 0.24) * 0.42 + (bass - 0.5) * 0.16;
  let ro_world = vec3<f32>(0.0, -0.04 + wobble, 3.45);
  let rd_world = normalize(vec3<f32>(uv.x * aspect * 1.02, -uv.y * 1.08 + 0.02, -2.52));
  let ro = bear_rot_y(ro_world, -spin);
  let rd = bear_rot_y(rd_world, -spin);

  var t = 0.0;
  var hit = false;
  var p = ro;
  for (var i = 0; i < 72; i = i + 1) {
    p = ro + rd * t;
    let d = bear_model_sdf(p);
    if (d < 0.0035) {
      hit = true;
      break;
    }
    t = t + max(d * 0.72, 0.006);
    if (t > 6.0) {
      break;
    }
  }

  let floor_shadow = exp(-pow((uv.x * aspect) / 0.72, 2.0) - pow((uv.y + 0.78) / 0.16, 2.0)) * (0.16 + bass * 0.18);
  if (!hit) {
    let bg_line = 1.0 - smoothstep(0.0, 0.018, abs(fract((uv.y + time * 0.04) * 10.0) - 0.5) * 2.0);
    let bg = vj_duotone(palette_rgb.xyz, hue_shift * 0.16 + uv.y * 0.12, 0.45 * palette_extra.x, 0.35 * palette_extra.y);
    let enabled = select(1.0, 0.0, energy < 0.0);
    return vec4<f32>(bg * (floor_shadow + bg_line * 0.03) * enabled, enabled);
  }

  let n = bear_normal(p);
  let view = normalize(-rd);
  let light = normalize(vec3<f32>(-0.42, 0.72, 0.68));
  let half_v = normalize(light + view);
  let diff = max(dot(n, light), 0.0);
  let spec = pow(max(dot(n, half_v), 0.0), 44.0 + high * 38.0);
  let fresnel = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.7);
  let wire = bear_surface_mesh(p, n, pulse, high);

  let front = smoothstep(0.08, 0.28, p.z);
  let eye_l = exp(-dot((p.xy - vec2<f32>(-0.115, 0.61)) * vec2<f32>(14.0, 18.0), (p.xy - vec2<f32>(-0.115, 0.61)) * vec2<f32>(14.0, 18.0))) * front;
  let eye_r = exp(-dot((p.xy - vec2<f32>(0.115, 0.61)) * vec2<f32>(14.0, 18.0), (p.xy - vec2<f32>(0.115, 0.61)) * vec2<f32>(14.0, 18.0))) * front;
  let nose = exp(-dot((p.xy - vec2<f32>(0.0, 0.49)) * vec2<f32>(12.0, 20.0), (p.xy - vec2<f32>(0.0, 0.49)) * vec2<f32>(12.0, 20.0))) * smoothstep(0.18, 0.33, p.z);
  let mouth_curve = abs(length((p.xy - vec2<f32>(0.0, 0.42)) * vec2<f32>(2.2, 4.0)) - 0.18);
  let mouth = (1.0 - smoothstep(0.015, 0.035, mouth_curve)) * smoothstep(-0.02, 0.09, p.y - 0.34) * smoothstep(0.18, 0.33, p.z);
  let belly = exp(-dot((p.xy - vec2<f32>(0.0, -0.22)) * vec2<f32>(2.1, 1.45), (p.xy - vec2<f32>(0.0, -0.22)) * vec2<f32>(2.1, 1.45))) * smoothstep(0.08, 0.28, p.z);
  let toe_l = exp(-dot((p.xy - vec2<f32>(-0.22, -1.05)) * vec2<f32>(7.0, 13.0), (p.xy - vec2<f32>(-0.22, -1.05)) * vec2<f32>(7.0, 13.0))) * smoothstep(0.12, 0.28, p.z);
  let toe_r = exp(-dot((p.xy - vec2<f32>(0.22, -1.05)) * vec2<f32>(7.0, 13.0), (p.xy - vec2<f32>(0.22, -1.05)) * vec2<f32>(7.0, 13.0))) * smoothstep(0.12, 0.28, p.z);
  let face = clamp(eye_l + eye_r + nose + mouth * 0.75 + (toe_l + toe_r) * 0.32, 0.0, 1.0);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let gel_base = vj_duotone(palette_rgb.xyz, hue_shift * 0.16 + p.y * 0.16 + p.z * 0.18 + time * 0.01, 0.84 * sat, bri);
  let gel_accent = clamp(duotone_accent(gel_base) + vec3<f32>(0.07, 0.06, 0.05), vec3<f32>(0.0), vec3<f32>(1.0));
  let inner = 0.22 + 0.35 * exp(-t * 0.22) + belly * 0.18 + pulse * 0.08;
  var color = gel_base * (inner + diff * 0.62) + gel_accent * (spec * 1.8 + fresnel * 0.88 + belly * 0.2);
  color = mix(color, gel_accent * (1.08 + pulse * 0.22), wire);
  color = mix(color, vec3<f32>(0.04, 0.03, 0.05) * bri, face);

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, enabled);
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
  let base = vj_duotone(palette_rgb.xyz, hue_phase, 0.62 * sat, 0.82 * bri);
  let accent = vj_duotone(palette_rgb.xyz, hue_phase + 0.33 + 0.45 * grain, 0.74 * sat, bri);
  let fill = mix(base, accent, 0.38 + 0.35 * energy);
  let color = fill * clamp(0.32 + layer, 0.0, 1.0) + vec3<f32>(line_glow) * accent + vec3<f32>(core * 0.45);
  let alpha = clamp(
    (layer + core + pulse * 0.15 + 0.5 * line_glow) * (0.35 + 0.65 * layer) * vignette * enabled,
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

  // layer_alpha from palette_extra.w lets the deck-GPU crossfade fade each layer
  // independently (legacy single-shader path passes 1.0).
  let layer_alpha = max(palette_extra.w, 0.0);

  if (v == 0) {
    let c = rehoboam_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 5) {
    let c = tunnel_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 6) {
    let c = glitch_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 7) {
    let c = fluid_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 8) {
    let c = truchet_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 10) {
    let c = bass_reactor_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 11) {
    let c = high_spark_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 12) {
    let c = kick_rings_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 13) {
    let c = laser_lattice_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 14) {
    let c = strobe_shards_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 15) {
    let c = vortex_bloom_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 16) {
    let c = crystal_core_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 17) {
    let c = bass_portal_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 18) {
    let c = mercury_lake_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 19) {
    let c = iridescent_veil_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 20) {
    let c = starweb_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 21) {
    let c = recursive_maw_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 22) {
    let c = inkbloom_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 23) {
    let c = scanlab_holo_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 24) {
    let c = lumen_coral_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 25) {
    let c = polaris_petals_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 26) {
    let c = aurora_curtains_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 27) {
    let c = bass_monolith_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 28) {
    let c = prism_tunnel_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 29) {
    let c = data_rain_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 30) {
    let c = solar_flare_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 31) {
    let c = topo_lines_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 32) {
    let c = glass_ribbons_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 33) {
    let c = gummy_wire_bear_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }

  let c = geometry_field(uv, time, hue, params.z, pulse, energy, bass, mid, high);
  return vec4<f32>(c.xyz, c.w * layer_alpha);
}

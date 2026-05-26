#import bevy_sprite::mesh2d_vertex_output::VertexOutput

const TAU: f32 = 6.283185307179586;

@group(2) @binding(0) var<uniform> params: vec4<f32>;
// palette_extra.x = saturation multiplier (0..1), palette_extra.y = brightness multiplier (0..1)
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;

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

fn geometry_field(
  uv: vec2<f32>,
  time: f32,
  hue_shift: f32,
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

  let spoke_count = 18.0 + floor(drift * 8.0);
  let spoke = 1.0 - smoothstep(
    0.0,
    0.055 + 0.015 * mid,
    abs(fract(angle / TAU * spoke_count + time * 0.08 + grain * 0.4) - 0.5) * 2.0
  );

  let ring_wave = fract(radius * (16.0 + high * 12.0) + time * (0.22 + bass * 0.18) + grain);
  let ring = 1.0 - smoothstep(0.0, 0.16 - 0.06 * bass, abs(ring_wave - 0.5) * 2.0);

  let lattice_uv = center * (8.0 + mid * 6.0 + bass * 2.0);
  let lattice_grid = abs(fract(lattice_uv) - vec2<f32>(0.5));
  let lattice = 1.0 - smoothstep(0.0, 0.06 + 0.02 * (1.0 - mid), min(lattice_grid.x, lattice_grid.y));

  let core = exp(-pow(radius * 2.2, 2.0)) * (0.9 + 0.1 * pulse);
  let pulse_wave = 1.0 + 0.45 * sin(time * 1.3 + ring_wave * 6.28318 + pulse * 5.0);
  let geometry = max(
    spoke,
    max(ring * (0.75 + 0.25 * energy), lattice * (0.35 + 0.35 * high)) * 0.75
  );
  let layer = geometry * pulse_wave;
  let enabled = select(1.0, 0.0, energy < 0.0);

  let vignette = 1.0 - smoothstep(0.2, 1.0, radius);
  let line_glow = 0.12 * pow(1.0 - clamp(radius, 0.0, 1.0), 2.8);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let hue_phase = angle / TAU * 0.42 + radius * 0.52 + time * 0.03 + 0.21 * drift;
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
  let active = params.w >= 0.0;
  let bass_activity = max(params.z, 0.0);
  let melodic_activity = max(params.w, 0.0);
  let activity = max(bass_activity, melodic_activity);
  let pulse = max(bass_activity * 1.2, melodic_activity * 0.7);
  let energy = select(-1.0, activity, active);

  return geometry_field(
    uv,
    params.y,
    params.x,
    pulse,
    energy,
    bass_activity,
    melodic_activity * 0.72,
    melodic_activity
  );
}

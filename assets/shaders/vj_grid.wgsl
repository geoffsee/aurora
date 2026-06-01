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

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let uv = (frag.uv - vec2<f32>(0.5)) * 2.0;
  let time = params.y;
  let hue_shift = params.x;
  let pulse = palette_extra.z;
  let energy = audio_uniforms.x;
  let bass = audio_uniforms.y;
  let mid = audio_uniforms.z;
  let high = audio_uniforms.w;

  // Inactive when OSC is not delivering audio (energy sentinel -1.0)
  let enabled = select(1.0, 0.0, energy < 0.0);

  // Grid density scales with audio
  let cols = 8.0 + floor(bass * 8.0);
  let rows = 6.0 + floor(mid * 6.0);

  let cell = vec2<f32>(uv.x * cols * 0.5 + cols * 0.5, uv.y * rows * 0.5 + rows * 0.5);
  let cell_id = floor(cell);
  let cell_uv = fract(cell) - vec2<f32>(0.5);

  // Per-cell animation phase, unique per tile
  let tile_seed = cell_id.x * 1.618 + cell_id.y * 2.414;
  let tile_phase = sin(tile_seed + time * 1.1 + pulse * 4.0);
  let tile_beat = sin(tile_seed * 0.5 + time * 2.6 + bass * 5.0);

  // Diamond shape inside each cell
  let diamond_r = 0.28 + high * 0.14 + pulse * 0.08;
  let diamond = 1.0 - smoothstep(diamond_r - 0.03, diamond_r + 0.03, abs(cell_uv.x) + abs(cell_uv.y));

  // Cross / grid lines
  let line_w = 0.04 + mid * 0.04;
  let cross_h = 1.0 - smoothstep(line_w, line_w + 0.03, abs(cell_uv.y));
  let cross_v = 1.0 - smoothstep(line_w, line_w + 0.03, abs(cell_uv.x));
  let cross = max(cross_h, cross_v);

  let shape = max(
    diamond * clamp(0.5 + 0.5 * tile_phase, 0.0, 1.0),
    cross   * clamp(0.25 + 0.35 * tile_beat, 0.0, 1.0)
  );

  // Color: hue cycles across grid + time
  let hue_phase = (cell_id.x + cell_id.y) / (cols + rows) * 0.5
                + time * 0.04
                + tile_phase * 0.1;
  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let color = vj_palette(hue_shift, hue_phase, 0.72 * sat, bri);

  let vignette = 1.0 - smoothstep(0.55, 1.0, length(uv) * 0.75);
  let alpha = clamp(shape * (0.55 + 0.45 * pulse) * vignette * enabled, 0.0, 1.0);

  return vec4<f32>(color * shape, alpha);
}

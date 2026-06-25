#import bevy_sprite::mesh2d_vertex_output::VertexOutput

const TAU: f32 = 6.283185307179586;

@group(2) @binding(0) var<uniform> params: vec4<f32>;
// palette_extra.x = saturation (0..1), y = brightness (0..1), z = pulse (0..1)
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
// audio_uniforms.x = energy (-1.0 = inactive), y = bass, z = mid, w = high (0..1 when active)
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
// grid_extra.x = density (0..1), y = diamond size (0..1), z = line width (0..1), w = shape mix (0=diamond, 1=cross)
@group(2) @binding(3) var<uniform> grid_extra: vec4<f32>;

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

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let uv = (frag.uv - vec2<f32>(0.5)) * 2.0;
  // Grid packs picked RGB into params (x,y,w) and show_time into z.
  let base = vec3<f32>(params.x, params.y, params.w);
  let time = params.z;
  let pulse = palette_extra.z;
  let energy = audio_uniforms.x;
  let bass = audio_uniforms.y;
  let mid = audio_uniforms.z;
  let high = audio_uniforms.w;

  // Inactive when OSC is not delivering audio (energy sentinel -1.0)
  let enabled = select(1.0, 0.0, energy < 0.0);

  // Density knob (0..1) → cols 4..20, rows 3..15. Audio still adds on top.
  let density = grid_extra.x;
  let cols = (4.0 + floor(density * 16.0)) + floor(bass * 8.0);
  let rows = (3.0 + floor(density * 12.0)) + floor(mid * 6.0);

  let cell = vec2<f32>(uv.x * cols * 0.5 + cols * 0.5, uv.y * rows * 0.5 + rows * 0.5);
  let cell_id = floor(cell);
  let cell_uv = fract(cell) - vec2<f32>(0.5);

  // Per-cell animation phase, unique per tile
  let tile_seed = cell_id.x * 1.618 + cell_id.y * 2.414;
  let tile_phase = sin(tile_seed + time * 1.1 + pulse * 4.0);
  let tile_beat = sin(tile_seed * 0.5 + time * 2.6 + bass * 5.0);

  // Diamond size knob (0..1) → radius 0.10..0.46. Audio still nudges it.
  let diamond_r = mix(0.10, 0.46, grid_extra.y) + high * 0.14 + pulse * 0.08;
  let diamond = 1.0 - smoothstep(diamond_r - 0.03, diamond_r + 0.03, abs(cell_uv.x) + abs(cell_uv.y));

  // Line width knob (0..1) → 0.005..0.12.
  let line_w = mix(0.005, 0.12, grid_extra.z) + mid * 0.04;
  let cross_h = 1.0 - smoothstep(line_w, line_w + 0.03, abs(cell_uv.y));
  let cross_v = 1.0 - smoothstep(line_w, line_w + 0.03, abs(cell_uv.x));
  let cross = max(cross_h, cross_v);

  // Shape mix (0 = diamond-only, 0.5 = original max() blend, 1 = cross-only).
  let mix_t = grid_extra.w;
  let diamond_only = diamond * clamp(0.5 + 0.5 * tile_phase, 0.0, 1.0);
  let cross_only   = cross   * clamp(0.25 + 0.35 * tile_beat, 0.0, 1.0);
  let balanced = max(diamond_only, cross_only);
  let shape = mix(
    mix(diamond_only, balanced, clamp(mix_t * 2.0, 0.0, 1.0)),
    cross_only,
    clamp(mix_t * 2.0 - 1.0, 0.0, 1.0)
  );

  // Color: hue cycles across grid + time
  let hue_phase = (cell_id.x + cell_id.y) / (cols + rows) * 0.5
                + time * 0.04
                + tile_phase * 0.1;
  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let color = vj_duotone(base, hue_phase, 0.72 * sat, bri);

  let vignette = 1.0 - smoothstep(0.55, 1.0, length(uv) * 0.75);
  let alpha = clamp(shape * (0.55 + 0.45 * pulse) * vignette * enabled, 0.0, 1.0);

  return vec4<f32>(color * shape, alpha);
}

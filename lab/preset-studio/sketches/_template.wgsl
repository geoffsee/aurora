// Preset Studio template — pack fullscreen bus (parity with show pack materials).
//
// Uniforms (must stay in sync with PackFullscreenMaterial + docs/preset-studio.md):
//   params:         x=hue, y=time, z=unused, w=aspect
//   palette_extra:  x=sat, y=bright, z=pulse, w=alpha
//   audio_uniforms: x=energy (−1 idle), y=bass, z=mid, w=high
//   palette_rgb:    xyz duotone base
//   pack_drive:     x=intensity, y=depth, z=feedback, w=speed
//
// Edit this file (or another sketch under sketches/) and save — Studio hot-reloads WGSL.

#import bevy_sprite::mesh2d_vertex_output::VertexOutput

@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@group(2) @binding(4) var<uniform> pack_drive: vec4<f32>;

const TAU: f32 = 6.283185307179586;

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let time = params.y;
  let aspect = max(params.w, 0.01);
  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.5);
  let pulse = clamp(palette_extra.z, 0.0, 1.0);
  let alpha = clamp(palette_extra.w, 0.0, 1.0);

  let energy_raw = audio_uniforms.x;
  let live = select(0.0, 1.0, energy_raw >= 0.0);
  let energy = select(0.25, clamp(energy_raw, 0.0, 1.0), energy_raw >= 0.0);
  let bass = select(0.15, clamp(audio_uniforms.y, 0.0, 1.0), energy_raw >= 0.0);
  let mid = select(0.12, clamp(audio_uniforms.z, 0.0, 1.0), energy_raw >= 0.0);
  let high = select(0.1, clamp(audio_uniforms.w, 0.0, 1.0), energy_raw >= 0.0);

  let intensity = clamp(pack_drive.x, 0.0, 1.0);
  let depth = clamp(pack_drive.y, 0.0, 1.0);
  let trails = clamp(pack_drive.z, 0.0, 1.0);
  let speed = clamp(pack_drive.w, 0.0, 1.0);

  var uv = (frag.uv - vec2<f32>(0.5)) * vec2<f32>(aspect, 1.0) * 2.0;
  let r = length(uv);

  // Soft discs on a drifting grid — proves density/intensity and audio.
  let cells = mix(8.0, 28.0, intensity);
  let drift = time * (0.15 + speed * 0.85);
  let gv = uv * cells + vec2<f32>(drift * 0.4, -drift * 0.25);
  let id = floor(gv);
  let f = fract(gv) - 0.5;
  let h = hash21(id);
  let tw = 0.55 + 0.45 * sin(time * (2.0 + h * 5.0) + h * TAU);
  let disc = (1.0 - smoothstep(0.02, 0.12 + high * 0.05, length(f)))
    * step(0.55 - mid * 0.25, h)
    * tw;

  let ring = exp(-pow(abs(r - (0.35 + bass * 0.25 + pulse * 0.08)), 2.0) * mix(40.0, 18.0, depth));
  let body = disc * (0.7 + energy * 0.5) + ring * (0.25 + trails * 0.4);
  let glow = exp(-r * r * 1.8) * (0.08 + intensity * 0.12);

  let base = max(palette_rgb.xyz, vec3<f32>(0.05));
  let gray = vec3<f32>(dot(base, vec3<f32>(0.299, 0.587, 0.114)));
  let col = mix(gray, base, sat) * bri * (0.45 + body * 0.9 + glow);
  let a = clamp(body + glow, 0.0, 1.0) * alpha * mix(0.85, 1.0, 0.5 + 0.5 * live);
  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), a);
}

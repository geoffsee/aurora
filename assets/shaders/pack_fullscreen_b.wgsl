// Deck B pack fullscreen slot — transparent placeholder until bridge WGSL arrives.
// Layout must match VjPackFullscreenBMaterial (including pack_drive @ binding 4).
#import bevy_sprite::mesh2d_vertex_output::VertexOutput

@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@group(2) @binding(4) var<uniform> pack_drive: vec4<f32>;

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let _keep = pack_drive.x + params.x + palette_extra.x + audio_uniforms.x + palette_rgb.x + frag.uv.x;
  return vec4<f32>(0.0, 0.0, 0.0, 0.0);
}

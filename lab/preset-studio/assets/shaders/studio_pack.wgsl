// Bootstrap asset path for PackFullscreenMaterial (hot-reload replaces contents from sketches/).
#import bevy_sprite::mesh2d_vertex_output::VertexOutput

@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@group(2) @binding(4) var<uniform> pack_drive: vec4<f32>;

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let t = params.y;
  let uv = frag.uv;
  let g = 0.08 + 0.04 * sin(t + uv.x * 6.0);
  let _keep = pack_drive.x + palette_extra.x + audio_uniforms.x + palette_rgb.x;
  return vec4<f32>(g, g * 1.1, g * 1.2, 0.35 + _keep * 0.0);
}

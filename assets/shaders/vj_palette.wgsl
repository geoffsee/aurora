#import bevy_sprite::mesh2d_vertex_output::VertexOutput

// params.x = hue_shift (from __bevyoscControlPalette, 0..1)
// params.y = show_time (seconds)
@group(2) @binding(0)
var<uniform> params: vec4<f32>;

fn vj_palette(hue: f32) -> vec3<f32> {
    let r = 0.5 + 0.5 * cos(6.28318 * (hue + 0.00));
    let g = 0.5 + 0.5 * cos(6.28318 * (hue + 0.33));
    let b = 0.5 + 0.5 * cos(6.28318 * (hue + 0.67));
    return vec3<f32>(r, g, b);
}

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    let hue_shift = params.x;
    let time = params.y;
    let uv = in.uv;
    let dx = uv.x - 0.5;
    let dy = uv.y - 0.5;
    // Radial vignette so the glow fades at screen edges
    let vignette = clamp(1.0 - (dx * dx + dy * dy) * 4.0, 0.0, 1.0);
    let hue = hue_shift + uv.x * 0.35 + uv.y * 0.22 + time * 0.04;
    let color = vj_palette(hue);
    let alpha = vignette * 0.35;
    return vec4<f32>(color, alpha);
}

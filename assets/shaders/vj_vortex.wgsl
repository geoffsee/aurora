#import bevy_sprite::mesh2d_vertex_output::VertexOutput

const TAU: f32 = 6.283185307179586;

@group(2) @binding(0) var<uniform> params: vec4f;
@group(2) @binding(1) var<uniform> palette_extra: vec4f;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4f;
@group(2) @binding(3) var<uniform> vortex_extra: vec4f;

fn hash21(p: vec2f) -> f32 {
    return fract(sin(p.x * 12.9898 + p.y * 78.233) * 43758.5453);
}

struct BevyVertexOutput {
  position: vec4f,
  uv: vec2f,
}

fn mainShader(frag: BevyVertexOutput) -> vec4f {
    let params_1 = (&params);
    let palette_extra_1 = (&palette_extra);
    let audio_uniforms_1 = (&audio_uniforms);
    let vortex_extra_1 = (&vortex_extra);
    
    let uv = frag.uv;
    let uv_centered = (uv - vec2f(0.5)) * 2.0;
    let time = (*params_1).z;
    let aspect = (*params_1).w;
    
    // Audio inputs
    let energy = (*audio_uniforms_1).x;
    let bass = (*audio_uniforms_1).y;
    let mid = (*audio_uniforms_1).z;
    let high = (*audio_uniforms_1).w;
    let enabled = select(1i, 0i, (energy < 0f));
    
    // Vortex parameters
    let streak_count = floor((*vortex_extra_1).x * 40.0) + 16.0;
    let rotation_speed = (*vortex_extra_1).y * 2.0 + 0.2;
    let streak_width = mix(0.005, 0.03, (*vortex_extra_1).z);
    let curve_amount = (*vortex_extra_1).w * 0.8 + 0.1;
    
    // Pulse for brightness modulation
    let pulse = (*palette_extra_1).w;
    
    // Get color from palette
    let hue_phase = time * 0.05;
    let base_hue = (*params_1).x;
    let color = vec3f(
        0.5 + 0.5 * cos(hue_phase + base_hue),
        0.5 + 0.5 * cos(hue_phase + base_hue + 2.094),
        0.5 + 0.5 * cos(hue_phase + base_hue + 4.188)
    );
    
    // Add audio color influence
    let audio_color = vec3f(bass * 2.0, mid * 2.0, high * 2.0);
    let final_color = mix(color, audio_color, 0.3);
    
    // Calculate distance from center
    let radius = length(uv_centered);
    
    // Create rotating streaks (the tunnel effect)
    let rotation = time * rotation_speed * (1.0 + bass * 0.3);
    let angle = atan2(uv_centered.y, uv_centered.x * aspect);
    
    // Curved streak effect - streaks bend toward center
    let streak_angle = angle + curve_amount * radius * radius * 2.0;
    
    // Calculate which streak we're closest to
    let normalized_angle = (streak_angle / TAU + 0.5);
    let streak_index = floor(normalized_angle * streak_count);
    let streak_frac = fract(normalized_angle * streak_count);
    
    // Distance to nearest streak
    let streak_dist = min(streak_frac, 1.0 - streak_frac);
    
    // Streak brightness - narrow bright lines
    let streak_alpha = smoothstep(streak_width, 0.0, streak_dist);
    
    // Animate streaks moving along the curve
    let streak_phase = streak_index / streak_count;
    let moving_offset = sin(time * rotation_speed * 2.0 + streak_phase * TAU * 3.0) * 0.1 * (1.0 + mid);
    
    // Add motion blur by sampling multiple points along each streak
    let blur_steps = 8u;
    let mut blur_alpha = 0.0;
    for (var i: u32 = 0; i < blur_steps; i = i + 1) {
        let t = f32(i) / f32(blur_steps - 1);
        let offset = (t - 0.5) * 0.1 * (1.0 + radius) * (0.5 + high * 2.0);
        let blur_frac = fract(normalized_angle * streak_count + offset + moving_offset);
        let blur_dist = min(blur_frac, 1.0 - blur_frac);
        blur_alpha += smoothstep(streak_width * 1.5, 0.0, blur_dist) * (1.0 - t * 0.5);
    }
    
    // Combine streak and blur
    let combined_alpha = max(streak_alpha, blur_alpha * 0.6);
    
    // Perspective - streaks are more visible in center
    let perspective = 1.0 / (1.0 + radius * 0.5 * curve_amount);
    
    // Vignette
    let vignette = 1.0 - smoothstep(0.6, 1.2, radius);
    
    // Final alpha with audio modulation
    let brightness = (0.6 + bass * 0.4 + mid * 0.3 + high * 0.2 + pulse * 0.3) * perspective * vignette;
    let alpha = clamp(combined_alpha * brightness * f32(enabled), 0.0, 1.0);
    
    return vec4f(final_color, alpha);
}

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
    var input: BevyVertexOutput;
    input.position = frag.position;
    input.uv = frag.uv;
    return mainShader(input);
}

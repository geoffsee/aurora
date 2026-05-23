// Reserved for GPU material experiments after the performance-safe MVP.
// The current show build drives Bevy 2D materials from Rust so controls stay
// easy to debug in the browser before a live set.

fn vj_palette(hue: f32) -> vec3<f32> {
    let r = 0.5 + 0.5 * cos(6.28318 * (hue + 0.00));
    let g = 0.5 + 0.5 * cos(6.28318 * (hue + 0.33));
    let b = 0.5 + 0.5 * cos(6.28318 * (hue + 0.67));
    return vec3<f32>(r, g, b);
}


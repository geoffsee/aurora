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
  let col = vjDuotone(palette_rgb.xyz, hue, sat, bri);
  let layer = star * (1.0 + pulse) + links * 0.6;

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(col * layer * enabled, clamp(layer * 0.85 * enabled, 0.0, 1.0));
}

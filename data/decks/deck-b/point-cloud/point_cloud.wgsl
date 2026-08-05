// GPU point cloud — dense star-field disc particles in fragment space.
// Pack fullscreen slot uniforms (PR13):
//   params:        x=displayHue, y=time, z=unused, w=aspect
//   palette_extra: x=sat, y=brightness, z=pulse, w=deckAlpha
//   audio_uniforms:x=energy (-1 idle), y=bass, z=mid, w=high
//   palette_rgb:   xyz=duotone base
#import bevy_sprite::mesh2d_vertex_output::VertexOutput

const TAU: f32 = 6.283185307179586;
const PI: f32 = 3.141592653589793;

@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
}

fn hash31(p: vec3<f32>) -> f32 {
  return fract(sin(dot(p, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123);
}

fn hash22(p: vec2<f32>) -> vec2<f32> {
  let n = vec2<f32>(
    dot(p, vec2<f32>(127.1, 311.7)),
    dot(p, vec2<f32>(269.5, 183.3)),
  );
  return fract(sin(n) * 43758.5453);
}

fn hash33(p: vec3<f32>) -> vec3<f32> {
  let n = vec3<f32>(
    dot(p, vec3<f32>(127.1, 311.7, 74.7)),
    dot(p, vec3<f32>(269.5, 183.3, 246.1)),
    dot(p, vec3<f32>(113.5, 271.9, 124.6)),
  );
  return fract(sin(n) * 43758.5453);
}

fn rotate2(p: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y);
}

fn duotone(base: vec3<f32>, phase: f32, sat: f32, value: f32) -> vec3<f32> {
  let accent = clamp(base * 1.35 + vec3<f32>(0.12, 0.08, 0.18), vec3<f32>(0.0), vec3<f32>(1.0));
  let t = abs(fract(phase) - 0.5) * 2.0;
  let rgb = mix(base, accent, t);
  let gray = vec3<f32>(dot(rgb, vec3<f32>(0.299, 0.587, 0.114)));
  return mix(gray, rgb, sat) * value;
}

/// Soft disc at local UV within a cell. Returns alpha.
fn disc(local: vec2<f32>, center: vec2<f32>, radius: f32) -> f32 {
  let d = length(local - center);
  // Hard core + soft halo so points read as points, not soft blobs.
  let core = 1.0 - smoothstep(radius * 0.35, radius, d);
  let halo = 1.0 - smoothstep(radius, radius * 2.4, d);
  return max(core, halo * 0.22);
}

/// One depth layer of a 3D point shell projected into UV space.
/// `layer` selects an independent hash field; `z_bias` is parallax depth.
fn shell_layer(
  uv: vec2<f32>,
  layer: f32,
  time: f32,
  swirl: f32,
  density: f32,
  spark: f32,
  breath: f32,
) -> vec3<f32> {
  // denser cells at higher density; keep a floor so it never looks empty
  let cells = mix(18.0, 42.0, density);
  let gv = uv * cells;
  let cell = floor(gv);
  var acc = 0.0;
  var hue_w = 0.0;

  // 3×3 neighborhood so points near cell borders don't pop
  for (var jy = -1; jy <= 1; jy = jy + 1) {
    for (var jx = -1; jx <= 1; jx = jx + 1) {
      let id = cell + vec2<f32>(f32(jx), f32(jy));
      // 1–2 points per cell
      for (var k = 0; k < 2; k = k + 1) {
        let hk = hash33(vec3<f32>(id, layer * 17.0 + f32(k) * 3.1));
        // Skip some cells for natural sparsity
        if (hk.x > mix(0.55, 0.88, density)) {
          continue;
        }
        let p0 = hash22(id + vec2<f32>(layer, f32(k) * 9.1));
        // Slow orbital drift + bass breath radius
        let ang = time * (0.08 + swirl * 0.45) * (0.6 + hk.y) + layer * 0.7;
        let orbit = rotate2(p0 - 0.5, ang) * (0.85 + breath * 0.2);
        let center = 0.5 + orbit * (0.55 + density * 0.35);
        let local = gv - id;
        // Parallax: outer layers move more with swirl/time
        let parallax = rotate2(local - center, ang * 0.15 * layer) + center;
        let size = (0.018 + 0.04 * hk.z) * (1.0 + spark * 0.9) / (0.65 + layer * 0.12);
        let a = disc(parallax, center, size);
        // Depth falloff + high-band sparkle
        let depth = exp(-layer * 0.28);
        let twinkle = 0.55 + 0.45 * sin(time * (2.0 + hk.y * 6.0) + hk.z * TAU);
        let w = a * depth * mix(1.0, twinkle, spark);
        acc = acc + w;
        hue_w = hue_w + w * (hk.y + layer * 0.07);
      }
    }
  }
  return vec3<f32>(acc, hue_w, 0.0);
}

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let time = params.y;
  let aspect = max(params.w, 0.01);
  let hue0 = params.x;
  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.5);
  let pulse = clamp(palette_extra.z, 0.0, 1.0);
  let deck_alpha = clamp(palette_extra.w, 0.0, 1.0);

  let energy_raw = audio_uniforms.x;
  let live = select(0.0, 1.0, energy_raw >= 0.0);
  let energy = select(0.35, clamp(energy_raw, 0.0, 1.0), energy_raw >= 0.0);
  let bass = select(0.15, clamp(audio_uniforms.y, 0.0, 1.0), energy_raw >= 0.0);
  let mid = select(0.12, clamp(audio_uniforms.z, 0.0, 1.0), energy_raw >= 0.0);
  let high = select(0.1, clamp(audio_uniforms.w, 0.0, 1.0), energy_raw >= 0.0);

  if (deck_alpha < 0.001) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  // Centered aspect-correct coords
  var uv = (frag.uv - vec2<f32>(0.5)) * vec2<f32>(aspect, 1.0) * 2.0;

  // Global slow spin + mild bass swell
  let swirl = 0.35 + mid * 0.25;
  let breath = 1.0 + bass * 0.22 + pulse * 0.12;
  uv = rotate2(uv, time * (0.05 + swirl * 0.08) * (0.7 + energy * 0.4));
  uv = uv / breath;

  let density = clamp(0.45 + energy * 0.35 + mid * 0.15, 0.2, 1.0);
  let spark = clamp(high * 0.85 + pulse * 0.25, 0.0, 1.0);

  // Multiple depth shells → dense volumetric cloud (GPU, not CPU sprites)
  var points = 0.0;
  var hue_acc = 0.0;
  for (var layer = 0; layer < 7; layer = layer + 1) {
    let lf = f32(layer);
    // Zoom shells for parallax depth
    let scale = mix(0.55, 1.85, lf / 6.0);
    let shell_uv = uv * scale + vec2<f32>(lf * 0.17, -lf * 0.11);
    let s = shell_layer(shell_uv, lf + 1.0, time, swirl, density, spark, breath);
    let fade = exp(-lf * 0.22);
    points = points + s.x * fade;
    hue_acc = hue_acc + s.y * fade;
  }

  // Soft core glow so the cloud has a volumetric center without becoming a wash
  let r = length(uv);
  let core = exp(-r * r * mix(2.2, 1.1, density)) * (0.08 + bass * 0.12 + energy * 0.06);
  points = points + core;

  // Tone map point density — keep blacks black, spikes bright
  let body = 1.0 - exp(-points * mix(1.6, 2.8, density));
  let alpha = body * deck_alpha * mix(0.75, 1.0, 0.55 + 0.45 * live);
  if (alpha < 0.004) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  let phase = hue0 + (hue_acc / max(points, 0.001)) * 0.15 + time * 0.02 + high * 0.08;
  let base = max(palette_rgb.xyz, vec3<f32>(0.04));
  var rgb = duotone(base, phase, sat * 0.92, bri * (0.55 + body * 0.55));
  // Sparkle lift on highs
  rgb = rgb + vec3<f32>(spark * 0.12 * body);
  rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));

  return vec4<f32>(rgb, alpha * clamp(0.35 + body * 0.75, 0.0, 1.0));
}

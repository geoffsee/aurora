// GPU point cloud — dense star-field discs in fragment space.
// Stars sit on fixed cell anchors and twinkle in brightness (no orbital jump).
//
// Uniforms (pack fullscreen slot):
//   params:        x=displayHue, y=time (already speed-scaled), z=unused, w=aspect
//   palette_extra: x=sat, y=brightness, z=pulse, w=deckAlpha
//   audio_uniforms:x=energy (-1 idle), y=bass, z=mid, w=high
//   palette_rgb:   xyz=duotone base
//   pack_drive:    x=intensity 0..1 (density/gain)
//                  y=depth 0..1     (scatter / shell thickness)  ← "3D Lines" knob
//                  z=feedback 0..1  (twinkle sustain / glow)   ← "Trails" knob
//                  w=speed 0..1     (twinkle rate scale)        ← "Speed" knob
//
// Also reacts to Color / GPU Sat / GPU Bright / Max Bright via the other buses.
#import bevy_sprite::mesh2d_vertex_output::VertexOutput

const TAU: f32 = 6.283185307179586;

@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> palette_rgb: vec4<f32>;
@group(2) @binding(4) var<uniform> pack_drive: vec4<f32>;

fn hash21(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453123);
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

fn duotone(base: vec3<f32>, phase: f32, sat: f32, value: f32) -> vec3<f32> {
  let accent = clamp(base * 1.35 + vec3<f32>(0.12, 0.08, 0.18), vec3<f32>(0.0), vec3<f32>(1.0));
  let t = abs(fract(phase) - 0.5) * 2.0;
  let rgb = mix(base, accent, t);
  let gray = vec3<f32>(dot(rgb, vec3<f32>(0.299, 0.587, 0.114)));
  return mix(gray, rgb, sat) * value;
}

fn disc(local: vec2<f32>, center: vec2<f32>, radius: f32) -> f32 {
  let d = length(local - center);
  let core = 1.0 - smoothstep(radius * 0.35, radius, d);
  let halo = 1.0 - smoothstep(radius, radius * 2.4, d);
  return max(core, halo * 0.22);
}

fn shell_layer(
  uv: vec2<f32>,
  layer: f32,
  time: f32,
  density: f32,
  spark: f32,
  scatter: f32,
  trail: f32,
  twinkle_rate: f32,
) -> vec3<f32> {
  // Density knob + operator intensity → cell count
  let cells = mix(14.0, 48.0, density);
  let gv = uv * cells;
  let cell = floor(gv);
  var acc = 0.0;
  var hue_w = 0.0;

  for (var jy = -1; jy <= 1; jy = jy + 1) {
    for (var jx = -1; jx <= 1; jx = jx + 1) {
      let id = cell + vec2<f32>(f32(jx), f32(jy));
      for (var k = 0; k < 2; k = k + 1) {
        let hk = hash33(vec3<f32>(id, layer * 17.0 + f32(k) * 3.1));
        // Higher density → more cells emit; scatter thins outer shells less
        let emit_gate = mix(0.42, 0.92, density) * mix(0.85, 1.05, scatter);
        if (hk.x > emit_gate) {
          continue;
        }
        // Fixed cell anchor — stars do not orbit / jump.
        let p0 = hash22(id + vec2<f32>(layer, f32(k) * 9.1));
        // Scatter + density only affect static placement radius inside the cell.
        let place_amp = (0.28 + scatter * 0.42) * (0.75 + density * 0.35);
        let center = 0.5 + (p0 - 0.5) * place_amp;
        let local = gv - id;

        // Per-star phase so the field doesn't blink in lockstep.
        let phase = hk.z * TAU + layer * 1.7 + f32(k) * 2.3;
        // Trails raise the floor and slow the beat (sustain); Speed scales rate.
        let base_hz = mix(1.6, 5.5, twinkle_rate) * (0.55 + hk.y * 1.8);
        let slow_hz = base_hz * mix(1.0, 0.35, trail);
        let fast_hz = base_hz * mix(2.4, 1.1, trail);
        let twinkle =
          mix(0.22, 0.58, trail)
          + (0.48 - trail * 0.18) * sin(time * slow_hz + phase)
          + (0.28 - trail * 0.12) * sin(time * fast_hz + phase * 1.7 + hk.y * TAU);
        let tw = clamp(twinkle, 0.05, 1.35);

        // Soft glow when trails are high; size breathes with twinkle, not position.
        let size = (0.014 + 0.034 * hk.z)
          * (0.72 + tw * 0.55)
          * (1.0 + spark * 0.55)
          * (1.0 + trail * 0.4)
          / (0.65 + layer * 0.12);
        let a = disc(local, center, size);
        let depth_fade = exp(-layer * mix(0.32, 0.18, scatter));
        // Always modulate by twinkle; spark deepens the contrast.
        let amp = mix(tw, pow(tw, mix(0.85, 0.45, spark)), spark);
        let w = a * depth_fade * amp;
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

  // Operator animation bus
  let drive_intensity = clamp(pack_drive.x, 0.0, 1.0);
  let drive_depth = clamp(pack_drive.y, 0.0, 1.0);     // scatter / shell thickness
  let drive_feedback = clamp(pack_drive.z, 0.0, 1.0); // trails / twinkle sustain
  let drive_speed = clamp(pack_drive.w, 0.0, 1.0);     // twinkle rate scale

  let energy_raw = audio_uniforms.x;
  let live = select(0.0, 1.0, energy_raw >= 0.0);
  let energy = select(0.35, clamp(energy_raw, 0.0, 1.0), energy_raw >= 0.0);
  let bass = select(0.15, clamp(audio_uniforms.y, 0.0, 1.0), energy_raw >= 0.0);
  let mid = select(0.12, clamp(audio_uniforms.z, 0.0, 1.0), energy_raw >= 0.0);
  let high = select(0.1, clamp(audio_uniforms.w, 0.0, 1.0), energy_raw >= 0.0);

  if (deck_alpha < 0.001) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  // Stable UV — no global spin or breath zoom (those made stars jump).
  let uv = (frag.uv - vec2<f32>(0.5)) * vec2<f32>(aspect, 1.0) * 2.0;

  // Density: operator intensity + audio energy
  let density = clamp(
    0.22 + drive_intensity * 0.55 + energy * 0.22 + mid * 0.08,
    0.12,
    1.0,
  );
  // Sparkle: highs + trails open the glitter gate
  let spark = clamp(high * 0.75 + pulse * 0.2 + drive_feedback * 0.35, 0.0, 1.0);
  let scatter = drive_depth;
  let trail = drive_feedback;
  // Speed drives twinkle rate; highs add a little extra shimmer
  let twinkle_rate = clamp(0.2 + drive_speed * 0.7 + high * 0.25, 0.0, 1.0);

  var points = 0.0;
  var hue_acc = 0.0;
  // More depth shells when scatter is high
  let layer_count = i32(mix(5.0, 8.0, scatter));
  for (var layer = 0; layer < 8; layer = layer + 1) {
    if (layer >= layer_count) {
      break;
    }
    let lf = f32(layer);
    // Depth knob spreads parallax range (tight shell → deep cloud)
    let scale = mix(mix(0.7, 0.45, scatter), mix(1.35, 2.15, scatter), lf / max(f32(layer_count - 1), 1.0));
    let shell_uv = uv * scale + vec2<f32>(lf * 0.17, -lf * 0.11);
    let s = shell_layer(shell_uv, lf + 1.0, time, density, spark, scatter, trail, twinkle_rate);
    let fade = exp(-lf * mix(0.28, 0.16, scatter));
    points = points + s.x * fade;
    hue_acc = hue_acc + s.y * fade;
  }

  let r = length(uv);
  // Soft core glow reacts to bass without moving star anchors
  let core = exp(-r * r * mix(2.4, 1.0, density))
    * (0.06 + bass * 0.12 + energy * 0.05 + drive_intensity * 0.05);
  points = points + core;

  let body = 1.0 - exp(-points * mix(1.4, 3.0, density));
  let alpha = body * deck_alpha * mix(0.72, 1.0, 0.5 + 0.5 * live);
  if (alpha < 0.004) {
    return vec4<f32>(0.0, 0.0, 0.0, 0.0);
  }

  let phase = hue0 + (hue_acc / max(points, 0.001)) * 0.15 + time * 0.02 + high * 0.08;
  let base = max(palette_rgb.xyz, vec3<f32>(0.04));
  var rgb = duotone(base, phase, sat * 0.92, bri * (0.5 + body * 0.55 + drive_intensity * 0.08));
  rgb = rgb + vec3<f32>(spark * 0.14 * body);
  rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));

  return vec4<f32>(rgb, alpha * clamp(0.32 + body * 0.78, 0.0, 1.0));
}

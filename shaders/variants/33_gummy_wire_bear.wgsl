// === Variant 33: Gummy Wire Bear ===
// Full-body 3D gummy-bear SDF with translucent gel shading and wrapped wireframe.
fn gummy_wire_bear_variant(uv: vec2<f32>, time: f32, hue_shift: f32, pulse: f32, energy: f32, bass: f32, mid: f32, high: f32) -> vec4<f32> {
  let aspect = max(params.w, 1.0);
  let wobble = sin(time * 1.15 + bass * 2.4) * 0.025;
  let spin = sin(time * 0.24) * 0.42 + (bass - 0.5) * 0.16;
  let ro_world = vec3<f32>(0.0, -0.04 + wobble, 3.45);
  let rd_world = normalize(vec3<f32>(uv.x * aspect * 1.02, -uv.y * 1.08 + 0.02, -2.52));
  let ro = bear_rot_y(ro_world, -spin);
  let rd = bear_rot_y(rd_world, -spin);

  var t = 0.0;
  var hit = false;
  var p = ro;
  for (var i = 0; i < 72; i = i + 1) {
    p = ro + rd * t;
    let d = bear_model_sdf(p);
    if (d < 0.0035) {
      hit = true;
      break;
    }
    t = t + max(d * 0.72, 0.006);
    if (t > 6.0) {
      break;
    }
  }

  let floor_shadow = exp(-pow((uv.x * aspect) / 0.72, 2.0) - pow((uv.y + 0.78) / 0.16, 2.0)) * (0.16 + bass * 0.18);
  if (!hit) {
    let bg_line = 1.0 - smoothstep(0.0, 0.018, abs(fract((uv.y + time * 0.04) * 10.0) - 0.5) * 2.0);
    let bg = vjDuotone(palette_rgb.xyz, hue_shift * 0.16 + uv.y * 0.12, 0.45 * palette_extra.x, 0.35 * palette_extra.y);
    let enabled = select(1.0, 0.0, energy < 0.0);
    return vec4<f32>(bg * (floor_shadow + bg_line * 0.03) * enabled, enabled);
  }

  let n = bear_normal(p);
  let view = normalize(-rd);
  let light = normalize(vec3<f32>(-0.42, 0.72, 0.68));
  let half_v = normalize(light + view);
  let diff = max(dot(n, light), 0.0);
  let spec = pow(max(dot(n, half_v), 0.0), 44.0 + high * 38.0);
  let fresnel = pow(1.0 - clamp(dot(n, view), 0.0, 1.0), 2.7);
  let wire = bear_surface_mesh(p, n, pulse, high);

  let front = smoothstep(0.08, 0.28, p.z);
  let eye_l = exp(-dot((p.xy - vec2<f32>(-0.115, 0.61)) * vec2<f32>(14.0, 18.0), (p.xy - vec2<f32>(-0.115, 0.61)) * vec2<f32>(14.0, 18.0))) * front;
  let eye_r = exp(-dot((p.xy - vec2<f32>(0.115, 0.61)) * vec2<f32>(14.0, 18.0), (p.xy - vec2<f32>(0.115, 0.61)) * vec2<f32>(14.0, 18.0))) * front;
  let nose = exp(-dot((p.xy - vec2<f32>(0.0, 0.49)) * vec2<f32>(12.0, 20.0), (p.xy - vec2<f32>(0.0, 0.49)) * vec2<f32>(12.0, 20.0))) * smoothstep(0.18, 0.33, p.z);
  let mouth_curve = abs(length((p.xy - vec2<f32>(0.0, 0.42)) * vec2<f32>(2.2, 4.0)) - 0.18);
  let mouth = (1.0 - smoothstep(0.015, 0.035, mouth_curve)) * smoothstep(-0.02, 0.09, p.y - 0.34) * smoothstep(0.18, 0.33, p.z);
  let belly = exp(-dot((p.xy - vec2<f32>(0.0, -0.22)) * vec2<f32>(2.1, 1.45), (p.xy - vec2<f32>(0.0, -0.22)) * vec2<f32>(2.1, 1.45))) * smoothstep(0.08, 0.28, p.z);
  let toe_l = exp(-dot((p.xy - vec2<f32>(-0.22, -1.05)) * vec2<f32>(7.0, 13.0), (p.xy - vec2<f32>(-0.22, -1.05)) * vec2<f32>(7.0, 13.0))) * smoothstep(0.12, 0.28, p.z);
  let toe_r = exp(-dot((p.xy - vec2<f32>(0.22, -1.05)) * vec2<f32>(7.0, 13.0), (p.xy - vec2<f32>(0.22, -1.05)) * vec2<f32>(7.0, 13.0))) * smoothstep(0.12, 0.28, p.z);
  let face = clamp(eye_l + eye_r + nose + mouth * 0.75 + (toe_l + toe_r) * 0.32, 0.0, 1.0);

  let sat = clamp(palette_extra.x, 0.0, 1.0);
  let bri = clamp(palette_extra.y, 0.0, 1.0);
  let gel_base = vjDuotone(palette_rgb.xyz, hue_shift * 0.16 + p.y * 0.16 + p.z * 0.18 + time * 0.01, 0.84 * sat, bri);
  let gel_accent = clamp(duotoneAccent(gel_base) + vec3<f32>(0.07, 0.06, 0.05), vec3<f32>(0.0), vec3<f32>(1.0));
  let inner = 0.22 + 0.35 * exp(-t * 0.22) + belly * 0.18 + pulse * 0.08;
  var color = gel_base * (inner + diff * 0.62) + gel_accent * (spec * 1.8 + fresnel * 0.88 + belly * 0.2);
  color = mix(color, gel_accent * (1.08 + pulse * 0.22), wire);
  color = mix(color, vec3<f32>(0.04, 0.03, 0.05) * bri, face);

  let enabled = select(1.0, 0.0, energy < 0.0);
  return vec4<f32>(color * enabled, enabled);
}

fn wolf_ellipse_2d(p: vec2<f32>, center: vec2<f32>, radius: vec2<f32>) -> f32 {
  return (length((p - center) / radius) - 1.0) * min(radius.x, radius.y);
}

fn wolf_capsule_2d(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

fn wolf_triangle_2d(p: vec2<f32>, base: vec2<f32>, tip: vec2<f32>, width: f32) -> f32 {
  let axis = normalize(tip - base);
  let perp = vec2<f32>(-axis.y, axis.x);
  let len = max(length(tip - base), 0.001);
  let q = p - base;
  let along = dot(q, axis);
  let lateral = abs(dot(q, perp));
  let taper = width * (1.0 - along / len);
  return max(max(-along, along - len), lateral - taper);
}

fn wolf_leg_2d_sdf(p: vec2<f32>, hip: vec2<f32>, phase: f32, stride: f32) -> f32 {
  let swing = sin(phase);
  let lift = max(cos(phase), 0.0);
  let knee = hip + vec2<f32>(0.11 * swing * stride, -0.32 + lift * 0.05);
  let ankle = hip + vec2<f32>(-0.11 * swing * stride, -0.62 + lift * 0.08);
  let paw = hip + vec2<f32>(-0.21 * swing * stride, -0.76 + lift * 0.10);
  var d = wolf_capsule_2d(p, hip, knee, 0.055);
  d = min(d, wolf_capsule_2d(p, knee, ankle, 0.047));
  d = min(d, wolf_capsule_2d(p, ankle, paw, 0.038));
  d = min(d, wolf_ellipse_2d(p, paw + vec2<f32>(0.055, -0.008), vec2<f32>(0.13, 0.045)));
  return d;
}

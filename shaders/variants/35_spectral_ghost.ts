// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { fbm } from '../shared/math.ts';
import { vjDuotone, duotoneAccent } from '../shared/duotone.ts';
import { wolf_ellipse_2d, wolf_capsule_2d, wolf_triangle_2d, wolf_leg_2d_sdf } from '../shared/wolf_sdf.ts';

export const meta = { index: 35, fn: 'spectral_ghost_variant' } as const;

export const spectral_ghostVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 1.0);
    let p = vec2f(uv.x * aspect, -uv.y);
    let hover = vec2f(std.sin(time * 0.19) * 0.12, std.sin(time * (0.74 + bass * 0.45)) * 0.065);
    let q = p - hover;
    let flow = vec2f(
      fbm(q * 1.7 + vec2f(time * 0.05, -time * 0.03)),
      fbm(q.yx * 1.55 + vec2f(-time * 0.04, time * 0.06))
    ) - vec2f(0.5);
    let w = q + flow * (0.075 + energy * 0.075);

    let head = 1.0 - std.smoothstep(0.43, 0.49, std.length((w - vec2f(0.0, 0.34)) * vec2f(0.92, 1.08)));
    let bottom_swell = 1.0 - std.smoothstep(-0.72, 0.42, w.y);
    let body_width = 0.27 + bottom_swell * 0.38 + std.sin(w.y * 8.0 + time * 0.7) * 0.025;
    let side = 1.0 - std.smoothstep(body_width, body_width + 0.055, std.abs(w.x));
    let top_gate = 1.0 - std.smoothstep(0.16, 0.38, w.y);
    let hem_wave = std.sin(w.x * 17.0 + time * (1.1 + mid * 0.8)) * (0.055 + high * 0.035);
    let bottom_gate = std.smoothstep(-0.88 + hem_wave, -0.69 + hem_wave, w.y);
    let sheet = side * top_gate * bottom_gate;

    let left_arm = 1.0 - std.smoothstep(0.0, 0.085, wolf_capsule_2d(
      w,
      vec2f(-0.26, 0.03),
      vec2f(-0.76, -0.05 + std.sin(time * 1.0) * 0.065),
      0.075 + pulse * 0.012
    ));
    let right_arm = 1.0 - std.smoothstep(0.0, 0.085, wolf_capsule_2d(
      w,
      vec2f(0.26, 0.02),
      vec2f(0.70, 0.10 + std.cos(time * 0.92) * 0.07),
      0.068 + pulse * 0.012
    ));
    let silhouette = std.clamp(std.max(head, std.max(sheet, std.max(left_arm * 0.72, right_arm * 0.68))), 0.0, 1.0);

    let eye_l_v = (w - vec2f(-0.12, 0.38)) * vec2f(13.0, 18.0);
    let eye_r_v = (w - vec2f(0.12, 0.38)) * vec2f(13.0, 18.0);
    let mouth_v = (w - vec2f(0.0, 0.16 + std.sin(time * 1.1) * 0.02)) * vec2f(7.0, 12.0);
    let eyes = std.clamp(std.exp(-std.dot(eye_l_v, eye_l_v)) + std.exp(-std.dot(eye_r_v, eye_r_v)), 0.0, 1.0) * head;
    let mouth = std.exp(-std.dot(mouth_v, mouth_v)) * head;
    let face_void = std.clamp(eyes + mouth * 0.88, 0.0, 1.0);

    let rib_phase = std.abs(std.fract((w.y + flow.x * 0.13 + time * 0.045) * (7.5 + mid * 7.0)) - 0.5) * 2.0;
    let rib = (1.0 - std.smoothstep(0.0, 0.18 + high * 0.08, rib_phase)) * silhouette * (0.16 + energy * 0.22);
    let edge = std.pow(1.0 - std.smoothstep(0.0, 0.11, std.abs(std.abs(w.x) - body_width)), 1.6) * sheet;
    let aura = std.exp(-std.length((q + flow * 0.2) * vec2f(0.72, 0.92)) * (1.25 - energy * 0.25)) * (0.24 + pulse * 0.22);
    let vapor = fbm((p + flow * 0.42) * vec2f(2.4, 2.0) + vec2f(time * 0.09, -time * 0.12));
    let fog = std.smoothstep(0.42, 0.86, vapor) * aura * (0.26 + high * 0.2);
    let floor_mist = std.exp(-std.pow((uv.y + 0.82) / 0.13, 2.0)) *
      (0.12 + bass * 0.24) *
      (0.55 + 0.45 * std.sin(uv.x * aspect * 7.0 - time * 1.1));

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.14 + w.y * 0.12 + flow.x * 0.5 + time * 0.01, 0.56 * sat, bri);
    let spectral = std.clamp(duotoneAccent(base) + vec3f(0.09, 0.11, 0.14), vec3f(0.0), vec3f(1.0));
    let color = std.mix(base * 0.38, spectral, std.clamp(silhouette * 0.58 + edge * 0.34 + rib, 0.0, 1.0));
    color = color * (0.18 + silhouette * 0.74 + aura * 0.58 + rib + fog);
    color = std.mix(color, vec3f(0.015, 0.018, 0.026) * bri, face_void * 0.92);
    color = color + spectral * (fog + floor_mist) * 0.72;

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    let alpha = std.clamp((silhouette * 0.58 + edge * 0.24 + aura * 0.30 + fog + floor_mist * 0.55) * enabled, 0.0, 0.88);
    return vec4f(color.mul(enabled), alpha);
});

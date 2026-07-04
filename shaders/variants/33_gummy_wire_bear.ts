// @ts-nocheck
import { std } from 'typegpu';
import { vjPaletteLayout } from '../shared/layout.ts';
import { TAU, vec2f, vec3f, vec4f, f32 } from '../shared/constants.ts';
import { paletteVariantShell } from '../shared/variant_fn.ts';
import { vjDuotone, duotoneAccent } from '../shared/duotone.ts';
import { bear_rot_y, bear_model_sdf, bear_normal, bear_tri_wire_2d, bear_surface_mesh, bear_smin, bear_ellipsoid } from '../shared/bear_sdf.ts';

export const meta = { index: 33, fn: 'gummy_wire_bear_variant' } as const;

export const gummy_wire_bearVariant = paletteVariantShell((uv, time, hue_shift, pulse, energy, bass, mid, high) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const palette_rgb = vjPaletteLayout.$.palette_rgb;

  let aspect = std.max(params.w, 1.0);
    let wobble = std.sin(time * 1.15 + bass * 2.4) * 0.025;
    let spin = std.sin(time * 0.24) * 0.42 + (bass - 0.5) * 0.16;
    let ro_world = vec3f(0.0, -0.04 + wobble, 3.45);
    let rd_world = std.normalize(vec3f(uv.x * aspect * 1.02, -uv.y * 1.08 + 0.02, -2.52));
    let ro = bear_rot_y(ro_world, -spin);
    let rd = bear_rot_y(rd_world, -spin);

    let t = f32(0.0);
    let hit = f32(0.0);
    for (let i = 0; i < 72; i = i + 1) {
      const d = bear_model_sdf(ro.add(rd.mul(t)));
      if (d < 0.0035) {
        hit = f32(1.0);
        break;
      }
      t = t + std.max(d * 0.72, 0.006);
      if (t > 6.0) {
        break;
      }
    }
    const p = ro.add(rd.mul(t));

    let floor_shadow = std.exp(-std.pow((uv.x * aspect) / 0.72, 2.0) - std.pow((uv.y + 0.78) / 0.16, 2.0)) * (0.16 + bass * 0.18);
    if (hit < 0.5) {
      let bg_line = 1.0 - std.smoothstep(0.0, 0.018, std.abs(std.fract((uv.y + time * 0.04) * 10.0) - 0.5) * 2.0);
      let bg = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.16 + uv.y * 0.12, 0.45 * palette_extra.x, 0.35 * palette_extra.y);
      let enabled = std.select(1.0, 0.0, energy < 0.0);
      return vec4f(bg.mul(floor_shadow + bg_line * 0.03).mul(enabled), enabled);
    }

    let n = bear_normal(p);
    let view = std.normalize(-rd);
    let light = std.normalize(vec3f(-0.42, 0.72, 0.68));
    let half_v = std.normalize(light.add(view));
    let diff = std.max(std.dot(n, light), 0.0);
    let spec = std.pow(std.max(std.dot(n, half_v), 0.0), 44.0 + high * 38.0);
    let fresnel = std.pow(1.0 - std.clamp(std.dot(n, view), 0.0, 1.0), 2.7);
    let wire = bear_surface_mesh(p, n, pulse, high);

    let px = vec2f(p.x, p.y);
    let front = std.smoothstep(0.08, 0.28, p.z);
    let eye_l = std.exp(-std.dot((px.sub(vec2f(-0.115, 0.61))).mul(vec2f(14.0, 18.0)), (px.sub(vec2f(-0.115, 0.61))).mul(vec2f(14.0, 18.0)))) * front;
    let eye_r = std.exp(-std.dot((px.sub(vec2f(0.115, 0.61))).mul(vec2f(14.0, 18.0)), (px.sub(vec2f(0.115, 0.61))).mul(vec2f(14.0, 18.0)))) * front;
    let nose = std.exp(-std.dot((px.sub(vec2f(0.0, 0.49))).mul(vec2f(12.0, 20.0)), (px.sub(vec2f(0.0, 0.49))).mul(vec2f(12.0, 20.0)))) * std.smoothstep(0.18, 0.33, p.z);
    let mouth_curve = std.abs(std.length((px.sub(vec2f(0.0, 0.42))).mul(vec2f(2.2, 4.0))) - 0.18);
    let mouth = (1.0 - std.smoothstep(0.015, 0.035, mouth_curve)) * std.smoothstep(-0.02, 0.09, p.y - 0.34) * std.smoothstep(0.18, 0.33, p.z);
    let belly = std.exp(-std.dot((px.sub(vec2f(0.0, -0.22))).mul(vec2f(2.1, 1.45)), (px.sub(vec2f(0.0, -0.22))).mul(vec2f(2.1, 1.45)))) * std.smoothstep(0.08, 0.28, p.z);
    let toe_l = std.exp(-std.dot((px.sub(vec2f(-0.22, -1.05))).mul(vec2f(7.0, 13.0)), (px.sub(vec2f(-0.22, -1.05))).mul(vec2f(7.0, 13.0)))) * std.smoothstep(0.12, 0.28, p.z);
    let toe_r = std.exp(-std.dot((px.sub(vec2f(0.22, -1.05))).mul(vec2f(7.0, 13.0)), (px.sub(vec2f(0.22, -1.05))).mul(vec2f(7.0, 13.0)))) * std.smoothstep(0.12, 0.28, p.z);
    let face = std.clamp(eye_l + eye_r + nose + mouth * 0.75 + (toe_l + toe_r) * 0.32, 0.0, 1.0);

    let sat = std.clamp(palette_extra.x, 0.0, 1.0);
    let bri = std.clamp(palette_extra.y, 0.0, 1.0);
    let gel_base = vjDuotone(vec3f(palette_rgb.x, palette_rgb.y, palette_rgb.z), hue_shift * 0.16 + p.y * 0.16 + p.z * 0.18 + time * 0.01, 0.84 * sat, bri);
    let gel_accent = std.clamp(duotoneAccent(gel_base).add(vec3f(0.07, 0.06, 0.05)), vec3f(0.0), vec3f(1.0));
    let inner = f32(0.22) + f32(0.35) * std.exp(-t * 0.22) + belly * 0.18 + pulse * 0.08;
    let color = gel_base.mul(inner + diff * 0.62).add(gel_accent.mul(spec * 1.8 + fresnel * 0.88 + belly * 0.2));
    color = std.mix(color, gel_accent.mul(f32(1.08) + pulse * 0.22), wire);
    color = std.mix(color, vec3f(0.04, 0.03, 0.05).mul(bri), face);

    let enabled = std.select(1.0, 0.0, energy < 0.0);
    return vec4f(color.mul(enabled), enabled);
});

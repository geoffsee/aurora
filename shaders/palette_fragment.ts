import tgpu, { std } from 'typegpu';
import { BevyVertexOutput } from './shared/bevy_vertex.ts';
import { vjPaletteLayout } from './shared/layout.ts';
import { vec2f, vec4f } from './shared/constants.ts';
import { audioCurve } from './shared/duotone.ts';
import { geometryField } from './geometry_field.ts';
import {
  rehoboamVariant,
  tunnelVariant,
  glitchVariant,
  fluidVariant,
  truchetVariant,
  bass_reactorVariant,
  high_sparkVariant,
  kick_ringsVariant,
  laser_latticeVariant,
  strobe_shardsVariant,
  vortex_bloomVariant,
  crystal_coreVariant,
  bass_portalVariant,
  mercury_lakeVariant,
  iridescent_veilVariant,
  starwebVariant,
  recursive_mawVariant,
  inkbloomVariant,
  scanlab_holoVariant,
  lumen_coralVariant,
  polaris_petalsVariant,
  aurora_curtainsVariant,
  bass_monolithVariant,
  prism_tunnelVariant,
  data_rainVariant,
  solar_flareVariant,
  topo_linesVariant,
  glass_ribbonsVariant,
  gummy_wire_bearVariant,
  fierce_walking_wolfVariant,
  spectral_ghostVariant,
} from './variants/index.ts';

export const paletteFragment = tgpu.fn([BevyVertexOutput], vec4f)((frag) => {
  'use gpu';
  const params = vjPaletteLayout.$.params;
  const palette_extra = vjPaletteLayout.$.palette_extra;
  const audio_uniforms = vjPaletteLayout.$.audio_uniforms;

  const uv = frag.uv.sub(vec2f(0.5)).mul(2.0);

  const inactive = audio_uniforms.x < 0.0;
  const energy = std.select(audioCurve(audio_uniforms.x), -1.0, inactive);
  const bass = std.select(audioCurve(audio_uniforms.y), 0.0, inactive);
  const mid = std.select(audioCurve(audio_uniforms.z), 0.0, inactive);
  const high = std.select(audioCurve(audio_uniforms.w), 0.0, inactive);
  const pulse = std.select(audioCurve(palette_extra.z), 0.0, inactive);

  const time = params.y;
  const hue = params.x;
  const v = std.round(params.z);
  const layer_alpha = std.max(palette_extra.w, 0.0);

  if (v === 0.0) {
    const c = rehoboamVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 5.0) {
    const c = tunnelVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 6.0) {
    const c = glitchVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 7.0) {
    const c = fluidVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 8.0) {
    const c = truchetVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 10.0) {
    const c = bass_reactorVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 11.0) {
    const c = high_sparkVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 12.0) {
    const c = kick_ringsVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 13.0) {
    const c = laser_latticeVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 14.0) {
    const c = strobe_shardsVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 15.0) {
    const c = vortex_bloomVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 16.0) {
    const c = crystal_coreVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 17.0) {
    const c = bass_portalVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 18.0) {
    const c = mercury_lakeVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 19.0) {
    const c = iridescent_veilVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 20.0) {
    const c = starwebVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 21.0) {
    const c = recursive_mawVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 22.0) {
    const c = inkbloomVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 23.0) {
    const c = scanlab_holoVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 24.0) {
    const c = lumen_coralVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 25.0) {
    const c = polaris_petalsVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 26.0) {
    const c = aurora_curtainsVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 27.0) {
    const c = bass_monolithVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 28.0) {
    const c = prism_tunnelVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 29.0) {
    const c = data_rainVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 30.0) {
    const c = solar_flareVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 31.0) {
    const c = topo_linesVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 32.0) {
    const c = glass_ribbonsVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 33.0) {
    const c = gummy_wire_bearVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 34.0) {
    const c = fierce_walking_wolfVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }
  if (v === 35.0) {
    const c = spectral_ghostVariant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
  }

  const c = geometryField(uv, time, hue, params.z, pulse, energy, bass, mid, high);
  return vec4f(c.x, c.y, c.z, c.w * layer_alpha);
});

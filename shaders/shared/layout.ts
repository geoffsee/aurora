import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const vec4f = d.vec4f;

/** Bindings shared by vj_palette.wgsl and vj_grid.wgsl (Bevy @group(2)). */
export const vjCommonBindings = {
  params: { uniform: vec4f },
  palette_extra: { uniform: vec4f },
  audio_uniforms: { uniform: vec4f },
} as const;

export const vjPaletteLayout = tgpu.bindGroupLayout({
  ...vjCommonBindings,
  palette_rgb: { uniform: vec4f },
});

export const vjGridLayout = tgpu.bindGroupLayout({
  ...vjCommonBindings,
  grid_extra: { uniform: vec4f },
});

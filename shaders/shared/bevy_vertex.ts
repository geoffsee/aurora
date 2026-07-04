import * as d from 'typegpu/data';
import { vec2f, vec4f } from './constants.ts';

export const BevyVertexOutput = d.struct({
  position: vec4f,
  uv: vec2f,
});

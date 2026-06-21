#version 450
precision highp float;

layout(set = 2, binding = 0) uniform Params { vec4 params; };
layout(set = 2, binding = 1) uniform PaletteExtra { vec4 palette_extra; };
layout(set = 2, binding = 2) uniform AudioUniforms { vec4 audio_uniforms; };
layout(set = 2, binding = 3) uniform Reserved { vec4 _reserved; };

#define iTime (params.y)
#define iResolution (vec3(1280.0, 720.0, 1.0))
#define iMouse (vec4(0.0))
#define iFrame (int(params.y * 60.0))
#define iTimeDelta (1.0 / 60.0)
#define iFrameRate (60.0)
#define iDate (vec4(0.0))
#define iChannelTime0 (params.y)
#define iChannelTime1 (params.y)
#define iChannelTime2 (params.y)
#define iChannelTime3 (params.y)
#define iChannelResolution0 (vec3(512.0, 2.0, 1.0))
#define iChannelResolution1 (vec3(512.0, 2.0, 1.0))
#define iChannelResolution2 (vec3(512.0, 2.0, 1.0))
#define iChannelResolution3 (vec3(512.0, 2.0, 1.0))

// Array forms — Shadertoy's canonical uniforms are iChannelResolution[i] /
// iChannelTime[i], which the scalar-suffixed #defines above don't cover. These
// const arrays let shaders that index by channel compile too.
const vec3 iChannelResolution[4] = vec3[4](
  vec3(512.0, 2.0, 1.0),
  vec3(512.0, 2.0, 1.0),
  vec3(512.0, 2.0, 1.0),
  vec3(512.0, 2.0, 1.0)
);
const float iChannelTime[4] = float[4](0.0, 0.0, 0.0, 0.0);

const int iChannel0 = 0;
const int iChannel1 = 1;
const int iChannel2 = 2;
const int iChannel3 = 3;

vec4 _bevyosc_channel(int ch) {
  if (ch == 0) return vec4(audio_uniforms.y, audio_uniforms.z, audio_uniforms.w, audio_uniforms.x);
  return vec4(0.0);
}

#define texture(ch, uv)            _bevyosc_channel(ch)
#define texelFetch(ch, p, lod)     _bevyosc_channel(ch)
#define textureLod(ch, uv, lod)    _bevyosc_channel(ch)
#define texture2D(ch, uv)          _bevyosc_channel(ch)
#define textureGrad(ch, uv, dx, dy) _bevyosc_channel(ch)

// === SHADERTOY USER CODE ===
// Real Shadertoy Image-pass source, exactly as the Shadertoy API returns the
// `renderpass[].code` field for an image pass. This is the import fixture driven
// through the *real* transform pipeline (shadertoy-import.ts) by
// tests/shadertoy-import-regression.test.ts — do NOT hand-edit it to chase a
// baseline diff; a diff means the transform changed, which is the whole point.
//
// "Palette Swirl": a single-pass radial swirl over the Inigo Quilez cosine
// palette idiom. Image pass only, no iChannel inputs.
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float v = sin(8.0 * r - iTime * 1.5 + 3.0 * a);
    vec3 col = 0.5 + 0.5 * cos(iTime + vec3(0.0, 2.0, 4.0) + v + r * 6.2831853);
    col *= smoothstep(0.9, 0.2, r);
    fragColor = vec4(col, 1.0);
}

// === END USER CODE ===


layout(location = 0) out vec4 _bevyosc_frag_out;
void main() {
  vec4 color;
  mainImage(color, gl_FragCoord.xy);
  _bevyosc_frag_out = color;
}

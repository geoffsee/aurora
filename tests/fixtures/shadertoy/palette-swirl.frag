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

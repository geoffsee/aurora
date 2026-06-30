#import bevy_sprite::mesh2d_vertex_output::VertexOutput

struct Params {
    params: vec4<f32>,
}

struct PaletteExtra {
    palette_extra: vec4<f32>,
}

struct AudioUniforms {
    audio_uniforms: vec4<f32>,
}

struct Reserved {
    _reserved: vec4<f32>,
}

struct FragmentOutput {
    @location(0) _aurora_frag_out: vec4<f32>,
}

const iChannelResolution: array<vec3<f32>, 4> = array<vec3<f32>, 4>(vec3<f32>(512f, 2f, 1f), vec3<f32>(512f, 2f, 1f), vec3<f32>(512f, 2f, 1f), vec3<f32>(512f, 2f, 1f));
const iChannelTime: array<f32, 4> = array<f32, 4>(0f, 0f, 0f, 0f);
const iChannel0_: i32 = 0i;
const iChannel1_: i32 = 1i;
const iChannel2_: i32 = 2i;
const iChannel3_: i32 = 3i;

@group(2) @binding(0) 
var<uniform> global: Params;
@group(2) @binding(1) 
var<uniform> global_1: PaletteExtra;
@group(2) @binding(2) 
var<uniform> global_2: AudioUniforms;
@group(2) @binding(3) 
var<uniform> global_3: Reserved;
var<private> _aurora_frag_out: vec4<f32>;
var<private> gl_FragCoord_1: vec4<f32>;

fn _aurora_channel(ch: i32) -> vec4<f32> {
    var ch_1: i32;

    ch_1 = ch;
    let _e16 = ch_1;
    if (_e16 == 0i) {
        let _e19 = global_2.audio_uniforms;
        let _e21 = global_2.audio_uniforms;
        let _e23 = global_2.audio_uniforms;
        let _e25 = global_2.audio_uniforms;
        return vec4<f32>(_e19.y, _e21.z, _e23.w, _e25.x);
    }
    return vec4(0f);
}

fn mainImage(fragColor: ptr<function, vec4<f32>>, fragCoord: vec2<f32>) {
    var fragCoord_1: vec2<f32>;
    var uv: vec2<f32>;
    var a: f32;
    var r: f32;
    var v: f32;
    var col: vec3<f32>;

    fragCoord_1 = fragCoord;
    let _e17 = fragCoord_1;
    uv = ((_e17 - vec2<f32>(640f, 360f)) / vec2(720f));
    let _e36 = uv;
    let _e38 = uv;
    a = atan2(_e36.y, _e38.x);
    let _e42 = uv;
    r = length(_e42);
    let _e46 = r;
    let _e48 = global.params;
    let _e54 = a;
    v = sin((((8f * _e46) - (_e48.y * 1.5f)) + (3f * _e54)));
    let _e61 = global.params;
    let _e69 = v;
    let _e72 = r;
    col = (vec3(0.5f) + (0.5f * cos((((vec3(_e61.y) + vec3<f32>(0f, 2f, 4f)) + vec3(_e69)) + vec3((_e72 * 6.2831855f))))));
    let _e82 = col;
    let _e85 = r;
    col = (_e82 * smoothstep(0.9f, 0.2f, _e85));
    let _e88 = col;
    (*fragColor) = vec4<f32>(_e88.x, _e88.y, _e88.z, 1f);
    return;
}

fn main_1() {
    var color: vec4<f32>;

    let _e18 = gl_FragCoord_1;
    mainImage((&color), _e18.xy);
    let _e21 = color;
    _aurora_frag_out = _e21;
    return;
}

@fragment
fn fragment(_aurora_in: VertexOutput) -> FragmentOutput {
    let gl_FragCoord: vec4<f32> = _aurora_in.position;
    gl_FragCoord_1 = gl_FragCoord;
    main_1();
    let _e25 = _aurora_frag_out;
    return FragmentOutput(_e25);
}

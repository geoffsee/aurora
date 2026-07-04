@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let uv = (frag.uv - vec2<f32>(0.5)) * 2.0;

  // audio_uniforms.x < 0.0 means OSC is not connected; preserve the -1.0 sentinel.
  let inactive = audio_uniforms.x < 0.0;
  let energy = select(audioCurve(audio_uniforms.x), -1.0, inactive);
  let bass   = select(audioCurve(audio_uniforms.y), 0.0, inactive);
  let mid    = select(audioCurve(audio_uniforms.z), 0.0, inactive);
  let high   = select(audioCurve(audio_uniforms.w), 0.0, inactive);
  let pulse  = select(audioCurve(palette_extra.z),  0.0, inactive);

  let time = params.y;
  let hue = params.x;
  let v = i32(round(params.z));

  // layer_alpha from palette_extra.w lets the deck-GPU crossfade fade each layer
  // independently (legacy single-shader path passes 1.0).
  let layer_alpha = max(palette_extra.w, 0.0);

  if (v == 0) {
    let c = rehoboam_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 5) {
    let c = tunnel_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 6) {
    let c = glitch_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 7) {
    let c = fluid_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 8) {
    let c = truchet_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 10) {
    let c = bass_reactor_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 11) {
    let c = high_spark_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 12) {
    let c = kick_rings_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 13) {
    let c = laser_lattice_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 14) {
    let c = strobe_shards_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 15) {
    let c = vortex_bloom_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 16) {
    let c = crystal_core_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 17) {
    let c = bass_portal_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 18) {
    let c = mercury_lake_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 19) {
    let c = iridescent_veil_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 20) {
    let c = starweb_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 21) {
    let c = recursive_maw_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 22) {
    let c = inkbloom_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 23) {
    let c = scanlab_holo_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 24) {
    let c = lumen_coral_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 25) {
    let c = polaris_petals_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 26) {
    let c = aurora_curtains_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 27) {
    let c = bass_monolith_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 28) {
    let c = prism_tunnel_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 29) {
    let c = data_rain_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 30) {
    let c = solar_flare_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 31) {
    let c = topo_lines_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 32) {
    let c = glass_ribbons_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 33) {
    let c = gummy_wire_bear_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 34) {
    let c = fierce_walking_wolf_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }
  if (v == 35) {
    let c = spectral_ghost_variant(uv, time, hue, pulse, energy, bass, mid, high);
    return vec4<f32>(c.xyz, c.w * layer_alpha);
  }

  let c = geometry_field(uv, time, hue, params.z, pulse, energy, bass, mid, high);
  return vec4<f32>(c.xyz, c.w * layer_alpha);
}

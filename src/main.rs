mod engine_modules;
mod field_runtime;
mod mode_catalog;
mod mode_director;
mod mode_disposition;
mod model_layer;

use std::f32::consts::TAU;

use bevy::{
    asset::AssetMetaCheck,
    core_pipeline::tonemapping::Tonemapping,
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::{Shader, ShaderRef},
    sprite_render::{AlphaMode2d, Material2d, Material2dPlugin},
    window::{PresentMode, PrimaryWindow, WindowResolution},
    winit::WinitSettings,
};
use engine_modules::pose_for_mode as engine_pose_for_mode;
use field_runtime::{
    FieldDeck, FieldFrameInputs, FieldPool, FieldRuntime, drain_pending as drain_field_pending,
    primitive_id_for_legacy_index, queue_compiled_json,
};
use mode_catalog::VisualMode;
use mode_director::{ModeDirector, ModeDirectorInputs, resolve_director};
use model_layer::{
    ActiveModelAssetPath, ActiveModelDrive, ModelDrive, ModelInstance, ResolvedMeshAsset,
    StageHaloSection, apply_model_instance, apply_stage_halo_section, ensure_selected_model_loaded,
    handle_gltf_load_failures, resolve_mesh_layer_ref, resolve_pending_gltf_models,
    setup_model_layer,
};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Off-frame WASM/host entry: queue a `CompiledModeWire` JSON for one deck.
/// Deck: 0 = deck-a, 1 = deck-b. Returns false if deck id is invalid.
/// Parse failures are applied as no-ops inside the runtime (previous kept).
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub fn aurora_set_compiled_mode(deck: u32, json: &str) -> bool {
    queue_compiled_json(deck, json)
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscConnected)]
    fn browser_osc_connected() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscPlaying)]
    fn browser_osc_playing() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscTempo)]
    fn browser_osc_tempo() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscEnergy)]
    fn browser_osc_energy() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscDeckA)]
    fn browser_osc_deck_a() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscDeckB)]
    fn browser_osc_deck_b() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscBass)]
    fn browser_osc_bass() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscMid)]
    fn browser_osc_mid() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscHigh)]
    fn browser_osc_high() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraOscPulse)]
    fn browser_osc_pulse() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlConnected)]
    fn browser_control_connected() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCrossfade)]
    fn browser_control_crossfade() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlBpm)]
    fn browser_control_bpm() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlSpeed)]
    fn browser_control_speed() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlIntensity)]
    fn browser_control_intensity() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFeedback)]
    fn browser_control_feedback() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlDepth)]
    fn browser_control_depth() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlPalette)]
    fn browser_control_palette() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlPaletteR)]
    fn browser_control_palette_r() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlPaletteG)]
    fn browser_control_palette_g() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlPaletteB)]
    fn browser_control_palette_b() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlDeckAMode)]
    fn browser_control_deck_a_mode() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlDeckBMode)]
    fn browser_control_deck_b_mode() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlDeckAGpuShader)]
    fn browser_control_deck_a_gpu_shader() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlDeckBGpuShader)]
    fn browser_control_deck_b_gpu_shader() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlRings)]
    fn browser_control_rings() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlRingOpacity)]
    fn browser_control_ring_opacity() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlStrobe)]
    fn browser_control_strobe() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlStrobeLockout)]
    fn browser_control_strobe_lockout() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlBlackout)]
    fn browser_control_blackout() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFreeze)]
    fn browser_control_freeze() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlShowGpuPalette)]
    fn browser_control_show_gpu_palette() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCpuDeckAEnabled)]
    fn browser_control_cpu_deck_a_enabled() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCpuDeckBEnabled)]
    fn browser_control_cpu_deck_b_enabled() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlGpuDeckAEnabled)]
    fn browser_control_gpu_deck_a_enabled() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlGpuDeckBEnabled)]
    fn browser_control_gpu_deck_b_enabled() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlMaxBrightness)]
    fn browser_control_max_brightness() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFlashVersion)]
    fn browser_control_flash_version() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlResetVersion)]
    fn browser_control_reset_version() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCueVersion)]
    fn browser_control_cue_version() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCueIntensity)]
    fn browser_control_cue_intensity() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCuePalette)]
    fn browser_control_cue_palette() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCueCrossfade)]
    fn browser_control_cue_crossfade() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCueDeckAMode)]
    fn browser_control_cue_deck_a_mode() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCueDeckBMode)]
    fn browser_control_cue_deck_b_mode() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCueDeckAGpuShader)]
    fn browser_control_cue_deck_a_gpu_shader() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlCueDeckBGpuShader)]
    fn browser_control_cue_deck_b_gpu_shader() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlPaletteSaturation)]
    fn browser_control_palette_saturation() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlPaletteBrightness)]
    fn browser_control_palette_brightness() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlGridDensity)]
    fn browser_control_grid_density() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlGridDiamond)]
    fn browser_control_grid_diamond() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlGridLineWidth)]
    fn browser_control_grid_line_width() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlGridShapeMix)]
    fn browser_control_grid_shape_mix() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlActiveShader)]
    fn browser_control_active_shader() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlBeatSync)]
    fn browser_control_beat_sync() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFigureModel)]
    fn browser_control_figure_model() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFigureAssetPath)]
    fn browser_control_figure_asset_path() -> String;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFigureScale)]
    fn browser_control_figure_scale() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFigureSpin)]
    fn browser_control_figure_spin() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFigureHalo)]
    fn browser_control_figure_halo() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __auroraControlFigureAudio)]
    fn browser_control_figure_audio() -> f32;
    /// Returns and consumes the pending imported-shader WGSL string, if any.
    /// JS-side global `window.__auroraTakePendingImportedShader()` returns the
    /// WGSL source from the most recent /api/shadertoy/import response, or null.
    /// Calling it clears the JS-side slot so the same shader is not re-applied
    /// on subsequent frames.
    #[wasm_bindgen(js_namespace = window, js_name = __auroraTakePendingImportedShader)]
    fn browser_take_pending_imported_shader() -> Option<String>;
}

/// GPU material driven by the `palette` controls.
/// `params`: x=legacy hue (0..1), y=show_time (s), z=variant, w=window aspect.
/// `palette_rgb`: xyz = picked duotone base (0..1 per channel).
/// `palette_extra`: x=saturation multiplier (0..1), y=brightness multiplier (0..1), z=pulse (0..1).
/// `audio_uniforms`: x=energy (-1.0 = inactive), y=bass, z=mid, w=high (all 0..1 when active).
#[derive(AsBindGroup, Asset, TypePath, Clone)]
struct VjPaletteMaterial {
    #[uniform(0)]
    params: Vec4,
    #[uniform(1)]
    palette_extra: Vec4,
    #[uniform(2)]
    audio_uniforms: Vec4,
    /// Picked duotone base color (RGB 0..1). Shared bind-group slot with grid's
    /// `grid_extra` on the grid material — only read by palette/imported shaders.
    #[uniform(3)]
    palette_rgb: Vec4,
}

impl Material2d for VjPaletteMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/vj_palette.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

/// Second GPU shader variant — shares the palette layout plus a grid-specific `grid_extra` slot.
/// `grid_extra`: x=density (0..1), y=diamond size (0..1), z=line width (0..1), w=shape mix (0..1, 0=diamond, 1=cross).
#[derive(AsBindGroup, Asset, TypePath, Clone)]
struct VjGridMaterial {
    #[uniform(0)]
    params: Vec4,
    #[uniform(1)]
    palette_extra: Vec4,
    #[uniform(2)]
    audio_uniforms: Vec4,
    #[uniform(3)]
    grid_extra: Vec4,
}

impl Material2d for VjGridMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/vj_grid.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

/// Slot for Shadertoy-imported shaders. Same bind-group layout as the palette
/// material so the asset-driven hot-swap keeps the existing uniforms bound.
/// The WGSL at `shaders/imported.wgsl` starts as a transparent placeholder and
/// is replaced in-place via `Assets<Shader>::insert` when a new shader arrives
/// from the bridge — Bevy's `AssetEvent::Modified` then triggers a pipeline
/// rebuild without a page reload.
#[derive(AsBindGroup, Asset, TypePath, Clone)]
struct VjImportedMaterial {
    #[uniform(0)]
    params: Vec4,
    #[uniform(1)]
    palette_extra: Vec4,
    #[uniform(2)]
    audio_uniforms: Vec4,
    #[uniform(3)]
    palette_rgb: Vec4,
}

impl Material2d for VjImportedMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/imported.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

/// Pack fullscreen slot for Deck A (PR13 / #247). Independent of Deck B so
/// two packs can run different shaders simultaneously. WGSL only — GLSL is
/// compiled on the bridge (naga). Placeholder until `ActiveCompiled` carries wgsl.
#[derive(AsBindGroup, Asset, TypePath, Clone)]
struct VjPackFullscreenAMaterial {
    #[uniform(0)]
    params: Vec4,
    #[uniform(1)]
    palette_extra: Vec4,
    #[uniform(2)]
    audio_uniforms: Vec4,
    #[uniform(3)]
    palette_rgb: Vec4,
}

impl Material2d for VjPackFullscreenAMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/pack_fullscreen_a.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

/// Pack fullscreen slot for Deck B (PR13 / #247).
#[derive(AsBindGroup, Asset, TypePath, Clone)]
struct VjPackFullscreenBMaterial {
    #[uniform(0)]
    params: Vec4,
    #[uniform(1)]
    palette_extra: Vec4,
    #[uniform(2)]
    audio_uniforms: Vec4,
    #[uniform(3)]
    palette_rgb: Vec4,
}

impl Material2d for VjPackFullscreenBMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/pack_fullscreen_b.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

/// Marks the fullscreen GPU-shader quads.
/// 0 = palette, 1 = grid, 2 = imported, 10/11 = deck palette overlays,
/// 20/21 = pack fullscreen slots (deck A / deck B).
#[derive(Component)]
struct GpuShaderQuad {
    index: u32,
}

#[derive(Resource)]
struct VjPaletteHandle(Handle<VjPaletteMaterial>);

#[derive(Resource)]
struct VjGridHandle(Handle<VjGridMaterial>);

#[derive(Resource)]
struct VjImportedHandle(Handle<VjImportedMaterial>);

/// Separate handles so Deck A and Deck B can each drive their own GPU shader
/// instance while the crossfade blends the two fullscreen quads.
#[derive(Resource)]
struct VjDeckPaletteAHandle(Handle<VjPaletteMaterial>);

#[derive(Resource)]
struct VjDeckPaletteBHandle(Handle<VjPaletteMaterial>);

#[derive(Resource)]
struct VjImportedShaderHandle(Handle<Shader>);

#[derive(Resource)]
struct VjPackFullscreenAHandle(Handle<VjPackFullscreenAMaterial>);

#[derive(Resource)]
struct VjPackFullscreenBHandle(Handle<VjPackFullscreenBMaterial>);

#[derive(Resource)]
struct VjPackFullscreenAShaderHandle(Handle<Shader>);

#[derive(Resource)]
struct VjPackFullscreenBShaderHandle(Handle<Shader>);

/// Last applied pack fullscreen identity so we hot-swap WGSL only on change.
#[derive(Resource, Default)]
struct PackFullscreenApplied {
    deck_a_key: String,
    deck_b_key: String,
}

const GPU_QUAD_PACK_A: u32 = 20;
const GPU_QUAD_PACK_B: u32 = 21;

const STAGE_WIDTH: f32 = 1280.0;
const STAGE_HEIGHT: f32 = 720.0;
// #232 visual quality: slightly sparser pools for breathing room (still responsive).
const DECK_A_BEAMS: usize = 56;
const DECK_A_RINGS: usize = 7;
const DECK_B_COLS: usize = 12;
const DECK_B_ROWS: usize = 7;
const DECK_GHOSTS: usize = 14;
// Slightly calmer audio→geometry coupling (smoother motion, less jitter).
const OSC_PULSE_GAIN: f32 = 0.07;
const AUDIO_GEOMETRY_GAIN: f32 = 0.24;
// Shared calm drivers applied in update_visuals / palette_color.
const VIS_SAT_BASE: f32 = 0.66;
const VIS_SAT_INTENSITY: f32 = 0.10;
const VIS_LIGHTNESS_BASE: f32 = 0.48;
const VIS_ALPHA_ENERGY_FLOOR: f32 = 0.26;
const VIS_ALPHA_ENERGY_GAIN: f32 = 0.48;
const VIS_ALPHA_CEIL: f32 = 1.22;
const VIS_WOBBLE_FREQ: f32 = 1.55;
const VIS_WOBBLE_SEED: f32 = 6.0;
const VIS_HUE_DRIFT: f32 = 11.0;
const VIS_GHOST_ALPHA_MUL: f32 = 0.68;
const VIS_PALETTE_L_CEIL: f32 = 0.86;
const VIS_PALETTE_L_FLOOR: f32 = 0.10;
const TUNNEL_RING_COUNT: usize = 18;
const TUNNEL_DEPTH: f32 = 32.0;
const AUDIO_GATE_START: f32 = 0.001;
const AUDIO_GATE_END: f32 = 0.025;
const PULSE_ATTACK_SPEED: f32 = 24.0;
const PULSE_RELEASE_SPEED: f32 = 7.0;
const MAX_GPU_SHADER_INDEX: u32 = 36;
/// Default dual-deck borealis pair (matches SHADER_OPTIONS / gpu-shader-routing).
const DEFAULT_DECK_A_GPU_SHADER: u32 = 26;
const DEFAULT_DECK_B_GPU_SHADER: u32 = 36;
/// UI picker index for the Shadertoy imported slot (prepended to SHADER_OPTIONS).
const GPU_SHADER_IMPORTED_UI_INDEX: u32 = 0;
/// UI picker index for the grid material slot.
const GPU_SHADER_GRID_UI_INDEX: u32 = 5;
/// UI picker index for Topo Lines (solo GPU path hides CPU geometry).
const GPU_SHADER_TOPO_LINES_UI_INDEX: u32 = 31;

/// Map control-state picker index → palette shader `params.z` variant id.
fn palette_variant_from_ui(ui: u32) -> f32 {
    if ui == GPU_SHADER_IMPORTED_UI_INDEX {
        return 0.0;
    }
    if ui >= 10 {
        return ui as f32;
    }
    (ui - 1) as f32
}

/// Route a UI picker index to a GPU quad (0=palette, 1=grid, 2=imported) and palette variant.
fn resolve_gpu_shader(ui: u32) -> (u32, f32) {
    if ui == GPU_SHADER_IMPORTED_UI_INDEX {
        (2, 0.0)
    } else if ui == GPU_SHADER_GRID_UI_INDEX {
        (1, 0.0)
    } else {
        (0, palette_variant_from_ui(ui))
    }
}

fn main() {
    App::new()
        .insert_resource(ClearColor(Color::BLACK))
        .insert_resource(WinitSettings::continuous())
        .insert_resource(VjState::default())
        .insert_resource(ModeDirector::default())
        .insert_resource(FieldRuntime::default())
        .insert_resource(ActiveModelDrive::default())
        .insert_resource(ActiveModelAssetPath::default())
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "aurora VJ".into(),
                        canvas: Some("#bevy-canvas".into()),
                        resolution: WindowResolution::new(1280, 720).with_scale_factor_override(1.0),
                        fit_canvas_to_parent: true,
                        prevent_default_event_handling: true,
                        present_mode: PresentMode::AutoVsync,
                        ..default()
                    }),
                    ..default()
                })
                // Web/bridge does not ship `.meta` sidecars; skip the 404 fetch storm.
                .set(AssetPlugin {
                    meta_check: AssetMetaCheck::Never,
                    ..default()
                }),
        )
        .add_plugins(Material2dPlugin::<VjPaletteMaterial>::default())
        .add_plugins(Material2dPlugin::<VjGridMaterial>::default())
        .add_plugins(Material2dPlugin::<VjImportedMaterial>::default())
        .add_plugins(Material2dPlugin::<VjPackFullscreenAMaterial>::default())
        .add_plugins(Material2dPlugin::<VjPackFullscreenBMaterial>::default())
        .insert_resource(PackFullscreenApplied::default())
        .add_systems(Startup, (setup, setup_model_layer))
        .add_systems(
            Update,
            (
                read_osc_inputs,
                keyboard_controls,
                advance_clock,
                // Drain compiled mesh/field wires before ModeDirector + model drive.
                drain_field_runtime,
                update_mode_director,
                apply_pack_fullscreen_shaders,
                update_visuals,
                update_tunnel_rings,
                sync_model_drive,
                handle_gltf_load_failures,
                ensure_selected_model_loaded,
                resolve_pending_gltf_models,
                update_model_instances,
                update_palette_material,
                consume_pending_imported_shader,
                debug_inject_imported_shader,
                fit_gpu_quads_to_window,
            )
                .chain(),
        )
        .run();
}

#[derive(Resource)]
struct VjState {
    crossfade: f32,
    bpm: f32,
    speed: f32,
    intensity: f32,
    feedback: f32,
    depth: f32,
    palette: f32,
    palette_r: f32,
    palette_g: f32,
    palette_b: f32,
    palette_saturation: f32,
    palette_brightness: f32,
    grid_density: f32,
    grid_diamond: f32,
    grid_line_width: f32,
    grid_shape_mix: f32,
    deck_a_mode: VisualMode,
    deck_b_mode: VisualMode,
    deck_a_gpu_shader: u32,
    deck_b_gpu_shader: u32,
    rings_enabled: bool,
    ring_opacity: f32,
    strobe: bool,
    strobe_lockout: bool,
    blackout: bool,
    freeze: bool,
    show_gpu_palette: bool,
    cpu_deck_a_enabled: bool,
    cpu_deck_b_enabled: bool,
    gpu_deck_a_enabled: bool,
    gpu_deck_b_enabled: bool,
    max_brightness: f32,
    show_time: f32,
    flash: f32,
    cue_boost: f32,
    osc_connected: bool,
    osc_playing: bool,
    osc_energy: f32,
    osc_deck_a: f32,
    osc_deck_b: f32,
    osc_bass: f32,
    osc_mid: f32,
    osc_high: f32,
    bass_activity: f32,
    melodic_activity: f32,
    osc_pulse: f32,
    last_control_flash_version: u32,
    last_control_reset_version: u32,
    last_control_cue_version: u32,
    active_shader: u32,
    beat_sync: bool,
    /// Catalog index for the active Figure mesh (`MODEL_CATALOG`).
    figure_model: i32,
    /// Optional remote HTTP(S) glTF/GLB URL; empty uses the catalog.
    figure_asset_path: String,
    figure_scale: f32,
    figure_spin: f32,
    figure_halo: f32,
    figure_audio: f32,
}

impl Default for VjState {
    fn default() -> Self {
        Self {
            crossfade: 0.5,
            bpm: 124.0,
            speed: 1.0,
            intensity: 0.82,
            feedback: 0.35,
            depth: 0.0,
            // Cool aurora-green base; crown shader adds magenta tips on Deck B.
            palette: 0.38,
            palette_r: 0.12,
            palette_g: 0.72,
            palette_b: 0.42,
            // #232: slightly lower sat/bright defaults — avoid neon clip, keep blacks.
            palette_saturation: 0.82,
            palette_brightness: 0.86,
            grid_density: 0.5,
            grid_diamond: 0.5,
            grid_line_width: 0.5,
            grid_shape_mix: 0.5,
            deck_a_mode: VisualMode::Beams,
            deck_b_mode: VisualMode::Tunnel,
            deck_a_gpu_shader: DEFAULT_DECK_A_GPU_SHADER,
            deck_b_gpu_shader: DEFAULT_DECK_B_GPU_SHADER,
            rings_enabled: false,
            ring_opacity: 0.35,
            strobe: false,
            strobe_lockout: false,
            blackout: false,
            freeze: false,
            // Dual GPU decks on by default: Aurora Curtains × Aurora Crown.
            show_gpu_palette: true,
            cpu_deck_a_enabled: false,
            cpu_deck_b_enabled: false,
            gpu_deck_a_enabled: true,
            gpu_deck_b_enabled: true,
            max_brightness: 0.88,
            show_time: 0.0,
            flash: 0.0,
            cue_boost: 0.0,
            osc_connected: false,
            osc_playing: false,
            osc_energy: 0.0,
            osc_deck_a: 0.0,
            osc_deck_b: 0.0,
            osc_bass: 0.0,
            osc_mid: 0.0,
            osc_high: 0.0,
            bass_activity: 0.0,
            melodic_activity: 0.0,
            osc_pulse: 0.0,
            last_control_flash_version: 0,
            last_control_reset_version: 0,
            last_control_cue_version: 0,
            active_shader: DEFAULT_DECK_A_GPU_SHADER,
            beat_sync: true,
            figure_model: 0,
            figure_asset_path: String::new(),
            figure_scale: 1.0,
            figure_spin: 0.35,
            figure_halo: 0.75,
            figure_audio: 1.0,
        }
    }
}

#[derive(Clone, Copy)]
enum Deck {
    A,
    B,
}

#[derive(Clone, Copy)]
enum VisualKind {
    Beam,
    Ring,
    Tile,
    Ghost,
}

#[derive(Component)]
struct VisualElement {
    deck: Deck,
    kind: VisualKind,
    index: usize,
    col: usize,
    row: usize,
    seed: f32,
}

#[derive(Component)]
struct TunnelRing {
    lane: usize,
}

#[allow(clippy::too_many_arguments)]
fn setup(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
    mut standard_materials: ResMut<Assets<StandardMaterial>>,
    mut palette_materials: ResMut<Assets<VjPaletteMaterial>>,
    mut grid_materials: ResMut<Assets<VjGridMaterial>>,
    mut imported_materials: ResMut<Assets<VjImportedMaterial>>,
    mut pack_a_materials: ResMut<Assets<VjPackFullscreenAMaterial>>,
    mut pack_b_materials: ResMut<Assets<VjPackFullscreenBMaterial>>,
) {
    commands.spawn(Camera2d);

    commands.spawn((
        Camera3d::default(),
        Camera {
            order: 1,
            clear_color: ClearColorConfig::None,
            ..default()
        },
        Tonemapping::None,
        Transform::from_xyz(0.0, 0.0, 6.0).looking_at(Vec3::new(0.0, 0.0, -1.0), Vec3::Y),
    ));

    let quad = meshes.add(Rectangle::default());
    // Rings render as a thin annulus. Keep it restrained; a thick, bright ring
    // reads like a target overlay rather than part of the visual texture.
    let ring_mesh = meshes.add(Annulus::new(0.94, 1.0));
    let torus = meshes.add(Torus {
        minor_radius: 0.035,
        major_radius: 1.0,
    });
    let transparent = Color::BLACK.with_alpha(0.0);

    for lane in 0..TUNNEL_RING_COUNT {
        let phase = lane as f32 / TUNNEL_RING_COUNT as f32;
        commands.spawn((
            Mesh3d(torus.clone()),
            MeshMaterial3d(standard_materials.add(StandardMaterial {
                base_color: Color::BLACK.with_alpha(0.0),
                unlit: true,
                alpha_mode: AlphaMode::Blend,
                ..default()
            })),
            Transform::from_xyz(0.0, 0.0, -(1.0 - phase) * TUNNEL_DEPTH),
            Visibility::Hidden,
            TunnelRing { lane },
        ));
    }

    commands.spawn((
        Mesh2d(quad.clone()),
        MeshMaterial2d(materials.add(Color::BLACK)),
        Transform::from_xyz(0.0, 0.0, -20.0).with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
    ));

    for index in 0..DECK_A_BEAMS {
        commands.spawn((
            Mesh2d(quad.clone()),
            MeshMaterial2d(materials.add(transparent)),
            Transform::from_xyz(0.0, 0.0, 0.0),
            VisualElement {
                deck: Deck::A,
                kind: VisualKind::Beam,
                index,
                col: 0,
                row: 0,
                seed: index as f32 * 0.137,
            },
        ));
    }

    for index in 0..DECK_A_RINGS {
        commands.spawn((
            Mesh2d(ring_mesh.clone()),
            MeshMaterial2d(materials.add(transparent)),
            Transform::from_xyz(0.0, 0.0, 2.0 + index as f32 * 0.01),
            VisualElement {
                deck: Deck::A,
                kind: VisualKind::Ring,
                index,
                col: 0,
                row: 0,
                seed: index as f32 * 0.73,
            },
        ));
    }

    for row in 0..DECK_B_ROWS {
        for col in 0..DECK_B_COLS {
            let index = row * DECK_B_COLS + col;
            commands.spawn((
                Mesh2d(quad.clone()),
                MeshMaterial2d(materials.add(transparent)),
                Transform::from_xyz(0.0, 0.0, 4.0 + index as f32 * 0.001),
                VisualElement {
                    deck: Deck::B,
                    kind: VisualKind::Tile,
                    index,
                    col,
                    row,
                    seed: index as f32 * 0.317,
                },
            ));
        }
    }

    for index in 0..DECK_GHOSTS {
        commands.spawn((
            Mesh2d(quad.clone()),
            MeshMaterial2d(materials.add(transparent)),
            Transform::from_xyz(0.0, 0.0, -5.0 + index as f32 * 0.002),
            VisualElement {
                deck: if index % 2 == 0 { Deck::A } else { Deck::B },
                kind: VisualKind::Ghost,
                index,
                col: 0,
                row: 0,
                seed: index as f32 * 0.41,
            },
        ));
    }

    let gpu_mat = palette_materials.add(VjPaletteMaterial {
        params: Vec4::ZERO,
        palette_extra: Vec4::new(1.0, 1.0, 0.0, 0.0),
        audio_uniforms: Vec4::new(-1.0, 0.0, 0.0, 0.0),
        palette_rgb: Vec4::new(61.0 / 255.0, 90.0 / 255.0, 128.0 / 255.0, 0.0),
    });
    commands.insert_resource(VjPaletteHandle(gpu_mat.clone()));
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(gpu_mat),
        Transform::from_xyz(0.0, 0.0, -15.0).with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
        Visibility::Inherited,
        GpuShaderQuad { index: 0 },
    ));

    let grid_mat = grid_materials.add(VjGridMaterial {
        params: Vec4::ZERO,
        palette_extra: Vec4::new(1.0, 1.0, 0.0, 0.0),
        audio_uniforms: Vec4::new(-1.0, 0.0, 0.0, 0.0),
        grid_extra: Vec4::new(0.5, 0.5, 0.5, 0.5),
    });
    commands.insert_resource(VjGridHandle(grid_mat.clone()));
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(grid_mat),
        Transform::from_xyz(0.0, 0.0, -15.0).with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
        Visibility::Hidden,
        GpuShaderQuad { index: 1 },
    ));

    // Imported (Shadertoy) shader slot — placeholder asset; mutated in place at
    // runtime via Assets<Shader>::insert when the bridge delivers a new WGSL.
    let imported_mat = imported_materials.add(VjImportedMaterial {
        params: Vec4::ZERO,
        palette_extra: Vec4::new(1.0, 1.0, 0.0, 0.0),
        audio_uniforms: Vec4::new(-1.0, 0.0, 0.0, 0.0),
        palette_rgb: Vec4::new(61.0 / 255.0, 90.0 / 255.0, 128.0 / 255.0, 0.0),
    });
    commands.insert_resource(VjImportedHandle(imported_mat.clone()));
    let imported_shader: Handle<Shader> = asset_server.load("shaders/imported.wgsl");
    commands.insert_resource(VjImportedShaderHandle(imported_shader));
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(imported_mat),
        Transform::from_xyz(0.0, 0.0, -15.0).with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
        Visibility::Hidden,
        GpuShaderQuad { index: 2 },
    ));

    // Deck A/B GPU layers: two independent palette quads so crossfade can blend
    // two different GPU shaders (one per deck) just like the CPU geometry decks.
    let deck_mat_a = palette_materials.add(VjPaletteMaterial {
        params: Vec4::ZERO,
        palette_extra: Vec4::new(1.0, 1.0, 0.0, 1.0),
        audio_uniforms: Vec4::new(-1.0, 0.0, 0.0, 0.0),
        palette_rgb: Vec4::new(61.0 / 255.0, 90.0 / 255.0, 128.0 / 255.0, 0.0),
    });
    commands.insert_resource(VjDeckPaletteAHandle(deck_mat_a.clone()));
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(deck_mat_a),
        Transform::from_xyz(0.0, 0.0, -15.5).with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
        Visibility::Hidden,
        GpuShaderQuad { index: 10 },
    ));

    let deck_mat_b = palette_materials.add(VjPaletteMaterial {
        params: Vec4::ZERO,
        palette_extra: Vec4::new(1.0, 1.0, 0.0, 1.0),
        audio_uniforms: Vec4::new(-1.0, 0.0, 0.0, 0.0),
        palette_rgb: Vec4::new(61.0 / 255.0, 90.0 / 255.0, 128.0 / 255.0, 0.0),
    });
    commands.insert_resource(VjDeckPaletteBHandle(deck_mat_b.clone()));
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(deck_mat_b),
        Transform::from_xyz(0.0, 0.0, -15.6).with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
        Visibility::Hidden,
        GpuShaderQuad { index: 11 },
    ));

    // Pack fullscreen slots (PR13): one independent material per deck for
    // bridge-compiled pack WGSL. Indices 20/21; hot-swapped from ActiveCompiled.
    let pack_a_mat = pack_a_materials.add(VjPackFullscreenAMaterial {
        params: Vec4::ZERO,
        palette_extra: Vec4::new(1.0, 1.0, 0.0, 1.0),
        audio_uniforms: Vec4::new(-1.0, 0.0, 0.0, 0.0),
        palette_rgb: Vec4::new(61.0 / 255.0, 90.0 / 255.0, 128.0 / 255.0, 0.0),
    });
    commands.insert_resource(VjPackFullscreenAHandle(pack_a_mat.clone()));
    let pack_a_shader: Handle<Shader> = asset_server.load("shaders/pack_fullscreen_a.wgsl");
    commands.insert_resource(VjPackFullscreenAShaderHandle(pack_a_shader));
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(pack_a_mat),
        Transform::from_xyz(0.0, 0.0, -15.7).with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
        Visibility::Hidden,
        GpuShaderQuad {
            index: GPU_QUAD_PACK_A,
        },
    ));

    let pack_b_mat = pack_b_materials.add(VjPackFullscreenBMaterial {
        params: Vec4::ZERO,
        palette_extra: Vec4::new(1.0, 1.0, 0.0, 1.0),
        audio_uniforms: Vec4::new(-1.0, 0.0, 0.0, 0.0),
        palette_rgb: Vec4::new(61.0 / 255.0, 90.0 / 255.0, 128.0 / 255.0, 0.0),
    });
    commands.insert_resource(VjPackFullscreenBHandle(pack_b_mat.clone()));
    let pack_b_shader: Handle<Shader> = asset_server.load("shaders/pack_fullscreen_b.wgsl");
    commands.insert_resource(VjPackFullscreenBShaderHandle(pack_b_shader));
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(pack_b_mat),
        Transform::from_xyz(0.0, 0.0, -15.8).with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
        Visibility::Hidden,
        GpuShaderQuad {
            index: GPU_QUAD_PACK_B,
        },
    ));

    // The control surface now lives on port 3001, so the projector output has no HUD.
}

fn model_drive_from_state(state: &VjState) -> ModelDrive {
    ModelDrive {
        show_time: state.show_time,
        intensity: state.intensity,
        blackout: state.blackout,
        freeze: state.freeze,
        crossfade: state.crossfade,
        deck_a_mode: state.deck_a_mode.as_control(),
        deck_b_mode: state.deck_b_mode.as_control(),
        bass: state.osc_bass,
        mid: state.osc_mid,
        high: state.osc_high,
        energy: state.osc_energy,
        pulse: state.osc_pulse,
        figure_model: state.figure_model,
        figure_scale: state.figure_scale,
        figure_spin: state.figure_spin,
        figure_halo: state.figure_halo,
        figure_audio: state.figure_audio,
    }
}

/// Pick which deck's compiled mesh layer drives the single model stage.
///
/// When both decks want mesh, prefer the crossfade-dominant side. Soft:
/// missing/unresolved layers return `None` so the UI catalog path stays.
fn pick_compiled_mesh_deck(
    field_runtime: &FieldRuntime,
    crossfade: f32,
    deck_a_mode: VisualMode,
    deck_b_mode: VisualMode,
) -> Option<FieldDeck> {
    let a_wants = deck_a_mode == VisualMode::Figure
        || field_runtime.is_mesh_primary(FieldDeck::A)
        || field_runtime.primary_mesh_layer(FieldDeck::A).is_some();
    let b_wants = deck_b_mode == VisualMode::Figure
        || field_runtime.is_mesh_primary(FieldDeck::B)
        || field_runtime.primary_mesh_layer(FieldDeck::B).is_some();
    match (a_wants, b_wants) {
        (true, true) => {
            if crossfade >= 0.5 {
                Some(FieldDeck::B)
            } else {
                Some(FieldDeck::A)
            }
        }
        (true, false) => Some(FieldDeck::A),
        (false, true) => Some(FieldDeck::B),
        (false, false) => None,
    }
}

/// Apply pack/catalog mesh from ActiveCompiled onto drive + asset path.
/// UI `figure_asset_path` always wins when non-empty (operator remote override).
fn apply_compiled_mesh_to_drive(
    field_runtime: &FieldRuntime,
    state: &VjState,
    drive: &mut ModelDrive,
    asset_path: &mut String,
) {
    if !asset_path.is_empty() {
        // Explicit remote override from controls — do not clobber.
        return;
    }
    let Some(deck) = pick_compiled_mesh_deck(
        field_runtime,
        state.crossfade,
        state.deck_a_mode,
        state.deck_b_mode,
    ) else {
        return;
    };
    let Some(active) = field_runtime.active(deck) else {
        return;
    };
    let Some(layer) = active.mesh_layers.first() else {
        return;
    };
    match resolve_mesh_layer_ref(&layer.ref_id, &active.asset_base) {
        ResolvedMeshAsset::Catalog { index } => {
            drive.figure_model = index as i32;
            // Leave asset_path empty so catalog asset_path is used.
        }
        ResolvedMeshAsset::Path(path) => {
            *asset_path = path;
        }
        ResolvedMeshAsset::Unresolved => {
            // Soft fail: keep previous UI figure_model / empty path (no panic).
        }
    }
}

/// Publish VJ control state into the model layer before lazy-load / apply systems.
fn sync_model_drive(
    state: Res<VjState>,
    field_runtime: Res<FieldRuntime>,
    mut drive: ResMut<ActiveModelDrive>,
    mut asset_path: ResMut<ActiveModelAssetPath>,
) {
    let mut drive_val = model_drive_from_state(&state);
    let mut path = state.figure_asset_path.clone();
    apply_compiled_mesh_to_drive(&field_runtime, &state, &mut drive_val, &mut path);
    drive.0 = drive_val;
    asset_path.0 = path;
}

/// Drive glTF model instances + the invisible sectional stage-halo lights.
fn update_model_instances(
    drive: Res<ActiveModelDrive>,
    mut models: Query<(&ModelInstance, &mut Transform, &mut Visibility)>,
    mut halo: Query<(&StageHaloSection, &mut SpotLight)>,
) {
    let drive = drive.0;
    for (instance, mut transform, mut visibility) in &mut models {
        apply_model_instance(drive, instance, &mut transform, &mut visibility);
    }
    for (section, mut light) in &mut halo {
        apply_stage_halo_section(drive, section, &mut light);
    }
}

/// Stretch the fullscreen GPU-shader quads to cover the whole window. The
/// Camera2d maps one world unit to one pixel, so the quads (unit `Rectangle`s)
/// must be scaled to the live window size every frame — otherwise they stay at
/// the fixed `STAGE_WIDTH`×`STAGE_HEIGHT` design resolution and leave letterbox
/// bars on any window with a different size or aspect ratio. The fragment
/// shaders sample `frag.uv` (0..1 across the quad), so stretching simply maps
/// the effect across the full viewport.
fn fit_gpu_quads_to_window(
    windows: Query<&Window, With<PrimaryWindow>>,
    mut quads: Query<&mut Transform, With<GpuShaderQuad>>,
) {
    let Ok(window) = windows.single() else {
        return;
    };
    let width = window.width().max(1.0);
    let height = window.height().max(1.0);
    for mut transform in &mut quads {
        transform.scale.x = width;
        transform.scale.y = height;
    }
}

#[cfg(target_arch = "wasm32")]
fn read_osc_inputs(time: Res<Time>, mut state: ResMut<VjState>) {
    let dt = time.delta_secs().clamp(0.0, 0.1);
    let connected = browser_osc_connected();
    state.osc_connected = connected;
    state.osc_playing = browser_osc_playing();

    let target_energy = if connected {
        soft_audio_gate(browser_osc_energy())
    } else {
        0.0
    };
    let target_deck_a = if connected {
        soft_audio_gate(browser_osc_deck_a())
    } else {
        0.0
    };
    let target_deck_b = if connected {
        soft_audio_gate(browser_osc_deck_b())
    } else {
        0.0
    };
    let target_bass = if connected {
        soft_audio_gate(browser_osc_bass())
    } else {
        0.0
    };
    let target_mid = if connected {
        soft_audio_gate(browser_osc_mid())
    } else {
        0.0
    };
    let target_high = if connected {
        soft_audio_gate(browser_osc_high())
    } else {
        0.0
    };
    let target_pulse = if connected {
        browser_osc_pulse().clamp(0.0, 1.0) * target_energy.max(target_bass)
    } else {
        0.0
    };

    let previous_bass = state.osc_bass;
    let previous_mid = state.osc_mid;
    let previous_high = state.osc_high;
    let previous_melodic = previous_mid * 0.62 + previous_high * 0.38;
    let target_melodic = target_mid * 0.62 + target_high * 0.38;
    let bass_attack = (target_bass - previous_bass).max(0.0) * 2.4;
    let melodic_attack = (target_melodic - previous_melodic).max(0.0) * 2.0;

    // Assign audio band values directly from the (now raw) browser inputs so the
    // signal remains jagged and extremely responsive. Derived activity envelopes
    // and pulse keep light smoothing for visual polish.
    state.osc_energy = target_energy;
    state.osc_deck_a = target_deck_a;
    state.osc_deck_b = target_deck_b;
    state.osc_bass = target_bass;
    state.osc_mid = target_mid;
    state.osc_high = target_high;
    state.bass_activity = smooth_signal(
        state.bass_activity,
        (target_bass * 0.72 + bass_attack).clamp(0.0, 1.0),
        dt,
        18.0,
        4.8,
    );
    state.melodic_activity = smooth_signal(
        state.melodic_activity,
        (target_melodic * 0.82 + melodic_attack).clamp(0.0, 1.0),
        dt,
        12.0,
        3.6,
    );
    state.osc_pulse = smooth_signal(
        state.osc_pulse,
        target_pulse,
        dt,
        PULSE_ATTACK_SPEED,
        PULSE_RELEASE_SPEED,
    );

    let tempo = browser_osc_tempo();
    if connected && tempo.is_finite() && tempo > 1.0 {
        state.bpm = tempo.clamp(40.0, 240.0);
    }

    if browser_control_connected() {
        let reset_version = browser_control_reset_version();
        let flash_version = browser_control_flash_version();
        let cue_version = browser_control_cue_version();
        if reset_version != state.last_control_reset_version {
            *state = VjState::default();
            state.last_control_reset_version = reset_version;
            state.last_control_flash_version = flash_version;
            state.last_control_cue_version = cue_version;
        }

        state.crossfade = browser_control_crossfade().clamp(0.0, 1.0);
        state.bpm = browser_control_bpm().clamp(40.0, 240.0);
        state.speed = browser_control_speed().clamp(0.1, 3.0);
        state.intensity = browser_control_intensity().clamp(0.05, 1.5);
        state.feedback = browser_control_feedback().clamp(0.0, 1.0);
        state.depth = browser_control_depth().clamp(0.0, 1.0);
        state.palette = browser_control_palette().clamp(0.0, 1.0);
        state.palette_r = browser_control_palette_r().clamp(0.0, 1.0);
        state.palette_g = browser_control_palette_g().clamp(0.0, 1.0);
        state.palette_b = browser_control_palette_b().clamp(0.0, 1.0);
        state.palette_saturation = browser_control_palette_saturation().clamp(0.0, 1.0);
        state.palette_brightness = browser_control_palette_brightness().clamp(0.0, 1.0);
        state.grid_density = browser_control_grid_density().clamp(0.0, 1.0);
        state.grid_diamond = browser_control_grid_diamond().clamp(0.0, 1.0);
        state.grid_line_width = browser_control_grid_line_width().clamp(0.0, 1.0);
        state.grid_shape_mix = browser_control_grid_shape_mix().clamp(0.0, 1.0);
        state.active_shader = browser_control_active_shader().min(MAX_GPU_SHADER_INDEX);
        state.beat_sync = browser_control_beat_sync();
        state.figure_model = browser_control_figure_model().round() as i32;
        state.figure_asset_path = browser_control_figure_asset_path();
        state.figure_scale = browser_control_figure_scale().clamp(0.2, 2.5);
        state.figure_spin = browser_control_figure_spin().clamp(0.0, 2.0);
        state.figure_halo = browser_control_figure_halo().clamp(0.0, 1.0);
        state.figure_audio = browser_control_figure_audio().clamp(0.0, 1.0);
        state.deck_a_mode = VisualMode::from_control(browser_control_deck_a_mode());
        state.deck_b_mode = VisualMode::from_control(browser_control_deck_b_mode());
        state.deck_a_gpu_shader = browser_control_deck_a_gpu_shader().min(MAX_GPU_SHADER_INDEX);
        state.deck_b_gpu_shader = browser_control_deck_b_gpu_shader().min(MAX_GPU_SHADER_INDEX);
        state.rings_enabled = browser_control_rings();
        state.ring_opacity = browser_control_ring_opacity().clamp(0.0, 1.0);
        state.strobe_lockout = browser_control_strobe_lockout();
        state.strobe = browser_control_strobe() && !state.strobe_lockout;
        state.blackout = browser_control_blackout();
        state.freeze = browser_control_freeze();
        state.show_gpu_palette = browser_control_show_gpu_palette();
        state.cpu_deck_a_enabled = browser_control_cpu_deck_a_enabled();
        state.cpu_deck_b_enabled = browser_control_cpu_deck_b_enabled();
        state.gpu_deck_a_enabled = browser_control_gpu_deck_a_enabled();
        state.gpu_deck_b_enabled = browser_control_gpu_deck_b_enabled();
        state.max_brightness = browser_control_max_brightness().clamp(0.0, 1.0);

        if flash_version != state.last_control_flash_version {
            state.flash = 1.0;
            state.last_control_flash_version = flash_version;
        }
        if cue_version != state.last_control_cue_version {
            state.cue_boost = 1.0;
            state.flash = state.flash.max(0.6);
            state.intensity = browser_control_cue_intensity().clamp(0.05, 1.5);
            state.palette = browser_control_cue_palette().clamp(0.0, 1.0);
            sync_palette_rgb_from_hue(&mut state);
            state.crossfade = browser_control_cue_crossfade().clamp(0.0, 1.0);
            state.deck_a_mode = VisualMode::from_control(browser_control_cue_deck_a_mode());
            state.deck_b_mode = VisualMode::from_control(browser_control_cue_deck_b_mode());
            // GPU deck shaders are not cued via dedicated cue* calls yet; fall back to live.
            // If cue GPU getters are added later, wire here symmetrically.
            state.last_control_cue_version = cue_version;
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn read_osc_inputs(_state: ResMut<VjState>) {}

/// Replaces the imported shader's asset bytes in place when JS has a new WGSL
/// pending. Bevy fires `AssetEvent::Modified` on the shader's `Handle<Shader>`,
/// which triggers a pipeline rebuild — no page reload required.
#[cfg(target_arch = "wasm32")]
fn consume_pending_imported_shader(
    handle: Res<VjImportedShaderHandle>,
    mut shaders: ResMut<Assets<Shader>>,
) {
    if let Some(wgsl) = browser_take_pending_imported_shader() {
        let shader = Shader::from_wgsl(wgsl, "shaders/imported.wgsl".to_string());
        let _ = shaders.insert(&handle.0, shader);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn consume_pending_imported_shader(
    _handle: Res<VjImportedShaderHandle>,
    _shaders: ResMut<Assets<Shader>>,
) {
}

/// Dev sanity check: press F10 to inject a known-good WGSL into the imported
/// shader slot without going through the bridge. Useful when verifying that
/// the asset hot-swap path is alive (e.g. after Bevy upgrades) even when the
/// Shadertoy API is unreachable. Also forces `active_shader = 0` so the
/// imported quad is visible.
///
/// Gated to debug builds so neither the keybind nor the embedded WGSL ship in
/// release/wasm projector builds.
#[cfg(debug_assertions)]
const DEBUG_IMPORTED_WGSL: &str = r#"#import bevy_sprite::mesh2d_vertex_output::VertexOutput

@group(2) @binding(0) var<uniform> params: vec4<f32>;
@group(2) @binding(1) var<uniform> palette_extra: vec4<f32>;
@group(2) @binding(2) var<uniform> audio_uniforms: vec4<f32>;
@group(2) @binding(3) var<uniform> _reserved: vec4<f32>;

@fragment
fn fragment(frag: VertexOutput) -> @location(0) vec4<f32> {
  let uv = frag.uv;
  let t = params.y;
  let stripe = step(0.5, fract(uv.x * 8.0 + t * 0.5));
  let r = 0.85 + 0.15 * sin(t * 3.0);
  let g = 0.10 + 0.10 * stripe;
  let b = 0.65 + 0.30 * cos(t * 2.1 + uv.y * 6.28);
  return vec4<f32>(r, g, b, 0.95);
}
"#;

#[cfg(debug_assertions)]
fn debug_inject_imported_shader(
    keys: Res<ButtonInput<KeyCode>>,
    handle: Res<VjImportedShaderHandle>,
    mut shaders: ResMut<Assets<Shader>>,
    mut state: ResMut<VjState>,
) {
    if keys.just_pressed(KeyCode::F10) {
        let shader = Shader::from_wgsl(
            DEBUG_IMPORTED_WGSL.to_string(),
            "shaders/imported.wgsl".to_string(),
        );
        let _ = shaders.insert(&handle.0, shader);
        state.active_shader = GPU_SHADER_IMPORTED_UI_INDEX;
        state.show_gpu_palette = true;
    }
}

#[cfg(not(debug_assertions))]
fn debug_inject_imported_shader() {}

fn keyboard_controls(keys: Res<ButtonInput<KeyCode>>, time: Res<Time>, mut state: ResMut<VjState>) {
    let dt = time.delta_secs();
    let fade_step = 0.85 * dt;
    let knob_step = 0.72 * dt;

    if keys.pressed(KeyCode::ArrowLeft) {
        state.crossfade = (state.crossfade - fade_step).clamp(0.0, 1.0);
    }
    if keys.pressed(KeyCode::ArrowRight) {
        state.crossfade = (state.crossfade + fade_step).clamp(0.0, 1.0);
    }
    if keys.just_pressed(KeyCode::KeyA) {
        state.crossfade = 0.0;
    }
    if keys.just_pressed(KeyCode::KeyS) {
        state.crossfade = 0.5;
    }
    if keys.just_pressed(KeyCode::KeyD) {
        state.crossfade = 1.0;
    }

    if keys.pressed(KeyCode::ArrowUp) {
        state.bpm = (state.bpm + 44.0 * dt).clamp(60.0, 190.0);
    }
    if keys.pressed(KeyCode::ArrowDown) {
        state.bpm = (state.bpm - 44.0 * dt).clamp(60.0, 190.0);
    }
    if keys.pressed(KeyCode::KeyJ) {
        state.speed = (state.speed - knob_step).clamp(0.1, 3.0);
    }
    if keys.pressed(KeyCode::KeyL) {
        state.speed = (state.speed + knob_step).clamp(0.1, 3.0);
    }
    if keys.pressed(KeyCode::KeyK) {
        state.intensity = (state.intensity - knob_step).clamp(0.05, 1.5);
    }
    if keys.pressed(KeyCode::KeyI) {
        state.intensity = (state.intensity + knob_step).clamp(0.05, 1.5);
    }
    if keys.pressed(KeyCode::BracketLeft) {
        state.feedback = (state.feedback - knob_step).clamp(0.0, 1.0);
    }
    if keys.pressed(KeyCode::BracketRight) {
        state.feedback = (state.feedback + knob_step).clamp(0.0, 1.0);
    }

    if keys.just_pressed(KeyCode::KeyQ) {
        state.palette = (state.palette - 0.025).rem_euclid(1.0);
        sync_palette_rgb_from_hue(&mut state);
    }
    if keys.just_pressed(KeyCode::KeyE) {
        state.palette = (state.palette + 0.025).rem_euclid(1.0);
        sync_palette_rgb_from_hue(&mut state);
    }
    if keys.just_pressed(KeyCode::KeyF) {
        state.flash = 1.0;
    }
    if keys.just_pressed(KeyCode::KeyG) {
        state.show_gpu_palette = !state.show_gpu_palette;
    }
    if keys.just_pressed(KeyCode::KeyT) {
        state.strobe = !state.strobe && !state.strobe_lockout;
    }
    if keys.just_pressed(KeyCode::KeyB) {
        state.blackout = !state.blackout;
    }
    if keys.just_pressed(KeyCode::Space) {
        state.freeze = !state.freeze;
    }
    if keys.just_pressed(KeyCode::KeyR) {
        *state = VjState::default();
    }
}

fn advance_clock(time: Res<Time>, mut state: ResMut<VjState>) {
    if !state.freeze {
        state.show_time += time.delta_secs() * state.speed;
    }
    state.flash = (state.flash - time.delta_secs() * 2.4).max(0.0);
    state.cue_boost = (state.cue_boost - time.delta_secs() * 1.7).max(0.0);
}

/// Resolve per-deck instrument specs + identity param packets for backends.
fn drain_field_runtime(mut runtime: ResMut<FieldRuntime>) {
    drain_field_pending(&mut runtime);
}

/// Hot-swap pack fullscreen WGSL into deck A/B material slots when ActiveCompiled changes.
/// WASM receives WGSL only (bridge naga); fail-closed on empty keeps previous pipeline.
fn apply_pack_fullscreen_shaders(
    field_runtime: Res<FieldRuntime>,
    mut applied: ResMut<PackFullscreenApplied>,
    shader_a: Option<Res<VjPackFullscreenAShaderHandle>>,
    shader_b: Option<Res<VjPackFullscreenBShaderHandle>>,
    mut shaders: ResMut<Assets<Shader>>,
) {
    // Deck A
    let key_a = match field_runtime.active(FieldDeck::A) {
        Some(a) if a.fullscreen_wgsl.as_ref().is_some_and(|s| !s.is_empty()) => {
            format!("{}:{}:{}", a.slug, a.epoch, a.fullscreen_wgsl.as_ref().map(|s| s.len()).unwrap_or(0))
        }
        _ => String::new(),
    };
    if key_a != applied.deck_a_key {
        applied.deck_a_key = key_a.clone();
        if let (Some(handle), Some(active)) = (shader_a.as_ref(), field_runtime.active(FieldDeck::A)) {
            if let Some(wgsl) = active.fullscreen_wgsl.as_ref().filter(|s| !s.is_empty()) {
                let shader = Shader::from_wgsl(wgsl.clone(), "shaders/pack_fullscreen_a.wgsl".to_string());
                let _ = shaders.insert(&handle.0, shader);
            }
        }
    }

    // Deck B
    let key_b = match field_runtime.active(FieldDeck::B) {
        Some(a) if a.fullscreen_wgsl.as_ref().is_some_and(|s| !s.is_empty()) => {
            format!("{}:{}:{}", a.slug, a.epoch, a.fullscreen_wgsl.as_ref().map(|s| s.len()).unwrap_or(0))
        }
        _ => String::new(),
    };
    if key_b != applied.deck_b_key {
        applied.deck_b_key = key_b;
        if let (Some(handle), Some(active)) = (shader_b.as_ref(), field_runtime.active(FieldDeck::B)) {
            if let Some(wgsl) = active.fullscreen_wgsl.as_ref().filter(|s| !s.is_empty()) {
                let shader = Shader::from_wgsl(wgsl.clone(), "shaders/pack_fullscreen_b.wgsl".to_string());
                let _ = shaders.insert(&handle.0, shader);
            }
        }
    }
}

fn field_deck_of(deck: Deck) -> FieldDeck {
    match deck {
        Deck::A => FieldDeck::A,
        Deck::B => FieldDeck::B,
    }
}

fn field_frame_inputs(state: &VjState, deck_drive: f32, beat: f32, beat_hit: f32, cue_hit: f32, intensity_drive: f32, motion_drive: f32) -> FieldFrameInputs {
    FieldFrameInputs {
        t: state.show_time,
        beat,
        beat_hit,
        bass: state.osc_bass.clamp(0.0, 1.0),
        mid: state.osc_mid.clamp(0.0, 1.0),
        high: state.osc_high.clamp(0.0, 1.0),
        energy: state.osc_energy.clamp(0.0, 1.0),
        pulse: state.osc_pulse.clamp(0.0, 1.0),
        intensity: state.intensity,
        depth: state.depth,
        feedback: state.feedback.clamp(0.0, 1.0),
        speed: state.speed,
        deck_drive,
        flash: state.flash,
        cue_hit,
        intensity_drive,
        motion_drive,
        bass_activity: state.bass_activity.clamp(0.0, 1.0),
        melodic_activity: state.melodic_activity.clamp(0.0, 1.0),
        osc_connected: state.osc_connected,
        beam_count: DECK_A_BEAMS as u32,
        ring_count: DECK_A_RINGS as u32,
        tile_cols: DECK_B_COLS as u32,
        tile_rows: DECK_B_ROWS as u32,
        ghost_count: DECK_GHOSTS as u32,
    }
}

fn update_mode_director(
    state: Res<VjState>,
    field_runtime: Res<FieldRuntime>,
    mut director: ResMut<ModeDirector>,
) {
    let beat = beat_phase(&state);
    *director = resolve_director(&ModeDirectorInputs {
        deck_a_mode: state.deck_a_mode,
        deck_b_mode: state.deck_b_mode,
        deck_a_mesh_primary: field_runtime.should_zero_legacy_field(FieldDeck::A),
        deck_b_mesh_primary: field_runtime.should_zero_legacy_field(FieldDeck::B),
        intensity: state.intensity,
        depth: state.depth,
        feedback: state.feedback,
        speed: state.speed,
        palette: state.palette,
        bass: state.osc_bass.clamp(0.0, 1.0),
        mid: state.osc_mid.clamp(0.0, 1.0),
        high: state.osc_high.clamp(0.0, 1.0),
        beat,
        pulse: state.osc_pulse.clamp(0.0, 1.0),
        energy: state.osc_energy.clamp(0.0, 1.0),
    });
}

fn update_visuals(
    state: Res<VjState>,
    director: Res<ModeDirector>,
    field_runtime: Res<FieldRuntime>,
    mut query: Query<(
        &VisualElement,
        &mut Transform,
        &MeshMaterial2d<ColorMaterial>,
    )>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    let t = state.show_time;
    let beat = beat_phase(&state);
    let osc_drive = state.osc_energy.clamp(0.0, 1.0);
    let bass = state.osc_bass.clamp(0.0, 1.0);
    let mid = state.osc_mid.clamp(0.0, 1.0);
    let high = state.osc_high.clamp(0.0, 1.0);
    let bass_activity = state.bass_activity.clamp(0.0, 1.0);
    let melodic_activity = state.melodic_activity.clamp(0.0, 1.0);
    let audio_active = osc_drive > 0.001 || bass > 0.001 || mid > 0.001 || high > 0.001;
    let manual_beat_hit = (1.0 - beat).powf(8.0);
    let cue_hit = state.cue_boost.powf(1.25);
    let beat_hit = (if state.osc_connected {
        musical_pulse(&state) * OSC_PULSE_GAIN
    } else {
        manual_beat_hit
    }) + cue_hit * 0.38;
    let band_drive = bass_activity * 0.46 + melodic_activity * 0.42 + osc_drive * 0.12;
    let intensity_drive =
        (state.intensity * (0.75 + band_drive * 0.95 + cue_hit * 0.55)).clamp(0.05, 2.4);
    let motion_drive = if state.osc_connected {
        (band_drive * AUDIO_GEOMETRY_GAIN).clamp(0.0, 1.0)
    } else {
        1.0
    };
    // Derive a transient-only signal for strobe: the excess of bass_activity over
    // its level-follow component. This keeps strobe flashing on kicks/hits rather
    // than staying solid during sustained bass.
    let bass_transient = (bass_activity - bass * 0.65).max(0.0);
    let strobe_alpha = if state.strobe
        && if state.osc_connected {
            // Flash on audio transients: the bass-activity envelope spikes on
            // kicks and `osc_pulse` (high-band peak) spikes on hats/snares, so
            // the strobe tracks the beat instead of sitting dark. The old
            // `osc_pulse > 0.45` gate was effectively unreachable because pulse
            // is scaled by energy/bass, so it never followed the music.
            audio_active && (bass_transient > 0.18 || state.osc_pulse > 0.28)
        } else {
            beat < 0.16
        } {
        1.0
    } else {
        0.0
    };
    for (element, mut transform, material_handle) in &mut query {
        let (deck_mix, cpu_enabled, instrument) = match element.deck {
            Deck::A => (
                1.0 - state.crossfade,
                state.cpu_deck_a_enabled,
                &director.deck_a,
            ),
            Deck::B => (state.crossfade, state.cpu_deck_b_enabled, &director.deck_b),
        };
        // ModeDirector zeros legacy_field_weight for Figure/mesh-primary and
        // fullscreen-primary (pack fullscreen / mesh own the look).
        let deck_alpha = deck_mix
            * instrument.legacy_field_weight
            * if state.blackout || !cpu_enabled {
                0.0
            } else {
                1.0
            };
        let deck_drive = match element.deck {
            Deck::A => state.osc_deck_a,
            Deck::B => state.osc_deck_b,
        }
        .clamp(0.0, 1.0);
        let deck_mode = instrument.mode;
        let reactive_gain = if state.osc_connected {
            0.55 + deck_drive * 0.95 + osc_drive * 0.25
        } else {
            1.0
        };

        let mut hue = element.seed * 360.0 + t * VIS_HUE_DRIFT;
        let mut alpha = deck_alpha * reactive_gain;
        // #232: darker base + wider range later → clearer contrast, less wash.
        let mut lightness = VIS_LIGHTNESS_BASE;
        let saturation = (VIS_SAT_BASE + intensity_drive * VIS_SAT_INTENSITY).clamp(0.35, 0.88);

        let fdeck = field_deck_of(element.deck);
        let finputs = field_frame_inputs(
            &state,
            deck_drive,
            beat,
            beat_hit,
            cue_hit,
            intensity_drive,
            motion_drive,
        );
        // Routing (PR14 / #248): FieldRuntime (0–23 + compiled) → engine_modules
        // (25–48) → hide. No residual 49-way layout match arms on the four pools.
        let field_fallback = primitive_id_for_legacy_index(deck_mode.as_control());
        let pool = match element.kind {
            VisualKind::Beam => FieldPool::Beams,
            VisualKind::Ring => FieldPool::Rings,
            VisualKind::Tile => FieldPool::Tiles,
            VisualKind::Ghost => FieldPool::Ghost,
        };

        if let Some(pose) = field_runtime.pose(
            fdeck,
            pool,
            element.index,
            element.seed,
            element.col,
            element.row,
            &finputs,
            field_fallback,
        ) {
            transform.translation = Vec3::new(pose.px, pose.py, pose.pz);
            transform.rotation = Quat::from_rotation_z(pose.rot);
            transform.scale = Vec3::new(pose.sx.max(1.0), pose.sy.max(1.0), 1.0);
            alpha *= pose.alpha.clamp(0.0, 1.5);
            hue = pose.hue;
            lightness = pose.lightness;
        } else if let Some(pose) = engine_pose_for_mode(
            deck_mode,
            pool,
            element.index,
            element.seed,
            element.col,
            element.row,
            &finputs,
        ) {
            transform.translation = Vec3::new(pose.px, pose.py, pose.pz);
            transform.rotation = Quat::from_rotation_z(pose.rot);
            transform.scale = Vec3::new(pose.sx.max(1.0), pose.sy.max(1.0), 1.0);
            alpha *= pose.alpha.clamp(0.0, 1.5);
            hue = pose.hue;
            lightness = pose.lightness;
        } else {
            // Figure/mesh/fullscreen (weight already 0) or no disposition: hide element.
            alpha = 0.0;
        }

        // Pool-specific gates (not mode layout).
        if matches!(element.kind, VisualKind::Ring) {
            alpha *= state.ring_opacity;
            if !state.rings_enabled {
                alpha = 0.0;
            }
        }

        let strobe_boost = if matches!(element.kind, VisualKind::Ring) && !state.rings_enabled {
            0.0
        } else {
            strobe_alpha * deck_alpha
        };
        // Max brightness is a crossfade-deck master (beams/tiles only). Rings, ghosts,
        // and the GPU shader layer have their own opacity/brightness controls.
        // #232: keep a soft floor so lowering max_brightness deepens blacks instead of crushing to mud.
        let crossfade_master = match element.kind {
            VisualKind::Beam | VisualKind::Tile => state.max_brightness.clamp(0.15, 1.0),
            _ => 1.0,
        };
        let alpha = ((alpha + strobe_boost) * crossfade_master).clamp(0.0, 1.0);
        let lightness = (lightness
            * match element.kind {
                VisualKind::Beam | VisualKind::Tile => 0.38 + state.max_brightness * 0.52,
                _ => 1.0,
            })
        .clamp(VIS_PALETTE_L_FLOOR, VIS_PALETTE_L_CEIL);
        if let Some(material) = materials.get_mut(&material_handle.0) {
            material.color = palette_color(
                state.palette_r,
                state.palette_g,
                state.palette_b,
                hue,
                saturation,
                lightness,
                alpha,
            );
        }
    }
}

fn update_tunnel_rings(
    state: Res<VjState>,
    mut rings: Query<(
        &TunnelRing,
        &mut Transform,
        &mut Visibility,
        &MeshMaterial3d<StandardMaterial>,
    )>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let tunnel_a = matches!(state.deck_a_mode, VisualMode::Tunnel);
    let tunnel_b = matches!(state.deck_b_mode, VisualMode::Tunnel);
    let active = (tunnel_a || tunnel_b) && !state.blackout;

    if !active {
        for (_, _, mut visibility, _) in &mut rings {
            *visibility = Visibility::Hidden;
        }
        return;
    }

    let drive = state.osc_energy.clamp(0.0, 1.0);
    let bass_activity = state.bass_activity.clamp(0.0, 1.0);
    let melodic_activity = state.melodic_activity.clamp(0.0, 1.0);
    let beat_hit = if state.osc_connected {
        state.osc_pulse.clamp(0.0, 1.0) * (bass_activity * 0.82 + drive * 0.18)
    } else {
        let beat = (state.show_time * state.bpm / 60.0).fract();
        (1.0 - beat).powf(8.0)
    };
    let rate = 0.18 + state.speed * 0.22 + drive * 0.18;
    let deck_mix = if tunnel_a && tunnel_b {
        1.0
    } else if tunnel_a {
        1.0 - state.crossfade
    } else {
        state.crossfade
    };

    for (ring, mut transform, mut visibility, material_handle) in &mut rings {
        *visibility = Visibility::Inherited;

        let phase =
            (state.show_time * rate + ring.lane as f32 / TUNNEL_RING_COUNT as f32).rem_euclid(1.0);
        let z = -(1.0 - phase) * TUNNEL_DEPTH;
        let radius = 1.5 + state.depth * 0.7 + bass_activity * 0.38 + beat_hit * 0.18;
        transform.translation = Vec3::new(0.0, 0.0, z);
        transform.scale = Vec3::splat(radius);
        transform.rotation = Quat::from_rotation_z(state.show_time * 0.4 + ring.lane as f32 * 0.6);

        let hue = (ring.lane as f32 * 18.0 + phase * 60.0).rem_euclid(360.0);
        let lightness =
            (0.45 + drive * 0.14 + melodic_activity * 0.24 + state.flash * 0.25).clamp(0.05, 0.85);
        let bell = (phase * TAU * 0.5).sin();
        let alpha =
            (bell * (0.55 + beat_hit * 0.45) * deck_mix).clamp(0.0, 1.0);

        if let Some(material) = materials.get_mut(&material_handle.0) {
            material.base_color = palette_color(
                state.palette_r,
                state.palette_g,
                state.palette_b,
                hue,
                0.85,
                lightness,
                alpha,
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn update_palette_material(
    state: Res<VjState>,
    field_runtime: Res<FieldRuntime>,
    windows: Query<&Window, With<PrimaryWindow>>,
    palette_handle: Res<VjPaletteHandle>,
    grid_handle: Res<VjGridHandle>,
    imported_handle: Res<VjImportedHandle>,
    deck_a_handle: Option<Res<VjDeckPaletteAHandle>>,
    deck_b_handle: Option<Res<VjDeckPaletteBHandle>>,
    pack_a_handle: Option<Res<VjPackFullscreenAHandle>>,
    pack_b_handle: Option<Res<VjPackFullscreenBHandle>>,
    mut palette_materials: ResMut<Assets<VjPaletteMaterial>>,
    mut grid_materials: ResMut<Assets<VjGridMaterial>>,
    mut imported_materials: ResMut<Assets<VjImportedMaterial>>,
    mut pack_a_materials: ResMut<Assets<VjPackFullscreenAMaterial>>,
    mut pack_b_materials: ResMut<Assets<VjPackFullscreenBMaterial>>,
    mut gpu_quads: Query<(&GpuShaderQuad, &mut Visibility)>,
) {
    let pack_a_active = field_runtime.fullscreen_wgsl(FieldDeck::A).is_some();
    let pack_b_active = field_runtime.fullscreen_wgsl(FieldDeck::B).is_some();
    let any_gpu_enabled = state.gpu_deck_a_enabled || state.gpu_deck_b_enabled;
    let any_pack = pack_a_active || pack_b_active;
    let active = state.osc_connected || any_gpu_enabled || any_pack;
    let energy = if active {
        state.osc_energy.max(0.0)
    } else {
        -1.0
    };
    let bass = if active { state.osc_bass.max(0.0) } else { 0.0 };
    let mid = if active { state.osc_mid.max(0.0) } else { 0.0 };
    let high = if active { state.osc_high.max(0.0) } else { 0.0 };
    let pulse = if active {
        musical_pulse(&state)
    } else {
        0.0
    };

    let aspect = windows
        .single()
        .map(|window| window.width() / window.height().max(1.0))
        .unwrap_or(STAGE_WIDTH / STAGE_HEIGHT);

    // Color picker is the GPU duotone base; params.x carries a reactive hue offset
    // (manual palette + mids/highs) for phase variation in shader variants.
    let audio_hue = if active {
        (mid * 0.62 + high * 0.38).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let display_hue = (state.palette * 0.35 + audio_hue * 0.65).rem_euclid(1.0);

    let palette_rgb = Vec4::new(
        state.palette_r,
        state.palette_g,
        state.palette_b,
        0.0,
    );
    let audio_uniforms = Vec4::new(energy, bass, mid, high);
    // GPU brightness is palette_brightness only — max_brightness is a CPU-geometry master.
    let palette_extra_base = Vec4::new(
        state.palette_saturation,
        state.palette_brightness,
        pulse,
        0.0,
    );

    let cross = state.crossfade.clamp(0.0, 1.0);
    let master = if state.blackout {
        0.0
    } else {
        state.max_brightness.clamp(0.0, 1.0)
    };
    let params_base = Vec4::new(display_hue, state.show_time, 0.0, aspect);

    // Pack fullscreen slots (indices 20/21): independent WGSL per deck, crossfaded.
    if any_pack {
        let alpha_a = if pack_a_active {
            ((1.0 - cross) * master).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let alpha_b = if pack_b_active {
            (cross * master).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let extra_a = Vec4::new(
            palette_extra_base.x,
            palette_extra_base.y,
            palette_extra_base.z,
            alpha_a,
        );
        let extra_b = Vec4::new(
            palette_extra_base.x,
            palette_extra_base.y,
            palette_extra_base.z,
            alpha_b,
        );
        if let Some(ha) = pack_a_handle.as_ref()
            && let Some(mat) = pack_a_materials.get_mut(&ha.0)
        {
            mat.params = params_base;
            mat.palette_extra = extra_a;
            mat.audio_uniforms = audio_uniforms;
            mat.palette_rgb = palette_rgb;
        }
        if let Some(hb) = pack_b_handle.as_ref()
            && let Some(mat) = pack_b_materials.get_mut(&hb.0)
        {
            mat.params = params_base;
            mat.palette_extra = extra_b;
            mat.audio_uniforms = audio_uniforms;
            mat.palette_rgb = palette_rgb;
        }
    }

    // GPU deck A/B palette overlays (indices 10/11): optional operator GPU pickers.
    if any_gpu_enabled {
        let a_var = palette_variant_from_ui(state.deck_a_gpu_shader);
        let b_var = palette_variant_from_ui(state.deck_b_gpu_shader);
        let alpha_a = if state.gpu_deck_a_enabled {
            ((1.0 - cross) * master).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let alpha_b = if state.gpu_deck_b_enabled {
            (cross * master).clamp(0.0, 1.0)
        } else {
            0.0
        };

        let params_a = Vec4::new(display_hue, state.show_time, a_var, aspect);
        let params_b = Vec4::new(display_hue, state.show_time, b_var, aspect);

        // Master alpha lives in palette_extra.w for the deck layers so each can
        // fade independently while sharing the same material type.
        let extra_a = Vec4::new(palette_extra_base.x, palette_extra_base.y, palette_extra_base.z, alpha_a);
        let extra_b = Vec4::new(palette_extra_base.x, palette_extra_base.y, palette_extra_base.z, alpha_b);

        if let Some(ha) = deck_a_handle.as_ref()
            && let Some(mat) = palette_materials.get_mut(&ha.0)
        {
            mat.params = params_a;
            mat.palette_extra = extra_a;
            mat.audio_uniforms = audio_uniforms;
            mat.palette_rgb = palette_rgb;
        }
        if let Some(hb) = deck_b_handle.as_ref()
            && let Some(mat) = palette_materials.get_mut(&hb.0)
        {
            mat.params = params_b;
            mat.palette_extra = extra_b;
            mat.audio_uniforms = audio_uniforms;
            mat.palette_rgb = palette_rgb;
        }
    }

    // Visibility: pack slots and/or GPU deck overlays; hide classic single-shader quads.
    if any_gpu_enabled || any_pack {
        for (quad, mut vis) in &mut gpu_quads {
            let show = (quad.index == 10 && state.gpu_deck_a_enabled)
                || (quad.index == 11 && state.gpu_deck_b_enabled)
                || (quad.index == GPU_QUAD_PACK_A && pack_a_active)
                || (quad.index == GPU_QUAD_PACK_B && pack_b_active);
            *vis = if show {
                Visibility::Inherited
            } else {
                Visibility::Hidden
            };
        }
        return;
    }

    // Neither GPU deck nor pack fullscreen is active — hide every GPU layer.
    let _ = (palette_handle, grid_handle, imported_handle, grid_materials, imported_materials);
    for (_, mut vis) in &mut gpu_quads {
        *vis = Visibility::Hidden;
    }
}

fn beat_phase(state: &VjState) -> f32 {
    (state.show_time * state.bpm / 60.0).fract()
}

/// Beat-aware pulse for GPU + geometry: bass-led swells when beat-sync is off,
/// kick envelopes when it is on — avoids high-transient chatter.
fn musical_pulse(state: &VjState) -> f32 {
    let bass = state.bass_activity.clamp(0.0, 1.0);
    if !state.osc_connected {
        return (1.0 - beat_phase(state)).powf(6.0);
    }
    let pulse = state.osc_pulse.clamp(0.0, 1.0);
    if state.beat_sync {
        return (pulse * (0.55 + bass * 0.45)).clamp(0.0, 1.0);
    }
    (bass * 0.78 + pulse * 0.22).clamp(0.0, 1.0)
}

fn soft_audio_gate(value: f32) -> f32 {
    let value = value.clamp(0.0, 1.0);
    let gate = ((value - AUDIO_GATE_START) / (AUDIO_GATE_END - AUDIO_GATE_START)).clamp(0.0, 1.0);
    let eased_gate = gate * gate * (3.0 - 2.0 * gate);

    value * eased_gate
}

fn smooth_signal(current: f32, target: f32, dt: f32, attack_speed: f32, release_speed: f32) -> f32 {
    let speed = if target > current {
        attack_speed
    } else {
        release_speed
    };
    let blend = 1.0 - (-speed * dt).exp();

    current + (target - current) * blend.clamp(0.0, 1.0)
}

fn palette_color(
    palette_r: f32,
    palette_g: f32,
    palette_b: f32,
    hue: f32,
    saturation: f32,
    lightness: f32,
    alpha: f32,
) -> Color {
    let phase = (hue / 360.0).fract();
    let base = Vec3::new(palette_r, palette_g, palette_b);
    let accent = duotone_accent_rgb(base);
    let mix = (phase - 0.5).abs() * 2.0;
    let rgb = base.lerp(accent, mix);
    let gray = Vec3::splat(rgb.dot(Vec3::new(0.299, 0.587, 0.114)));
    // #232: wider usable lightness range with a hard ceiling below pure white
    // so highlights keep contrast and blacks are not crushed by neon clip.
    let rgb = gray.lerp(rgb, saturation.clamp(0.0, 1.0))
        * lightness.clamp(VIS_PALETTE_L_FLOOR, VIS_PALETTE_L_CEIL);

    Color::srgba(rgb.x, rgb.y, rgb.z, alpha)
}

// Accent stays in the picked color's hue family: a brighter, slightly
// warmer tint. Rotating channels here produced jarring opposite hues
// (e.g. a purple accent from a green base), so keep it monochromatic.
fn duotone_accent_rgb(base: Vec3) -> Vec3 {
    (base * 1.35 + Vec3::splat(0.18)).clamp(Vec3::ZERO, Vec3::ONE)
}

fn sync_palette_rgb_from_hue(state: &mut VjState) {
    let rgb = hue_to_rgb(state.palette);
    state.palette_r = rgb.x;
    state.palette_g = rgb.y;
    state.palette_b = rgb.z;
}

fn hue_to_rgb(hue: f32) -> Vec3 {
    let h = hue.rem_euclid(1.0);
    let saturation = 0.72;
    let lightness = 0.52;
    let c = (1.0_f32 - (2.0_f32 * lightness - 1.0_f32).abs()) * saturation;
    let x = c * (1.0 - ((h * 6.0) % 2.0 - 1.0).abs());
    let m = lightness - c * 0.5;
    let (r, g, b) = if h < 1.0 / 6.0 {
        (c, x, 0.0)
    } else if h < 2.0 / 6.0 {
        (x, c, 0.0)
    } else if h < 3.0 / 6.0 {
        (0.0, c, x)
    } else if h < 4.0 / 6.0 {
        (0.0, x, c)
    } else if h < 5.0 / 6.0 {
        (x, 0.0, c)
    } else {
        (c, 0.0, x)
    };
    Vec3::new(r + m, g + m, b + m)
}

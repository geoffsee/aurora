mod mode_catalog;
mod mode_director;
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
use mode_catalog::VisualMode;
use mode_director::{ModeDirector, ModeDirectorInputs, resolve_director};
use model_layer::{
    ActiveModelAssetPath, ActiveModelDrive, ModelDrive, ModelInstance, StageHaloSection,
    apply_model_instance, apply_stage_halo_section, ensure_selected_model_loaded,
    handle_gltf_load_failures, resolve_pending_gltf_models, setup_model_layer,
};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

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

/// Marks the fullscreen GPU-shader quads. `index` 0 = palette material, 1 = grid material, 2 = imported.
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

const STAGE_WIDTH: f32 = 1280.0;
const STAGE_HEIGHT: f32 = 720.0;
const DECK_A_BEAMS: usize = 72;
const DECK_A_RINGS: usize = 8;
const DECK_B_COLS: usize = 14;
const DECK_B_ROWS: usize = 8;
const OSC_PULSE_GAIN: f32 = 0.08;
const AUDIO_GEOMETRY_GAIN: f32 = 0.28;
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
        .add_systems(Startup, (setup, setup_model_layer))
        .add_systems(
            Update,
            (
                read_osc_inputs,
                keyboard_controls,
                advance_clock,
                update_mode_director,
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
            palette_saturation: 0.88,
            palette_brightness: 0.92,
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
            max_brightness: 0.95,
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

    for index in 0..18 {
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

/// Publish VJ control state into the model layer before lazy-load / apply systems.
fn sync_model_drive(
    state: Res<VjState>,
    mut drive: ResMut<ActiveModelDrive>,
    mut asset_path: ResMut<ActiveModelAssetPath>,
) {
    drive.0 = model_drive_from_state(&state);
    asset_path.0.clone_from(&state.figure_asset_path);
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
fn update_mode_director(state: Res<VjState>, mut director: ResMut<ModeDirector>) {
    let beat = beat_phase(&state);
    *director = resolve_director(&ModeDirectorInputs {
        deck_a_mode: state.deck_a_mode,
        deck_b_mode: state.deck_b_mode,
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
    // Trails slider — gates the ghost layer and echo-style deck modes.
    let trail_gain = state.feedback.clamp(0.0, 1.0);
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
        // ModeDirector.legacy_field_weight is 1.0 for all modes in PR1.
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

        let mut hue = element.seed * 360.0 + t * 18.0;
        let mut alpha = deck_alpha * reactive_gain;
        let mut lightness = 0.54;
        let saturation = 0.78 + intensity_drive * 0.12;

        match element.kind {
            VisualKind::Beam => {
                // Deck A field: every mode fully owns layout (pos/rot/scale/alpha/hue).
                // Same contract as Deck B — no shared base that makes every pad identical.
                let n = DECK_A_BEAMS.max(1) as f32;
                let fraction = element.index as f32 / n;
                let layer = (element.index % 12) as f32 / 11.0;
                let seed = element.seed;
                let depth = state.depth;
                let wobble = wave(t * 2.3 + seed * 9.0);
                let field_live = if state.osc_connected {
                    (0.4 + motion_drive * 0.6 + intensity_drive * 0.12 + bass_activity * 0.15)
                        .clamp(0.4, 1.6)
                } else {
                    1.0
                };
                let energy = (intensity_drive * field_live).clamp(0.2, 2.2);

                let mut px = 0.0_f32;
                let mut py = 0.0_f32;
                let mut pz = 2.0_f32 + fraction;
                let mut rot = 0.0_f32;
                let mut sx = 6.0_f32;
                let mut sy = 200.0_f32;
                let mut mode_alpha = 1.0_f32;
                let mut mode_hue = 0.0_f32;

                match deck_mode {
                    VisualMode::Beams => {
                        let spin = t
                            * (0.18
                                + intensity_drive * 0.14
                                + deck_drive * 0.2
                                + depth * 0.15
                                + mid * 0.25
                                + high * 0.15);
                        let a = fraction * TAU + spin;
                        let r = depth * (layer - 0.5) * (130.0 + wobble * 70.0) + bass_activity * 14.0;
                        let side = depth * (wobble - 0.5) * 60.0
                            + melodic_activity * 10.0 * wave(t * 9.0 + fraction);
                        px = a.cos() * r - a.sin() * side;
                        py = a.sin() * r + a.cos() * side;
                        rot = a + depth * (layer - 0.5) * 0.28;
                        sx = 4.0
                            + 28.0 * (wobble * energy * 0.5 + beat_hit * 0.7)
                            + bass * 4.0
                            + high * wave(t * 12.0 + seed) * 2.5
                            + depth * layer * 14.0;
                        sy = 280.0
                            + 200.0 * wave(t * 1.2 + fraction * TAU * 3.0) * field_live
                            + deck_drive * 140.0
                            + bass * 50.0
                            + depth * layer * 220.0;
                        pz = 2.0 + fraction + layer * depth * 24.0;
                        mode_hue = fraction * 180.0;
                        mode_alpha = 0.85;
                    }
                    VisualMode::Tunnel => {
                        let ring = (element.index % 12) as f32;
                        let spoke = (element.index / 12) as f32;
                        let a = spoke / 6.0 * TAU + t * (0.4 + depth * 0.5);
                        let r = 50.0 + ring * 42.0 + depth * 90.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.8;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + ring * 1.5 + beat_hit * 8.0;
                        sy = 80.0 + ring * 22.0 + beat_hit * 60.0 + depth * 40.0;
                        pz = 2.0 + ring * 4.0;
                        mode_hue = 10.0 + ring * 14.0;
                        mode_alpha = 0.5 + (1.0 - ring / 12.0) * 0.5;
                    }
                    VisualMode::Burst => {
                        let a = fraction * TAU + seed * 3.0;
                        let burst = (beat_hit * 2.8 + cue_hit * 1.4).clamp(0.0, 2.5);
                        let r = 30.0 + burst * 320.0 + fraction * 100.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a;
                        sx = 6.0 + burst * 40.0;
                        sy = 40.0 + burst * 200.0 + high * 50.0;
                        mode_hue = 210.0 + burst * 45.0;
                        mode_alpha = 0.4 + burst * 0.7;
                    }
                    VisualMode::Mirror => {
                        let side = if element.index % 2 == 0 { -1.0 } else { 1.0 };
                        let a = (fraction * 0.5) * TAU + t * 0.2;
                        let r = 80.0 + layer * 200.0 + mid * 40.0;
                        px = side * (a.cos().abs() * r + 40.0);
                        py = a.sin() * r * 0.85;
                        rot = if side < 0.0 { -a } else { a };
                        sx = 6.0 + high * 12.0;
                        sy = 120.0 + energy * 160.0 + wobble * 80.0;
                        mode_hue = 130.0 + side * 40.0;
                        mode_alpha = 0.7 + high * 0.3;
                    }
                    VisualMode::Wash => {
                        let a = fraction * TAU + t * 0.08;
                        px = a.cos() * (40.0 + layer * 30.0);
                        py = (fraction - 0.5) * STAGE_HEIGHT * 0.7 + wave(t * 0.45 + fraction) * 40.0;
                        rot = 0.0;
                        sx = 200.0 + state.feedback * 280.0 + energy * 60.0;
                        sy = 18.0 + wave(t * 0.45 + fraction) * 25.0 + trail_gain * 30.0;
                        pz = -2.0 + layer * 0.5;
                        mode_hue = 30.0 + fraction * 40.0;
                        mode_alpha = 0.14 + state.feedback * 0.45 + osc_drive * 0.22;
                    }
                    VisualMode::Strobe => {
                        let a = fraction * TAU + t * 0.5;
                        let r = 70.0 + fraction * 400.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + TAU * 0.25;
                        sx = 10.0 + beat_hit * 35.0;
                        sy = 140.0 + bass_activity * 100.0;
                        let gate = if bass_activity + beat_hit > 0.38 { 1.0 } else { 0.1 };
                        mode_alpha = gate;
                        mode_hue = beat_hit * 120.0 + fraction * 60.0;
                    }
                    VisualMode::Swarm => {
                        px = (t * 1.7 + seed * 11.0).sin() * 420.0
                            + (t * 3.1 + seed * 5.0).sin() * 50.0;
                        py = (t * 2.1 + seed * 7.0).cos() * 280.0
                            + (t * 2.8 + seed * 4.0).cos() * 40.0;
                        rot = seed * 6.0 + t * 0.6;
                        sx = 6.0 + high * 14.0;
                        sy = 50.0 + energy * 90.0 + wave(t * 2.0 + seed * 5.0) * 40.0;
                        mode_hue = seed * 360.0;
                        mode_alpha = 0.75;
                    }
                    VisualMode::Orbit => {
                        let lane = (element.index % 8) as f32;
                        let a = t * (0.45 + seed * 0.4) + seed * TAU + lane * 0.2;
                        let r = 100.0 + lane * 55.0 + layer * 40.0 + bass * 50.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.75;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + mid * 8.0;
                        sy = 90.0 + energy * 80.0;
                        mode_hue = 130.0 + lane * 20.0;
                        mode_alpha = 0.85;
                    }
                    VisualMode::Pulse => {
                        let pump = (beat * TAU).sin().abs();
                        let a = fraction * TAU;
                        let r = 50.0 + fraction * 380.0 * (0.5 + pump * 0.95);
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + pump * 30.0 + beat_hit * 20.0;
                        sy = 80.0 + pump * 220.0;
                        mode_hue = 80.0 + pump * 80.0;
                        mode_alpha = 0.45 + pump * 0.6;
                    }
                    VisualMode::Spiral => {
                        let a = fraction * TAU * 4.0 + t * 0.45;
                        let r = 40.0 + fraction * 450.0 + bass * 70.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.78;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + high * 10.0;
                        sy = 100.0 + fraction * 120.0 + energy * 60.0;
                        mode_hue = 1.0 + fraction * 200.0;
                        mode_alpha = 0.8;
                    }
                    VisualMode::Ripple => {
                        let a = fraction * TAU;
                        let phase = t * (1.6 + bass * 2.0) - fraction * 10.0;
                        let wave_r = ((phase.sin() + 1.0) * 0.5) * 480.0 + 50.0;
                        px = a.cos() * wave_r;
                        py = a.sin() * wave_r * 0.72;
                        rot = a + TAU * 0.25;
                        sx = 6.0 + phase.sin().abs() * 16.0;
                        sy = 40.0 + phase.sin().abs() * 120.0;
                        mode_hue = 40.0 + phase.to_degrees() * 0.2;
                        mode_alpha = 0.35 + phase.sin().abs() * 0.65;
                    }
                    VisualMode::Shatter => {
                        let a = seed * TAU + t * (2.2 + high * 3.5);
                        let r = 100.0 + high * 320.0 + (t * 5.0 + seed * 11.0).sin().abs() * 220.0;
                        px = a.cos() * r + (t * 12.0 + seed).sin() * 60.0;
                        py = a.sin() * r * 0.7 + (t * 10.0 + seed).cos() * 50.0;
                        rot = a * 2.2 + t * 3.5;
                        sx = 4.0 + high * 22.0;
                        sy = 35.0 + high * 140.0 + beat_hit * 50.0;
                        mode_hue = seed * 200.0 + high * 90.0;
                        mode_alpha = 0.3 + high * 0.7 + beat_hit * 0.3;
                    }
                    VisualMode::Flux => {
                        let flow = wave(t * (1.0 + mid * 1.3) + fraction * 4.0);
                        px = (fraction - 0.5) * STAGE_WIDTH * 0.9 + flow * 220.0;
                        py = ((element.index % 12) as f32 / 11.0 - 0.5) * STAGE_HEIGHT * 0.85;
                        rot = flow * 0.4;
                        sx = 50.0 + mid * 70.0;
                        sy = 16.0 + energy * 28.0;
                        mode_hue = 50.0 + mid * 80.0 + flow * 40.0;
                        mode_alpha = 0.65 + mid * 0.3;
                    }
                    VisualMode::Lattice => {
                        let vertical = element.index % 2 == 0;
                        let cols = 12.0_f32;
                        let rows = 6.0_f32;
                        let c = (element.index % 12) as f32;
                        let r = (element.index / 12) as f32;
                        if vertical {
                            px = (c / (cols - 1.0) - 0.5) * STAGE_WIDTH * 0.95;
                            py = (r / rows.max(1.0) - 0.5) * STAGE_HEIGHT * 0.2;
                            rot = 0.0;
                            sx = 4.0 + beat_hit * 5.0;
                            sy = STAGE_HEIGHT * (0.55 + wobble * 0.15);
                        } else {
                            px = (c / cols - 0.5) * STAGE_WIDTH * 0.2;
                            py = (r / rows.max(1.0) - 0.5) * STAGE_HEIGHT * 0.9;
                            rot = TAU * 0.25;
                            sx = 4.0 + beat_hit * 5.0;
                            sy = STAGE_WIDTH * (0.4 + wobble * 0.1);
                        }
                        mode_hue = 62.0 + (element.index % 4) as f32 * 20.0;
                        mode_alpha = 0.75;
                    }
                    VisualMode::Drift => {
                        let a = seed * TAU + t * 0.1;
                        let r = 120.0 + fraction * 300.0;
                        px = a.cos() * r + wave(t * 0.22 + seed) * 90.0;
                        py = a.sin() * r * 0.55 + wave(t * 0.18 + seed * 2.0) * 55.0;
                        rot = a * 0.35;
                        sx = 40.0 + energy * 50.0;
                        sy = 22.0 + trail_gain * 40.0;
                        mode_hue = 32.0 + mid * 40.0;
                        mode_alpha = 0.4 + state.feedback * 0.35;
                    }
                    // Squall: diagonal rain curtains + fork lightning on hits (not generic chaos).
                    VisualMode::Storm => {
                        let wind = 0.55 + bass * 0.55 + mid * 0.25;
                        let fall = (t * (2.4 + state.speed * 0.9 + high * 1.4) + seed * 6.0).fract();
                        let lane = (fraction * 14.0 + seed * 3.0) % 1.0;
                        let is_bolt = element.index % 11 == 0;
                        if is_bolt {
                            // Fork lightning: tall jagged verticals that flash with the hit.
                            let bolt_x = (lane - 0.5) * STAGE_WIDTH * 1.05
                                + (t * 17.0 + seed * 9.0).sin() * 28.0;
                            let jag = (t * 40.0 + seed * 13.0).sin() * (18.0 + high * 30.0);
                            px = bolt_x + jag * 0.35;
                            py = (0.5 - fall) * STAGE_HEIGHT * 1.1;
                            rot = (jag * 0.02) + (seed - 0.5) * 0.25;
                            sx = 3.0 + beat_hit * 14.0 + state.osc_pulse * 10.0;
                            sy = STAGE_HEIGHT
                                * (0.35 + beat_hit * 0.55 + bass_activity * 0.25)
                                + cue_hit * 80.0;
                            mode_hue = 195.0 + high * 40.0 + beat_hit * 50.0;
                            mode_alpha = 0.08
                                + beat_hit * 0.95
                                + cue_hit * 0.7
                                + state.osc_pulse * 0.45;
                        } else {
                            // Rain: long thin streaks sweeping diagonally with wind.
                            px = (lane - 0.5) * STAGE_WIDTH * 1.15
                                + fall * wind * 220.0
                                + (seed - 0.5) * 40.0;
                            py = (0.55 - fall) * STAGE_HEIGHT * 1.25;
                            rot = -0.55 - wind * 0.35 + high * 0.1;
                            sx = 2.2 + high * 3.5 + beat_hit * 2.0;
                            sy = 70.0
                                + energy * 50.0
                                + bass * 40.0
                                + (1.0 - fall) * 60.0;
                            mode_hue = 200.0 + mid * 25.0 + layer * 20.0;
                            mode_alpha = 0.28
                                + (1.0 - fall) * 0.45
                                + high * 0.2
                                + beat_hit * 0.15;
                        }
                    }
                    VisualMode::Echo => {
                        let lag = (t * (0.5 + trail_gain) + fraction * 2.0).fract();
                        let a = fraction * TAU + t * 0.35 - lag * 2.5;
                        let r = 70.0 + fraction * 380.0 * (1.0 - lag * 0.5);
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + TAU * 0.25;
                        sx = 4.0 + (1.0 - lag) * 12.0;
                        sy = 60.0 + (1.0 - lag) * 140.0 * trail_gain.max(0.15);
                        mode_hue = lag * 100.0;
                        mode_alpha = if trail_gain > 0.02 {
                            (1.0 - lag).powf(1.5) * (0.5 + trail_gain)
                        } else {
                            0.3 + wobble * 0.4
                        };
                    }
                    VisualMode::Vortex => {
                        let pull = 0.3 + bass * 1.3 + beat_hit * 0.7;
                        let a = fraction * TAU * 3.0 + t * (2.2 + pull * 2.6);
                        let r = (450.0 - fraction * 380.0) * (1.0 - pull * 0.25).max(0.35);
                        px = a.cos() * r;
                        py = a.sin() * r * 0.75;
                        rot = a * 1.4;
                        sx = 4.0 + pull * 12.0;
                        sy = 70.0 + pull * 120.0;
                        mode_hue = a.to_degrees() * 0.5 + pull * 40.0;
                        mode_alpha = 0.55 + pull * 0.4;
                    }
                    VisualMode::Fracture => {
                        let arm = (element.index % 10) as f32;
                        let a = arm / 10.0 * TAU + high * 0.5 + beat_hit * 0.4;
                        let r = 40.0 + (element.index / 10) as f32 * 48.0 + high * 120.0;
                        px = a.cos() * r + (t * 9.0 + seed).sin() * high * 50.0;
                        py = a.sin() * r * 0.8;
                        rot = a + TAU * 0.15;
                        sx = 3.5 + high * 16.0;
                        sy = 50.0 + high * 140.0 + beat_hit * 60.0;
                        mode_hue = arm * 36.0 + high * 90.0;
                        mode_alpha = 0.4 + high * 0.55;
                    }
                    VisualMode::Nebula => {
                        let a = seed * TAU + t * 0.12;
                        let r = 50.0 + fraction * 320.0;
                        px = a.cos() * r + wave(t * 0.5 + seed) * mid * 70.0;
                        py = a.sin() * r * 0.65 + wave(t * 0.4 + seed * 2.0) * high * 50.0;
                        rot = a * 0.2;
                        sx = 60.0 + energy * 100.0 + mid * 50.0;
                        sy = 40.0 + energy * 70.0 + high * 40.0;
                        mode_hue = 20.0 + mid * 50.0;
                        mode_alpha = 0.22 + (mid + high) * 0.25 + state.feedback * 0.2;
                    }
                    VisualMode::Prism => {
                        let band = (element.index % 3) as f32 - 1.0;
                        let a = fraction * TAU + t * 0.28;
                        let r = 90.0 + fraction * 340.0;
                        px = a.cos() * r + band * (60.0 + high * 80.0);
                        py = a.sin() * r * 0.7 + band * 25.0;
                        rot = a + band * 0.2;
                        sx = 6.0 + high * 14.0;
                        sy = 70.0 + mid * 80.0 + energy * 50.0;
                        mode_hue = band * 90.0 + fraction * 140.0;
                        mode_alpha = 0.55 + high * 0.35;
                    }
                    VisualMode::Scanner => {
                        let scan = ((t * (0.5 + state.speed * 0.18 + high * 0.55) + seed).fract()
                            * 2.0)
                            - 1.0;
                        px = wave(t * 0.75 + fraction * 5.0) * STAGE_WIDTH * 0.18;
                        py = scan * STAGE_HEIGHT * 0.45 + layer * 8.0;
                        rot = if element.index % 2 == 0 { 0.0 } else { TAU * 0.25 };
                        sx = STAGE_WIDTH * (0.4 + high * 0.15);
                        sy = 8.0 + state.osc_pulse * 28.0 + beat_hit * 16.0;
                        mode_hue = 175.0 + scan * 70.0;
                        mode_alpha = 0.5 + high * 0.4 + state.osc_pulse * 0.35;
                    }
                    VisualMode::Comet => {
                        let a = t * (1.1 + bass * 2.2 + state.speed * 0.25) + fraction * TAU;
                        let r = 50.0 + fraction * 470.0 + beat_hit * 70.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.55;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + high * 10.0;
                        sy = 120.0 + bass * 180.0 + trail_gain * 120.0 + beat_hit * 60.0;
                        mode_hue = a.to_degrees() * 0.3 + bass * 55.0;
                        mode_alpha = 0.42 + bass * 0.55 + beat_hit * 0.3;
                    }
                    VisualMode::Bloom => {
                        let a = fraction * TAU + t * 0.15;
                        let bloom = wave(t * 0.35 + fraction) + beat_hit * 0.55 + cue_hit * 0.35;
                        let r = 35.0 + fraction * 300.0 * (0.7 + bloom * 0.65);
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a;
                        sx = 25.0 + bloom * 80.0 + state.feedback * 50.0;
                        sy = 55.0 + bloom * 140.0 + mid * 50.0;
                        mode_hue = 25.0 + bloom * 40.0 + mid * 35.0;
                        mode_alpha = 0.22 + bloom * 0.5 + state.feedback * 0.28;
                    }
                    VisualMode::Figure => {
                        mode_alpha = 0.0;
                    }
                    VisualMode::Hypercube => {
                        let cell = (element.index % 8) as f32;
                        let edge = (element.index / 8) as f32;
                        let a1 = t * 1.15 + cell * TAU / 8.0;
                        let a2 = t * 0.75 + edge * 0.85 + bass * 0.5;
                        let r1 = 180.0 + beat_hit * 50.0;
                        let r2 = 100.0 + mid * 45.0;
                        px = a1.cos() * r1 + a2.cos() * r2 * 0.6;
                        py = a1.sin() * r1 * 0.75 + a2.sin() * r2 * 0.5;
                        rot = a1 + a2;
                        sx = 3.5 + beat_hit * 7.0;
                        sy = 70.0 + edge * 10.0 + energy * 50.0;
                        mode_hue = cell * 40.0 + a1.to_degrees() * 0.2;
                        mode_alpha = 0.8;
                    }
                    VisualMode::CalabiYau => {
                        let a = seed * TAU + t * 0.22;
                        let lobes = 3.0 + (element.index % 5) as f32;
                        let r = 90.0
                            + (a * lobes).sin().abs() * 260.0
                            + mid * 90.0
                            + wave(t * 0.6 + seed) * 50.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + (a * lobes).cos() * 0.5;
                        sx = 12.0 + mid * 24.0;
                        sy = 50.0 + energy * 90.0 + high * 40.0;
                        mode_hue = a.to_degrees() * 0.15 + mid * 40.0;
                        mode_alpha = 0.55 + mid * 0.3 + high * 0.15;
                    }
                    VisualMode::Quasicrystal => {
                        let k = 5.0;
                        let a = fraction * TAU * k + t * 0.35;
                        let mut rx = 0.0_f32;
                        let mut ry = 0.0_f32;
                        for i in 0..5 {
                            let ang = i as f32 * TAU / k + t * 0.12;
                            let phase = (fraction * 8.0 + t + i as f32).cos();
                            rx += ang.cos() * phase;
                            ry += ang.sin() * phase;
                        }
                        px = rx * (110.0 + high * 90.0) + a.cos() * 50.0;
                        py = ry * (85.0 + high * 70.0) + a.sin() * 40.0;
                        rot = a;
                        sx = 4.0 + high * 14.0 + beat_hit * 10.0;
                        sy = 40.0 + high * 70.0 + energy * 40.0;
                        mode_hue = fraction * 200.0 + high * 60.0;
                        mode_alpha = 0.55 + high * 0.4;
                    }
                    VisualMode::PenroseTiling => {
                        let phi = 1.618_034_f32;
                        let c = (element.index % 12) as f32;
                        let r = (element.index / 12) as f32;
                        let alt = ((element.index % 2) as f32);
                        px = (c - 5.5) * 48.0 * phi.recip() * 2.0 + alt * 20.0;
                        py = (r - 3.0) * 55.0 + (1.0 - alt) * 16.0;
                        rot = alt * TAU * 0.2 + (element.index % 5) as f32 * 0.15;
                        sx = 5.0 + (element.index % 5) as f32 * 2.5;
                        sy = 70.0 + alt * 35.0 + energy * 40.0;
                        mode_hue = 62.0 + alt * 50.0;
                        mode_alpha = 0.8;
                    }
                    VisualMode::SierpinskiTriangle => {
                        let bits = element.index as u32;
                        let show = bits & (bits >> 1) == 0;
                        let mut ix = 0.0_f32;
                        let mut iy = 0.5_f32;
                        let mut n = element.index + 1;
                        for _ in 0..10 {
                            let corner = n % 3;
                            n /= 3;
                            let (cx, cy) = match corner {
                                0 => (-0.5_f32, -0.4_f32),
                                1 => (0.5_f32, -0.4_f32),
                                _ => (0.0_f32, 0.55_f32),
                            };
                            ix = (ix + cx) * 0.5;
                            iy = (iy + cy) * 0.5;
                        }
                        px = ix * STAGE_WIDTH * 0.9;
                        py = iy * STAGE_HEIGHT * 0.9;
                        rot = t * 0.25 + fraction;
                        sx = 5.0 + beat_hit * 8.0;
                        sy = 50.0 + energy * 60.0;
                        mode_hue = fraction * 90.0;
                        mode_alpha = if show { 0.9 } else { 0.0 };
                    }
                    VisualMode::TetrahedralMatrix => {
                        let elev = ((element.index % 3) as f32);
                        let a = fraction * TAU + elev * 0.8 + t * 0.28;
                        let r = 80.0 + elev * 100.0 + (element.index % 9) as f32 * 18.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7 + elev * 35.0 - 45.0;
                        pz = 2.0 + elev * 12.0;
                        rot = a + elev;
                        sx = 4.0 + elev * 2.5;
                        sy = 55.0 + elev * 25.0 + energy * 45.0;
                        mode_hue = 62.0 + elev * 35.0;
                        mode_alpha = 0.75 + elev * 0.08;
                    }
                    VisualMode::BorromeanRings => {
                        let ring = (element.index % 3) as f32;
                        let along = (element.index / 3) as f32 / 24.0 * TAU + t * (1.3 + bass);
                        let r = 160.0 + bass * 50.0;
                        let cx = (ring - 1.0) * 100.0;
                        let cy = ((ring + 1.0) % 3.0 - 1.0) * 45.0;
                        px = cx + along.cos() * r;
                        py = cy + along.sin() * r * 0.45 + (ring - 1.0) * along.sin() * 35.0;
                        rot = along + ring;
                        sx = 5.0 + beat_hit * 10.0;
                        sy = 60.0 + energy * 70.0;
                        mode_hue = ring * 100.0 + along.to_degrees() * 0.2;
                        mode_alpha = 0.75;
                    }
                    VisualMode::Torus => {
                        let major = fraction * TAU + t * 0.45;
                        let minor = (element.index as f32 * 0.65 + t * 1.3) % TAU;
                        let r_major = 200.0 + depth * 120.0;
                        let r_minor = 65.0 + bass * 45.0;
                        px = (r_major + r_minor * minor.cos()) * major.cos();
                        py = (r_major + r_minor * minor.cos()) * major.sin() * 0.55;
                        pz = 2.0 + minor.sin() * 25.0;
                        rot = major + minor;
                        sx = 4.0 + minor.cos().abs() * 7.0;
                        sy = 45.0 + r_minor * 0.45 + energy * 40.0;
                        mode_hue = 15.0 + minor.to_degrees() * 0.3;
                        mode_alpha = 0.7 + minor.cos().abs() * 0.25;
                    }
                    VisualMode::PermutationGroups => {
                        let slots = DECK_A_BEAMS.max(1);
                        let beat_step = (t * state.bpm / 60.0).floor() as usize;
                        let dest = (element.index * 11 + beat_step * 5) % slots;
                        let df = dest as f32 / n;
                        let a = df * TAU;
                        let r = 80.0 + (dest % 12) as f32 * 28.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.75;
                        rot = a + t * 0.1;
                        sx = 6.0 + beat_hit * 12.0;
                        sy = 70.0 + energy * 70.0;
                        mode_hue = dest as f32 * 4.0;
                        mode_alpha = 0.85;
                    }
                    VisualMode::SymmetryGroups => {
                        let qx = ((fraction * 2.0 - 1.0) as f32).abs();
                        let qy = ((layer * 2.0 - 1.0) as f32).abs();
                        let sx_sign = if element.index % 2 == 0 { 1.0 } else { -1.0 };
                        let sy_sign = if (element.index / 2) % 2 == 0 { 1.0 } else { -1.0 };
                        px = sx_sign * qx * STAGE_WIDTH * 0.48;
                        py = sy_sign * qy * STAGE_HEIGHT * 0.48;
                        rot = (qx + qy) * 2.5 + t * 0.35;
                        sx = 5.0 + high * 12.0;
                        sy = 80.0 + energy * 90.0;
                        mode_hue = 130.0 + qx * 80.0;
                        mode_alpha = 0.75 + high * 0.25;
                    }
                    VisualMode::LieAlgebras => {
                        let x0 = (fraction - 0.5) * STAGE_WIDTH;
                        let y0 = (layer - 0.5) * STAGE_HEIGHT;
                        let ang = t * 0.45 + y0 * 0.004 + x0 * 0.003;
                        px = x0 + ang.cos() * 55.0;
                        py = y0 + ang.sin() * 55.0;
                        rot = ang;
                        sx = 3.5;
                        sy = 55.0 + energy * 60.0 + mid * 30.0;
                        mode_hue = 140.0 + ang.to_degrees() * 0.2;
                        mode_alpha = 0.75;
                    }
                    VisualMode::LatticeTheory => {
                        let rank = element.index % 8;
                        let along = (element.index / 8) as f32 / 9.0;
                        px = (along - 0.5) * STAGE_WIDTH * 0.9;
                        py = (rank as f32 / 7.0 - 0.5) * STAGE_HEIGHT * 0.9;
                        rot = 0.0;
                        if element.index % 3 == 0 {
                            sx = 60.0 + mid * 40.0;
                            sy = 5.0;
                        } else {
                            sx = 8.0 + (rank % 3) as f32 * 4.0;
                            sy = 28.0 + energy * 35.0;
                        }
                        mode_hue = 62.0 + rank as f32 * 15.0;
                        mode_alpha = 0.8;
                    }
                    VisualMode::GraphTheory => {
                        let nodes = 16.max(1);
                        let node = element.index % nodes;
                        let a = node as f32 / nodes as f32 * TAU + t * 0.18;
                        let r = 180.0 + mid * 50.0;
                        if element.index % 3 == 0 {
                            px = a.cos() * r;
                            py = a.sin() * r * 0.75;
                            rot = 0.0;
                            sx = 14.0 + beat_hit * 12.0;
                            sy = 14.0 + beat_hit * 12.0;
                        } else {
                            let a2 = (node as f32 + 1.0 + (element.index % 5) as f32) / nodes as f32
                                * TAU
                                + t * 0.18;
                            let x1 = a.cos() * r;
                            let y1 = a.sin() * r * 0.75;
                            let x2 = a2.cos() * r;
                            let y2 = a2.sin() * r * 0.75;
                            px = (x1 + x2) * 0.5;
                            py = (y1 + y2) * 0.5;
                            rot = (y2 - y1).atan2(x2 - x1);
                            let dist = ((x2 - x1).hypot(y2 - y1)).max(1.0);
                            sx = 3.0 + high * 5.0;
                            sy = dist * 0.92;
                        }
                        mode_hue = 40.0 + node as f32 * 18.0;
                        mode_alpha = 0.7 + high * 0.3;
                    }
                    VisualMode::DesignTheory => {
                        let block = element.index % 6;
                        let bx = (block % 3) as f32 - 1.0;
                        let by = (block / 3) as f32 - 0.5;
                        px = bx * 300.0 + (fraction - 0.5) * 90.0;
                        py = by * 240.0 + (layer - 0.5) * 70.0;
                        rot = 0.0;
                        sx = 90.0 + state.feedback * 50.0;
                        sy = 20.0 + wobble * 18.0;
                        mode_hue = block as f32 * 55.0;
                        mode_alpha = 0.25 + state.feedback * 0.4 + osc_drive * 0.2;
                    }
                    VisualMode::MandelbrotSet => {
                        let a = fraction * TAU + t * 0.12;
                        let zoom = 1.0 + intensity_drive * 1.6 + bass * 0.9;
                        let r = (25.0 + (fraction * 14.0).fract() * 340.0) / zoom.sqrt()
                            + wave(t * 0.3 + fraction) * 25.0;
                        px = a.cos() * r * 1.25;
                        py = a.sin() * r * 0.95;
                        rot = a + TAU * 0.25;
                        sx = 3.5 + (1.0 - fraction) * 10.0;
                        sy = 35.0 + (1.0 - fraction) * 120.0 * energy;
                        mode_hue = 200.0 + fraction * 80.0 + mid * 40.0;
                        mode_alpha = 0.6 + (1.0 - fraction) * 0.35;
                    }
                    VisualMode::JuliaSets => {
                        let c_a = t * (0.45 + mid * 0.65);
                        let a = fraction * TAU * 2.0 + c_a;
                        let r = 70.0 + (a * 2.0 + c_a).sin().abs() * 300.0 + high * 70.0;
                        px = a.cos() * r + c_a.cos() * 50.0;
                        py = a.sin() * r * 0.7 + c_a.sin() * 35.0;
                        rot = a;
                        sx = 5.0 + high * 14.0;
                        sy = 55.0 + mid * 60.0 + energy * 50.0;
                        mode_hue = c_a.to_degrees() + fraction * 100.0;
                        mode_alpha = 0.6 + high * 0.35;
                    }
                    VisualMode::LorenzAttractor => {
                        let mut lx = 0.1 + seed * 0.4;
                        let mut ly = seed * 0.8 - 0.4;
                        let mut lz = 1.0 + fraction * 2.0;
                        let dt_l = 0.008 * (1.0 + state.speed);
                        let steps = 50 + (element.index % 25);
                        for _ in 0..steps {
                            let dx = 10.0 * (ly - lx);
                            let dy = lx * (28.0 - lz) - ly;
                            let dz = lx * ly - (8.0 / 3.0) * lz;
                            lx += dx * dt_l;
                            ly += dy * dt_l;
                            lz += dz * dt_l;
                        }
                        let spin = t * 0.55;
                        px = (lx * spin.cos() - ly * spin.sin()) * 20.0;
                        py = (lz - 25.0) * 14.0 + (lx * spin.sin() + ly * spin.cos()) * 7.0;
                        rot = ly.atan2(lx) + spin;
                        sx = 4.0 + state.osc_pulse * 10.0;
                        sy = 28.0 + energy * 45.0 + beat_hit * 25.0;
                        mode_hue = 20.0 + lz * 8.0;
                        mode_alpha = 0.6 + osc_drive * 0.35;
                    }
                    VisualMode::Functors => {
                        let left = element.index % 2 == 0;
                        let slot = ((element.index / 2) as f32) / (n * 0.5).max(1.0);
                        if element.index % 5 == 0 {
                            let y0 = (slot - 0.5) * STAGE_HEIGHT * 0.9;
                            px = 0.0;
                            py = y0 * 0.5 + wave(t * 0.8 + slot) * 12.0;
                            rot = TAU * 0.25 + (wave(t + slot) - 0.5) * 0.3;
                            sx = 4.0;
                            sy = STAGE_WIDTH * 0.3;
                            mode_hue = 100.0 + high * 40.0;
                        } else if left {
                            px = -STAGE_WIDTH * 0.34;
                            py = (slot - 0.5) * STAGE_HEIGHT * 0.9;
                            rot = 0.0;
                            sx = 12.0;
                            sy = 22.0 + energy * 14.0;
                            mode_hue = 180.0;
                        } else {
                            px = STAGE_WIDTH * 0.34;
                            py = (slot - 0.5) * STAGE_HEIGHT * 0.9 + wave(t + slot) * 25.0;
                            rot = 0.0;
                            sx = 12.0;
                            sy = 22.0 + energy * 14.0;
                            mode_hue = 40.0;
                        }
                        mode_alpha = 0.75 + high * 0.2;
                    }
                    VisualMode::ModularArithmetic => {
                        let modulus = 10 + (bass * 6.0) as i32;
                        let class = element.index as i32 % modulus;
                        let a = class as f32 / modulus as f32 * TAU - TAU * 0.25 + t * 0.06;
                        let r = 220.0 + (element.index / modulus.max(1) as usize) as f32 * 28.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.85;
                        rot = a + TAU * 0.25;
                        let lit = if class == ((t * state.bpm / 60.0) as i32).rem_euclid(modulus) {
                            1.0
                        } else {
                            0.35
                        };
                        sx = 6.0 + lit * 12.0;
                        sy = 45.0 + lit * 70.0 + energy * 30.0;
                        mode_hue = class as f32 * (360.0 / modulus as f32);
                        mode_alpha = 0.4 + lit * 0.55;
                    }
                    VisualMode::PAdicNumbers => {
                        let depth_i = (element.index % 7) as f32;
                        let a = (element.index / 7) as f32 * 0.85 + t * 0.12 * (depth_i + 1.0);
                        let r = 45.0 * 1.5_f32.powf(depth_i) + wave(t + depth_i) * 12.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.8;
                        rot = a;
                        sx = 3.0 + (6.0 - depth_i).max(0.0) * 2.5;
                        sy = 28.0 + (6.0 - depth_i).max(1.0) * 18.0 + energy * 25.0;
                        mode_hue = depth_i * 45.0;
                        mode_alpha = 0.4 + (1.0 - depth_i / 7.0) * 0.5;
                    }
                    VisualMode::VectorSpaces => {
                        let kind = element.index % 4;
                        match kind {
                            0 => {
                                px = (fraction - 0.5) * STAGE_WIDTH * 0.75;
                                py = 0.0;
                                rot = 0.0;
                                sx = 5.0;
                                sy = STAGE_WIDTH * 0.4;
                            }
                            1 => {
                                px = 0.0;
                                py = (layer - 0.5) * STAGE_HEIGHT * 0.75;
                                rot = TAU * 0.25;
                                sx = 5.0;
                                sy = STAGE_HEIGHT * 0.4;
                            }
                            _ => {
                                let shear = mid * 0.8 + wave(t * 0.5) * 0.3;
                                px = (fraction - 0.5) * STAGE_WIDTH * 0.65
                                    + (layer - 0.5) * STAGE_WIDTH * shear * 0.35;
                                py = (layer - 0.5) * STAGE_HEIGHT * 0.65;
                                rot = shear * 0.4;
                                sx = 3.5;
                                sy = 40.0 + energy * 45.0;
                            }
                        }
                        mode_hue = 20.0 + kind as f32 * 30.0;
                        mode_alpha = 0.75;
                    }
                    VisualMode::Eigenvectors => {
                        let pump = (beat * TAU).sin().abs();
                        let axis: f32 = if element.index % 2 == 0 { 0.35 } else { -0.55 };
                        let along = (fraction - 0.5) * 2.0;
                        px = along * 450.0 * axis.cos() * (0.6 + pump);
                        py = along * 320.0 * axis.sin() * (0.6 + pump);
                        rot = axis;
                        sx = 5.0 + pump * 18.0;
                        sy = 55.0 + pump * 160.0 + beat_hit * 50.0;
                        mode_hue = 80.0 + pump * 80.0;
                        mode_alpha = 0.55 + pump * 0.4;
                    }
                    VisualMode::BooleanLattices => {
                        let bit = element.index & 15;
                        let xbits = (bit & 1) as f32
                            + ((bit >> 1) & 1) as f32 * 0.5
                            + ((bit >> 2) & 1) as f32 * 0.25;
                        let ybits = ((bit >> 3) & 1) as f32
                            + ((bit >> 2) & 1) as f32 * 0.4
                            + ((bit >> 1) & 1) as f32 * 0.2;
                        px = (xbits - 0.9) * 380.0 + (fraction - 0.5) * 30.0;
                        py = (ybits - 0.5) * 300.0 + (layer - 0.5) * 30.0;
                        rot = (bit as f32) * 0.35;
                        let ones = bit.count_ones() as f32;
                        sx = 5.0 + ones * 3.0;
                        sy = 40.0 + ones * 22.0 + energy * 30.0;
                        mode_hue = bit as f32 * 22.0;
                        mode_alpha = 0.35 + ones * 0.1 + state.feedback * 0.2;
                    }
                    VisualMode::Forcing => {
                        let depth_i = (element.index % 9) as f32;
                        let branch = ((element.index / 9) as f32) / 8.0;
                        let spread = depth_i * 75.0 + beat_hit * 45.0;
                        px = (branch - 0.5) * spread * 2.8;
                        py = STAGE_HEIGHT * 0.42 - depth_i * 52.0;
                        rot = (branch - 0.5) * 0.85;
                        sx = 4.0 + (8.0 - depth_i).max(0.0);
                        sy = 45.0 + (8.0 - depth_i) * 10.0 + energy * 35.0;
                        mode_hue = depth_i * 30.0 + bass * 40.0;
                        mode_alpha = 0.45 + (1.0 - depth_i / 9.0) * 0.5;
                    }
                }

                transform.translation = Vec3::new(px, py, pz);
                transform.rotation = Quat::from_rotation_z(rot);
                // Perspective-ish scale boost from depth control (subtle, all modes).
                let persp = 1.0 + depth * (layer - 0.45) * 0.35;
                transform.scale = Vec3::new(sx.max(1.0) * persp, sy.max(1.0) * persp, 1.0);

                alpha *= (mode_alpha * (0.3 + 0.55 * energy) + beat_hit * 0.12 + state.flash * 0.3)
                    .clamp(0.0, 1.5);
                hue += mode_hue;
                lightness += beat_hit * 0.04
                    + state.flash * 0.15
                    + deck_drive * 0.06
                    + depth * layer * 0.05
                    + high * 0.03;
            }
            VisualKind::Ring => {
                // A restrained halo, not a target ring. Layers stay close and faint so
                // the ring supports the beams instead of becoming the whole composition.
                let layer = if DECK_A_RINGS > 1 {
                    element.index as f32 / (DECK_A_RINGS as f32 - 1.0)
                } else {
                    0.0
                };
                let ring_pulse = wave(t * 2.4);
                let beat_swell = beat_hit * 0.7 + cue_hit * 0.4;
                let pump = (beat * TAU).sin().abs();

                // Per-mode feel WITHOUT moving the ring off-centre or onto multiple
                // radii (that is exactly what read as a web). Only radius, halo spread,
                // alpha, and an on/off gate change per mode; the ring stays centred.
                let (radius_gain, halo_gain, alpha_gain, mode_gate) = match deck_mode {
                    VisualMode::Tunnel => (0.92 + state.depth * 0.18, 0.9, 0.65, 1.0),
                    VisualMode::Burst => (0.96 + beat_hit * 0.32 + cue_hit * 0.18, 1.0, 0.72, 1.0),
                    VisualMode::Mirror => (0.9, 0.65, 0.58 + mid * 0.28, 1.0),
                    VisualMode::Wash => (1.02 + state.feedback * 0.18, 1.4, 0.44, 1.0),
                    VisualMode::Strobe => (
                        0.9 + bass_activity * 0.22,
                        0.8,
                        0.75,
                        if (bass_activity + beat_hit * 1.2).clamp(0.0, 1.0) > 0.35 {
                            1.0
                        } else {
                            0.0
                        },
                    ),
                    VisualMode::Swarm => (0.88 + ring_pulse * 0.05, 1.1, 0.5, 1.0),
                    VisualMode::Orbit => (0.92, 0.9, 0.6, 1.0),
                    VisualMode::Pulse => (0.78 + pump * 0.22 + beat_hit * 0.14, 0.8, 0.42 + pump * 0.32, 1.0),
                    VisualMode::Spiral => (0.9, 1.05, 0.55, 1.0),
                    VisualMode::Ripple => (0.84 + bass * 0.2, 1.05, 0.58 + bass * 0.22, 1.0),
                    VisualMode::Shatter => (0.94, 0.72, 0.48 + high * 0.35, if high > 0.45 { 1.0 } else { 0.35 }),
                    VisualMode::Flux => (0.9, 1.0, 0.56 + mid * 0.24, 1.0),
                    VisualMode::Lattice => (0.88, 0.82, 0.62, 1.0),
                    VisualMode::Drift => (0.96, 1.15, 0.38, 1.0),
                    VisualMode::Storm => (
                        0.82 + osc_drive * 0.18,
                        0.95,
                        0.5 + state.osc_pulse * 0.35,
                        if osc_drive + state.osc_pulse > 0.55 {
                            1.0
                        } else {
                            0.25
                        },
                    ),
                    VisualMode::Echo => (
                        0.95 + state.feedback * 0.25 + high * 0.12,
                        1.25,
                        0.48 + state.osc_pulse * 0.3,
                        1.0,
                    ),
                    VisualMode::Vortex => (
                        0.78 + bass * 0.32,
                        0.85,
                        0.52 + bass_activity * 0.2,
                        if bass + beat_hit > 0.3 { 1.0 } else { 0.6 },
                    ),
                    VisualMode::Fracture => (
                        0.88 + high * 0.18,
                        0.7,
                        0.42 + high * 0.38,
                        if high > 0.38 { 1.0 } else { 0.45 },
                    ),
                    VisualMode::Nebula => (1.15 + mid * 0.2, 1.6, 0.32 + (mid + high) * 0.18, 1.0),
                    VisualMode::Prism => (0.92 + high * 0.1, 0.78, 0.58 + high * 0.24, 1.0),
                    VisualMode::Scanner => (
                        0.84,
                        0.72,
                        0.45 + state.osc_pulse * 0.35,
                        if high + state.osc_pulse > 0.32 {
                            1.0
                        } else {
                            0.35
                        },
                    ),
                    VisualMode::Comet => (0.86 + bass * 0.24, 0.9, 0.54 + bass * 0.22, 1.0),
                    VisualMode::Bloom => (
                        1.05 + beat_hit * 0.22 + cue_hit * 0.16,
                        1.7,
                        0.34 + state.feedback * 0.3 + beat_hit * 0.18,
                        1.0,
                    ),
                    VisualMode::Figure => (1.0, 1.0, 0.0, 0.0),
                    // Mathematical concepts - use Beams defaults
                    VisualMode::Hypercube
                    | VisualMode::CalabiYau
                    | VisualMode::Quasicrystal
                    | VisualMode::PenroseTiling
                    | VisualMode::SierpinskiTriangle
                    | VisualMode::TetrahedralMatrix
                    | VisualMode::BorromeanRings
                    | VisualMode::Torus
                    | VisualMode::PermutationGroups
                    | VisualMode::SymmetryGroups
                    | VisualMode::LieAlgebras
                    | VisualMode::LatticeTheory
                    | VisualMode::GraphTheory
                    | VisualMode::DesignTheory
                    | VisualMode::MandelbrotSet
                    | VisualMode::JuliaSets
                    | VisualMode::LorenzAttractor
                    | VisualMode::Functors
                    | VisualMode::ModularArithmetic
                    | VisualMode::PAdicNumbers
                    | VisualMode::VectorSpaces
                    | VisualMode::Eigenvectors
                    | VisualMode::BooleanLattices
                    | VisualMode::Forcing => (0.9, 0.8, 0.55, 1.0),
                    VisualMode::Beams => (0.9, 0.8, 0.55, 1.0),
                };

                let base_radius = 220.0
                    + deck_drive * 44.0
                    + bass * 58.0
                    + melodic_activity * 18.0
                    + ring_pulse * 9.0 * motion_drive
                    + beat_swell * 24.0;
                let size = (base_radius * radius_gain * (1.0 + layer * 0.08 * halo_gain)).max(1.0);

                transform.translation = Vec3::new(0.0, 0.0, 18.0 - layer);
                transform.rotation = Quat::from_rotation_z(-t * 0.22);
                transform.scale = Vec3::splat(size);

                hue += 35.0 + layer * 24.0;

                // Faint inner band; halo falls off quickly outward.
                let halo = 1.0 - layer;
                let glow = halo * halo;
                alpha *= mode_gate
                    * alpha_gain
                    * (0.015 + 0.22 * glow)
                    * (0.26
                        + ring_pulse * 0.12 * motion_drive
                        + beat_hit * 0.22
                        + melodic_activity * 0.08
                        + state.flash * 0.16);
                alpha *= state.ring_opacity;
                if !state.rings_enabled {
                    alpha = 0.0;
                }
                lightness += 0.04 + mid * 0.025 + high * 0.02 + glow * 0.035;
            }
            VisualKind::Tile => {
                // Deck B field: every mode fully owns layout (pos/rot/scale/alpha/hue).
                // No shared "default sticks" base — that made every pad look identical.
                let col = element.col as f32;
                let row = element.row as f32;
                let cols = DECK_B_COLS as f32;
                let rows = DECK_B_ROWS as f32;
                let fraction = element.index as f32
                    / ((DECK_B_COLS * DECK_B_ROWS).max(1) as f32);
                let seed = element.seed;
                let diagonal = col * 0.32 + row * 0.41;
                let pulse = wave(
                    t * (3.8 + melodic_activity * 5.5) - diagonal * 1.7
                        + beat_hit * 2.0
                        + deck_drive,
                );
                let u = if cols > 1.0 { col / (cols - 1.0) } else { 0.5 };
                let v = if rows > 1.0 { row / (rows - 1.0) } else { 0.5 };
                // Keep field visible under quiet OSC (old path died when motion_drive ~ 0).
                let field_live = if state.osc_connected {
                    (0.4 + motion_drive * 0.6 + intensity_drive * 0.12 + bass_activity * 0.15)
                        .clamp(0.4, 1.6)
                } else {
                    1.0
                };
                let energy = (intensity_drive * field_live).clamp(0.2, 2.2);

                let mut px = 0.0_f32;
                let mut py = 0.0_f32;
                let mut pz = 8.0_f32;
                let mut rot = 0.0_f32;
                let mut sx = 6.0_f32;
                let mut sy = 90.0_f32;
                let mut mode_alpha = 1.0_f32;
                let mut mode_hue = 0.0_f32;

                match deck_mode {
                    // ——— radial ray burst ———
                    VisualMode::Beams => {
                        let a = fraction * TAU + t * (0.2 + mid * 0.3);
                        let r = 50.0 + fraction * 480.0 + bass * 50.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + high * 8.0 + beat_hit * 10.0;
                        sy = 70.0 + energy * 90.0 + pulse * 40.0;
                        mode_hue = fraction * 180.0;
                        mode_alpha = 0.85;
                    }
                    // ——— concentric corridor rings ———
                    VisualMode::Tunnel => {
                        let ring = (element.index % 10) as f32;
                        let spoke = (element.index / 10) as f32;
                        let a = spoke / 12.0 * TAU + t * (0.35 + state.depth * 0.4);
                        let r = 40.0 + ring * 48.0 + state.depth * 80.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.78;
                        rot = a + TAU * 0.25;
                        sx = 4.0 + ring * 1.2;
                        sy = 36.0 + ring * 8.0 + beat_hit * 30.0;
                        pz = 4.0 + ring * 3.0;
                        mode_hue = 10.0 + ring * 18.0;
                        mode_alpha = 0.55 + (1.0 - ring / 10.0) * 0.45;
                    }
                    // ——— explode from center on hits ———
                    VisualMode::Burst => {
                        let a = fraction * TAU + seed * 2.0;
                        let r = 20.0 + (beat_hit * 2.5 + cue_hit + pulse) * 280.0 + fraction * 80.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.65;
                        rot = a;
                        sx = 8.0 + beat_hit * 40.0;
                        sy = 30.0 + beat_hit * 120.0 + high * 40.0;
                        mode_hue = 210.0 + beat_hit * 50.0;
                        mode_alpha = 0.35 + beat_hit * 0.9 + cue_hit * 0.5;
                    }
                    // ——— bilateral halves ———
                    VisualMode::Mirror => {
                        let side = if element.col % 2 == 0 { -1.0 } else { 1.0 };
                        px = side * (80.0 + u * 420.0 + mid * 40.0);
                        py = (v - 0.5) * STAGE_HEIGHT * 0.9;
                        rot = if side < 0.0 { TAU * 0.5 } else { 0.0 };
                        sx = 7.0 + high * 10.0;
                        sy = 50.0 + energy * 70.0;
                        mode_hue = 130.0 + side * 40.0;
                        mode_alpha = 0.75 + high * 0.25;
                    }
                    // ——— soft horizontal washes ———
                    VisualMode::Wash => {
                        px = (u - 0.5) * STAGE_WIDTH * 1.1;
                        py = (v - 0.5) * STAGE_HEIGHT * 0.55 + wave(t * 0.4 + v) * 30.0;
                        rot = 0.0;
                        sx = 180.0 + state.feedback * 220.0 + energy * 40.0;
                        sy = 12.0 + pulse * 18.0 + trail_gain * 20.0;
                        mode_hue = 30.0 + v * 40.0;
                        mode_alpha = 0.12 + state.feedback * 0.4 + osc_drive * 0.2;
                    }
                    // ——— hard gated flashes ———
                    VisualMode::Strobe => {
                        let a = fraction * TAU;
                        let r = 60.0 + fraction * 400.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + TAU * 0.25;
                        sx = 12.0 + beat_hit * 30.0;
                        sy = 100.0 + bass_activity * 80.0;
                        let gate = if bass_activity + beat_hit > 0.35 { 1.0 } else { 0.08 };
                        mode_alpha = gate;
                        mode_hue = beat_hit * 120.0 + fraction * 60.0;
                    }
                    // ——— chaotic cloud of dots/sticks ———
                    VisualMode::Swarm => {
                        let ox = (t * 1.6 + seed * 13.0).sin() * 380.0;
                        let oy = (t * 2.1 + seed * 9.0).cos() * 240.0;
                        px = ox + (t * 3.0 + seed * 5.0).sin() * 40.0;
                        py = oy + (t * 2.7 + seed * 7.0).cos() * 30.0;
                        rot = seed * TAU + t * 0.8;
                        sx = 6.0 + high * 12.0;
                        sy = 24.0 + energy * 50.0 + pulse * 30.0;
                        mode_hue = seed * 360.0;
                        mode_alpha = 0.7;
                    }
                    // ——— clean orbits ———
                    VisualMode::Orbit => {
                        let lane = (element.index % 6) as f32;
                        let a = t * (0.4 + seed * 0.35 + lane * 0.05) + fraction * TAU;
                        let r = 90.0 + lane * 55.0 + bass * 40.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.72;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + mid * 6.0;
                        sy = 40.0 + energy * 45.0;
                        mode_hue = 130.0 + lane * 25.0;
                        mode_alpha = 0.8;
                    }
                    // ——— whole field breathes ———
                    VisualMode::Pulse => {
                        let a = fraction * TAU;
                        let pump = (beat * TAU).sin().abs();
                        let r = 40.0 + fraction * 360.0 * (0.55 + pump * 0.9);
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + TAU * 0.25;
                        sx = 4.0 + pump * 20.0 + beat_hit * 15.0;
                        sy = 50.0 + pump * 140.0;
                        mode_hue = 80.0 + pump * 80.0;
                        mode_alpha = 0.4 + pump * 0.7;
                    }
                    // ——— arm spiral ———
                    VisualMode::Spiral => {
                        let a = fraction * TAU * 3.5 + t * 0.55;
                        let r = 30.0 + fraction * 420.0 + bass * 60.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.75;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + high * 8.0;
                        sy = 55.0 + fraction * 80.0 + energy * 40.0;
                        mode_hue = fraction * 200.0 + t * 20.0;
                        mode_alpha = 0.75;
                    }
                    // ——— expanding ring waves ———
                    VisualMode::Ripple => {
                        let a = fraction * TAU;
                        let phase = t * (1.5 + bass * 1.8) - fraction * 8.0;
                        let wave_r = ((phase.sin() + 1.0) * 0.5) * 420.0 + 40.0;
                        px = a.cos() * wave_r;
                        py = a.sin() * wave_r * 0.72;
                        rot = a + TAU * 0.25;
                        sx = 6.0 + phase.sin().abs() * 14.0;
                        sy = 25.0 + phase.sin().abs() * 70.0;
                        mode_hue = 40.0 + phase.to_degrees() * 0.2;
                        mode_alpha = 0.35 + phase.sin().abs() * 0.65;
                    }
                    // ——— flying shards ———
                    VisualMode::Shatter => {
                        let a = seed * TAU + t * (2.0 + high * 3.0);
                        let r = 80.0 + high * 280.0 + (t * 4.0 + seed * 9.0).sin().abs() * 200.0;
                        px = a.cos() * r + (t * 11.0 + seed).sin() * 50.0;
                        py = a.sin() * r * 0.7 + (t * 9.0 + seed).cos() * 40.0;
                        rot = a * 2.0 + t * 3.0;
                        sx = 4.0 + high * 20.0;
                        sy = 20.0 + high * 90.0 + beat_hit * 40.0;
                        mode_hue = seed * 200.0 + high * 80.0;
                        mode_alpha = 0.3 + high * 0.7 + beat_hit * 0.3;
                    }
                    // ——— horizontal shear flow ———
                    VisualMode::Flux => {
                        let flow = wave(t * (0.9 + mid * 1.3) + v * 3.0);
                        px = (u - 0.5) * STAGE_WIDTH + flow * 200.0;
                        py = (v - 0.5) * STAGE_HEIGHT * 0.85;
                        rot = flow * 0.35;
                        sx = 40.0 + mid * 60.0;
                        sy = 14.0 + energy * 20.0;
                        mode_hue = 50.0 + mid * 80.0 + flow * 40.0;
                        mode_alpha = 0.65 + mid * 0.3;
                    }
                    // ——— sparse cross-hatch lattice of thin lines ———
                    VisualMode::Lattice => {
                        let vertical = element.index % 2 == 0;
                        if vertical {
                            px = (col - (cols - 1.0) * 0.5) * (STAGE_WIDTH / cols.max(1.0)) * 1.05;
                            py = (v - 0.5) * STAGE_HEIGHT * 0.95;
                            rot = 0.0;
                            sx = 3.5 + beat_hit * 4.0;
                            sy = STAGE_HEIGHT * (0.55 + pulse * 0.2);
                        } else {
                            px = (u - 0.5) * STAGE_WIDTH * 0.95;
                            py = (row - (rows - 1.0) * 0.5) * (STAGE_HEIGHT / rows.max(1.0)) * 1.05;
                            rot = TAU * 0.25;
                            sx = 3.5 + beat_hit * 4.0;
                            sy = STAGE_WIDTH * (0.35 + pulse * 0.1);
                        }
                        mode_hue = 62.0 + (element.index % 4) as f32 * 20.0;
                        mode_alpha = 0.7;
                    }
                    // ——— slow floating haze ———
                    VisualMode::Drift => {
                        let a = seed * TAU + t * 0.08;
                        let r = 100.0 + fraction * 280.0;
                        px = a.cos() * r + wave(t * 0.2 + seed) * 80.0;
                        py = a.sin() * r * 0.55 + wave(t * 0.15 + seed * 2.0) * 50.0;
                        rot = a * 0.3;
                        sx = 30.0 + energy * 40.0;
                        sy = 18.0 + trail_gain * 30.0;
                        mode_hue = 32.0 + mid * 40.0;
                        mode_alpha = 0.35 + state.feedback * 0.4;
                    }
                    // ——— violent weather ———
                    // Squall: diagonal rain curtains + fork lightning on hits (not generic chaos).
                    VisualMode::Storm => {
                        let wind = 0.55 + bass * 0.55 + mid * 0.25;
                        let fall = (t * (2.4 + state.speed * 0.9 + high * 1.4) + seed * 6.0).fract();
                        let lane = (fraction * 14.0 + seed * 3.0) % 1.0;
                        let is_bolt = element.index % 9 == 0;
                        if is_bolt {
                            let bolt_x = (lane - 0.5) * STAGE_WIDTH * 1.05
                                + (t * 17.0 + seed * 9.0).sin() * 28.0;
                            let jag = (t * 40.0 + seed * 13.0).sin() * (18.0 + high * 30.0);
                            px = bolt_x + jag * 0.35;
                            py = (0.5 - fall) * STAGE_HEIGHT * 1.1;
                            rot = (jag * 0.02) + (seed - 0.5) * 0.25;
                            sx = 3.0 + beat_hit * 14.0 + state.osc_pulse * 10.0;
                            sy = STAGE_HEIGHT
                                * (0.35 + beat_hit * 0.55 + bass_activity * 0.25)
                                + cue_hit * 80.0;
                            mode_hue = 195.0 + high * 40.0 + beat_hit * 50.0;
                            mode_alpha = 0.08
                                + beat_hit * 0.95
                                + cue_hit * 0.7
                                + state.osc_pulse * 0.45;
                        } else {
                            px = (lane - 0.5) * STAGE_WIDTH * 1.15
                                + fall * wind * 220.0
                                + (seed - 0.5) * 40.0;
                            py = (0.55 - fall) * STAGE_HEIGHT * 1.25;
                            rot = -0.55 - wind * 0.35 + high * 0.1;
                            sx = 2.2 + high * 3.5 + beat_hit * 2.0;
                            sy = 55.0
                                + energy * 45.0
                                + bass * 35.0
                                + (1.0 - fall) * 50.0;
                            mode_hue = 200.0 + mid * 25.0 + fraction * 30.0;
                            mode_alpha = 0.28
                                + (1.0 - fall) * 0.45
                                + high * 0.2
                                + beat_hit * 0.15;
                        }
                    }
                    // ——— delayed after-images (needs trails) ———
                    VisualMode::Echo => {
                        let lag = (t * (0.5 + trail_gain) + fraction * 2.0).fract();
                        let a = fraction * TAU + t * 0.3 - lag * 2.0;
                        let r = 60.0 + fraction * 350.0 * (1.0 - lag * 0.5);
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + TAU * 0.25;
                        sx = 4.0 + (1.0 - lag) * 10.0;
                        sy = 40.0 + (1.0 - lag) * 100.0 * trail_gain.max(0.15);
                        mode_hue = lag * 100.0;
                        mode_alpha = if trail_gain > 0.02 {
                            (1.0 - lag).powf(1.5) * (0.5 + trail_gain)
                        } else {
                            0.25 + pulse * 0.4
                        };
                    }
                    // ——— inward spiral drain ———
                    VisualMode::Vortex => {
                        let pull = 0.3 + bass * 1.2 + beat_hit * 0.6;
                        let a = fraction * TAU * 3.0 + t * (2.0 + pull * 2.5);
                        let r = (420.0 - fraction * 360.0) * (1.0 - pull * 0.25).max(0.35);
                        px = a.cos() * r;
                        py = a.sin() * r * 0.75;
                        rot = a * 1.4;
                        sx = 4.0 + pull * 10.0;
                        sy = 50.0 + pull * 90.0;
                        mode_hue = a.to_degrees() * 0.5 + pull * 40.0;
                        mode_alpha = 0.55 + pull * 0.4;
                    }
                    // ——— angular cracks ———
                    VisualMode::Fracture => {
                        let arm = (element.index % 8) as f32;
                        let a = arm / 8.0 * TAU + (high * 0.4 + beat_hit) * 0.5;
                        let r = 30.0 + (element.index / 8) as f32 * 55.0 + high * 100.0;
                        px = a.cos() * r + (t * 8.0 + seed).sin() * high * 40.0;
                        py = a.sin() * r * 0.8;
                        rot = a + TAU * 0.15;
                        sx = 3.0 + high * 15.0;
                        sy = 35.0 + high * 100.0 + beat_hit * 50.0;
                        mode_hue = arm * 40.0 + high * 90.0;
                        mode_alpha = 0.4 + high * 0.55;
                    }
                    // ——— soft cloud blobs as wide ovals ———
                    VisualMode::Nebula => {
                        let a = seed * TAU + t * 0.12;
                        let r = 40.0 + fraction * 300.0;
                        px = a.cos() * r + wave(t * 0.5 + seed) * mid * 60.0;
                        py = a.sin() * r * 0.65 + wave(t * 0.4 + seed * 2.0) * high * 40.0;
                        rot = a * 0.2;
                        sx = 50.0 + energy * 80.0 + mid * 40.0;
                        sy = 30.0 + energy * 50.0 + high * 30.0;
                        mode_hue = 20.0 + mid * 50.0;
                        mode_alpha = 0.2 + (mid + high) * 0.25 + state.feedback * 0.2;
                    }
                    // ——— 3-way hue split fans ———
                    VisualMode::Prism => {
                        let band = (element.index % 3) as f32 - 1.0;
                        let a = fraction * TAU + t * 0.25;
                        let r = 80.0 + fraction * 320.0;
                        px = a.cos() * r + band * (50.0 + high * 70.0);
                        py = a.sin() * r * 0.7 + band * 20.0;
                        rot = a + band * 0.2;
                        sx = 6.0 + high * 12.0;
                        sy = 45.0 + mid * 60.0 + energy * 40.0;
                        mode_hue = band * 90.0 + fraction * 120.0;
                        mode_alpha = 0.55 + high * 0.35;
                    }
                    // ——— horizontal scan beams ———
                    VisualMode::Scanner => {
                        let scan = ((t * (0.55 + state.speed * 0.2 + high * 0.5) + seed).fract()
                            * 2.0)
                            - 1.0;
                        px = wave(t * 0.7 + fraction * 4.0) * STAGE_WIDTH * 0.2;
                        py = scan * STAGE_HEIGHT * 0.45 + (row - rows * 0.5) * 6.0;
                        rot = 0.0;
                        sx = STAGE_WIDTH * (0.35 + high * 0.15);
                        sy = 6.0 + state.osc_pulse * 20.0 + beat_hit * 12.0;
                        mode_hue = 175.0 + scan * 70.0;
                        mode_alpha = 0.45 + high * 0.4 + state.osc_pulse * 0.35;
                    }
                    // ——— long trailing comets ———
                    VisualMode::Comet => {
                        let a = t * (1.1 + bass * 2.0 + state.speed * 0.2) + fraction * TAU;
                        let r = 40.0 + fraction * 450.0 + beat_hit * 60.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.55;
                        rot = a + TAU * 0.25;
                        sx = 5.0 + high * 8.0;
                        sy = 80.0 + bass * 140.0 + trail_gain * 100.0 + beat_hit * 50.0;
                        mode_hue = a.to_degrees() * 0.3 + bass * 50.0;
                        mode_alpha = 0.4 + bass * 0.5 + beat_hit * 0.3;
                    }
                    // ——— soft radial bloom ———
                    VisualMode::Bloom => {
                        let a = fraction * TAU + t * 0.15;
                        let bloom = wave(t * 0.35 + fraction) + beat_hit * 0.5;
                        let r = 30.0 + fraction * 280.0 * (0.7 + bloom * 0.6);
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a;
                        sx = 20.0 + bloom * 60.0 + state.feedback * 40.0;
                        sy = 40.0 + bloom * 100.0 + mid * 40.0;
                        mode_hue = 25.0 + bloom * 40.0 + mid * 30.0;
                        mode_alpha = 0.2 + bloom * 0.5 + state.feedback * 0.25;
                    }
                    VisualMode::Figure => {
                        mode_alpha = 0.0;
                    }
                    // ——— tesseract-ish: dual-radius spinning frame ———
                    VisualMode::Hypercube => {
                        let cell = (element.index % 8) as f32;
                        let edge = (element.index / 8) as f32;
                        let a1 = t * 1.1 + cell * TAU / 8.0;
                        let a2 = t * 0.7 + edge * 0.9 + bass * 0.5;
                        let r1 = 160.0 + beat_hit * 40.0;
                        let r2 = 90.0 + mid * 40.0;
                        px = a1.cos() * r1 + a2.cos() * r2 * 0.6;
                        py = a1.sin() * r1 * 0.75 + a2.sin() * r2 * 0.5;
                        rot = a1 + a2;
                        sx = 3.5 + beat_hit * 6.0;
                        sy = 55.0 + edge * 8.0 + energy * 40.0;
                        mode_hue = cell * 40.0 + a1.to_degrees() * 0.2;
                        mode_alpha = 0.75;
                    }
                    // ——— organic multi-lobe fold ———
                    VisualMode::CalabiYau => {
                        let a = seed * TAU + t * 0.2;
                        let lobes = 3.0 + (element.index % 4) as f32;
                        let r = 80.0
                            + (a * lobes).sin().abs() * 220.0
                            + mid * 80.0
                            + wave(t * 0.6 + seed) * 40.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7;
                        rot = a + (a * lobes).cos() * 0.5;
                        sx = 10.0 + mid * 20.0;
                        sy = 35.0 + energy * 70.0 + high * 30.0;
                        mode_hue = a.to_degrees() * 0.15 + mid * 40.0;
                        mode_alpha = 0.55 + mid * 0.3 + high * 0.15;
                    }
                    // ——— 5-fold quasi interference points ———
                    VisualMode::Quasicrystal => {
                        let k = 5.0;
                        let a = fraction * TAU * k + t * 0.3;
                        let mut rx = 0.0_f32;
                        let mut ry = 0.0_f32;
                        for i in 0..5 {
                            let ang = i as f32 * TAU / k + t * 0.1;
                            let phase = (px * 0.01 + fraction * 6.0 + t + i as f32).cos();
                            rx += ang.cos() * phase;
                            ry += ang.sin() * phase;
                        }
                        px = rx * (90.0 + high * 80.0) + a.cos() * 40.0;
                        py = ry * (70.0 + high * 60.0) + a.sin() * 30.0;
                        rot = a;
                        sx = 4.0 + high * 12.0 + beat_hit * 8.0;
                        sy = 28.0 + high * 50.0 + energy * 30.0;
                        mode_hue = fraction * 200.0 + high * 60.0;
                        mode_alpha = 0.5 + high * 0.4;
                    }
                    // ——— rhomb-ish diamond orientations (not square tiles) ———
                    VisualMode::PenroseTiling => {
                        let phi = 1.618_034_f32;
                        let gx = (col - cols * 0.5) * 48.0 * phi.recip() * 2.0;
                        let gy = (row - rows * 0.5) * 42.0;
                        let alt = ((element.col + element.row) % 2) as f32;
                        px = gx + alt * 18.0;
                        py = gy + (1.0 - alt) * 14.0;
                        rot = alt * TAU * 0.2 + (element.index % 5) as f32 * 0.15;
                        sx = 5.0 + (element.index % 5) as f32 * 2.0;
                        sy = 45.0 + alt * 25.0 + energy * 30.0;
                        mode_hue = 62.0 + alt * 50.0;
                        mode_alpha = 0.75;
                    }
                    // ——— recursive triangle IFS points ———
                    VisualMode::SierpinskiTriangle => {
                        let bits = element.index as u32;
                        let show = bits & (bits >> 1) == 0;
                        // Map index through IFS-ish triangle corners
                        let mut ix = 0.0_f32;
                        let mut iy = 0.5_f32;
                        let mut n = element.index + 1;
                        for _ in 0..8 {
                            let corner = n % 3;
                            n /= 3;
                            let (cx, cy) = match corner {
                                0 => (-0.5_f32, -0.4_f32),
                                1 => (0.5_f32, -0.4_f32),
                                _ => (0.0_f32, 0.55_f32),
                            };
                            ix = (ix + cx) * 0.5;
                            iy = (iy + cy) * 0.5;
                        }
                        px = ix * STAGE_WIDTH * 0.85;
                        py = iy * STAGE_HEIGHT * 0.85;
                        rot = t * 0.2 + fraction;
                        sx = 4.0 + beat_hit * 6.0;
                        sy = 30.0 + energy * 40.0;
                        mode_hue = fraction * 90.0;
                        mode_alpha = if show { 0.85 } else { 0.0 };
                    }
                    // ——— 3-layer tetrahedral node cloud ———
                    VisualMode::TetrahedralMatrix => {
                        let elev = ((element.col + 2 * element.row) % 3) as f32;
                        let a = fraction * TAU + elev * 0.7 + t * 0.25;
                        let r = 70.0 + elev * 90.0 + (element.index % 7) as f32 * 20.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.7 + elev * 30.0 - 40.0;
                        pz = 6.0 + elev * 10.0;
                        rot = a + elev;
                        sx = 4.0 + elev * 2.0;
                        sy = 40.0 + elev * 20.0 + energy * 35.0;
                        mode_hue = 62.0 + elev * 35.0;
                        mode_alpha = 0.7 + elev * 0.1;
                    }
                    // ——— three linked ring paths ———
                    VisualMode::BorromeanRings => {
                        let ring = (element.index % 3) as f32;
                        let along = (element.index / 3) as f32 / 40.0 * TAU + t * (1.2 + bass);
                        let r = 140.0 + bass * 40.0;
                        let cx = (ring - 1.0) * 90.0;
                        let cy = ((ring + 1.0) % 3.0 - 1.0) * 40.0;
                        px = cx + along.cos() * r;
                        py = cy + along.sin() * r * 0.45 + (ring - 1.0) * along.sin() * 30.0;
                        rot = along + ring;
                        sx = 5.0 + beat_hit * 8.0;
                        sy = 45.0 + energy * 50.0;
                        mode_hue = ring * 100.0 + along.to_degrees() * 0.2;
                        mode_alpha = 0.7;
                    }
                    // ——— torus: major/minor circle sampling ———
                    VisualMode::Torus => {
                        let major = fraction * TAU + t * 0.4;
                        let minor = (element.index as f32 * 0.7 + t * 1.2) % TAU;
                        let r_major = 180.0 + state.depth * 100.0;
                        let r_minor = 55.0 + bass * 40.0;
                        px = (r_major + r_minor * minor.cos()) * major.cos();
                        py = (r_major + r_minor * minor.cos()) * major.sin() * 0.55;
                        // fake Z as scale/offset
                        pz = 8.0 + minor.sin() * 20.0;
                        rot = major + minor;
                        sx = 4.0 + minor.cos().abs() * 6.0;
                        sy = 35.0 + r_minor * 0.4 + energy * 30.0;
                        mode_hue = 15.0 + minor.to_degrees() * 0.3;
                        mode_alpha = 0.65 + minor.cos().abs() * 0.25;
                    }
                    // ——— discrete slot permute on beats ———
                    VisualMode::PermutationGroups => {
                        let slots = (DECK_B_COLS * DECK_B_ROWS).max(1);
                        let beat_step = (t * state.bpm / 60.0).floor() as usize;
                        let dest = (element.index * 7 + beat_step * 3) % slots;
                        let dc = (dest % DECK_B_COLS) as f32;
                        let dr = (dest / DECK_B_COLS) as f32;
                        px = (dc / cols.max(1.0) - 0.5) * STAGE_WIDTH * 0.9;
                        py = (dr / rows.max(1.0) - 0.5) * STAGE_HEIGHT * 0.9;
                        rot = (dest as f32) * 0.2 + t * 0.1;
                        sx = 6.0 + beat_hit * 10.0;
                        sy = 40.0 + energy * 50.0;
                        mode_hue = dest as f32 * 5.0;
                        mode_alpha = 0.8;
                    }
                    // ——— 4-fold kaleidoscope ———
                    VisualMode::SymmetryGroups => {
                        let qx = (u - 0.5).abs();
                        let qy = (v - 0.5).abs();
                        let sx_sign = if element.col % 2 == 0 { 1.0 } else { -1.0 };
                        let sy_sign = if element.row % 2 == 0 { 1.0 } else { -1.0 };
                        px = sx_sign * qx * STAGE_WIDTH * 0.95;
                        py = sy_sign * qy * STAGE_HEIGHT * 0.95;
                        rot = (qx + qy) * 2.0 + t * 0.3;
                        sx = 5.0 + high * 10.0;
                        sy = 50.0 + energy * 60.0;
                        mode_hue = 130.0 + qx * 80.0;
                        mode_alpha = 0.7 + high * 0.25;
                    }
                    // ——— streamline field ———
                    VisualMode::LieAlgebras => {
                        let x0 = (u - 0.5) * STAGE_WIDTH;
                        let y0 = (v - 0.5) * STAGE_HEIGHT;
                        // rotate vector field
                        let ang = t * 0.4 + y0 * 0.004 + x0 * 0.003;
                        px = x0 + ang.cos() * 40.0;
                        py = y0 + ang.sin() * 40.0;
                        rot = ang;
                        sx = 3.5;
                        sy = 35.0 + energy * 45.0 + mid * 20.0;
                        mode_hue = 140.0 + ang.to_degrees() * 0.2;
                        mode_alpha = 0.7;
                    }
                    // ——— layered Hasse-like ranks ———
                    VisualMode::LatticeTheory => {
                        let rank = element.row;
                        let along = col / cols.max(1.0);
                        px = (along - 0.5) * STAGE_WIDTH * 0.85;
                        py = (rank as f32 / rows.max(1.0) - 0.5) * STAGE_HEIGHT * 0.9;
                        rot = 0.0;
                        sx = 8.0 + (rank % 3) as f32 * 4.0;
                        sy = 20.0 + energy * 25.0;
                        // connectors as short horizontals
                        if element.col % 2 == 1 {
                            sx = 50.0 + mid * 30.0;
                            sy = 4.0;
                        }
                        mode_hue = 62.0 + rank as f32 * 15.0;
                        mode_alpha = 0.75;
                    }
                    // ——— node + thin edge segments ———
                    VisualMode::GraphTheory => {
                        let nodes = 12.max(1);
                        let node = element.index % nodes;
                        let a = node as f32 / nodes as f32 * TAU + t * 0.15;
                        let r = 160.0 + mid * 40.0;
                        if element.index % 3 == 0 {
                            // node
                            px = a.cos() * r;
                            py = a.sin() * r * 0.75;
                            rot = 0.0;
                            sx = 12.0 + beat_hit * 10.0;
                            sy = 12.0 + beat_hit * 10.0;
                        } else {
                            // edge between node and next
                            let a2 = (node as f32 + 1.0 + (element.index % 5) as f32) / nodes as f32
                                * TAU
                                + t * 0.15;
                            let x1 = a.cos() * r;
                            let y1 = a.sin() * r * 0.75;
                            let x2 = a2.cos() * r;
                            let y2 = a2.sin() * r * 0.75;
                            px = (x1 + x2) * 0.5;
                            py = (y1 + y2) * 0.5;
                            rot = (y2 - y1).atan2(x2 - x1);
                            let dist = ((x2 - x1).hypot(y2 - y1)).max(1.0);
                            sx = 3.0 + high * 4.0;
                            sy = dist * 0.9;
                        }
                        mode_hue = 40.0 + node as f32 * 20.0;
                        mode_alpha = 0.65 + high * 0.3;
                    }
                    // ——— block color bands ———
                    VisualMode::DesignTheory => {
                        let block = element.index % 6;
                        let bx = (block % 3) as f32 - 1.0;
                        let by = (block / 3) as f32 - 0.5;
                        px = bx * 280.0 + (u - 0.5) * 80.0;
                        py = by * 220.0 + (v - 0.5) * 60.0;
                        rot = 0.0;
                        sx = 70.0 + state.feedback * 40.0;
                        sy = 18.0 + pulse * 15.0;
                        mode_hue = block as f32 * 55.0;
                        mode_alpha = 0.25 + state.feedback * 0.4 + osc_drive * 0.2;
                    }
                    // ——— nested zoom rings (fractal stand-in) ———
                    VisualMode::MandelbrotSet => {
                        let a = fraction * TAU + t * 0.1;
                        let zoom = 1.0 + intensity_drive * 1.5 + bass * 0.8;
                        let r = (20.0 + (fraction * 12.0).fract() * 300.0) / zoom.sqrt()
                            + wave(t * 0.3 + fraction) * 20.0;
                        px = a.cos() * r * 1.2;
                        py = a.sin() * r * 0.9;
                        rot = a + TAU * 0.25;
                        sx = 3.0 + (1.0 - fraction) * 8.0;
                        sy = 25.0 + (1.0 - fraction) * 90.0 * energy;
                        mode_hue = 200.0 + fraction * 80.0 + mid * 40.0;
                        mode_alpha = 0.55 + (1.0 - fraction) * 0.35;
                    }
                    // ——— julia: orbiting seed lobes ———
                    VisualMode::JuliaSets => {
                        let c_a = t * (0.4 + mid * 0.6);
                        let a = fraction * TAU * 2.0 + c_a;
                        let r = 60.0 + (a * 2.0 + c_a).sin().abs() * 280.0 + high * 60.0;
                        px = a.cos() * r + c_a.cos() * 40.0;
                        py = a.sin() * r * 0.7 + c_a.sin() * 30.0;
                        rot = a;
                        sx = 5.0 + high * 12.0;
                        sy = 40.0 + mid * 50.0 + energy * 40.0;
                        mode_hue = c_a.to_degrees() + fraction * 100.0;
                        mode_alpha = 0.55 + high * 0.35;
                    }
                    // ——— Lorenz ribbon (Euler integration per element) ———
                    VisualMode::LorenzAttractor => {
                        // Distinct initial conditions per element; short integrated path sample.
                        let mut lx = 0.1 + seed * 0.4;
                        let mut ly = seed * 0.8 - 0.4;
                        let mut lz = 1.0 + fraction * 2.0;
                        let dt_l = 0.008 * (1.0 + state.speed);
                        let steps = 40 + (element.index % 20);
                        for _ in 0..steps {
                            let dx = 10.0 * (ly - lx);
                            let dy = lx * (28.0 - lz) - ly;
                            let dz = lx * ly - (8.0 / 3.0) * lz;
                            lx += dx * dt_l;
                            ly += dy * dt_l;
                            lz += dz * dt_l;
                        }
                        // Spin the projection with time
                        let spin = t * 0.5;
                        px = (lx * spin.cos() - ly * spin.sin()) * 18.0;
                        py = (lz - 25.0) * 12.0 + (lx * spin.sin() + ly * spin.cos()) * 6.0;
                        rot = (ly).atan2(lx) + spin;
                        sx = 4.0 + state.osc_pulse * 8.0;
                        sy = 20.0 + energy * 35.0 + beat_hit * 20.0;
                        mode_hue = 20.0 + lz * 8.0;
                        mode_alpha = 0.55 + osc_drive * 0.35;
                    }
                    // ——— source→target map (two columns + bridging strokes) ———
                    VisualMode::Functors => {
                        let left = element.index % 2 == 0;
                        let slot = (element.index / 2) as f32 / (rows.max(1.0));
                        if left {
                            px = -STAGE_WIDTH * 0.32;
                            py = (slot - 0.5) * STAGE_HEIGHT * 0.9;
                            rot = 0.0;
                            sx = 10.0;
                            sy = 16.0 + energy * 10.0;
                            mode_hue = 180.0;
                        } else {
                            px = STAGE_WIDTH * 0.32;
                            py = (slot - 0.5) * STAGE_HEIGHT * 0.9 + wave(t + slot) * 20.0;
                            rot = 0.0;
                            sx = 10.0;
                            sy = 16.0 + energy * 10.0;
                            mode_hue = 40.0;
                        }
                        // half the elements are arrows
                        if element.row % 3 == 0 && !left {
                            let y0 = (slot - 0.5) * STAGE_HEIGHT * 0.9;
                            px = 0.0;
                            py = y0 * 0.5 + wave(t * 0.8 + slot) * 10.0;
                            rot = TAU * 0.25 + (wave(t + slot) - 0.5) * 0.3;
                            sx = 4.0;
                            sy = STAGE_WIDTH * 0.28;
                            mode_hue = 100.0 + high * 40.0;
                        }
                        mode_alpha = 0.7 + high * 0.2;
                    }
                    // ——— modular clock ———
                    VisualMode::ModularArithmetic => {
                        let modulus = 8 + (bass * 4.0) as i32;
                        let class = element.index as i32 % modulus;
                        let a = class as f32 / modulus as f32 * TAU - TAU * 0.25 + t * 0.05;
                        let r = 200.0 + (element.index / modulus.max(1) as usize) as f32 * 30.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.85;
                        rot = a + TAU * 0.25;
                        let lit = if class == ((t * state.bpm / 60.0) as i32).rem_euclid(modulus) {
                            1.0
                        } else {
                            0.35
                        };
                        sx = 6.0 + lit * 10.0;
                        sy = 30.0 + lit * 50.0 + energy * 20.0;
                        mode_hue = class as f32 * (360.0 / modulus as f32);
                        mode_alpha = 0.4 + lit * 0.55;
                    }
                    // ——— nested disks hierarchy ———
                    VisualMode::PAdicNumbers => {
                        let depth_i = (element.index % 6) as f32;
                        let a = (element.index / 6) as f32 * 0.9 + t * 0.1 * (depth_i + 1.0);
                        let r = 40.0 * 1.55_f32.powf(depth_i) + wave(t + depth_i) * 10.0;
                        px = a.cos() * r;
                        py = a.sin() * r * 0.8;
                        rot = a;
                        sx = 3.0 + (5.0 - depth_i).max(0.0) * 2.0;
                        sy = 20.0 + (5.0 - depth_i).max(1.0) * 15.0 + energy * 20.0;
                        mode_hue = depth_i * 45.0;
                        mode_alpha = 0.4 + (1.0 - depth_i / 6.0) * 0.5;
                    }
                    // ——— basis axes + span grid lines ———
                    VisualMode::VectorSpaces => {
                        let kind = element.index % 4;
                        match kind {
                            0 => {
                                // e1 axis
                                px = (u - 0.5) * STAGE_WIDTH * 0.7;
                                py = 0.0;
                                rot = 0.0;
                                sx = 4.0;
                                sy = STAGE_WIDTH * 0.35;
                            }
                            1 => {
                                // e2 axis
                                px = 0.0;
                                py = (v - 0.5) * STAGE_HEIGHT * 0.7;
                                rot = TAU * 0.25;
                                sx = 4.0;
                                sy = STAGE_HEIGHT * 0.35;
                            }
                            _ => {
                                // span samples
                                let shear = mid * 0.8 + wave(t * 0.5) * 0.3;
                                px = (u - 0.5) * STAGE_WIDTH * 0.6 + (v - 0.5) * STAGE_WIDTH * shear * 0.3;
                                py = (v - 0.5) * STAGE_HEIGHT * 0.6;
                                rot = shear * 0.4;
                                sx = 3.0;
                                sy = 25.0 + energy * 30.0;
                            }
                        }
                        mode_hue = 20.0 + kind as f32 * 30.0;
                        mode_alpha = 0.7;
                    }
                    // ——— stretch along preferred axes ———
                    VisualMode::Eigenvectors => {
                        let pump = (beat * TAU).sin().abs();
                        let axis: f32 = if element.index % 2 == 0 { 0.35 } else { -0.55 };
                        let along = (fraction - 0.5) * 2.0;
                        px = along * 400.0 * axis.cos() * (0.6 + pump);
                        py = along * 300.0 * axis.sin() * (0.6 + pump);
                        rot = axis;
                        sx = 5.0 + pump * 15.0;
                        sy = 40.0 + pump * 120.0 + beat_hit * 40.0;
                        mode_hue = 80.0 + pump * 80.0;
                        mode_alpha = 0.55 + pump * 0.4;
                    }
                    // ——— subset hypercube faces as staggered ranks ———
                    VisualMode::BooleanLattices => {
                        let bit = element.index & 7;
                        let xbits = (bit & 1) as f32 + ((bit >> 1) & 1) as f32 * 0.5;
                        let ybits = ((bit >> 2) & 1) as f32 + ((bit >> 1) & 1) as f32 * 0.35;
                        px = (xbits - 0.75) * 350.0 + (u - 0.5) * 40.0;
                        py = (ybits - 0.5) * 280.0 + (v - 0.5) * 40.0;
                        rot = (bit as f32) * 0.4;
                        sx = 5.0 + (bit.count_ones() as f32) * 3.0;
                        sy = 30.0 + (bit.count_ones() as f32) * 20.0 + energy * 25.0;
                        mode_hue = bit as f32 * 40.0;
                        mode_alpha = 0.35 + (bit.count_ones() as f32) * 0.12 + state.feedback * 0.2;
                    }
                    // ——— expanding condition tree ———
                    VisualMode::Forcing => {
                        let depth_i = (element.row).min(7) as f32;
                        let branch = col / cols.max(1.0);
                        let spread = depth_i * 70.0 + beat_hit * 40.0;
                        px = (branch - 0.5) * spread * 2.5;
                        py = STAGE_HEIGHT * 0.4 - depth_i * 55.0;
                        rot = (branch - 0.5) * 0.8;
                        sx = 4.0 + (7.0 - depth_i).max(0.0);
                        sy = 35.0 + (7.0 - depth_i) * 8.0 + energy * 30.0;
                        mode_hue = depth_i * 30.0 + bass * 40.0;
                        mode_alpha = 0.45 + (1.0 - depth_i / 8.0) * 0.45;
                    }
                }

                transform.translation = Vec3::new(px, py, pz);
                transform.rotation = Quat::from_rotation_z(rot);
                transform.scale = Vec3::new(sx.max(1.0), sy.max(1.0), 1.0);

                // Visible floor — modes can darken, but the field shouldn't vanish under quiet OSC.
                alpha *= (mode_alpha * (0.3 + 0.55 * energy) + beat_hit * 0.12 + state.flash * 0.25)
                    .clamp(0.0, 1.5);
                hue += mode_hue;
                lightness += 0.05 + pulse * 0.08 + beat_hit * 0.05;
            }
            VisualKind::Ghost => {
                // Ghost streaks are the dedicated trails layer — fully silent at feedback 0
                // (flash can still punch through briefly).
                if trail_gain <= 0.0 && state.flash <= 0.0 {
                    alpha = 0.0;
                } else {
                let fraction = element.index as f32 / 18.0;
                let angle = t * (0.08 + fraction * 0.04) + fraction * TAU;
                let sway = wave(t * 0.9 + element.seed * 4.0);

                // Staggered life cycles so each streak brightens then fades out.
                // Higher feedback stretches the tail; at zero the layer is silent.
                let life_rate = 0.32 + trail_gain * 0.85 + state.speed * 0.1;
                let life = (t * life_rate + element.seed * 4.1).fract();
                let decay_power = (2.6 - trail_gain * 1.8).max(0.4);
                let trail_fade = (1.0 - life).powf(decay_power);

                transform.translation = Vec3::new(
                    angle.cos() * 120.0 * sway,
                    angle.sin() * 70.0 * (1.0 - sway),
                    -8.0 + fraction,
                );
                transform.rotation = Quat::from_rotation_z(angle);
                transform.scale = Vec3::new(
                    STAGE_WIDTH
                        * (0.22 + trail_gain * 0.9 + bass * 0.05 * trail_gain)
                        * (0.3 + 0.7 * trail_fade)
                        * trail_gain.max(state.flash * 0.5),
                    (18.0 + 180.0 * trail_gain * wave(t + element.seed)
                        + melodic_activity * 24.0 * trail_gain
                        + bass_activity * 22.0 * trail_gain)
                        * trail_fade
                        * trail_gain.max(state.flash * 0.5),
                    1.0,
                );

                match deck_mode {
                    VisualMode::Tunnel => {
                        transform.rotation = Quat::from_rotation_z(angle + fraction * TAU * 0.5);
                        transform.scale.x *= 0.55 + state.depth;
                        transform.scale.y *= 1.4 + fraction;
                    }
                    VisualMode::Burst => {
                        transform.scale.x *= 0.35 + beat_hit * 2.4 + cue_hit;
                        transform.scale.y *= 1.0 + beat_hit * 1.6;
                        alpha *= 0.45 + beat_hit;
                    }
                    VisualMode::Mirror => {
                        transform.translation.x = if element.index % 2 == 0 {
                            transform.translation.x.abs()
                        } else {
                            -transform.translation.x.abs()
                        };
                        transform.scale.x *= 0.75;
                        alpha *= 1.1;
                    }
                    VisualMode::Wash => {
                        transform.scale.x *= 1.8;
                        transform.scale.y *= 2.2 + state.feedback;
                        alpha *= 1.35;
                    }
                    VisualMode::Strobe => {
                        // Use transient envelope for flashing, not sustained bass level.
                        let gate = (bass_activity + beat_hit).clamp(0.0, 1.0);
                        let on = if gate > 0.28 { 1.0 } else { 0.0 };
                        alpha *= on;
                        transform.scale.x *= 1.0 + bass_activity * 0.6;
                    }
                    VisualMode::Swarm => {
                        let dx = (t * 1.0 + fraction * 17.0).sin() * 240.0;
                        let dy = (t * 1.4 + fraction * 11.0).cos() * 100.0;
                        transform.translation.x = dx;
                        transform.translation.y = dy;
                        transform.rotation = Quat::from_rotation_z(t * 0.7 + fraction * TAU);
                    }
                    VisualMode::Orbit => {
                        let orbit_a = t * 0.6 + fraction * TAU;
                        transform.translation.x = orbit_a.cos() * (180.0 + fraction * 80.0);
                        transform.translation.y = orbit_a.sin() * (120.0 + fraction * 40.0);
                    }
                    VisualMode::Pulse => {
                        let pump = (beat * TAU).sin().abs();
                        transform.scale.x *= 0.6 + pump * 1.4;
                        transform.scale.y *= 0.5 + pump * 2.2;
                        alpha *= 0.4 + pump * 0.9;
                    }
                    VisualMode::Spiral => {
                        let spiral_a = fraction * TAU * 3.0 + t * 0.5;
                        transform.translation.x = spiral_a.cos() * (160.0 + fraction * 100.0);
                        transform.translation.y = spiral_a.sin() * (160.0 + fraction * 100.0);
                        transform.rotation = Quat::from_rotation_z(spiral_a);
                        transform.scale.x *= 0.5;
                    }
                    VisualMode::Ripple => {
                        let ripple = (fraction * 10.0 - t * (1.1 + bass * 1.8)).sin();
                        transform.scale.x *= 1.0 + ripple.abs() * (0.5 + bass);
                        transform.scale.y *= 0.8 + ripple.abs() * (0.8 + bass * 0.6);
                        alpha *= 0.35 + ripple.abs() * 0.45;
                    }
                    VisualMode::Shatter => {
                        let shard = (fraction * 19.0 + t * 5.0).sin();
                        transform.translation.x += shard * (80.0 + high * 120.0);
                        transform.scale.x *= 0.35 + shard.abs();
                        alpha *= 0.3 + high * 0.55;
                    }
                    VisualMode::Flux => {
                        let flow = wave(t * 0.7 + fraction * 4.0);
                        transform.translation.x += flow * 90.0;
                        transform.translation.y -= flow * 50.0;
                        transform.rotation = Quat::from_rotation_z(flow * 0.5 + fraction);
                    }
                    VisualMode::Lattice => {
                        transform.translation.x = (transform.translation.x / 80.0).round() * 80.0;
                        transform.translation.y = (transform.translation.y / 50.0).round() * 50.0;
                        transform.scale.x *= 0.7 + (element.index % 4) as f32 * 0.12;
                    }
                    VisualMode::Drift => {
                        let drift_a = t * 0.12 + fraction * TAU;
                        transform.translation.x = drift_a.cos() * (140.0 + fraction * 40.0);
                        transform.translation.y = drift_a.sin() * (80.0 + fraction * 20.0);
                        alpha *= 0.55 + state.feedback * 0.25;
                    }
                    VisualMode::Storm => {
                        // Ghost layer: soft rain wash; brighten with the bolt envelope.
                        let fall = (t * 1.8 + fraction * 3.0 + element.seed).fract();
                        transform.translation.x += (fraction - 0.5) * 40.0 + fall * 30.0;
                        transform.translation.y = (0.5 - fall) * STAGE_HEIGHT * 0.6;
                        transform.rotation = Quat::from_rotation_z(-0.5);
                        transform.scale.x *= 0.35 + high * 0.4;
                        transform.scale.y *= 0.8 + trail_gain * 1.2 + beat_hit * 0.8;
                        alpha *= 0.2 + trail_gain * 0.45 + beat_hit * 0.5 + state.osc_pulse * 0.25;
                        hue += 200.0;
                    }
                    VisualMode::Echo if trail_gain > 0.0 => {
                        let life2 = (t * (0.45 + trail_gain * 1.1) + fraction * 1.6).fract();
                        let trail2 = (1.0 - life2).powf(1.8 - trail_gain * 1.1);
                        let ex = (t * 0.6 + fraction * 1.2).sin() * trail_gain * (70.0 + 90.0);
                        transform.translation.x += ex;
                        transform.scale.x *= 0.35 + trail_gain * 0.7 + high * 0.3 * trail_gain;
                        transform.scale.y *= (0.6 + trail2 * 1.6) * (0.8 + high * 0.3 * trail_gain);
                        alpha *= (trail2 * (0.7 + trail_gain * 0.5) + high * 0.15 * trail_gain) * trail_gain;
                    }
                    VisualMode::Echo => {}
                    VisualMode::Vortex => {
                        let va = fraction * TAU * 2.2 + t * (2.6 + bass * 3.4);
                        let vr = 110.0 - bass * 55.0;
                        transform.translation.x = va.cos() * vr;
                        transform.translation.y = va.sin() * (vr * 0.65);
                        transform.rotation = Quat::from_rotation_z(va * 2.0);
                        transform.scale.x *= 0.45 + bass * 0.8;
                        alpha *= 0.45 + bass * 0.5 + beat_hit * 0.4;
                    }
                    VisualMode::Fracture => {
                        let fj = (fraction * 23.0 + t * 9.0 + high * 6.0).sin();
                        transform.translation.x += fj * (55.0 + high * 85.0);
                        transform.scale.x *= 0.3 + fj.abs() * 0.8 + beat_hit;
                        alpha *= 0.25 + high * 0.5 + state.osc_pulse * 0.3;
                        hue += fj * 110.0;
                    }
                    VisualMode::Nebula => {
                        let nd = t * 0.09 + fraction * 1.1;
                        transform.translation.x = nd.cos() * (95.0 + mid * 40.0);
                        transform.translation.y = nd.sin() * (55.0 + high * 35.0);
                        transform.scale.x *= 1.4 + wave(t + fraction) * 1.6 + osc_drive * 0.8;
                        transform.scale.y *= 0.9 + (mid + high) * 0.5;
                        alpha *= 0.2 + (mid * 0.4 + high * 0.3) + state.feedback * 0.15;
                    }
                    VisualMode::Prism => {
                        let split = (element.index % 3) as f32 - 1.0;
                        let shimmer = wave(t * (0.8 + mid) + fraction * TAU * 2.0);
                        transform.translation.x += split * (44.0 + high * 72.0);
                        transform.translation.y += (shimmer - 0.5) * (34.0 + high * 44.0);
                        transform.rotation *= Quat::from_rotation_z(split * 0.35 + shimmer * 0.28);
                        transform.scale.x *= 0.7 + shimmer * 1.2 + high * 0.45;
                        alpha *= 0.36 + shimmer * 0.45 + high * 0.25;
                        hue += split * 90.0 + shimmer * 110.0;
                    }
                    VisualMode::Scanner => {
                        let scan = ((t * (0.5 + state.speed * 0.16 + high * 0.6) + fraction).fract() * 2.0)
                            - 1.0;
                        transform.translation.x = wave(t * 0.7 + fraction * 4.0) * STAGE_WIDTH * 0.16;
                        transform.translation.y = scan * STAGE_HEIGHT * 0.42;
                        transform.rotation = Quat::from_rotation_z(0.0);
                        transform.scale.x *= 1.55 + high * 0.9;
                        transform.scale.y *= 0.38 + state.osc_pulse * 1.4 + beat_hit * 0.6;
                        alpha *= 0.28 + state.osc_pulse * 0.65 + high * 0.28;
                        hue += 175.0 + scan * 65.0;
                    }
                    VisualMode::Comet => {
                        let ca = t * (1.2 + bass * 2.6) + fraction * TAU * 1.4;
                        let cr = 90.0 + fraction * 260.0 + bass * 55.0;
                        transform.translation.x = ca.cos() * cr;
                        transform.translation.y = ca.sin() * cr * 0.55;
                        transform.rotation = Quat::from_rotation_z(ca + TAU * 0.25);
                        transform.scale.x *= 0.38 + trail_gain * 0.8 + high * 0.3;
                        transform.scale.y *= 1.15 + bass * 1.2 + beat_hit * 0.7;
                        alpha *= 0.34 + bass * 0.48 + trail_gain * 0.36;
                        hue += ca.to_degrees() * 0.28 + bass * 55.0;
                    }
                    VisualMode::Bloom => {
                        let bloom = (wave(t * 0.32 + fraction * TAU) + beat_hit * 0.7 + cue_hit * 0.45)
                            .clamp(0.0, 1.7);
                        transform.translation.x *= 0.75 + bloom * 0.35;
                        transform.translation.y *= 0.75 + bloom * 0.35;
                        transform.scale.x *= 1.25 + bloom * 1.5 + state.feedback * 0.8;
                        transform.scale.y *= 0.9 + bloom * 0.9 + mid * 0.35;
                        alpha *= 0.18 + bloom * 0.45 + state.feedback * 0.3;
                        hue += 30.0 + bloom * 35.0;
                    }
                    // Mesh catalog owns the look; hide CPU geometry for this deck.
                    VisualMode::Figure => {
                        alpha = 0.0;
                    }
                    // Mathematical concepts - fall through to Beams
                    VisualMode::Hypercube
                    | VisualMode::CalabiYau
                    | VisualMode::Quasicrystal
                    | VisualMode::PenroseTiling
                    | VisualMode::SierpinskiTriangle
                    | VisualMode::TetrahedralMatrix
                    | VisualMode::BorromeanRings
                    | VisualMode::Torus
                    | VisualMode::PermutationGroups
                    | VisualMode::SymmetryGroups
                    | VisualMode::LieAlgebras
                    | VisualMode::LatticeTheory
                    | VisualMode::GraphTheory
                    | VisualMode::DesignTheory
                    | VisualMode::MandelbrotSet
                    | VisualMode::JuliaSets
                    | VisualMode::LorenzAttractor
                    | VisualMode::Functors
                    | VisualMode::ModularArithmetic
                    | VisualMode::PAdicNumbers
                    | VisualMode::VectorSpaces
                    | VisualMode::Eigenvectors
                    | VisualMode::BooleanLattices
                    | VisualMode::Forcing => {}
                    VisualMode::Beams => {}
                }

                hue += fraction * 90.0;
                alpha *= (trail_gain * (0.06 + 0.22 * sway) * trail_fade)
                    .max(0.0)
                    + state.flash * 0.08 * trail_fade;
                lightness += 0.08;
                }
            }
        }

        let strobe_boost = if matches!(element.kind, VisualKind::Ring) && !state.rings_enabled {
            0.0
        } else {
            strobe_alpha * deck_alpha
        };
        // Max brightness is a crossfade-deck master (beams/tiles only). Rings, ghosts,
        // and the GPU shader layer have their own opacity/brightness controls.
        let crossfade_master = match element.kind {
            VisualKind::Beam | VisualKind::Tile => state.max_brightness,
            _ => 1.0,
        };
        let alpha = ((alpha + strobe_boost) * crossfade_master).clamp(0.0, 1.0);
        let lightness = lightness
            * match element.kind {
                VisualKind::Beam | VisualKind::Tile => 0.45 + state.max_brightness * 0.55,
                _ => 1.0,
            };
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
    windows: Query<&Window, With<PrimaryWindow>>,
    palette_handle: Res<VjPaletteHandle>,
    grid_handle: Res<VjGridHandle>,
    imported_handle: Res<VjImportedHandle>,
    deck_a_handle: Option<Res<VjDeckPaletteAHandle>>,
    deck_b_handle: Option<Res<VjDeckPaletteBHandle>>,
    mut palette_materials: ResMut<Assets<VjPaletteMaterial>>,
    mut grid_materials: ResMut<Assets<VjGridMaterial>>,
    mut imported_materials: ResMut<Assets<VjImportedMaterial>>,
    mut gpu_quads: Query<(&GpuShaderQuad, &mut Visibility)>,
) {
    let any_gpu_enabled = state.gpu_deck_a_enabled || state.gpu_deck_b_enabled;
    let active = state.osc_connected || any_gpu_enabled;
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

    // GPU deck A/B layers: independently drive the enabled fullscreen
    // palette quads (indices 10/11) and crossfade their alphas via palette_extra.w.
    // Max brightness scales that crossfade mix only — not palette_brightness.
    if any_gpu_enabled {
        let a_var = palette_variant_from_ui(state.deck_a_gpu_shader);
        let b_var = palette_variant_from_ui(state.deck_b_gpu_shader);
        let cross = state.crossfade.clamp(0.0, 1.0);
        let master = state.max_brightness.clamp(0.0, 1.0);
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

        // Show only the deck layers; hide classic single-shader quads.
        for (quad, mut vis) in &mut gpu_quads {
            *vis = if (quad.index == 10 && state.gpu_deck_a_enabled)
                || (quad.index == 11 && state.gpu_deck_b_enabled)
            {
                Visibility::Inherited
            } else {
                Visibility::Hidden
            };
        }
        return;
    }

    // Neither GPU deck is enabled, so hide every GPU layer and leave the frame
    // to the independently-enabled CPU decks.
    for (_, mut vis) in &mut gpu_quads {
        *vis = Visibility::Hidden;
    }
    return;

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

fn wave(value: f32) -> f32 {
    value.sin() * 0.5 + 0.5
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
    let rgb = gray.lerp(rgb, saturation.clamp(0.0, 1.0)) * lightness.clamp(0.0, 0.92);

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

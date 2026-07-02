use std::f32::consts::TAU;

use bevy::{
    core_pipeline::tonemapping::Tonemapping,
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::{Shader, ShaderRef},
    sprite_render::{AlphaMode2d, Material2d, Material2dPlugin},
    window::{PresentMode, PrimaryWindow, WindowResolution},
    winit::WinitSettings,
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

fn main() {
    App::new()
        .insert_resource(ClearColor(Color::BLACK))
        .insert_resource(WinitSettings::continuous())
        .insert_resource(VjState::default())
        .add_plugins(DefaultPlugins.set(WindowPlugin {
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
        }))
        .add_plugins(Material2dPlugin::<VjPaletteMaterial>::default())
        .add_plugins(Material2dPlugin::<VjGridMaterial>::default())
        .add_plugins(Material2dPlugin::<VjImportedMaterial>::default())
        .add_systems(Startup, setup)
        .add_systems(
            Update,
            (
                read_osc_inputs,
                keyboard_controls,
                advance_clock,
                update_visuals,
                update_tunnel_rings,
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
            palette: 0.0,
            palette_r: 61.0 / 255.0,
            palette_g: 90.0 / 255.0,
            palette_b: 128.0 / 255.0,
            palette_saturation: 1.0,
            palette_brightness: 1.0,
            grid_density: 0.5,
            grid_diamond: 0.5,
            grid_line_width: 0.5,
            grid_shape_mix: 0.5,
            deck_a_mode: VisualMode::Beams,
            deck_b_mode: VisualMode::Tunnel,
            deck_a_gpu_shader: 0,
            deck_b_gpu_shader: 5,
            rings_enabled: true,
            ring_opacity: 1.0,
            strobe: false,
            strobe_lockout: false,
            blackout: false,
            freeze: false,
            show_gpu_palette: false,
            max_brightness: 0.9,
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
            active_shader: 0,
            beat_sync: true,
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

#[derive(Clone, Copy)]
enum VisualMode {
    Beams,
    Tunnel,
    Burst,
    Mirror,
    Wash,
    Strobe,
    Swarm,
    Orbit,
    Pulse,
    Spiral,
    Ripple,
    Shatter,
    Flux,
    Lattice,
    Drift,
    Storm,
    Echo,
    Vortex,
    Fracture,
    Nebula,
}

impl VisualMode {
    fn from_control(value: f32) -> Self {
        match value.round() as i32 {
            1 => Self::Tunnel,
            2 => Self::Burst,
            3 => Self::Mirror,
            4 => Self::Wash,
            5 => Self::Strobe,
            6 => Self::Swarm,
            7 => Self::Orbit,
            8 => Self::Pulse,
            9 => Self::Spiral,
            10 => Self::Ripple,
            11 => Self::Shatter,
            12 => Self::Flux,
            13 => Self::Lattice,
            14 => Self::Drift,
            15 => Self::Storm,
            16 => Self::Echo,
            17 => Self::Vortex,
            18 => Self::Fracture,
            19 => Self::Nebula,
            _ => Self::Beams,
        }
    }
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
        state.active_shader = browser_control_active_shader().min(25);
        state.beat_sync = browser_control_beat_sync();
        state.deck_a_mode = VisualMode::from_control(browser_control_deck_a_mode());
        state.deck_b_mode = VisualMode::from_control(browser_control_deck_b_mode());
        state.deck_a_gpu_shader = browser_control_deck_a_gpu_shader().min(25);
        state.deck_b_gpu_shader = browser_control_deck_b_gpu_shader().min(25);
        state.rings_enabled = browser_control_rings();
        state.ring_opacity = browser_control_ring_opacity().clamp(0.0, 1.0);
        state.strobe_lockout = browser_control_strobe_lockout();
        state.strobe = browser_control_strobe() && !state.strobe_lockout;
        state.blackout = browser_control_blackout();
        state.freeze = browser_control_freeze();
        state.show_gpu_palette = browser_control_show_gpu_palette();
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
/// Shadertoy API is unreachable. Also forces `active_shader = 9` so the
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
        state.active_shader = 9;
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

fn update_visuals(
    state: Res<VjState>,
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
    let blackout = if state.blackout { 0.0 } else { 1.0 };

    for (element, mut transform, material_handle) in &mut query {
        let deck_alpha = match element.deck {
            Deck::A => 1.0 - state.crossfade,
            Deck::B => state.crossfade,
        } * blackout;
        let deck_drive = match element.deck {
            Deck::A => state.osc_deck_a,
            Deck::B => state.osc_deck_b,
        }
        .clamp(0.0, 1.0);
        let deck_mode = match element.deck {
            Deck::A => state.deck_a_mode,
            Deck::B => state.deck_b_mode,
        };
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
                let fraction = element.index as f32 / DECK_A_BEAMS as f32;
                let layer = (element.index % 12) as f32 / 11.0;
                let depth = state.depth;
                let depth_wave = wave(t * 0.7 + layer * TAU + element.seed * 2.0);
                let perspective = 1.0 + depth * (layer - 0.45) * 0.85 + depth * depth_wave * 0.22;
                let spin = t
                    * (0.16
                        + intensity_drive * 0.16
                        + deck_drive * 0.22
                        + depth * 0.18
                        + mid * 0.28
                        + high * 0.18);
                let wobble = wave(t * 2.3 + element.seed * 9.0);
                let length = 370.0
                    + 240.0 * wave(t * 1.2 + fraction * TAU * 3.0) * motion_drive
                    + deck_drive * 160.0
                    + bass * 60.0
                    + depth * layer * 260.0;
                let width = 4.0
                    + 28.0 * (wobble * intensity_drive * motion_drive + beat_hit * 0.7)
                    + bass * 4.0
                    + high * wave(t * 12.0 + element.seed) * 2.5
                    + depth * layer * 14.0;
                let angle = fraction * TAU + spin;
                let radial_offset =
                    depth * (layer - 0.5) * (130.0 + depth_wave * 70.0) + bass_activity * 14.0;
                let side_offset = depth * (depth_wave - 0.5) * 60.0
                    + melodic_activity * 10.0 * wave(t * 9.0 + fraction);

                transform.translation = Vec3::new(
                    angle.cos() * radial_offset - angle.sin() * side_offset,
                    angle.sin() * radial_offset + angle.cos() * side_offset,
                    2.0 + fraction + layer * depth * 24.0,
                );
                transform.rotation = Quat::from_rotation_z(angle + depth * (layer - 0.5) * 0.28);
                transform.scale = Vec3::new(width * perspective, length * perspective, 1.0);

                match deck_mode {
                    VisualMode::Tunnel => {
                        let tunnel = 0.8 + layer * 1.6 + depth * 0.8;
                        transform.translation.z += layer * 18.0;
                        transform.scale.x *= 0.55 + tunnel * 0.18;
                        transform.scale.y *= tunnel + beat_hit * 0.9;
                        alpha *= 0.8 + layer * 0.9;
                        hue += 10.0 + layer * 12.0;
                    }
                    VisualMode::Burst => {
                        let burst = (beat_hit * 2.8 + cue_hit * 1.4).clamp(0.0, 2.2);
                        transform.translation.x *= 1.0 + burst * 0.9;
                        transform.translation.y *= 1.0 + burst * 0.9;
                        transform.scale.x *= 1.0 + burst * 1.6;
                        transform.scale.y *= 0.35 + burst * 0.9;
                        alpha *= 0.55 + burst;
                        hue += 210.0 + burst * 45.0;
                    }
                    VisualMode::Mirror => {
                        if element.index % 2 == 1 {
                            transform.translation.x = -transform.translation.x;
                            transform.rotation = Quat::from_rotation_z(-angle);
                        }
                        transform.scale.y *= 0.82 + wave(t * 2.0 + layer) * 0.45;
                        alpha *= 0.72 + high * 0.9;
                        hue += 130.0;
                    }
                    VisualMode::Wash => {
                        transform.scale.x *= 5.5 + state.feedback * 3.0;
                        transform.scale.y *= 0.28 + wave(t * 0.45 + fraction) * 0.2;
                        transform.translation.z = -2.0 + layer * 0.2;
                        alpha *= 0.18 + state.feedback * 0.45 + osc_drive * 0.22;
                        hue += 30.0;
                    }
                    VisualMode::Strobe => {
                        // Use the transient envelope so the strobe flashes on hits
                        // rather than staying solid during sustained bass energy.
                        let gate = (bass_activity + beat_hit * 1.4).clamp(0.0, 1.0);
                        let on = if gate > 0.38 { 1.0 } else { 0.12 };
                        alpha *= on;
                        transform.scale.y *= 1.0 + bass_activity * 0.7 + beat_hit * 0.6;
                        hue += beat_hit * 120.0 + fraction * 60.0;
                    }
                    VisualMode::Swarm => {
                        let dx = (t * 1.7 + element.seed * 11.0).sin() * 110.0;
                        let dy = (t * 2.1 + element.seed * 7.0).cos() * 90.0;
                        transform.translation.x += dx;
                        transform.translation.y += dy;
                        transform.rotation *= Quat::from_rotation_z(element.seed * 4.0 + t * 0.4);
                        transform.scale.y *= 0.7 + (t * 3.0 + element.seed * 5.0).sin().abs() * 0.6;
                        alpha *= 0.55 + osc_drive * 0.55;
                        hue += element.seed * 220.0;
                    }
                    VisualMode::Orbit => {
                        let orbit_r = 140.0 + layer * 100.0;
                        let orbit_a = t * (0.45 + element.seed * 0.4) + element.seed * TAU;
                        transform.translation.x += orbit_a.cos() * orbit_r;
                        transform.translation.y += orbit_a.sin() * orbit_r * 0.75;
                        transform.rotation = Quat::from_rotation_z(orbit_a + TAU * 0.25);
                        transform.scale.y *= 0.8 + layer * 0.6;
                        alpha *= 0.7 + layer * 0.4;
                        hue += orbit_a.to_degrees() * 0.08;
                    }
                    VisualMode::Pulse => {
                        let pump = (beat * TAU).sin().abs();
                        let s = 0.55 + pump * 1.6 + beat_hit * 0.5;
                        transform.scale.x *= s;
                        transform.scale.y *= 1.0 + pump * 0.8;
                        alpha *= 0.35 + pump * 0.9;
                        hue += pump * 80.0;
                    }
                    VisualMode::Spiral => {
                        let spiral_a = fraction * TAU * 4.0 + t * 0.4;
                        let spiral_r = 80.0 + fraction * 380.0 + bass * 80.0;
                        transform.translation.x = spiral_a.cos() * spiral_r;
                        transform.translation.y = spiral_a.sin() * spiral_r;
                        transform.rotation = Quat::from_rotation_z(spiral_a + TAU * 0.25);
                        transform.scale.y *= 1.1 + fraction * 0.5;
                        hue += fraction * 360.0;
                    }
                    VisualMode::Ripple => {
                        let ripple = (fraction * 12.0 - t * (1.4 + bass * 2.2)).sin();
                        let swell = 1.0 + ripple * (0.22 + bass * 0.35) + beat_hit * 0.18;
                        transform.translation.x *= swell;
                        transform.translation.y *= swell;
                        transform.scale.x *= 0.85 + ripple.abs() * 0.35;
                        transform.scale.y *= 0.9 + ripple.abs() * 0.5;
                        alpha *= 0.55 + ripple.abs() * 0.45;
                        hue += ripple * 40.0;
                    }
                    VisualMode::Shatter => {
                        let shard = (element.seed * 17.3 + t * 3.7).sin() * 0.5 + 0.5;
                        let jitter = (shard * 2.0 - 1.0) * (28.0 + high * 72.0);
                        transform.translation.x += jitter;
                        transform.translation.y += jitter * 0.7;
                        transform.scale.x *= 0.35 + shard * 0.9 + high * 0.4;
                        transform.scale.y *= 0.25 + (1.0 - shard) * 0.8;
                        alpha *= 0.4 + high * 0.55;
                        hue += shard * 180.0;
                    }
                    VisualMode::Flux => {
                        let flow = wave(t * (0.9 + mid * 1.4) + element.seed * 3.0);
                        transform.translation.x += flow * (60.0 + mid * 90.0);
                        transform.translation.y += (1.0 - flow) * (40.0 + mid * 70.0);
                        transform.rotation *= Quat::from_rotation_z(flow * 0.35 + mid * 0.2);
                        transform.scale.y *= 0.75 + flow * 0.55;
                        alpha *= 0.6 + mid * 0.35;
                        hue += flow * 55.0;
                    }
                    VisualMode::Lattice => {
                        let snap_a = (angle / (TAU / 12.0)).round() * (TAU / 12.0);
                        let snap_r = (radial_offset / 40.0).round() * 40.0;
                        transform.rotation = Quat::from_rotation_z(snap_a);
                        transform.translation.x = snap_a.cos() * snap_r;
                        transform.translation.y = snap_a.sin() * snap_r;
                        transform.scale.x *= 0.7 + (element.index % 3) as f32 * 0.15;
                        alpha *= 0.65;
                        hue += (element.index % 6) as f32 * 22.0;
                    }
                    VisualMode::Drift => {
                        let drift_a = t * (0.08 + element.seed * 0.05) + element.seed * TAU;
                        transform.translation.x += drift_a.cos() * 36.0;
                        transform.translation.y += drift_a.sin() * 24.0;
                        transform.scale.y *= 0.9 + wave(t * 0.35 + element.seed) * 0.15;
                        alpha *= 0.45 + state.feedback * 0.25;
                        hue += element.seed * 40.0;
                    }
                    VisualMode::Storm => {
                        let chaos = (t * 7.0 + element.seed * 13.0).sin();
                        let surge = osc_drive * 0.8 + state.osc_pulse * 0.6 + beat_hit;
                        transform.translation.x *= 1.0 + chaos * surge * 0.45;
                        transform.translation.y *= 1.0 + (chaos * 0.7).cos() * surge * 0.35;
                        transform.scale.x *= 0.6 + surge * 1.4;
                        transform.scale.y *= 0.5 + surge * 1.1;
                        alpha *= 0.35 + surge * 0.75;
                        hue += chaos * 90.0 + surge * 60.0;
                    }
                    VisualMode::Echo if trail_gain > 0.0 => {
                        // Echo: feedback lengthens the trail, highs add extra ghost copies,
                        // bass widens the echo spacing. Multiple virtual positions per beam.
                        let echo_count = 1.0 + trail_gain * (2.5 + high * 1.2);
                        let echo_phase = (element.seed * 1.7 + t * (0.6 + mid * 0.8)).fract();
                        let echo_off = (echo_phase * echo_count).floor();
                        let echo_mix = (echo_phase * echo_count).fract();
                        let lag = echo_off * trail_gain * (18.0 + 32.0 + bass * 24.0);
                        let echo_x = (t * 0.4 + element.seed).sin() * lag * 0.6;
                        let echo_y = (t * 0.3 + element.seed * 1.3).cos() * lag * 0.5;
                        transform.translation.x += echo_x + (echo_mix - 0.5) * 22.0 * high * trail_gain;
                        transform.translation.y += echo_y - lag * 0.03 * bass_activity;
                        transform.scale.y *= 0.7 + echo_mix * 0.9 * trail_gain + state.osc_pulse * 0.6;
                        transform.scale.x *= 0.85 + high * 0.6 * trail_gain;
                        alpha *= (0.6 - echo_mix * 0.55) * (0.7 + trail_gain * 0.6) * trail_gain;
                        hue += echo_off * 28.0 + high * 55.0 * trail_gain;
                    }
                    VisualMode::Echo => {}
                    VisualMode::Vortex => {
                        // Vortex: bass pulls inward and speeds spin; mids add arm count.
                        let pull = bass * 1.6 + osc_drive * 0.6 + beat_hit * 0.8;
                        let arms = 3.0 + mid * 7.0;
                        let swirl = (fraction * arms + t * (1.8 + bass * 3.2 + pull * 1.4)) * TAU;
                        let vr = 90.0 - pull * 70.0 + (element.seed - 0.5) * 30.0;
                        transform.translation.x = swirl.cos() * vr + (high * 18.0) * (t * 2.0 + element.seed).sin();
                        transform.translation.y = swirl.sin() * vr * 0.8 - pull * 12.0;
                        transform.rotation = Quat::from_rotation_z(swirl * 1.6 + pull * 1.2);
                        transform.scale.x *= 0.6 + (1.0 - pull * 0.6).max(0.2) + state.osc_pulse * 0.5;
                        transform.scale.y *= 1.1 + pull * 0.9 + beat_hit;
                        alpha *= 0.55 + pull * 0.5 + melodic_activity * 0.3;
                        hue += swirl.to_degrees() * 0.6 + pull * 45.0;
                    }
                    VisualMode::Fracture => {
                        // Fracture: high rips shards apart; pulse cracks scale on beat.
                        let crack = (high * 2.8 + state.osc_pulse * 1.6 + beat_hit * 2.2).clamp(0.0, 3.5);
                        let shard = (element.seed * 29.0 + t * 11.0 + high * 4.0).sin();
                        let jx = shard * (12.0 + crack * 48.0);
                        let jy = (shard * 0.7 + (t * 13.0 + element.seed).cos() * 0.3) * (10.0 + crack * 38.0);
                        transform.translation.x += jx;
                        transform.translation.y += jy;
                        transform.scale.x *= 0.35 + (1.0 - shard.abs() * 0.6) * (0.9 + high * 0.8) + crack * 0.15;
                        transform.scale.y *= 0.25 + (0.6 + shard.abs() * 0.7) * (0.8 + beat_hit);
                        transform.rotation *= Quat::from_rotation_z(shard * 1.8 + crack * 0.7);
                        alpha *= (0.35 + crack * 0.25).min(1.0) + high * 0.25;
                        hue += shard * 160.0 + crack * 35.0 + high * 70.0;
                    }
                    VisualMode::Nebula => {
                        // Nebula: large soft drifting forms; mid/high control density and glow.
                        let drift = t * (0.07 + element.seed * 0.04) + element.seed * TAU * 0.6;
                        let swell = wave(t * (0.6 + melodic_activity * 1.1) + element.seed * 2.0);
                        let cx = drift.cos() * (42.0 + mid * 55.0);
                        let cy = drift.sin() * (30.0 + high * 48.0);
                        transform.translation.x += cx + (swell - 0.5) * 18.0;
                        transform.translation.y += cy * 0.9;
                        transform.scale.x *= 2.4 + swell * 1.8 + osc_drive * 1.1;
                        transform.scale.y *= 1.6 + swell * 1.2 + bass_activity * 0.7;
                        alpha *= 0.22 + swell * 0.55 + (mid + high) * 0.25 + state.feedback * 0.2;
                        hue += drift.to_degrees() * 0.12 + mid * 30.0 + swell * 25.0;
                    }
                    VisualMode::Beams => {}
                }

                hue += match deck_mode {
                    VisualMode::Tunnel => fraction * 18.0,
                    _ => fraction * 180.0,
                };
                alpha *= 0.04
                    + 0.64 * intensity_drive * wobble * motion_drive
                    + bass_activity * 0.1
                    + melodic_activity * 0.08 * wave(t * 16.0 + element.seed)
                    + state.flash * 0.35;
                lightness += beat_hit * 0.04
                    + state.flash * 0.2
                    + deck_drive * 0.08
                    + depth * layer * 0.06
                    + high * 0.04;
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
                let x_step = STAGE_WIDTH / DECK_B_COLS as f32;
                let y_step = STAGE_HEIGHT / DECK_B_ROWS as f32;
                let x = -STAGE_WIDTH / 2.0 + x_step * (element.col as f32 + 0.5);
                let y = -STAGE_HEIGHT / 2.0 + y_step * (element.row as f32 + 0.5);
                let diagonal = element.col as f32 * 0.32 + element.row as f32 * 0.41;
                let pulse = wave(
                    t * (3.8 + melodic_activity * 5.5) - diagonal * 1.7
                        + beat_hit * 2.0
                        + deck_drive,
                );
                let size = 14.0
                    + pulse * 58.0 * intensity_drive * motion_drive
                    + beat_hit * 30.0
                    + deck_drive * 42.0
                    + melodic_activity * 11.0;
                let shear = wave(t * (1.1 + melodic_activity * 1.6) + element.seed)
                    * (0.35 + melodic_activity * 0.12);

                transform.translation = Vec3::new(x + shear * 26.0, y - shear * 18.0, 8.0 + pulse);
                transform.rotation = Quat::from_rotation_z((pulse - 0.5) * 0.5 + t * 0.07);
                transform.scale = Vec3::new(size * (1.1 + pulse), size, 1.0);

                match deck_mode {
                    VisualMode::Tunnel => {
                        let centered_x = x / (STAGE_WIDTH * 0.5);
                        let centered_y = y / (STAGE_HEIGHT * 0.5);
                        let radius = (centered_x * centered_x + centered_y * centered_y).sqrt();
                        let tunnel = (1.0 - radius).clamp(0.0, 1.0);
                        transform.translation.x *= 0.75 + tunnel * state.depth;
                        transform.translation.y *= 0.75 + tunnel * state.depth;
                        transform.translation.z += tunnel * 24.0;
                        transform.scale *= 0.7 + tunnel * 1.8 + beat_hit;
                        alpha *= 0.7 + tunnel;
                    }
                    VisualMode::Burst => {
                        let center_push = beat_hit * 72.0 + cue_hit * 96.0;
                        transform.translation.x += x.signum() * center_push;
                        transform.translation.y += y.signum() * center_push * 0.56;
                        transform.scale *= 0.7 + beat_hit * 2.1 + high;
                        alpha *= 0.65 + beat_hit * 1.6 + melodic_activity;
                    }
                    VisualMode::Mirror => {
                        if (element.col + element.row) % 2 == 0 {
                            transform.rotation *= Quat::from_rotation_z(TAU * 0.25);
                        }
                        transform.translation.x = transform.translation.x.abs()
                            * if element.col % 2 == 0 { 1.0 } else { -1.0 };
                        alpha *= 0.8 + wave(t * 4.0 + diagonal) * 0.45;
                        hue += 110.0;
                    }
                    VisualMode::Wash => {
                        transform.scale.x *= 2.8 + state.feedback * 2.2;
                        transform.scale.y *= 0.45 + pulse * 0.5;
                        alpha *= 0.22 + state.feedback * 0.52;
                        hue += 45.0;
                    }
                    VisualMode::Strobe => {
                        // Use transient envelope for flashing, not sustained bass level.
                        let gate = (bass_activity + beat_hit * 1.3).clamp(0.0, 1.0);
                        let on = if gate > 0.35 { 1.0 } else { 0.1 };
                        alpha *= on;
                        transform.scale *= 1.0 + bass_activity * 0.8;
                        if (t * 4.0).sin() > 0.0 && (element.col + element.row) % 2 == 0 {
                            hue += 180.0;
                        }
                    }
                    VisualMode::Swarm => {
                        let dx = (t * 1.8 + element.seed * 9.0).sin() * 32.0;
                        let dy = (t * 2.2 + element.seed * 6.0).cos() * 28.0;
                        transform.translation.x += dx;
                        transform.translation.y += dy;
                        transform.rotation *= Quat::from_rotation_z(element.seed * 6.0 + t * 0.5);
                        alpha *= 0.65;
                    }
                    VisualMode::Orbit => {
                        let orbit_a = t * 0.9 + diagonal;
                        let orbit_r = 14.0 + bass * 28.0;
                        transform.translation.x += orbit_a.cos() * orbit_r;
                        transform.translation.y += orbit_a.sin() * orbit_r;
                    }
                    VisualMode::Pulse => {
                        let pump = (beat * TAU).sin().abs();
                        transform.scale *= 0.5 + pump * 2.0;
                        alpha *= 0.3 + pump * 1.0;
                        hue += pump * 60.0;
                    }
                    VisualMode::Spiral => {
                        let spiral_a = diagonal * 0.3 + t * 0.45;
                        transform.translation.x = spiral_a.cos() * (60.0 + diagonal * 50.0);
                        transform.translation.y = spiral_a.sin() * (60.0 + diagonal * 50.0);
                        transform.rotation = Quat::from_rotation_z(spiral_a + diagonal * 0.5);
                    }
                    VisualMode::Ripple => {
                        let centered_x = x / (STAGE_WIDTH * 0.5);
                        let centered_y = y / (STAGE_HEIGHT * 0.5);
                        let radius = (centered_x * centered_x + centered_y * centered_y).sqrt();
                        let ripple = (radius * 10.0 - t * (1.6 + bass * 2.0)).sin();
                        transform.translation.x += centered_x * ripple * (24.0 + bass * 40.0);
                        transform.translation.y += centered_y * ripple * (24.0 + bass * 40.0);
                        transform.scale *= 0.8 + ripple.abs() * 0.55;
                        alpha *= 0.55 + ripple.abs() * 0.4;
                    }
                    VisualMode::Shatter => {
                        let shard = (element.seed * 11.0 + t * 4.2).sin();
                        transform.translation.x += shard * (18.0 + high * 42.0);
                        transform.translation.y += (element.seed * 7.0 + t).cos() * (14.0 + high * 30.0);
                        transform.scale *= 0.55 + shard.abs() * 0.9;
                        alpha *= 0.45 + high * 0.5;
                        hue += shard * 120.0;
                    }
                    VisualMode::Flux => {
                        let flow = wave(t * (1.0 + mid * 1.2) + diagonal);
                        transform.translation.x += flow * 22.0;
                        transform.translation.y -= flow * 16.0;
                        transform.rotation *= Quat::from_rotation_z(flow * 0.4);
                        alpha *= 0.65 + mid * 0.3;
                    }
                    VisualMode::Lattice => {
                        let snap_x = (x / 48.0).round() * 48.0;
                        let snap_y = (y / 48.0).round() * 48.0;
                        transform.translation.x = snap_x + (element.col % 2) as f32 * 6.0;
                        transform.translation.y = snap_y + (element.row % 2) as f32 * 6.0;
                        transform.scale *= 0.85 + (element.col % 3) as f32 * 0.12;
                    }
                    VisualMode::Drift => {
                        let drift = wave(t * 0.25 + diagonal * 0.4);
                        transform.translation.x += drift * 18.0;
                        transform.translation.y += (1.0 - drift) * 12.0;
                        alpha *= 0.35 + state.feedback * 0.35;
                    }
                    VisualMode::Storm => {
                        let chaos = (t * 6.0 + diagonal * 2.5).sin();
                        let surge = osc_drive + state.osc_pulse * 0.8 + beat_hit;
                        transform.translation.x += chaos * surge * 28.0;
                        transform.translation.y += (chaos * 0.7).cos() * surge * 22.0;
                        transform.scale *= 0.55 + surge * 1.5;
                        alpha *= 0.35 + surge * 0.8;
                    }
                    VisualMode::Echo if trail_gain > 0.0 => {
                        let echo = wave(t * (1.4 + trail_gain * 1.8) + diagonal * 2.2);
                        let lag = (echo * (1.0 + trail_gain * 1.5) + high * 0.4 * trail_gain) * 22.0;
                        transform.translation.x += lag * (diagonal - 0.5);
                        transform.translation.y -= lag * 0.6;
                        transform.scale *= 0.7 + echo * 0.9 * trail_gain + high * 0.6 * trail_gain;
                        alpha *= (0.4 + trail_gain * 0.5 + high * 0.25 * trail_gain) * trail_gain;
                        hue += echo * 80.0 * trail_gain + high * 40.0 * trail_gain;
                    }
                    VisualMode::Echo => {}
                    VisualMode::Vortex => {
                        let pull = bass * 1.4 + beat_hit * 0.7;
                        let va = diagonal * 2.8 + t * (2.2 + pull * 2.4);
                        transform.translation.x = (x * 0.6 + pull * -18.0) + va.cos() * (16.0 + pull * 18.0);
                        transform.translation.y = (y * 0.6 + pull * -14.0) + va.sin() * (12.0 + pull * 14.0);
                        transform.rotation = Quat::from_rotation_z(va * 1.3);
                        transform.scale *= 0.55 + pull * 1.1;
                        alpha *= 0.5 + pull * 0.6;
                    }
                    VisualMode::Fracture => {
                        let shard = (diagonal * 13.0 + t * 5.5 + high * 3.0).sin();
                        transform.translation.x += shard * (16.0 + high * 36.0);
                        transform.translation.y += (1.0 - shard.abs()) * high * -22.0;
                        transform.scale *= 0.45 + shard.abs() * 0.7 + beat_hit * 1.1;
                        alpha *= 0.4 + high * 0.45 + beat_hit * 0.3;
                        hue += shard * 140.0;
                    }
                    VisualMode::Nebula => {
                        let cloud = wave(t * 0.55 + diagonal * 1.3);
                        transform.translation.x += cloud * 26.0 * mid;
                        transform.translation.y += (cloud - 0.5) * 20.0 * high;
                        transform.scale *= 1.8 + cloud * 2.2 + osc_drive * 0.9;
                        alpha *= 0.18 + cloud * 0.5 + (mid + high) * 0.22;
                    }
                    VisualMode::Beams => {}
                }

                hue += 190.0 + diagonal * 38.0;
                alpha *= 0.05
                    + pulse * 0.8 * intensity_drive * motion_drive
                    + melodic_activity * 0.11 * wave(t * 14.0 + element.seed)
                    + state.flash * 0.35;
                lightness += pulse * 0.12 + melodic_activity * 0.06;
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
                        let chaos = (t * 5.5 + fraction * 11.0).sin();
                        let surge = osc_drive + state.osc_pulse + beat_hit;
                        transform.scale.x *= 0.4 + surge * 2.0;
                        transform.scale.y *= 0.35 + surge * 1.6;
                        transform.translation.x *= 1.0 + chaos * surge * 0.5;
                        alpha *= 0.25 + surge * 0.7;
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
    // Active whenever OSC is delivering audio; show_gpu_palette forces it on without OSC.
    let active = state.osc_connected || state.show_gpu_palette;
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

    // GPU deck A/B layers: when show_gpu_palette is on we drive two fullscreen
    // palette quads (indices 10/11) and crossfade their alphas via palette_extra.w.
    // Max brightness scales that crossfade mix only — not palette_brightness.
    if state.show_gpu_palette {
        let a_var = state.deck_a_gpu_shader as f32;
        let b_var = state.deck_b_gpu_shader as f32;
        let cross = state.crossfade.clamp(0.0, 1.0);
        let master = state.max_brightness.clamp(0.0, 1.0);
        let alpha_a = ((1.0 - cross) * master).clamp(0.0, 1.0);
        let alpha_b = (cross * master).clamp(0.0, 1.0);

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
            *vis = if quad.index == 10 || quad.index == 11 {
                Visibility::Inherited
            } else {
                Visibility::Hidden
            };
        }
        return;
    }

    // Legacy single-shader picker path (active when GPU palette is not forced on).
    // active_shader routing:
    //   0..=3 → palette quad (Rehoboam/Spokes/Rings/Plasma via geometry_field)
    //   4     → grid quad
    //   5..=8 → palette quad (Tunnel/Glitch/Fluid/Truchet)
    //   9     → imported quad (Shadertoy hot-swap slot)
    //   10..=17 → palette quad (Bass Reactor … Bass Portal)
    //   18..=25 → palette quad (new creative variants)
    let (quad_index, palette_variant) = if state.active_shader == 4 {
        (1u32, 0.0)
    } else if state.active_shader == 9 {
        (2u32, 0.0)
    } else {
        (0u32, state.active_shader as f32)
    };

    let params = Vec4::new(display_hue, state.show_time, palette_variant, aspect);
    let grid_params = Vec4::new(
        state.palette_r,
        state.palette_g,
        state.show_time,
        state.palette_b,
    );
    let palette_extra = Vec4::new(
        palette_extra_base.x,
        palette_extra_base.y,
        palette_extra_base.z,
        1.0,
    );

    if let Some(mat) = palette_materials.get_mut(&palette_handle.0) {
        mat.params = params;
        mat.palette_extra = palette_extra;
        mat.audio_uniforms = audio_uniforms;
        mat.palette_rgb = palette_rgb;
    }
    if let Some(mat) = grid_materials.get_mut(&grid_handle.0) {
        mat.params = grid_params;
        mat.palette_extra = palette_extra;
        mat.audio_uniforms = audio_uniforms;
        mat.grid_extra = Vec4::new(
            state.grid_density,
            state.grid_diamond,
            state.grid_line_width,
            state.grid_shape_mix,
        );
    }
    if let Some(mat) = imported_materials.get_mut(&imported_handle.0) {
        mat.params = params;
        mat.palette_extra = palette_extra;
        mat.audio_uniforms = audio_uniforms;
        mat.palette_rgb = palette_rgb;
    }

    for (quad, mut vis) in &mut gpu_quads {
        *vis = if quad.index == quad_index {
            Visibility::Inherited
        } else {
            Visibility::Hidden
        };
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

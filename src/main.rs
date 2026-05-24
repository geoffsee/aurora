use std::f32::consts::TAU;

use bevy::{
    core_pipeline::tonemapping::Tonemapping,
    prelude::*,
    render::render_resource::AsBindGroup,
    shader::ShaderRef,
    sprite_render::{AlphaMode2d, Material2d, Material2dPlugin},
    window::{PresentMode, WindowResolution},
    winit::WinitSettings,
};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
unsafe extern "C" {
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscConnected)]
    fn browser_osc_connected() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscPlaying)]
    fn browser_osc_playing() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscTempo)]
    fn browser_osc_tempo() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscEnergy)]
    fn browser_osc_energy() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscDeckA)]
    fn browser_osc_deck_a() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscDeckB)]
    fn browser_osc_deck_b() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscBass)]
    fn browser_osc_bass() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscMid)]
    fn browser_osc_mid() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscHigh)]
    fn browser_osc_high() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscOscPulse)]
    fn browser_osc_pulse() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlConnected)]
    fn browser_control_connected() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlCrossfade)]
    fn browser_control_crossfade() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlBpm)]
    fn browser_control_bpm() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlSpeed)]
    fn browser_control_speed() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlIntensity)]
    fn browser_control_intensity() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlFeedback)]
    fn browser_control_feedback() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlDepth)]
    fn browser_control_depth() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlPalette)]
    fn browser_control_palette() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlDeckAMode)]
    fn browser_control_deck_a_mode() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlDeckBMode)]
    fn browser_control_deck_b_mode() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlRings)]
    fn browser_control_rings() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlRingOpacity)]
    fn browser_control_ring_opacity() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlStrobe)]
    fn browser_control_strobe() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlStrobeLockout)]
    fn browser_control_strobe_lockout() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlBlackout)]
    fn browser_control_blackout() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlFreeze)]
    fn browser_control_freeze() -> bool;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlMaxBrightness)]
    fn browser_control_max_brightness() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlFlashVersion)]
    fn browser_control_flash_version() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlResetVersion)]
    fn browser_control_reset_version() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlCueVersion)]
    fn browser_control_cue_version() -> u32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlCueIntensity)]
    fn browser_control_cue_intensity() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlCuePalette)]
    fn browser_control_cue_palette() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlCueCrossfade)]
    fn browser_control_cue_crossfade() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlCueDeckAMode)]
    fn browser_control_cue_deck_a_mode() -> f32;
    #[wasm_bindgen(js_namespace = window, js_name = __bevyoscControlCueDeckBMode)]
    fn browser_control_cue_deck_b_mode() -> f32;
}

/// GPU material driven by the `palette` OSC control.
/// The fragment shader (`assets/shaders/vj_palette.wgsl`) receives `params`
/// as a vec4 uniform: x=hue_shift (0..1), y=show_time (seconds).
#[derive(AsBindGroup, Asset, TypePath, Clone)]
struct VjPaletteMaterial {
    #[uniform(0)]
    params: Vec4,
}

impl Material2d for VjPaletteMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/vj_palette.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

#[derive(Resource)]
struct VjPaletteHandle(Handle<VjPaletteMaterial>);

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
const AUDIO_GATE_START: f32 = 0.02;
const AUDIO_GATE_END: f32 = 0.08;
const AUDIO_ATTACK_SPEED: f32 = 14.0;
const AUDIO_RELEASE_SPEED: f32 = 5.0;
const PULSE_ATTACK_SPEED: f32 = 24.0;
const PULSE_RELEASE_SPEED: f32 = 7.0;

fn main() {
    App::new()
        .insert_resource(ClearColor(Color::BLACK))
        .insert_resource(WinitSettings::continuous())
        .insert_resource(VjState::default())
        .add_plugins(Material2dPlugin::<VjPaletteMaterial>::default())
        .add_plugins(DefaultPlugins.set(WindowPlugin {
            primary_window: Some(Window {
                title: "bevyosc VJ".into(),
                canvas: Some("#bevy-canvas".into()),
                resolution: WindowResolution::new(1280, 720).with_scale_factor_override(1.0),
                fit_canvas_to_parent: true,
                prevent_default_event_handling: true,
                present_mode: PresentMode::AutoVsync,
                ..default()
            }),
            ..default()
        }))
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
    deck_a_mode: VisualMode,
    deck_b_mode: VisualMode,
    rings_enabled: bool,
    ring_opacity: f32,
    strobe: bool,
    strobe_lockout: bool,
    blackout: bool,
    freeze: bool,
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
    osc_pulse: f32,
    last_control_flash_version: u32,
    last_control_reset_version: u32,
    last_control_cue_version: u32,
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
            deck_a_mode: VisualMode::Beams,
            deck_b_mode: VisualMode::Tunnel,
            rings_enabled: true,
            ring_opacity: 1.0,
            strobe: false,
            strobe_lockout: true,
            blackout: false,
            freeze: false,
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
            osc_pulse: 0.0,
            last_control_flash_version: 0,
            last_control_reset_version: 0,
            last_control_cue_version: 0,
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
}

impl VisualMode {
    fn from_control(value: f32) -> Self {
        match value.round() as i32 {
            1 => Self::Tunnel,
            2 => Self::Burst,
            3 => Self::Mirror,
            4 => Self::Wash,
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

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
    mut standard_materials: ResMut<Assets<StandardMaterial>>,
    mut palette_materials: ResMut<Assets<VjPaletteMaterial>>,
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
    let circle = meshes.add(Circle::new(1.0));
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
            Mesh2d(circle.clone()),
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

    // GPU palette background: sits between the black fill (z=-20) and the ghost
    // layer (z=-8). Alpha-blended; hue_shift and show_time are updated each frame
    // by `update_palette_material` from the live `VjState`.
    let gpu_mat = palette_materials.add(VjPaletteMaterial {
        params: Vec4::ZERO,
    });
    commands.insert_resource(VjPaletteHandle(gpu_mat.clone()));
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(gpu_mat),
        Transform::from_xyz(0.0, 0.0, -15.0)
            .with_scale(Vec3::new(STAGE_WIDTH, STAGE_HEIGHT, 1.0)),
    ));

    // The control surface now lives on port 3001, so the projector output has no HUD.
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

    state.osc_energy = smooth_audio(state.osc_energy, target_energy, dt);
    state.osc_deck_a = smooth_audio(state.osc_deck_a, target_deck_a, dt);
    state.osc_deck_b = smooth_audio(state.osc_deck_b, target_deck_b, dt);
    state.osc_bass = smooth_audio(state.osc_bass, target_bass, dt);
    state.osc_mid = smooth_audio(state.osc_mid, target_mid, dt);
    state.osc_high = smooth_audio(state.osc_high, target_high, dt);
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
        state.deck_a_mode = VisualMode::from_control(browser_control_deck_a_mode());
        state.deck_b_mode = VisualMode::from_control(browser_control_deck_b_mode());
        state.rings_enabled = browser_control_rings();
        state.ring_opacity = browser_control_ring_opacity().clamp(0.0, 1.0);
        state.strobe_lockout = browser_control_strobe_lockout();
        state.strobe = browser_control_strobe() && !state.strobe_lockout;
        state.blackout = browser_control_blackout();
        state.freeze = browser_control_freeze();
        state.max_brightness = browser_control_max_brightness().clamp(0.1, 1.0);

        if flash_version != state.last_control_flash_version {
            state.flash = 1.0;
            state.last_control_flash_version = flash_version;
        }
        if cue_version != state.last_control_cue_version {
            state.cue_boost = 1.0;
            state.flash = state.flash.max(0.6);
            state.intensity = browser_control_cue_intensity().clamp(0.05, 1.5);
            state.palette = browser_control_cue_palette().clamp(0.0, 1.0);
            state.crossfade = browser_control_cue_crossfade().clamp(0.0, 1.0);
            state.deck_a_mode = VisualMode::from_control(browser_control_cue_deck_a_mode());
            state.deck_b_mode = VisualMode::from_control(browser_control_cue_deck_b_mode());
            state.last_control_cue_version = cue_version;
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn read_osc_inputs(_state: ResMut<VjState>) {}

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
    }
    if keys.just_pressed(KeyCode::KeyE) {
        state.palette = (state.palette + 0.025).rem_euclid(1.0);
    }
    if keys.just_pressed(KeyCode::KeyF) {
        state.flash = 1.0;
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
    let audio_active = osc_drive > 0.001 || bass > 0.001 || mid > 0.001 || high > 0.001;
    let manual_beat_hit = (1.0 - beat).powf(8.0);
    let cue_hit = state.cue_boost.powf(1.25);
    let beat_hit = (if state.osc_connected {
        state.osc_pulse.powf(1.35) * (bass * 0.8 + osc_drive * 0.2) * OSC_PULSE_GAIN
    } else {
        manual_beat_hit
    }) + cue_hit * 0.38;
    let band_drive = bass * 0.45 + mid * 0.35 + high * 0.2;
    let intensity_drive =
        (state.intensity * (0.75 + band_drive * 0.95 + cue_hit * 0.55)).clamp(0.05, 2.4);
    let motion_drive = if state.osc_connected {
        (band_drive * AUDIO_GEOMETRY_GAIN).clamp(0.0, 1.0)
    } else {
        1.0
    };
    let strobe_alpha = if state.strobe
        && if state.osc_connected {
            audio_active && state.osc_pulse > 0.45 && (high > 0.04 || bass > 0.08)
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
                    depth * (layer - 0.5) * (130.0 + depth_wave * 70.0) + bass * 8.0;
                let side_offset =
                    depth * (depth_wave - 0.5) * 60.0 + high * 6.0 * wave(t * 9.0 + fraction);

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
                        hue += 80.0 + layer * 120.0;
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
                    VisualMode::Beams => {}
                }

                hue += fraction * 180.0;
                alpha *= 0.04
                    + 0.64 * intensity_drive * wobble * motion_drive
                    + bass * 0.08
                    + high * 0.05 * wave(t * 16.0 + element.seed)
                    + state.flash * 0.35;
                lightness += beat_hit * 0.04
                    + state.flash * 0.2
                    + deck_drive * 0.08
                    + depth * layer * 0.06
                    + high * 0.04;
            }
            VisualKind::Ring => {
                let fraction = element.index as f32 / DECK_A_RINGS as f32;
                let pulse = wave(t * 3.2 - fraction * 3.4);
                let size = 90.0
                    + fraction * 560.0
                    + pulse * 80.0 * motion_drive
                    + beat_hit * 110.0
                    + deck_drive * 130.0
                    + mid * 35.0;

                transform.translation = Vec3::new(0.0, 0.0, 18.0 + fraction);
                transform.rotation = Quat::from_rotation_z(-t * (0.4 + fraction));
                transform.scale = Vec3::splat(size);

                match deck_mode {
                    VisualMode::Tunnel => {
                        let offset = (fraction - 0.5) * state.depth * 220.0;
                        transform.translation =
                            Vec3::new(offset * wave(t + fraction), offset, 24.0 + fraction * 20.0);
                        transform.scale *= 0.75 + fraction * 1.3 + beat_hit * 0.6;
                        alpha *= 1.15 + state.depth;
                    }
                    VisualMode::Burst => {
                        transform.scale *= 0.8 + beat_hit * 2.4 + cue_hit;
                        alpha *= 0.7 + beat_hit * 1.8;
                    }
                    VisualMode::Mirror => {
                        transform.translation.x = (fraction - 0.5) * STAGE_WIDTH * 0.55;
                        transform.scale.y *= 0.55;
                        alpha *= 0.8 + mid * 0.7;
                    }
                    VisualMode::Wash => {
                        transform.scale *= 1.9 + state.feedback;
                        alpha *= 0.4 + state.feedback * 0.5;
                    }
                    VisualMode::Beams => {}
                }

                hue += 35.0 + fraction * 240.0;
                alpha *= 0.02
                    + pulse * 0.18 * motion_drive
                    + beat_hit * 0.05
                    + mid * 0.08
                    + state.flash * 0.24;
                alpha *= state.ring_opacity;
                if !state.rings_enabled {
                    alpha = 0.0;
                }
                lightness += 0.1 + mid * 0.04;
            }
            VisualKind::Tile => {
                let x_step = STAGE_WIDTH / DECK_B_COLS as f32;
                let y_step = STAGE_HEIGHT / DECK_B_ROWS as f32;
                let x = -STAGE_WIDTH / 2.0 + x_step * (element.col as f32 + 0.5);
                let y = -STAGE_HEIGHT / 2.0 + y_step * (element.row as f32 + 0.5);
                let diagonal = element.col as f32 * 0.32 + element.row as f32 * 0.41;
                let pulse =
                    wave(t * (3.8 + high * 4.0) - diagonal * 1.7 + beat_hit * 2.0 + deck_drive);
                let size = 14.0
                    + pulse * 58.0 * intensity_drive * motion_drive
                    + beat_hit * 30.0
                    + deck_drive * 42.0
                    + high * 7.0;
                let shear = wave(t * (1.1 + high * 1.0) + element.seed) * (0.35 + high * 0.08);

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
                        alpha *= 0.65 + beat_hit * 1.6 + high;
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
                    VisualMode::Beams => {}
                }

                hue += 190.0 + diagonal * 38.0;
                alpha *= 0.05
                    + pulse * 0.8 * intensity_drive * motion_drive
                    + high * 0.08 * wave(t * 14.0 + element.seed)
                    + state.flash * 0.35;
                lightness += pulse * 0.12 + high * 0.04;
            }
            VisualKind::Ghost => {
                let fraction = element.index as f32 / 18.0;
                let angle = t * (0.08 + fraction * 0.04) + fraction * TAU;
                let sway = wave(t * 0.9 + element.seed * 4.0);

                transform.translation = Vec3::new(
                    angle.cos() * 120.0 * sway,
                    angle.sin() * 70.0 * (1.0 - sway),
                    -8.0 + fraction,
                );
                transform.rotation = Quat::from_rotation_z(angle);
                transform.scale = Vec3::new(
                    STAGE_WIDTH * (0.22 + state.feedback * 0.9 + bass * 0.05),
                    18.0 + 180.0 * state.feedback * wave(t + element.seed)
                        + mid * 18.0
                        + bass * 16.0,
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
                    VisualMode::Beams => {}
                }

                hue += fraction * 90.0;
                alpha *= state.feedback * (0.025 + 0.12 * sway) + state.flash * 0.08;
                lightness += 0.08;
            }
        }

        let alpha = ((alpha + strobe_alpha * deck_alpha) * state.max_brightness).clamp(0.0, 1.0);
        let lightness = lightness * (0.45 + state.max_brightness * 0.55);
        if let Some(material) = materials.get_mut(&material_handle.0) {
            material.color = palette_color(state.palette, hue, saturation, lightness, alpha);
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

    let bass = state.osc_bass.clamp(0.0, 1.0);
    let mid = state.osc_mid.clamp(0.0, 1.0);
    let drive = state.osc_energy.clamp(0.0, 1.0);
    let beat_hit = if state.osc_connected {
        state.osc_pulse.clamp(0.0, 1.0) * (bass * 0.8 + drive * 0.2)
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
        let radius = 1.5 + state.depth * 0.7 + bass * 0.25 + beat_hit * 0.18;
        transform.translation = Vec3::new(0.0, 0.0, z);
        transform.scale = Vec3::splat(radius);
        transform.rotation = Quat::from_rotation_z(state.show_time * 0.4 + ring.lane as f32 * 0.6);

        let hue =
            (state.palette * 360.0 + ring.lane as f32 * 18.0 + phase * 60.0).rem_euclid(360.0);
        let lightness = (0.45 + drive * 0.2 + mid * 0.15 + state.flash * 0.25).clamp(0.05, 0.85);
        let bell = (phase * TAU * 0.5).sin();
        let alpha =
            (bell * (0.55 + beat_hit * 0.45) * deck_mix * state.max_brightness).clamp(0.0, 1.0);

        if let Some(material) = materials.get_mut(&material_handle.0) {
            material.base_color = Color::hsla(hue, 0.85, lightness, alpha);
        }
    }
}

fn update_palette_material(
    state: Res<VjState>,
    handle: Res<VjPaletteHandle>,
    mut materials: ResMut<Assets<VjPaletteMaterial>>,
) {
    if let Some(mat) = materials.get_mut(&handle.0) {
        mat.params = Vec4::new(state.palette, state.show_time, 0.0, 0.0);
    }
}

fn beat_phase(state: &VjState) -> f32 {
    (state.show_time * state.bpm / 60.0).fract()
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

fn smooth_audio(current: f32, target: f32, dt: f32) -> f32 {
    smooth_signal(current, target, dt, AUDIO_ATTACK_SPEED, AUDIO_RELEASE_SPEED)
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

fn palette_color(palette: f32, hue: f32, saturation: f32, lightness: f32, alpha: f32) -> Color {
    let phase = (hue / 360.0).fract();
    let base_hue = palette.rem_euclid(1.0) * 360.0;
    let lightness = lightness.clamp(0.0, 0.86);
    let saturation = saturation.clamp(0.0, 1.0);

    let hue = base_hue + (phase - 0.5) * 42.0;

    Color::hsla(
        hue % 360.0,
        (saturation * 0.86).clamp(0.0, 1.0),
        lightness.clamp(0.0, 0.92),
        alpha,
    )
}

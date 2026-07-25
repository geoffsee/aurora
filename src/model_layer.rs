//! Mesh model layer for visualizations that bind deck modes to glTF assets.
//!
//! Catalog source of truth:
//! - `models/manifest.json` (docs + layout)
//! - `shared/model-catalog.ts` (TS tests / future UI)
//! - `MODEL_CATALOG` here (runtime Bevy spawn + update)
//!
//! Pattern: each catalog entry loads a `Handle<Gltf>`. When the asset is ready,
//! mesh primitives are spawned as children of a `ModelInstance` root (not
//! `SceneRoot` — scene spawn needs Reflect type registration that is easy to
//! miss under `default-features = false` / WASM). Visibility + transform are
//! driven from deck modes and audio.
//!
//! Stage lighting: an invisible ring of spotlights above the figure (sectional
//! halo) is driven from the same `ModelDrive` so intensity and hue ride bass /
//! mid / high / pulse without adding any visible fixtures.

use std::f32::consts::{FRAC_1_SQRT_2, FRAC_PI_6, PI, TAU};

use bevy::gltf::GltfMesh;
use bevy::prelude::*;

/// Number of discrete spots in the overhead stage halo.
pub const STAGE_HALO_SECTIONS: usize = 8;
/// Horizontal radius of the halo ring (world units, around the figure).
const STAGE_HALO_RADIUS: f32 = 1.65;
/// Height of the halo above the stage floor (Y-up).
const STAGE_HALO_HEIGHT: f32 = 3.15;
/// Aim point near torso height so cones wrap the figure without floor blow-out.
const STAGE_HALO_TARGET: Vec3 = Vec3::new(0.0, 0.35, 0.0);
/// Peak lumens per section when fully driven (Bevy default exposure is outdoor-ish).
const STAGE_HALO_PEAK_LUMENS: f32 = 48_000.0;
/// Soft idle floor so the figure never goes fully black when audio is quiet.
const STAGE_HALO_IDLE_LUMENS: f32 = 2_800.0;

/// Static description of one model under `models/*` (mirrored into assets/).
#[derive(Clone, Copy, Debug)]
pub struct ModelDef {
    /// Catalog id (mirrored in manifest / TS); kept for inspection & future UI.
    #[allow(dead_code)]
    pub id: &'static str,
    pub asset_path: &'static str,
    /// glTF scene index (documented for SceneRoot paths; mesh spawn uses meshes[]).
    #[allow(dead_code)]
    pub scene: usize,
    pub default_scale: f32,
    pub offset: Vec3,
    /// Extra root orientation applied after audio-driven yaw (glTF node fixups).
    pub base_rotation: Quat,
    /// Suggested default spin rate (controls UI seeds `figureSpin` from this).
    #[allow(dead_code)]
    pub yaw_speed: f32,
    /// Matches `VisualMode::from_control` integer (e.g. 24 = Figure).
    pub visual_mode: i32,
}

/// Registry of models available to visualizations. Keep in sync with
/// `models/manifest.json` and `shared/model-catalog.ts`.
pub const MODEL_CATALOG: &[ModelDef] = &[ModelDef {
    id: "human-female",
    asset_path: "models/human-female/source/74f42c5a92bbb95403c45ff3929560ae.glb",
    scene: 0,
    default_scale: 1.0,
    offset: Vec3::new(0.0, -1.0, 0.0),
    // Blender export node: 90° about X so the figure stands upright in Bevy Y-up.
    base_rotation: Quat::from_xyzw(FRAC_1_SQRT_2, 0.0, 0.0, FRAC_1_SQRT_2),
    yaw_speed: 0.35,
    visual_mode: 24,
}];

/// Marks a model root that visualizations drive (transform / visibility).
#[derive(Component)]
pub struct ModelInstance {
    pub catalog_index: usize,
    pub visual_mode: i32,
    pub base_scale: f32,
    pub offset: Vec3,
    pub base_rotation: Quat,
}

/// Waiting for `Assets<Gltf>` to finish loading before mesh children are spawned.
#[derive(Component)]
pub(crate) struct PendingGltfModel {
    handle: Handle<Gltf>,
}

/// One section of the invisible overhead stage-light halo.
///
/// Lights are pure `SpotLight` entities (no mesh), aimed at the figure. Intensity
/// and hue are driven each frame from audio bands so the ring reads as a
/// sectional, music-reactive halo rather than a flat key light.
#[derive(Component, Debug, Clone, Copy)]
pub struct StageHaloSection {
    pub index: usize,
}

/// Audio + deck weights consumed by the model layer each frame.
#[derive(Clone, Copy, Debug)]
pub struct ModelDrive {
    pub show_time: f32,
    pub intensity: f32,
    pub blackout: bool,
    pub freeze: bool,
    pub crossfade: f32,
    pub deck_a_mode: i32,
    pub deck_b_mode: i32,
    pub bass: f32,
    pub mid: f32,
    pub high: f32,
    pub energy: f32,
    pub pulse: f32,
    /// Catalog index selected in the controls UI (`figureModel`).
    pub figure_model: i32,
    /// Scale multiplier from UI (`figureScale`).
    pub figure_scale: f32,
    /// Absolute yaw rate from UI (`figureSpin`).
    pub figure_spin: f32,
    /// Halo brightness from UI (`figureHalo`).
    pub figure_halo: f32,
    /// Audio-reactivity amount from UI (`figureAudio`).
    pub figure_audio: f32,
}

impl Default for ModelDrive {
    fn default() -> Self {
        Self {
            show_time: 0.0,
            intensity: 1.0,
            blackout: false,
            freeze: false,
            crossfade: 0.5,
            deck_a_mode: 0,
            deck_b_mode: 0,
            bass: 0.0,
            mid: 0.0,
            high: 0.0,
            energy: 0.0,
            pulse: 0.0,
            figure_model: 0,
            figure_scale: 1.0,
            figure_spin: 0.35,
            figure_halo: 0.75,
            figure_audio: 1.0,
        }
    }
}

impl ModelDrive {
    /// Crossfade-weighted contribution when either deck is on this visual mode.
    pub fn weight_for_mode(self, visual_mode: i32) -> f32 {
        if self.blackout {
            return 0.0;
        }
        let a = if self.deck_a_mode == visual_mode {
            1.0 - self.crossfade
        } else {
            0.0
        };
        let b = if self.deck_b_mode == visual_mode {
            self.crossfade
        } else {
            0.0
        };
        (a + b).clamp(0.0, 1.0)
    }

    /// Max weight across every catalog visual mode (halo follows any active figure).
    pub fn model_layer_weight(self) -> f32 {
        MODEL_CATALOG
            .iter()
            .map(|def| self.weight_for_mode(def.visual_mode))
            .fold(0.0_f32, f32::max)
    }
}

/// Spawn one pending root per catalog entry plus a dim base rig and stage halo.
pub fn setup_model_layer(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut ambient_light: ResMut<AmbientLight>,
) {
    // Dim cool fill — previous ambient (120) + cinema point blew out PBR albedos.
    ambient_light.color = Color::srgb(0.55, 0.62, 0.78);
    ambient_light.brightness = 22.0;

    // Very soft key so silhouettes stay readable when the halo is quiet.
    commands.spawn((
        DirectionalLight {
            illuminance: 900.0,
            color: Color::srgb(0.85, 0.88, 1.0),
            shadows_enabled: false,
            ..default()
        },
        Transform::from_xyz(1.2, 5.0, 2.8).looking_at(STAGE_HALO_TARGET, Vec3::Y),
    ));

    // Invisible sectional halo: spots only (no fixture meshes).
    for index in 0..STAGE_HALO_SECTIONS {
        let phase = index as f32 / STAGE_HALO_SECTIONS as f32 * TAU;
        let pos = Vec3::new(
            phase.cos() * STAGE_HALO_RADIUS,
            STAGE_HALO_HEIGHT,
            phase.sin() * STAGE_HALO_RADIUS,
        );
        commands.spawn((
            SpotLight {
                // Start dark; `apply_stage_halo_section` raises lumens with audio.
                intensity: 0.0,
                range: 9.0,
                radius: 0.35,
                color: Color::srgb(0.9, 0.92, 1.0),
                shadows_enabled: false,
                // Narrow-ish stage cone; inner soft core + outer falloff.
                inner_angle: FRAC_PI_6 * 0.55,
                outer_angle: FRAC_PI_6 * 1.35,
                ..default()
            },
            Transform::from_translation(pos).looking_at(STAGE_HALO_TARGET, Vec3::Y),
            StageHaloSection { index },
        ));
    }

    for (index, def) in MODEL_CATALOG.iter().enumerate() {
        let handle: Handle<Gltf> = asset_server.load(def.asset_path);
        commands.spawn((
            Transform::from_translation(def.offset)
                .with_rotation(def.base_rotation)
                .with_scale(Vec3::splat(def.default_scale)),
            Visibility::Hidden,
            ModelInstance {
                catalog_index: index,
                visual_mode: def.visual_mode,
                base_scale: def.default_scale,
                offset: def.offset,
                base_rotation: def.base_rotation,
            },
            PendingGltfModel { handle },
        ));
    }
}

/// Once a glTF finishes loading, attach mesh primitives under the model root.
///
/// Avoids `SceneRoot` / `SceneSpawner`, which panics when scene components are
/// missing from the Reflect type registry (common with `default-features = false`
/// and on WASM where `reflect_auto_register` / inventory is unreliable).
pub fn resolve_pending_gltf_models(
    mut commands: Commands,
    gltfs: Res<Assets<Gltf>>,
    gltf_meshes: Res<Assets<GltfMesh>>,
    pending: Query<(Entity, &PendingGltfModel)>,
) {
    for (entity, pending_model) in &pending {
        let Some(gltf) = gltfs.get(&pending_model.handle) else {
            continue;
        };

        // Wait until every labeled mesh asset is in the store so we never attach
        // a partial set of children and leave PendingGltfModel stuck.
        let mut resolved = Vec::with_capacity(gltf.meshes.len());
        let mut ready = true;
        for mesh_handle in &gltf.meshes {
            let Some(gltf_mesh) = gltf_meshes.get(mesh_handle) else {
                ready = false;
                break;
            };
            resolved.push(gltf_mesh);
        }
        if !ready || resolved.is_empty() {
            continue;
        }

        for gltf_mesh in resolved {
            for primitive in &gltf_mesh.primitives {
                let mut child = commands.spawn((
                    Mesh3d(primitive.mesh.clone()),
                    Transform::default(),
                    Visibility::Inherited,
                ));
                if let Some(material) = &primitive.material {
                    child.insert(MeshMaterial3d(material.clone()));
                }
                let child_id = child.id();
                commands.entity(entity).add_child(child_id);
            }
        }
        commands.entity(entity).remove::<PendingGltfModel>();
    }
}

/// Apply one frame of drive to a single model instance.
pub fn apply_model_instance(
    drive: ModelDrive,
    instance: &ModelInstance,
    transform: &mut Transform,
    visibility: &mut Visibility,
) {
    let weight = drive.weight_for_mode(instance.visual_mode);
    // Only the UI-selected catalog entry is shown when Figure mode is active.
    let selected = drive.figure_model.clamp(0, MODEL_CATALOG.len().saturating_sub(1) as i32)
        as usize;
    if weight < 0.01 || instance.catalog_index != selected {
        *visibility = Visibility::Hidden;
        return;
    }
    *visibility = Visibility::Visible;

    let t = if drive.freeze { 0.0 } else { drive.show_time };
    let audio = drive.figure_audio.clamp(0.0, 1.0);
    let bass = drive.bass.clamp(0.0, 1.0) * audio;
    let mid = drive.mid.clamp(0.0, 1.0) * audio;
    let high = drive.high.clamp(0.0, 1.0) * audio;
    let energy = drive.energy.clamp(0.0, 1.0) * audio;
    let pulse = drive.pulse.clamp(0.0, 1.0) * audio;
    let intensity = drive.intensity.clamp(0.05, 2.0);
    let spin = drive.figure_spin.clamp(0.0, 2.0);
    let scale_mul = drive.figure_scale.clamp(0.2, 2.5);

    let yaw = t * spin * (0.55 + intensity * 0.55 + mid * 0.35);
    let bob = (t * 1.4 + bass * 2.0).sin() * (0.04 + bass * 0.08);
    let scale = instance.base_scale
        * scale_mul
        * (0.92 + intensity * 0.12 + bass * 0.14 + pulse * 0.08)
        * (0.85 + weight * 0.15);

    transform.translation = instance.offset
        + Vec3::new(
            (t * 0.7 + high).sin() * high * 0.08,
            bob,
            (energy - 0.5) * 0.15,
        );
    let audio_rot = Quat::from_euler(
        EulerRot::YXZ,
        yaw,
        (mid - 0.5) * 0.12,
        (high - 0.5) * 0.08 * pulse,
    );
    transform.rotation = audio_rot * instance.base_rotation;
    transform.scale = Vec3::splat(scale.max(0.05));
}

/// Drive one halo section: sectional lobes + a pulse chase around the ring.
pub fn apply_stage_halo_section(
    drive: ModelDrive,
    section: &StageHaloSection,
    light: &mut SpotLight,
) {
    let weight = drive.model_layer_weight();
    let halo = drive.figure_halo.clamp(0.0, 1.0);
    if weight < 0.01 || halo < 0.01 {
        light.intensity = 0.0;
        return;
    }

    let t = if drive.freeze { 0.0 } else { drive.show_time };
    let audio = drive.figure_audio.clamp(0.0, 1.0);
    let bass = drive.bass.clamp(0.0, 1.0) * audio;
    let mid = drive.mid.clamp(0.0, 1.0) * audio;
    let high = drive.high.clamp(0.0, 1.0) * audio;
    let energy = drive.energy.clamp(0.0, 1.0) * audio;
    let pulse = drive.pulse.clamp(0.0, 1.0) * audio;
    let intensity = drive.intensity.clamp(0.05, 2.0);

    let n = STAGE_HALO_SECTIONS as f32;
    let phase = section.index as f32 / n * TAU;

    // Slow rotating wash so sections don't feel static when audio is flat.
    let chase = ((t * (0.85 + energy * 1.8) - phase).sin() * 0.5 + 0.5).powf(1.4);
    // Bass occupies opposite lobes; mid fills the orthogonal pair.
    let bass_lobe = ((phase + PI * 0.25).cos() * 0.5 + 0.5).powf(1.6) * bass;
    let mid_lobe = ((phase - PI * 0.5).sin() * 0.5 + 0.5).powf(1.4) * mid;
    // High sparkle flutters around the ring faster than the chase.
    let high_sparkle = ((phase * 2.0 + t * 5.5).sin().abs()).powf(2.2) * high;
    // Pulse hits travel as a narrow wedge so hats/kicks flash one sector at a time.
    let pulse_wedge = {
        let spin = (t * (2.4 + pulse * 4.0)).rem_euclid(TAU);
        let delta = (phase - spin + PI).rem_euclid(TAU) - PI;
        let narrow = (1.0 - (delta.abs() / (PI / n)).min(1.0)).powf(3.0);
        narrow * pulse
    };

    // When audio react is low, keep a calm sectional wash instead of silence.
    let static_wash = (1.0 - audio) * 0.35;
    let section_drive = (0.12
        + static_wash
        + chase * 0.28
        + bass_lobe * 0.55
        + mid_lobe * 0.42
        + high_sparkle * 0.38
        + pulse_wedge * 0.95
        + energy * 0.12)
        .clamp(0.0, 1.6);

    let lumens = (STAGE_HALO_IDLE_LUMENS
        + section_drive * STAGE_HALO_PEAK_LUMENS * (0.45 + intensity * 0.55))
        * weight
        * halo;
    light.intensity = lumens;

    // Hue walks the ring (sectional color identity) and tips with mid/high.
    let base_hue = section.index as f32 / n * 360.0;
    let hue = (base_hue + mid * 28.0 + high * 42.0 + pulse * 18.0) % 360.0;
    let sat = (0.42 + bass * 0.22 + energy * 0.18 + pulse * 0.12).clamp(0.25, 0.95);
    let lightness = (0.52 + high * 0.18 + section_drive * 0.12).clamp(0.35, 0.78);
    light.color = Color::hsl(hue, sat, lightness);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_human_female_on_figure_mode() {
        assert!(!MODEL_CATALOG.is_empty());
        let human = MODEL_CATALOG
            .iter()
            .find(|m| m.id == "human-female")
            .expect("human-female catalog entry");
        assert_eq!(human.visual_mode, 24);
        assert!(human.asset_path.ends_with(".glb"));
    }

    #[test]
    fn drive_weight_follows_crossfade_and_mode() {
        let mut drive = ModelDrive {
            crossfade: 0.25,
            deck_a_mode: 24,
            deck_b_mode: 0,
            ..default()
        };
        assert!((drive.weight_for_mode(24) - 0.75).abs() < 1e-4);
        assert_eq!(drive.weight_for_mode(0), 0.0);

        drive.deck_b_mode = 24;
        assert!((drive.weight_for_mode(24) - 1.0).abs() < 1e-4);

        drive.blackout = true;
        assert_eq!(drive.weight_for_mode(24), 0.0);
    }

    #[test]
    fn halo_section_goes_dark_when_no_model_mode_active() {
        let drive = ModelDrive {
            deck_a_mode: 0,
            deck_b_mode: 1,
            bass: 1.0,
            mid: 1.0,
            high: 1.0,
            energy: 1.0,
            pulse: 1.0,
            intensity: 1.0,
            ..default()
        };
        let mut light = SpotLight {
            intensity: 12_000.0,
            ..default()
        };
        apply_stage_halo_section(drive, &StageHaloSection { index: 0 }, &mut light);
        assert_eq!(light.intensity, 0.0);
    }

    #[test]
    fn halo_section_lights_up_on_figure_mode() {
        let drive = ModelDrive {
            deck_a_mode: 24,
            deck_b_mode: 0,
            crossfade: 0.0,
            bass: 0.6,
            mid: 0.4,
            high: 0.3,
            energy: 0.5,
            pulse: 0.2,
            intensity: 1.0,
            show_time: 1.25,
            figure_halo: 1.0,
            figure_audio: 1.0,
            ..default()
        };
        let mut light = SpotLight::default();
        apply_stage_halo_section(drive, &StageHaloSection { index: 2 }, &mut light);
        assert!(light.intensity > STAGE_HALO_IDLE_LUMENS * 0.5);
        assert!(light.intensity < STAGE_HALO_PEAK_LUMENS * 2.5);
    }

    #[test]
    fn only_selected_catalog_model_is_visible() {
        let drive = ModelDrive {
            deck_a_mode: 24,
            deck_b_mode: 0,
            crossfade: 0.0,
            figure_model: 0,
            ..default()
        };
        let instance = ModelInstance {
            catalog_index: 0,
            visual_mode: 24,
            base_scale: 1.0,
            offset: Vec3::ZERO,
            base_rotation: Quat::IDENTITY,
        };
        let mut transform = Transform::default();
        let mut visibility = Visibility::Hidden;
        apply_model_instance(drive, &instance, &mut transform, &mut visibility);
        assert!(matches!(visibility, Visibility::Visible));

        let other = ModelInstance {
            catalog_index: 1,
            ..instance
        };
        apply_model_instance(drive, &other, &mut transform, &mut visibility);
        assert!(matches!(visibility, Visibility::Hidden));
    }
}

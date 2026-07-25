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

use std::f32::consts::FRAC_1_SQRT_2;

use bevy::gltf::GltfMesh;
use bevy::prelude::*;

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
    #[allow(dead_code)]
    pub catalog_index: usize,
    pub visual_mode: i32,
    pub base_scale: f32,
    pub offset: Vec3,
    pub base_rotation: Quat,
    pub yaw_speed: f32,
}

/// Waiting for `Assets<Gltf>` to finish loading before mesh children are spawned.
#[derive(Component)]
pub(crate) struct PendingGltfModel {
    handle: Handle<Gltf>,
}

/// Audio + deck weights consumed by the model layer each frame.
#[derive(Clone, Copy, Debug, Default)]
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
}

/// Spawn one pending root per catalog entry plus stage lights for PBR shading.
pub fn setup_model_layer(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut ambient_light: ResMut<AmbientLight>,
) {
    // Soft fill so textured glTFs are visible without competing with 2D decks.
    ambient_light.color = Color::srgb(0.72, 0.78, 0.92);
    ambient_light.brightness = 120.0;

    commands.spawn((
        DirectionalLight {
            illuminance: 8_000.0,
            shadows_enabled: false,
            ..default()
        },
        Transform::from_xyz(2.5, 4.0, 3.5).looking_at(Vec3::ZERO, Vec3::Y),
    ));
    commands.spawn((
        PointLight {
            intensity: 900_000.0,
            range: 18.0,
            color: Color::srgb(0.95, 0.88, 1.0),
            shadows_enabled: false,
            ..default()
        },
        Transform::from_xyz(-2.0, 2.5, 4.0),
    ));

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
                yaw_speed: def.yaw_speed,
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
    if weight < 0.01 {
        *visibility = Visibility::Hidden;
        return;
    }
    *visibility = Visibility::Visible;

    let t = if drive.freeze { 0.0 } else { drive.show_time };
    let bass = drive.bass.clamp(0.0, 1.0);
    let mid = drive.mid.clamp(0.0, 1.0);
    let high = drive.high.clamp(0.0, 1.0);
    let energy = drive.energy.clamp(0.0, 1.0);
    let pulse = drive.pulse.clamp(0.0, 1.0);
    let intensity = drive.intensity.clamp(0.05, 2.0);

    let yaw = t * instance.yaw_speed * (0.55 + intensity * 0.55 + mid * 0.35);
    let bob = (t * 1.4 + bass * 2.0).sin() * (0.04 + bass * 0.08);
    let scale = instance.base_scale
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
}

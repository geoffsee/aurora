//! Preset Studio — host Bevy look-dev (3D stage + pack fullscreen GPU).
//!
//! ```bash
//! CARGO_TARGET_DIR=target-studio cargo run -p preset-studio
//! # or: bun run preset-studio
//! ```

mod hot_reload;
mod hud;
mod materials;
mod stage;
mod uniforms;

use std::path::PathBuf;

use bevy::prelude::*;
use bevy::sprite_render::Material2dPlugin;
use bevy::window::{Window, WindowPlugin};

use hot_reload::{poll_sketch_reload, SketchWatch};
use hud::{keyboard_bus, spawn_hud, update_hud};
use materials::{PackFullscreenMaterial, PackMaterialHandle, PackShaderHandle};
use stage::{orbit_camera, spawn_stage};
use uniforms::StudioBus;

/// Fullscreen 2D GPU layer (pack material) — above 3D stage.
const GPU_Z: f32 = 10.0;
const STAGE_W: f32 = 19.2;
const STAGE_H: f32 = 10.8;

fn main() {
    let studio_root = studio_root();
    let assets_path = studio_root.join("assets");
    let sketches_dir = studio_root.join("sketches");

    App::new()
        .add_plugins(
            DefaultPlugins
                .set(WindowPlugin {
                    primary_window: Some(Window {
                        title: "Preset Studio".into(),
                        resolution: (1440, 900).into(),
                        ..default()
                    }),
                    ..default()
                })
                .set(AssetPlugin {
                    file_path: assets_path.to_string_lossy().into_owned(),
                    ..default()
                }),
        )
        .add_plugins(Material2dPlugin::<PackFullscreenMaterial>::default())
        .insert_resource(StudioBus::default())
        .insert_resource(SketchWatch::new(sketches_dir))
        .add_systems(Startup, (spawn_stage, setup_gpu_overlay, spawn_hud).chain())
        .add_systems(
            Update,
            (
                keyboard_bus,
                orbit_camera,
                tick_bus,
                apply_bus_to_material,
                poll_sketch_reload,
                update_hud,
            ),
        )
        .run();
}

fn studio_root() -> PathBuf {
    // Prefer CARGO_MANIFEST_DIR (crate root) so sketches resolve when run from repo root.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn setup_gpu_overlay(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut pack_materials: ResMut<Assets<PackFullscreenMaterial>>,
    asset_server: Res<AssetServer>,
    bus: Res<StudioBus>,
) {
    // Camera2d for Material2d pack fullscreen — does not clear (3D already did).
    commands.spawn((
        Camera2d,
        Camera {
            order: 1,
            clear_color: ClearColorConfig::None,
            ..default()
        },
    ));

    let mat = pack_materials.add(PackFullscreenMaterial {
        params: bus.params(STAGE_W / STAGE_H),
        palette_extra: bus.palette_extra(),
        audio_uniforms: bus.audio_uniforms(),
        palette_rgb: bus.palette_rgb_vec4(),
        pack_drive: bus.pack_drive(),
    });
    commands.insert_resource(PackMaterialHandle(mat.clone()));

    // Same path as Material2d::fragment_shader — insert swaps this asset on reload.
    let shader: Handle<Shader> = asset_server.load("shaders/studio_pack.wgsl");
    commands.insert_resource(PackShaderHandle(shader));

    commands.spawn((
        Mesh2d(meshes.add(Rectangle::default())),
        MeshMaterial2d(mat),
        Transform::from_xyz(0.0, 0.0, GPU_Z).with_scale(Vec3::new(STAGE_W, STAGE_H, 1.0)),
    ));
}

fn tick_bus(time: Res<Time>, mut bus: ResMut<StudioBus>) {
    bus.tick_time(time.delta_secs());
    bus.apply_demo_lfos();
}

fn apply_bus_to_material(
    bus: Res<StudioBus>,
    handle: Option<Res<PackMaterialHandle>>,
    mut materials: ResMut<Assets<PackFullscreenMaterial>>,
    windows: Query<&Window>,
) {
    let Some(handle) = handle else {
        return;
    };
    let aspect = windows
        .iter()
        .next()
        .map(|w| {
            let width = w.resolution.width().max(1.0);
            let height = w.resolution.height().max(1.0);
            width / height
        })
        .unwrap_or(STAGE_W / STAGE_H);

    if let Some(mat) = materials.get_mut(&handle.0) {
        mat.params = bus.params(aspect);
        mat.palette_extra = bus.palette_extra();
        mat.audio_uniforms = bus.audio_uniforms();
        mat.palette_rgb = bus.palette_rgb_vec4();
        mat.pack_drive = bus.pack_drive();
    }
}

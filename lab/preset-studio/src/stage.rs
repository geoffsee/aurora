//! 3D stage + orbit camera (look-dev depth context under the GPU overlay).

use bevy::input::mouse::{MouseMotion, MouseWheel};
use bevy::prelude::*;

#[derive(Component)]
pub struct OrbitCamera {
    pub yaw: f32,
    pub pitch: f32,
    pub distance: f32,
    pub focus: Vec3,
}

impl Default for OrbitCamera {
    fn default() -> Self {
        Self {
            yaw: 0.55,
            pitch: 0.35,
            distance: 8.5,
            focus: Vec3::new(0.0, 0.4, 0.0),
        }
    }
}

pub fn spawn_stage(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Perspective camera — 3D stage (GPU fullscreen rides a separate Camera2d).
    commands.spawn((
        Camera3d::default(),
        Camera {
            order: 0,
            clear_color: ClearColorConfig::Custom(Color::srgb(0.02, 0.02, 0.03)),
            ..default()
        },
        Transform::from_xyz(4.0, 3.0, 7.0).looking_at(Vec3::new(0.0, 0.4, 0.0), Vec3::Y),
        OrbitCamera::default(),
    ));

    commands.spawn((
        DirectionalLight {
            illuminance: 6_000.0,
            shadows_enabled: false,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(EulerRot::XYZ, -0.9, 0.6, 0.0)),
    ));

    // Ground plane
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(20.0, 20.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.06, 0.07, 0.09),
            perceptual_roughness: 0.95,
            metallic: 0.0,
            ..default()
        })),
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));

    // Center marker cube so orbit reads as 3D.
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(0.6, 0.6, 0.6))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.15, 0.55, 0.4),
            emissive: LinearRgba::rgb(0.05, 0.2, 0.12),
            perceptual_roughness: 0.4,
            ..default()
        })),
        Transform::from_xyz(0.0, 0.35, 0.0),
    ));

    // Grid lines (simple thin boxes) on XZ.
    let line_mat = materials.add(StandardMaterial {
        base_color: Color::srgba(0.25, 0.3, 0.35, 1.0),
        unlit: true,
        ..default()
    });
    for i in -5..=5 {
        let t = i as f32;
        // along Z
        commands.spawn((
            Mesh3d(meshes.add(Cuboid::new(0.02, 0.01, 10.0))),
            MeshMaterial3d(line_mat.clone()),
            Transform::from_xyz(t, 0.01, 0.0),
        ));
        // along X
        commands.spawn((
            Mesh3d(meshes.add(Cuboid::new(10.0, 0.01, 0.02))),
            MeshMaterial3d(line_mat.clone()),
            Transform::from_xyz(0.0, 0.01, t),
        ));
    }
}

pub fn orbit_camera(
    buttons: Res<ButtonInput<MouseButton>>,
    mut motion: MessageReader<MouseMotion>,
    mut scroll: MessageReader<MouseWheel>,
    mut q: Query<(&mut Transform, &mut OrbitCamera)>,
) {
    let mut delta = Vec2::ZERO;
    for ev in motion.read() {
        delta += ev.delta;
    }
    let mut zoom = 0.0_f32;
    for ev in scroll.read() {
        zoom += ev.y;
    }

    for (mut tf, mut orbit) in &mut q {
        if buttons.pressed(MouseButton::Right) || buttons.pressed(MouseButton::Middle) {
            orbit.yaw -= delta.x * 0.005;
            orbit.pitch = (orbit.pitch - delta.y * 0.005).clamp(-1.4, 1.4);
        }
        if zoom.abs() > 0.0 {
            orbit.distance = (orbit.distance * (1.0 - zoom * 0.08)).clamp(2.0, 40.0);
        }
        let cp = orbit.pitch.cos();
        let sp = orbit.pitch.sin();
        let cy = orbit.yaw.cos();
        let sy = orbit.yaw.sin();
        let offset = Vec3::new(orbit.distance * cp * sy, orbit.distance * sp, orbit.distance * cp * cy);
        tf.translation = orbit.focus + offset;
        tf.look_at(orbit.focus, Vec3::Y);
    }
}

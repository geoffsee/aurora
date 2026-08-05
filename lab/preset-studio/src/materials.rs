//! Pack fullscreen material — layout mirrors show `VjPackFullscreenAMaterial`.
//!
//! Bindings (group 2 via Bevy Material2d):
//! 0 params, 1 palette_extra, 2 audio_uniforms, 3 palette_rgb, 4 pack_drive

use bevy::prelude::*;
use bevy::reflect::TypePath;
use bevy::render::render_resource::AsBindGroup;
use bevy::shader::ShaderRef;
use bevy::sprite_render::{AlphaMode2d, Material2d};

/// Same 5-uniform bus as production pack fullscreen slots.
#[derive(Asset, TypePath, AsBindGroup, Clone, Debug)]
pub struct PackFullscreenMaterial {
    #[uniform(0)]
    pub params: Vec4,
    #[uniform(1)]
    pub palette_extra: Vec4,
    #[uniform(2)]
    pub audio_uniforms: Vec4,
    #[uniform(3)]
    pub palette_rgb: Vec4,
    /// x=intensity, y=depth, z=feedback, w=speed (0..1 each).
    #[uniform(4)]
    pub pack_drive: Vec4,
}

impl Material2d for PackFullscreenMaterial {
    fn fragment_shader() -> ShaderRef {
        // Loaded from this crate's asset root; hot-reload swaps the Shader asset in place.
        "shaders/studio_pack.wgsl".into()
    }

    fn alpha_mode(&self) -> AlphaMode2d {
        AlphaMode2d::Blend
    }
}

/// Handle to the Material2d instance we mutate each frame.
#[derive(Resource, Clone)]
pub struct PackMaterialHandle(pub Handle<PackFullscreenMaterial>);

/// Handle to the WGSL Shader asset (for `Assets<Shader>::insert` hot-reload).
#[derive(Resource, Clone)]
pub struct PackShaderHandle(pub Handle<Shader>);

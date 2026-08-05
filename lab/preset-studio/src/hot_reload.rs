//! Watch sketches/*.wgsl and hot-swap the pack Shader asset (show-style insert).

use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use bevy::prelude::*;
use bevy::shader::Shader;

use crate::materials::PackShaderHandle;
use crate::uniforms::StudioBus;

const ASSET_SHADER_PATH: &str = "shaders/studio_pack.wgsl";
const POLL_SECS: f32 = 0.2;

#[derive(Resource)]
pub struct SketchWatch {
    pub sketches_dir: PathBuf,
    pub sketches: Vec<PathBuf>,
    pub index: usize,
    pub last_mtime: Option<SystemTime>,
    pub poll_accum: f32,
    pub force_reload: bool,
}

impl SketchWatch {
    pub fn new(sketches_dir: PathBuf) -> Self {
        let mut watch = Self {
            sketches_dir,
            sketches: Vec::new(),
            index: 0,
            last_mtime: None,
            poll_accum: 0.0,
            force_reload: true,
        };
        watch.rescan();
        watch
    }

    pub fn rescan(&mut self) {
        self.sketches.clear();
        if let Ok(rd) = fs::read_dir(&self.sketches_dir) {
            for ent in rd.flatten() {
                let p = ent.path();
                if p.extension().and_then(|e| e.to_str()) == Some("wgsl") {
                    self.sketches.push(p);
                }
            }
        }
        self.sketches.sort();
        if self.index >= self.sketches.len() {
            self.index = 0;
        }
    }

    pub fn current(&self) -> Option<&Path> {
        self.sketches.get(self.index).map(|p| p.as_path())
    }

    pub fn cycle(&mut self, delta: i32) {
        if self.sketches.is_empty() {
            return;
        }
        let n = self.sketches.len() as i32;
        let next = (self.index as i32 + delta).rem_euclid(n) as usize;
        self.index = next;
        self.last_mtime = None;
        self.force_reload = true;
    }
}

pub fn poll_sketch_reload(
    time: Res<Time>,
    mut watch: ResMut<SketchWatch>,
    mut bus: ResMut<StudioBus>,
    shader_handle: Option<Res<PackShaderHandle>>,
    mut shaders: ResMut<Assets<Shader>>,
) {
    watch.poll_accum += time.delta_secs();
    if !watch.force_reload && watch.poll_accum < POLL_SECS {
        return;
    }
    watch.poll_accum = 0.0;

    if watch.sketches.is_empty() {
        watch.rescan();
    }
    let Some(path) = watch.current().map(|p| p.to_path_buf()) else {
        bus.status = format!("no sketches in {}", watch.sketches_dir.display());
        return;
    };

    let meta = match fs::metadata(&path) {
        Ok(m) => m,
        Err(e) => {
            bus.status = format!("stat {}: {e}", path.display());
            return;
        }
    };
    let mtime = meta.modified().ok();
    let changed = watch.force_reload
        || match (mtime, watch.last_mtime) {
            (Some(now), Some(prev)) => now > prev,
            (Some(_), None) => true,
            _ => false,
        };
    if !changed {
        return;
    }
    watch.force_reload = false;
    watch.last_mtime = mtime;

    let source = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            bus.status = format!("read {}: {e}", path.display());
            return;
        }
    };

    let Some(handle) = shader_handle else {
        bus.status = "shader handle not ready".into();
        return;
    };

    // Same pattern as show apply_pack_fullscreen_shaders: replace asset in place.
    let shader = Shader::from_wgsl(source, ASSET_SHADER_PATH.to_string());
    let _ = shaders.insert(&handle.0, shader);

    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("sketch");
    bus.status = format!("loaded {name}");
    info!("Preset Studio: hot-loaded {}", path.display());
}

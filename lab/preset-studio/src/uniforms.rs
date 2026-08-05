//! Mock control / audio bus for Preset Studio (no bridge).

use bevy::prelude::*;

/// Live look-dev bus. Written by input systems; read when filling material uniforms.
#[derive(Resource, Debug, Clone)]
pub struct StudioBus {
    pub playing: bool,
    pub time: f32,
    /// Multiplier on wall-clock dt when playing.
    pub time_scale: f32,
    /// When true, LFOs fill energy/bass/mid/high/pulse.
    pub demo_audio: bool,
    /// energy < 0 means idle (show sentinel). When demo_audio, kept >= 0.
    pub energy: f32,
    pub bass: f32,
    pub mid: f32,
    pub high: f32,
    pub pulse: f32,
    pub hue: f32,
    pub sat: f32,
    pub bright: f32,
    pub alpha: f32,
    pub palette_rgb: Vec3,
    pub intensity: f32,
    pub depth: f32,
    pub feedback: f32,
    pub speed: f32,
    pub status: String,
}

impl Default for StudioBus {
    fn default() -> Self {
        Self {
            playing: true,
            time: 0.0,
            time_scale: 1.0,
            demo_audio: true,
            energy: 0.45,
            bass: 0.35,
            mid: 0.28,
            high: 0.22,
            pulse: 0.15,
            hue: 0.38,
            sat: 0.75,
            bright: 0.92,
            alpha: 1.0,
            palette_rgb: Vec3::new(0.12, 0.72, 0.42),
            intensity: 0.65,
            depth: 0.45,
            feedback: 0.3,
            speed: 0.45,
            status: String::new(),
        }
    }
}

impl StudioBus {
    pub fn tick_time(&mut self, dt: f32) {
        if self.playing {
            self.time += dt * self.time_scale.max(0.0);
        }
    }

    pub fn apply_demo_lfos(&mut self) {
        if !self.demo_audio {
            return;
        }
        let t = self.time;
        self.energy = (0.42 + 0.28 * (t * 0.7).sin()).clamp(0.0, 1.0);
        self.bass = (0.3 + 0.35 * (t * 1.7).sin().max(0.0)).clamp(0.0, 1.0);
        self.mid = (0.25 + 0.25 * (t * 2.3 + 1.1).sin()).clamp(0.0, 1.0);
        self.high = (0.15 + 0.35 * (t * 5.1).sin().max(0.0).powf(2.0)).clamp(0.0, 1.0);
        self.pulse = (0.1 + 0.5 * (t * 3.0).sin().max(0.0).powf(4.0)).clamp(0.0, 1.0);
    }

    pub fn params(&self, aspect: f32) -> Vec4 {
        Vec4::new(self.hue, self.time, 0.0, aspect.max(0.01))
    }

    pub fn palette_extra(&self) -> Vec4 {
        Vec4::new(self.sat, self.bright, self.pulse, self.alpha)
    }

    pub fn audio_uniforms(&self) -> Vec4 {
        // Idle sentinel when demo off and energy forced negative via toggle.
        Vec4::new(self.energy, self.bass, self.mid, self.high)
    }

    pub fn palette_rgb_vec4(&self) -> Vec4 {
        Vec4::new(self.palette_rgb.x, self.palette_rgb.y, self.palette_rgb.z, 0.0)
    }

    pub fn pack_drive(&self) -> Vec4 {
        Vec4::new(self.intensity, self.depth, self.feedback, self.speed)
    }
}

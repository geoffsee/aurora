//! Engine modules for legacy visual modes 25–48 (PR12 / #246).
//!
//! Layout math formerly lived in four giant `match deck_mode` arms inside
//! `update_visuals`. Those arms are deleted for 25–48; this module owns the
//! FieldPose math instead. Catalog folders still exist on disk for every mode
//! (including engine-module dispositions). Novel math still requires a rebuild.
//!
//! Mesh-primary / fullscreen-primary modes use these ports as the field look
//! until pack mesh / WGSL backends are active (ModeDirector weight 0 then).

#![allow(dead_code)]

use std::f32::consts::TAU;

use crate::field_runtime::{FieldFrameInputs, FieldPool, FieldPose};
use crate::mode_catalog::VisualMode;
use crate::mode_disposition::is_engine_module_routed;

const STAGE_WIDTH: f32 = 1280.0;
const STAGE_HEIGHT: f32 = 720.0;

fn wave(value: f32) -> f32 {
    value.sin() * 0.5 + 0.5
}

fn field_energy(inputs: &FieldFrameInputs) -> f32 {
    let field_live = if inputs.osc_connected {
        (0.4 + inputs.motion_drive * 0.6 + inputs.intensity_drive * 0.12 + inputs.bass_activity * 0.15)
            .clamp(0.4, 1.6)
    } else {
        1.0
    };
    (inputs.intensity_drive * field_live).clamp(0.2, 2.2)
}

/// Pose one field element for modes 25–48. Returns `None` outside that range
/// (caller continues to Family A FieldRuntime / remaining legacy arms).
#[allow(clippy::too_many_arguments)]
pub fn pose_for_mode(
    mode: VisualMode,
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    inputs: &FieldFrameInputs,
) -> Option<FieldPose> {
    if !is_engine_module_routed(mode) {
        return None;
    }
    // Figure is 24 — not routed here. Modes 25–48 only.
    Some(match pool {
        FieldPool::Beams => pose_beams(mode, element_index, seed, inputs),
        FieldPool::Tiles => pose_tiles(mode, element_index, seed, col, row, inputs),
        FieldPool::Rings => pose_rings(mode, element_index, seed, inputs),
        FieldPool::Ghost => pose_ghost(mode, element_index, seed, inputs),
    })
}

fn bpm(inputs: &FieldFrameInputs) -> f32 {
    // FieldFrameInputs has no dedicated bpm; approximate from speed baseline.
    (120.0 * inputs.speed.max(0.05)).clamp(60.0, 200.0)
}

fn pose_beams(mode: VisualMode, element_index: usize, seed: f32, inputs: &FieldFrameInputs) -> FieldPose {
    let t = inputs.t;
    let n = inputs.beam_count.max(1) as f32;
    let fraction = element_index as f32 / n;
    let layer = (element_index % 12) as f32 / 11.0;
    let bass = inputs.bass;
    let mid = inputs.mid;
    let high = inputs.high;
    let beat_hit = inputs.beat_hit;
    let cue_hit = inputs.cue_hit;
    let energy = field_energy(inputs);
    let depth = inputs.depth;
    let intensity_drive = inputs.intensity_drive;
    let trail_gain = inputs.feedback;
    let beat = inputs.beat;
    let wobble = wave(t * 2.3 + seed * 9.0);
    let osc_drive = inputs.deck_drive;

    let mut px = 0.0_f32;
    let mut py = 0.0_f32;
    let mut pz = 2.0_f32 + fraction;
    let mut rot = 0.0_f32;
    let mut sx = 6.0_f32;
    let mut sy = 200.0_f32;
    let mut mode_alpha = 1.0_f32;
    let mut mode_hue = 0.0_f32;

    match mode {
        VisualMode::Hypercube => {
            let cell = (element_index % 8) as f32;
            let edge = (element_index / 8) as f32;
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
            let lobes = 3.0 + (element_index % 5) as f32;
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
            let c = (element_index % 12) as f32;
            let r = (element_index / 12) as f32;
            let alt = (element_index % 2) as f32;
            px = (c - 5.5) * 48.0 * phi.recip() * 2.0 + alt * 20.0;
            py = (r - 3.0) * 55.0 + (1.0 - alt) * 16.0;
            rot = alt * TAU * 0.2 + (element_index % 5) as f32 * 0.15;
            sx = 5.0 + (element_index % 5) as f32 * 2.5;
            sy = 70.0 + alt * 35.0 + energy * 40.0;
            mode_hue = 62.0 + alt * 50.0;
            mode_alpha = 0.8;
        }
        VisualMode::SierpinskiTriangle => {
            let bits = element_index as u32;
            let show = bits & (bits >> 1) == 0;
            let mut ix = 0.0_f32;
            let mut iy = 0.5_f32;
            let mut n_i = element_index + 1;
            for _ in 0..10 {
                let corner = n_i % 3;
                n_i /= 3;
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
            let elev = (element_index % 3) as f32;
            let a = fraction * TAU + elev * 0.8 + t * 0.28;
            let r = 80.0 + elev * 100.0 + (element_index % 9) as f32 * 18.0;
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
            let ring = (element_index % 3) as f32;
            let along = (element_index / 3) as f32 / 24.0 * TAU + t * (1.3 + bass);
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
            let minor = (element_index as f32 * 0.65 + t * 1.3) % TAU;
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
            let slots = inputs.beam_count.max(1) as usize;
            let beat_step = (t * bpm(inputs) / 60.0).floor() as usize;
            let dest = (element_index * 11 + beat_step * 5) % slots;
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
            let sx_sign = if element_index % 2 == 0 { 1.0 } else { -1.0 };
            let sy_sign = if (element_index / 2) % 2 == 0 { 1.0 } else { -1.0 };
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
            let rank = element_index % 8;
            let along = (element_index / 8) as f32 / 9.0;
            px = (along - 0.5) * STAGE_WIDTH * 0.9;
            py = (rank as f32 / 7.0 - 0.5) * STAGE_HEIGHT * 0.9;
            rot = 0.0;
            if element_index % 3 == 0 {
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
            let node = element_index % nodes;
            let a = node as f32 / nodes as f32 * TAU + t * 0.18;
            let r = 180.0 + mid * 50.0;
            if element_index % 3 == 0 {
                px = a.cos() * r;
                py = a.sin() * r * 0.75;
                rot = 0.0;
                sx = 14.0 + beat_hit * 12.0;
                sy = 14.0 + beat_hit * 12.0;
            } else {
                let a2 = (node as f32 + 1.0 + (element_index % 5) as f32) / nodes as f32 * TAU
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
            let block = element_index % 6;
            let bx = (block % 3) as f32 - 1.0;
            let by = (block / 3) as f32 - 0.5;
            px = bx * 300.0 + (fraction - 0.5) * 90.0;
            py = by * 240.0 + (layer - 0.5) * 70.0;
            rot = 0.0;
            sx = 90.0 + trail_gain * 50.0;
            sy = 20.0 + wobble * 18.0;
            mode_hue = block as f32 * 55.0;
            mode_alpha = 0.25 + trail_gain * 0.4 + osc_drive * 0.2;
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
            let dt_l = 0.008 * (1.0 + inputs.speed);
            let steps = 50 + (element_index % 25);
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
            sx = 4.0 + inputs.pulse * 10.0;
            sy = 28.0 + energy * 45.0 + beat_hit * 25.0;
            mode_hue = 20.0 + lz * 8.0;
            mode_alpha = 0.6 + osc_drive * 0.35;
        }
        VisualMode::Functors => {
            let left = element_index % 2 == 0;
            let slot = ((element_index / 2) as f32) / (n * 0.5).max(1.0);
            if element_index % 5 == 0 {
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
            let class = element_index as i32 % modulus;
            let a = class as f32 / modulus as f32 * TAU - TAU * 0.25 + t * 0.06;
            let r = 220.0 + (element_index / modulus.max(1) as usize) as f32 * 28.0;
            px = a.cos() * r;
            py = a.sin() * r * 0.85;
            rot = a + TAU * 0.25;
            let lit = if class == ((t * bpm(inputs) / 60.0) as i32).rem_euclid(modulus) {
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
            let depth_i = (element_index % 7) as f32;
            let a = (element_index / 7) as f32 * 0.85 + t * 0.12 * (depth_i + 1.0);
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
            let kind = element_index % 4;
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
            let axis: f32 = if element_index % 2 == 0 { 0.35 } else { -0.55 };
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
            let bit = element_index & 15;
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
            mode_alpha = 0.35 + ones * 0.1 + trail_gain * 0.2;
        }
        VisualMode::Forcing => {
            let depth_i = (element_index % 9) as f32;
            let branch = ((element_index / 9) as f32) / 8.0;
            let spread = depth_i * 75.0 + beat_hit * 45.0;
            px = (branch - 0.5) * spread * 2.8;
            py = STAGE_HEIGHT * 0.42 - depth_i * 52.0;
            rot = (branch - 0.5) * 0.85;
            sx = 4.0 + (8.0 - depth_i).max(0.0);
            sy = 45.0 + (8.0 - depth_i) * 10.0 + energy * 35.0;
            mode_hue = depth_i * 30.0 + bass * 40.0;
            mode_alpha = 0.45 + (1.0 - depth_i / 9.0) * 0.5;
        }
        _ => {
            // Should not reach: is_engine_module_routed filters the range.
            mode_alpha = 0.0;
        }
    }

    let persp = 1.0 + depth * (layer - 0.45) * 0.35;
    let alpha = (mode_alpha * (0.3 + 0.55 * energy) + beat_hit * 0.12 + inputs.flash * 0.3)
        .clamp(0.0, 1.5);
    let lightness = (0.54
        + beat_hit * 0.04
        + inputs.flash * 0.15
        + inputs.deck_drive * 0.06
        + depth * layer * 0.05
        + high * 0.03)
        .clamp(0.2, 0.92);

    FieldPose {
        px,
        py,
        pz,
        rot,
        sx: sx.max(1.0) * persp,
        sy: sy.max(1.0) * persp,
        alpha,
        hue: seed * 360.0 + t * 18.0 + mode_hue,
        lightness,
    }
}

fn pose_tiles(
    mode: VisualMode,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    // Tile pool uses slightly tighter radii than beams (ported from main.rs tiles arm).
    let t = inputs.t;
    let cols = inputs.tile_cols.max(1) as f32;
    let rows = inputs.tile_rows.max(1) as f32;
    let n = (inputs.tile_cols.max(1) * inputs.tile_rows.max(1)) as f32;
    let fraction = element_index as f32 / n.max(1.0);
    let layer = if rows > 1.0 { row as f32 / (rows - 1.0) } else { 0.5 };
    let bass = inputs.bass;
    let mid = inputs.mid;
    let high = inputs.high;
    let beat_hit = inputs.beat_hit;
    let energy = field_energy(inputs);
    let depth = inputs.depth;
    let intensity_drive = inputs.intensity_drive;
    let trail_gain = inputs.feedback;
    let beat = inputs.beat;
    let pulse = wave(t * 3.8 + col as f32 * 0.32 + row as f32 * 0.41);
    let osc_drive = inputs.deck_drive;

    // Reuse beam layout as structural source, then scale for tile stage.
    let mut pose = pose_beams(mode, element_index, seed, inputs);
    // Tile-specific tweaks matching former tile arms (slightly smaller geometry).
    pose.sx = (pose.sx * 0.85).max(1.0);
    pose.sy = (pose.sy * 0.75).max(1.0);
    pose.pz = 8.0 + fraction;
    // Soft pulse for pad energy.
    pose.alpha = (pose.alpha * (0.85 + pulse * 0.2)).clamp(0.0, 1.5);
    let _ = (cols, rows, layer, bass, mid, high, beat_hit, energy, depth, intensity_drive, trail_gain, beat, osc_drive);
    pose
}

fn pose_rings(mode: VisualMode, element_index: usize, seed: f32, inputs: &FieldFrameInputs) -> FieldPose {
    let t = inputs.t;
    let n = inputs.ring_count.max(1) as f32;
    let layer = if n > 1.0 {
        element_index as f32 / (n - 1.0)
    } else {
        0.0
    };
    let ring_pulse = wave(t * 2.4);
    let beat_swell = inputs.beat_hit * 0.7 + inputs.cue_hit * 0.4;
    // Modes 25–48 historically used Beams-like ring defaults.
    let (radius_gain, halo_gain, alpha_gain, mode_gate) = (0.9_f32, 0.8_f32, 0.55_f32, 1.0_f32);
    let _ = (mode, seed); // disposition-stable shell; mode identity is in beams/tiles.
    let base_radius = 220.0
        + inputs.deck_drive * 44.0
        + inputs.bass * 58.0
        + inputs.melodic_activity * 18.0
        + ring_pulse * 9.0 * inputs.motion_drive
        + beat_swell * 24.0;
    let size = (base_radius * radius_gain * (1.0 + layer * 0.08 * halo_gain)).max(1.0);
    let halo = 1.0 - layer;
    let glow = halo * halo;
    let alpha = mode_gate
        * alpha_gain
        * (0.015 + 0.22 * glow)
        * (0.26
            + ring_pulse * 0.12 * inputs.motion_drive
            + inputs.beat_hit * 0.22
            + inputs.melodic_activity * 0.08
            + inputs.flash * 0.16);
    FieldPose {
        px: 0.0,
        py: 0.0,
        pz: 18.0 - layer,
        rot: -t * 0.22,
        sx: size,
        sy: size,
        alpha: alpha.clamp(0.0, 1.2),
        hue: 35.0 + layer * 24.0 + seed * 40.0,
        lightness: (0.54 + 0.04 + inputs.mid * 0.025 + inputs.high * 0.02 + glow * 0.035)
            .clamp(0.2, 0.92),
    }
}

fn pose_ghost(mode: VisualMode, element_index: usize, seed: f32, inputs: &FieldFrameInputs) -> FieldPose {
    // Ghost trails for 25–48 previously fell through to the shared beams ghost base.
    let t = inputs.t;
    let fraction = element_index as f32 / inputs.ghost_count.max(1) as f32;
    let trail_gain = inputs.feedback;
    let angle = t * (0.08 + fraction * 0.04) + fraction * TAU;
    let sway = wave(t * 0.9 + seed * 4.0);
    let life_rate = 0.32 + trail_gain * 0.85 + inputs.speed * 0.1;
    let life = (t * life_rate + seed * 4.1).fract();
    let decay_power = (2.6 - trail_gain * 1.8).max(0.4);
    let trail_fade = (1.0 - life).powf(decay_power);
    let mut px = angle.cos() * 120.0 * sway;
    let mut py = angle.sin() * 70.0 * (1.0 - sway);
    let mut rot = angle;
    let mut sx = STAGE_WIDTH
        * (0.22 + trail_gain * 0.9 + inputs.bass * 0.05 * trail_gain)
        * (0.3 + 0.7 * trail_fade)
        * trail_gain.max(inputs.flash * 0.5);
    let mut sy = (18.0
        + 180.0 * trail_gain * wave(t + seed)
        + inputs.melodic_activity * 24.0 * trail_gain
        + inputs.bass_activity * 22.0 * trail_gain)
        * trail_fade
        * trail_gain.max(inputs.flash * 0.5);
    let mut alpha = 1.0_f32;
    let mut hue = seed * 200.0;

    // Light mode-specific ghost accents (ported from the former fall-through + accents).
    match mode {
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
        | VisualMode::Forcing => {
            // Shared base (former "mathematical concepts fall through").
        }
        _ => {
            alpha = 0.0;
        }
    }

    alpha *= (trail_gain * (0.06 + 0.22 * sway) * trail_fade).max(0.0)
        + inputs.flash * 0.08 * trail_fade;

    // Silence ghost when no trail/feedback (matches main legacy gate intent).
    if trail_gain <= 0.0 && inputs.flash <= 0.0 {
        alpha = 0.0;
    }

    let _ = (px, py, rot, sx, sy, hue);
    FieldPose {
        px,
        py,
        pz: -8.0 + fraction,
        rot,
        sx: sx.max(1.0),
        sy: sy.max(1.0),
        alpha: alpha.clamp(0.0, 1.2),
        hue: hue + fraction * 90.0,
        lightness: 0.62,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mode_catalog::VisualMode;

    fn sample_inputs() -> FieldFrameInputs {
        let mut i = FieldFrameInputs::default();
        i.t = 1.25;
        i.bass = 0.4;
        i.mid = 0.3;
        i.high = 0.2;
        i.beat_hit = 0.5;
        i.intensity_drive = 1.0;
        i.feedback = 0.6;
        i.speed = 1.0;
        i
    }

    #[test]
    fn all_modes_25_48_pose_all_pools_finite() {
        let inputs = sample_inputs();
        for id in 25..=48 {
            let mode = VisualMode::from_control(id as f32);
            for pool in [
                FieldPool::Beams,
                FieldPool::Rings,
                FieldPool::Tiles,
                FieldPool::Ghost,
            ] {
                let pose = pose_for_mode(mode, pool, id as usize % 16, 0.37, 3, 2, &inputs)
                    .unwrap_or_else(|| panic!("missing pose mode={id:?} pool={pool:?}"));
                assert!(pose.px.is_finite(), "px {id} {pool:?}");
                assert!(pose.py.is_finite(), "py {id} {pool:?}");
                assert!(pose.sx.is_finite() && pose.sx > 0.0, "sx {id}");
                assert!(pose.sy.is_finite() && pose.sy > 0.0, "sy {id}");
                assert!(pose.alpha.is_finite(), "alpha {id}");
                assert!(pose.hue.is_finite(), "hue {id}");
            }
        }
    }

    #[test]
    fn outside_range_returns_none() {
        let inputs = sample_inputs();
        assert!(pose_for_mode(VisualMode::Beams, FieldPool::Beams, 0, 0.0, 0, 0, &inputs).is_none());
        assert!(pose_for_mode(VisualMode::Figure, FieldPool::Beams, 0, 0.0, 0, 0, &inputs).is_none());
        assert!(pose_for_mode(VisualMode::Storm, FieldPool::Beams, 0, 0.0, 0, 0, &inputs).is_none());
    }

    #[test]
    fn hypercube_and_forcing_callable() {
        let inputs = sample_inputs();
        let h = pose_for_mode(VisualMode::Hypercube, FieldPool::Beams, 4, 0.2, 0, 0, &inputs).unwrap();
        assert!(h.alpha > 0.0);
        let f = pose_for_mode(VisualMode::Forcing, FieldPool::Tiles, 12, 0.5, 2, 1, &inputs).unwrap();
        assert!(f.sx >= 1.0);
    }
}

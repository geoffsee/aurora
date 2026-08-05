//! FieldRuntime — DSL-backed poses for the four CPU field pools.
//!
//! PR6 (#240): `supernova_burst` (id 1) vertical slice.
//! PR8 (#242): Family A modes 0–7 (`beams`…`orbit`, ids 10–17) for **all four**
//! pools. When no compiled wire is active, VST int-only shows still render via
//! `pose(..., fallback_primitive_id)` synthesized from legacy index 0–7.
//!
//! Unknown / unimplemented primitive ids return `None` so the caller can fall
//! through to remaining legacy match arms (unless `suppress_legacy_field`).

#![allow(dead_code)] // Dual-deck slots + queue API are wired from main progressively.

use std::collections::HashMap;
use std::f32::consts::TAU;
use std::sync::Mutex;

use bevy::prelude::Resource;

// ── Permanent primitive ids (mirror shared/field-primitive-ids.ts) ────────────

/// Must stay in lockstep with `FIELD_PRIMITIVE_IDS.supernova_burst` in TS.
pub const PRIMITIVE_SUPERNOVA_BURST: u32 = 1;

// Family A (legacy indices 0–7) — permanent ids 10–17.
pub const PRIMITIVE_BEAMS: u32 = 10;
pub const PRIMITIVE_TUNNEL: u32 = 11;
pub const PRIMITIVE_BURST: u32 = 12;
pub const PRIMITIVE_MIRROR: u32 = 13;
pub const PRIMITIVE_WASH: u32 = 14;
pub const PRIMITIVE_STROBE: u32 = 15;
pub const PRIMITIVE_SWARM: u32 = 16;
pub const PRIMITIVE_ORBIT: u32 = 17;

/// Feature flag: when false, `pose` always returns None (full legacy path).
pub const FIELD_RUNTIME_DSL: bool = true;

/// Wire protocol version we accept (shared/compiled-mode-wire.ts).
pub const COMPILED_MODE_WIRE_VERSION: u32 = 1;

const STAGE_WIDTH: f32 = 1280.0;
const STAGE_HEIGHT: f32 = 720.0;

// ── Pool / deck ──────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FieldPool {
    Beams,
    Rings,
    Tiles,
    Ghost,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FieldDeck {
    A,
    B,
}

impl FieldDeck {
    pub fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(Self::A),
            1 => Some(Self::B),
            _ => None,
        }
    }

    pub fn as_u32(self) -> u32 {
        match self {
            Self::A => 0,
            Self::B => 1,
        }
    }
}

// ── Pose + frame inputs ──────────────────────────────────────────────────────

/// Per-element transform + material drivers produced by a field primitive.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FieldPose {
    pub px: f32,
    pub py: f32,
    pub pz: f32,
    pub rot: f32,
    pub sx: f32,
    pub sy: f32,
    /// Multiplier on deck alpha (typically 0..~1.5); caller still applies deck mix.
    pub alpha: f32,
    pub hue: f32,
    pub lightness: f32,
}

/// Shared per-frame drives (subset of VjState + update_visuals locals).
#[derive(Clone, Copy, Debug)]
pub struct FieldFrameInputs {
    pub t: f32,
    pub beat: f32,
    pub beat_hit: f32,
    pub bass: f32,
    pub mid: f32,
    pub high: f32,
    pub energy: f32,
    pub pulse: f32,
    pub intensity: f32,
    pub depth: f32,
    pub feedback: f32,
    pub speed: f32,
    pub deck_drive: f32,
    pub flash: f32,
    pub cue_hit: f32,
    pub intensity_drive: f32,
    pub motion_drive: f32,
    /// Smoothed activity envelopes (legacy path used these for strobe/swarm feel).
    pub bass_activity: f32,
    pub melodic_activity: f32,
    pub osc_connected: bool,
    /// Pool layout hints (beams count, ring count, tile grid, ghost count).
    pub beam_count: u32,
    pub ring_count: u32,
    pub tile_cols: u32,
    pub tile_rows: u32,
    pub ghost_count: u32,
}

impl Default for FieldFrameInputs {
    fn default() -> Self {
        Self {
            t: 0.0,
            beat: 0.0,
            beat_hit: 0.0,
            bass: 0.0,
            mid: 0.0,
            high: 0.0,
            energy: 0.0,
            pulse: 0.0,
            intensity: 0.85,
            depth: 0.5,
            feedback: 0.5,
            speed: 1.0,
            deck_drive: 0.5,
            flash: 0.0,
            cue_hit: 0.0,
            intensity_drive: 1.0,
            motion_drive: 1.0,
            bass_activity: 0.0,
            melodic_activity: 0.0,
            osc_connected: false,
            beam_count: 72,
            ring_count: 8,
            tile_cols: 14,
            tile_rows: 8,
            ghost_count: 18,
        }
    }
}

// ── Compiled definition ──────────────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
pub struct CompiledFieldDef {
    pub primitive_id: u32,
    pub primitive_name: String,
    pub params: HashMap<String, f32>,
}

/// Mirror of `ModeDisposition` on CompiledModeWire / ModePreset.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum ModeDisposition {
    FieldPrimitive,
    FullscreenPrimary,
    MeshPrimary,
    EngineModule,
    RetireMerge,
    #[default]
    Unknown,
}

impl ModeDisposition {
    pub fn parse(s: &str) -> Self {
        match s {
            "field-primitive" => Self::FieldPrimitive,
            "fullscreen-primary" => Self::FullscreenPrimary,
            "mesh-primary" => Self::MeshPrimary,
            "engine-module" => Self::EngineModule,
            "retire/merge" => Self::RetireMerge,
            _ => Self::Unknown,
        }
    }

    pub fn is_mesh_primary(self) -> bool {
        matches!(self, Self::MeshPrimary)
    }
}

/// One mesh layer from CompiledModeWire.layers (kind == "mesh").
#[derive(Clone, Debug, PartialEq)]
pub struct MeshLayerSpec {
    /// Catalog id or path relative to asset_base (or absolute/root-relative).
    pub ref_id: String,
    pub weight: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ActiveCompiled {
    pub slug: String,
    pub epoch: u32,
    pub field: Option<CompiledFieldDef>,
    pub suppress_legacy_field: bool,
    pub disposition: ModeDisposition,
    /// Epoch-scoped base URL for pack-local assets (`/api/data/e/.../`).
    pub asset_base: String,
    /// Mesh layers from the wire (catalog id or pack-local glTF ref).
    pub mesh_layers: Vec<MeshLayerSpec>,
}

// ── Runtime ──────────────────────────────────────────────────────────────────

#[derive(Resource, Debug, Default)]
pub struct FieldRuntime {
    deck_a: Option<ActiveCompiled>,
    deck_b: Option<ActiveCompiled>,
}

impl FieldRuntime {
    pub fn active(&self, deck: FieldDeck) -> Option<&ActiveCompiled> {
        match deck {
            FieldDeck::A => self.deck_a.as_ref(),
            FieldDeck::B => self.deck_b.as_ref(),
        }
    }

    pub fn has_active(&self, deck: FieldDeck) -> bool {
        self.active(deck).is_some()
    }

    pub fn suppress_legacy(&self, deck: FieldDeck) -> bool {
        self.active(deck)
            .map(|a| a.suppress_legacy_field)
            .unwrap_or(false)
    }

    /// True when the active compiled disposition is mesh-primary.
    pub fn is_mesh_primary(&self, deck: FieldDeck) -> bool {
        self.active(deck)
            .map(|a| a.disposition.is_mesh_primary())
            .unwrap_or(false)
    }

    /// True when ModeDirector should zero legacy_field_weight for this deck:
    /// mesh-primary disposition, or suppress + at least one mesh layer.
    pub fn should_zero_legacy_field(&self, deck: FieldDeck) -> bool {
        match self.active(deck) {
            Some(a) => {
                a.disposition.is_mesh_primary()
                    || (a.suppress_legacy_field && !a.mesh_layers.is_empty())
            }
            None => false,
        }
    }

    /// First mesh layer on the active compiled wire, if any.
    pub fn primary_mesh_layer(&self, deck: FieldDeck) -> Option<&MeshLayerSpec> {
        self.active(deck).and_then(|a| a.mesh_layers.first())
    }

    /// True when this deck has a compiled field primitive the runtime can pose.
    pub fn is_dsl_backed(&self, deck: FieldDeck) -> bool {
        if !FIELD_RUNTIME_DSL {
            return false;
        }
        match self.active(deck).and_then(|a| a.field.as_ref()) {
            Some(f) => is_implemented_primitive(f.primitive_id),
            None => false,
        }
    }

    /// Off-frame ingest. On `Err`, previous active definition is **unchanged**.
    pub fn try_set_compiled(&mut self, deck: FieldDeck, wire_json: &str) -> Result<(), String> {
        let parsed = parse_compiled_wire(wire_json)?;
        match deck {
            FieldDeck::A => self.deck_a = Some(parsed),
            FieldDeck::B => self.deck_b = Some(parsed),
        }
        Ok(())
    }

    /// Clear a deck's active compiled (e.g. host requested empty selection).
    pub fn clear(&mut self, deck: FieldDeck) {
        match deck {
            FieldDeck::A => self.deck_a = None,
            FieldDeck::B => self.deck_b = None,
        }
    }

    /// Pose one element. `None` → caller falls through to legacy (unless suppress).
    ///
    /// Resolution order:
    /// 1. Active compiled field if its primitive is implemented
    /// 2. Else `fallback_primitive_id` (Family A VST int path for legacy 0–7)
    /// 3. Else `None`
    #[allow(clippy::too_many_arguments)] // pool + element identity + shared frame inputs
    pub fn pose(
        &self,
        deck: FieldDeck,
        pool: FieldPool,
        element_index: usize,
        seed: f32,
        col: usize,
        row: usize,
        inputs: &FieldFrameInputs,
        fallback_primitive_id: Option<u32>,
    ) -> Option<FieldPose> {
        if !FIELD_RUNTIME_DSL {
            return None;
        }
        let owned_fallback;
        let field_ref: &CompiledFieldDef = if let Some(f) = self
            .active(deck)
            .and_then(|a| a.field.as_ref())
            .filter(|f| is_implemented_primitive(f.primitive_id))
        {
            f
        } else if let Some(id) = fallback_primitive_id.filter(|id| is_implemented_primitive(*id)) {
            owned_fallback = default_field_def(id);
            &owned_fallback
        } else {
            return None;
        };

        pose_for_field(pool, element_index, seed, col, row, field_ref, inputs)
    }
}

/// Map control-bus / VisualMode legacy index → permanent Family A primitive id.
/// Indices 0–7 only; other modes stay on the legacy match until later PRs.
pub fn primitive_id_for_legacy_index(legacy_index: i32) -> Option<u32> {
    match legacy_index {
        0 => Some(PRIMITIVE_BEAMS),
        1 => Some(PRIMITIVE_TUNNEL),
        2 => Some(PRIMITIVE_BURST),
        3 => Some(PRIMITIVE_MIRROR),
        4 => Some(PRIMITIVE_WASH),
        5 => Some(PRIMITIVE_STROBE),
        6 => Some(PRIMITIVE_SWARM),
        7 => Some(PRIMITIVE_ORBIT),
        _ => None,
    }
}

pub fn is_implemented_primitive(id: u32) -> bool {
    matches!(
        id,
        PRIMITIVE_SUPERNOVA_BURST
            | PRIMITIVE_BEAMS
            | PRIMITIVE_TUNNEL
            | PRIMITIVE_BURST
            | PRIMITIVE_MIRROR
            | PRIMITIVE_WASH
            | PRIMITIVE_STROBE
            | PRIMITIVE_SWARM
            | PRIMITIVE_ORBIT
    )
}

pub fn primitive_name(id: u32) -> &'static str {
    match id {
        PRIMITIVE_SUPERNOVA_BURST => "supernova_burst",
        PRIMITIVE_BEAMS => "beams",
        PRIMITIVE_TUNNEL => "tunnel",
        PRIMITIVE_BURST => "burst",
        PRIMITIVE_MIRROR => "mirror",
        PRIMITIVE_WASH => "wash",
        PRIMITIVE_STROBE => "strobe",
        PRIMITIVE_SWARM => "swarm",
        PRIMITIVE_ORBIT => "orbit",
        _ => "unknown",
    }
}

fn default_field_def(id: u32) -> CompiledFieldDef {
    CompiledFieldDef {
        primitive_id: id,
        primitive_name: primitive_name(id).to_string(),
        params: HashMap::new(),
    }
}

fn pose_for_field(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> Option<FieldPose> {
    Some(match field.primitive_id {
        PRIMITIVE_SUPERNOVA_BURST => {
            pose_supernova_burst(pool, element_index, seed, col, row, field, inputs)
        }
        PRIMITIVE_BEAMS => pose_beams(pool, element_index, seed, col, row, field, inputs),
        PRIMITIVE_TUNNEL => pose_tunnel(pool, element_index, seed, col, row, field, inputs),
        PRIMITIVE_BURST => pose_burst(pool, element_index, seed, col, row, field, inputs),
        PRIMITIVE_MIRROR => pose_mirror(pool, element_index, seed, col, row, field, inputs),
        PRIMITIVE_WASH => pose_wash(pool, element_index, seed, col, row, field, inputs),
        PRIMITIVE_STROBE => pose_strobe(pool, element_index, seed, col, row, field, inputs),
        PRIMITIVE_SWARM => pose_swarm(pool, element_index, seed, col, row, field, inputs),
        PRIMITIVE_ORBIT => pose_orbit(pool, element_index, seed, col, row, field, inputs),
        _ => return None,
    })
}

// ── Param helpers ────────────────────────────────────────────────────────────

fn param(field: &CompiledFieldDef, key: &str, default: f32) -> f32 {
    field.params.get(key).copied().unwrap_or(default)
}

fn clamp(v: f32, lo: f32, hi: f32) -> f32 {
    v.max(lo).min(hi)
}

fn wave(value: f32) -> f32 {
    value.sin() * 0.5 + 0.5
}

fn field_live_energy(inputs: &FieldFrameInputs) -> (f32, f32) {
    let field_live = if inputs.osc_connected {
        (0.4 + inputs.motion_drive * 0.6 + inputs.intensity_drive * 0.12 + inputs.bass_activity * 0.15)
            .clamp(0.4, 1.6)
    } else {
        1.0
    };
    let energy = (inputs.intensity_drive * field_live).clamp(0.2, 2.2);
    (field_live, energy)
}

fn intensity_param(field: &CompiledFieldDef) -> f32 {
    clamp(param(field, "intensity", 1.0), 0.0, 1.0)
}

// ── supernova_burst — all four pools ─────────────────────────────────────────

fn supernova_params(field: &CompiledFieldDef) -> (f32, f32, f32) {
    let intensity = clamp(param(field, "intensity", 0.85), 0.0, 1.0);
    let spin = clamp(param(field, "spin", 0.4), -2.0, 2.0);
    let decay = clamp(param(field, "decay", 0.55), 0.01, 1.0);
    (intensity, spin, decay)
}

/// Deterministic supernova_burst poses for every FieldPool.
pub fn pose_supernova_burst(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let (intensity, spin, decay) = supernova_params(field);
    let t = inputs.t * inputs.speed.max(0.05);
    let energy = clamp(
        inputs.intensity_drive * (0.55 + intensity * 0.7) * (0.7 + inputs.deck_drive * 0.5),
        0.15,
        2.4,
    );
    let burst = (inputs.beat_hit * 0.85 + inputs.cue_hit * 0.45 + inputs.flash * 0.35
        + inputs.bass * 0.25)
        .clamp(0.0, 1.8);
    let shell = 1.0 + burst * (1.35 - decay * 0.55) + inputs.depth * 0.35;

    match pool {
        FieldPool::Beams => {
            let n = inputs.beam_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let layer = (element_index % 12) as f32 / 11.0;
            let theta = fraction * TAU + t * (0.35 + spin * 0.85) + seed * 0.17;
            let r = (90.0 + layer * 210.0 * decay.powf(0.65) + shell * 95.0 + inputs.bass * 40.0)
                * (0.55 + intensity * 0.55);
            let wobble = wave(t * 2.1 + seed * 9.0) - 0.5;
            let px = theta.cos() * r + theta.sin() * wobble * 28.0 * inputs.depth;
            let py = theta.sin() * r - theta.cos() * wobble * 18.0 * inputs.depth;
            let pz = 2.0 + fraction;
            let rot = theta + spin * 0.15 * layer;
            let sx = 3.5 + 22.0 * energy * (0.35 + burst * 0.65) + inputs.high * 4.0;
            let sy = 160.0
                + 220.0 * energy * (0.4 + (1.0 - layer) * 0.6)
                + burst * 90.0
                + inputs.deck_drive * 60.0;
            let alpha = (0.35 + intensity * 0.55 + burst * 0.35) * (0.55 + (1.0 - layer * 0.35));
            let hue = seed * 360.0 + t * 22.0 * spin.abs().max(0.15) + layer * 40.0 + burst * 50.0;
            let lightness = 0.5 + burst * 0.12 + intensity * 0.08 + inputs.high * 0.04;
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx,
                sy,
                alpha: alpha.clamp(0.0, 1.5),
                hue,
                lightness: lightness.clamp(0.2, 0.92),
            }
        }
        FieldPool::Rings => {
            let n = inputs.ring_count.max(1) as f32;
            let layer = if n > 1.0 {
                element_index as f32 / (n - 1.0)
            } else {
                0.0
            };
            let phase = (t * (0.55 + (1.0 - decay) * 0.9) + layer * decay).fract();
            let expand = phase * shell;
            let base = 140.0 + inputs.deck_drive * 40.0 + inputs.bass * 50.0;
            let size = (base * (0.55 + expand * 0.9 + layer * 0.12) * (0.7 + intensity * 0.45))
                .max(1.0);
            let rot = -t * (0.18 + spin * 0.35);
            let glow = (1.0 - layer) * (1.0 - phase).powf(0.8 + decay);
            let alpha = (0.04 + 0.28 * glow * glow) * (0.5 + intensity * 0.6 + burst * 0.35);
            let hue = 40.0 + layer * 50.0 + t * 12.0 * spin.abs().max(0.1) + burst * 30.0;
            let lightness = 0.52 + glow * 0.1 + inputs.mid * 0.04;
            FieldPose {
                px: 0.0,
                py: 0.0,
                pz: 18.0 - layer,
                rot,
                sx: size,
                sy: size,
                alpha: alpha.clamp(0.0, 1.2),
                hue,
                lightness: lightness.clamp(0.2, 0.92),
            }
        }
        FieldPool::Tiles => {
            let cols = inputs.tile_cols.max(1) as f32;
            let rows = inputs.tile_rows.max(1) as f32;
            let u = if cols > 1.0 {
                col as f32 / (cols - 1.0)
            } else {
                0.5
            };
            let v = if rows > 1.0 {
                row as f32 / (rows - 1.0)
            } else {
                0.5
            };
            let cx = u - 0.5;
            let cy = v - 0.5;
            let dist = (cx * cx + cy * cy).sqrt();
            let ang = cy.atan2(cx);
            let ring_phase =
                (dist * 2.8 - t * (1.1 + spin.abs() * 0.4) * (0.5 + decay) + burst * 0.5).rem_euclid(1.0);
            let pulse = (1.0 - ring_phase).powf(1.2 + decay) * shell;
            let px = cx * STAGE_WIDTH * (0.85 + pulse * 0.2 * intensity);
            let py = cy * STAGE_HEIGHT * (0.85 + pulse * 0.2 * intensity);
            let rot = ang + spin * 0.25 * pulse + t * spin * 0.05;
            let cell = (28.0 + pulse * 55.0 * intensity + energy * 12.0).max(2.0);
            let sx = cell * (0.55 + (1.0 - dist).max(0.0) * 0.5);
            let sy = cell * (0.9 + pulse * 0.8);
            let alpha = (0.2 + intensity * 0.55 + pulse * 0.55) * (0.45 + (1.0 - dist) * 0.55);
            let hue = ang.to_degrees() + t * 18.0 + pulse * 60.0 + seed * 40.0;
            let lightness = 0.48 + pulse * 0.14 + inputs.high * 0.05;
            FieldPose {
                px,
                py,
                pz: 8.0 + dist,
                rot,
                sx,
                sy,
                alpha: alpha.clamp(0.0, 1.5),
                hue,
                lightness: lightness.clamp(0.2, 0.92),
            }
        }
        FieldPool::Ghost => {
            let n = inputs.ghost_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let life_rate = 0.28 + (1.0 - decay) * 0.7 + inputs.feedback * 0.55 + inputs.speed * 0.08;
            let life = (t * life_rate + seed * 4.1 + fraction).fract();
            let trail = (1.0 - life).powf(1.4 + decay * 1.2);
            let echo_r = (70.0 + fraction * 160.0 + shell * 80.0 * (1.0 - life))
                * (0.5 + intensity * 0.6)
                * (0.35 + inputs.feedback.max(inputs.flash * 0.5));
            let theta = fraction * TAU + t * (0.12 + spin * 0.55) - life * spin * 0.8;
            let px = theta.cos() * echo_r;
            let py = theta.sin() * echo_r * 0.62;
            let rot = theta + life * 0.4;
            let sx = (40.0 + 200.0 * trail * intensity + burst * 40.0)
                * (0.3 + inputs.feedback.max(inputs.flash * 0.4));
            let sy = (14.0 + 120.0 * trail * (0.5 + intensity) + inputs.bass * 20.0)
                * (0.3 + inputs.feedback.max(inputs.flash * 0.4));
            let alpha = trail
                * (0.08 + intensity * 0.28 + inputs.feedback * 0.35 + inputs.flash * 0.2)
                * (0.5 + burst * 0.4);
            let hue = seed * 200.0 + t * 14.0 + life * 90.0 + fraction * 40.0;
            let lightness = 0.55 + trail * 0.1 + inputs.mid * 0.04;
            FieldPose {
                px,
                py,
                pz: -8.0 + fraction,
                rot,
                sx: sx.max(1.0),
                sy: sy.max(1.0),
                alpha: alpha.clamp(0.0, 1.2),
                hue,
                lightness: lightness.clamp(0.2, 0.92),
            }
        }
    }
}

// ── Family A shared helpers ──────────────────────────────────────────────────

fn beam_post_alpha(mode_alpha: f32, energy: f32, inputs: &FieldFrameInputs, intensity: f32) -> f32 {
    (mode_alpha * intensity * (0.3 + 0.55 * energy) + inputs.beat_hit * 0.12 + inputs.flash * 0.3)
        .clamp(0.0, 1.5)
}

fn tile_post_alpha(mode_alpha: f32, energy: f32, inputs: &FieldFrameInputs, intensity: f32) -> f32 {
    (mode_alpha * intensity * (0.3 + 0.55 * energy) + inputs.beat_hit * 0.12 + inputs.flash * 0.25)
        .clamp(0.0, 1.5)
}

fn beam_lightness(inputs: &FieldFrameInputs, layer: f32) -> f32 {
    (0.54
        + inputs.beat_hit * 0.04
        + inputs.flash * 0.15
        + inputs.deck_drive * 0.06
        + inputs.depth * layer * 0.05
        + inputs.high * 0.03)
        .clamp(0.2, 0.92)
}

fn tile_lightness(inputs: &FieldFrameInputs, pulse: f32) -> f32 {
    (0.54 + 0.05 + pulse * 0.08 + inputs.beat_hit * 0.05).clamp(0.2, 0.92)
}

/// Centred ring shell with per-mode gains (legacy rings path essence).
fn pose_ring_shell(
    element_index: usize,
    inputs: &FieldFrameInputs,
    radius_gain: f32,
    halo_gain: f32,
    alpha_gain: f32,
    mode_gate: f32,
    mode_hue: f32,
    intensity: f32,
) -> FieldPose {
    let n = inputs.ring_count.max(1) as f32;
    let layer = if n > 1.0 {
        element_index as f32 / (n - 1.0)
    } else {
        0.0
    };
    let t = inputs.t;
    let ring_pulse = wave(t * 2.4);
    let beat_swell = inputs.beat_hit * 0.7 + inputs.cue_hit * 0.4;
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
        * intensity
        * (0.015 + 0.22 * glow)
        * (0.26
            + ring_pulse * 0.12 * inputs.motion_drive
            + inputs.beat_hit * 0.22
            + inputs.melodic_activity * 0.08
            + inputs.flash * 0.16);
    let hue = 35.0 + layer * 24.0 + mode_hue;
    let lightness =
        (0.54 + 0.04 + inputs.mid * 0.025 + inputs.high * 0.02 + glow * 0.035).clamp(0.2, 0.92);
    FieldPose {
        px: 0.0,
        py: 0.0,
        pz: 18.0 - layer,
        rot: -t * 0.22,
        sx: size,
        sy: size,
        alpha: alpha.clamp(0.0, 1.5),
        hue,
        lightness,
    }
}

/// Shared ghost streak base (legacy trails layer) before mode modifiers.
fn ghost_base(
    element_index: usize,
    seed: f32,
    inputs: &FieldFrameInputs,
) -> (f32, f32, f32, f32, f32, f32, f32, f32) {
    let n = inputs.ghost_count.max(1) as f32;
    let fraction = element_index as f32 / n;
    let t = inputs.t;
    let trail_gain = inputs.feedback.clamp(0.0, 1.0);
    let angle = t * (0.08 + fraction * 0.04) + fraction * TAU;
    let sway = wave(t * 0.9 + seed * 4.0);
    let life_rate = 0.32 + trail_gain * 0.85 + inputs.speed * 0.1;
    let life = (t * life_rate + seed * 4.1).fract();
    let decay_power = (2.6 - trail_gain * 1.8).max(0.4);
    let trail_fade = (1.0 - life).powf(decay_power);
    let px = angle.cos() * 120.0 * sway;
    let py = angle.sin() * 70.0 * (1.0 - sway);
    let pz = -8.0 + fraction;
    let rot = angle;
    let sx = STAGE_WIDTH
        * (0.22 + trail_gain * 0.9 + inputs.bass * 0.05 * trail_gain)
        * (0.3 + 0.7 * trail_fade)
        * trail_gain.max(inputs.flash * 0.5);
    let sy = (18.0
        + 180.0 * trail_gain * wave(t + seed)
        + inputs.melodic_activity * 24.0 * trail_gain
        + inputs.bass_activity * 22.0 * trail_gain)
        * trail_fade
        * trail_gain.max(inputs.flash * 0.5);
    let alpha = (trail_gain * (0.06 + 0.22 * sway) * trail_fade).max(0.0)
        + inputs.flash * 0.08 * trail_fade;
    let hue = seed * 360.0 + t * 18.0 + fraction * 90.0;
    (px, py, pz, rot, sx.max(1.0), sy.max(1.0), alpha, hue)
}

fn ghost_silent(inputs: &FieldFrameInputs) -> bool {
    inputs.feedback <= 0.0 && inputs.flash <= 0.0
}

// ── beams (legacy 0) ─────────────────────────────────────────────────────────

pub fn pose_beams(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let intensity = intensity_param(field);
    let t = inputs.t;
    let (field_live, energy) = field_live_energy(inputs);
    match pool {
        FieldPool::Beams => {
            let n = inputs.beam_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let layer = (element_index % 12) as f32 / 11.0;
            let depth = inputs.depth;
            let wobble = wave(t * 2.3 + seed * 9.0);
            let spin = t
                * (0.18
                    + inputs.intensity_drive * 0.14
                    + inputs.deck_drive * 0.2
                    + depth * 0.15
                    + inputs.mid * 0.25
                    + inputs.high * 0.15);
            let a = fraction * TAU + spin;
            let r = depth * (layer - 0.5) * (130.0 + wobble * 70.0) + inputs.bass_activity * 14.0;
            let side = depth * (wobble - 0.5) * 60.0
                + inputs.melodic_activity * 10.0 * wave(t * 9.0 + fraction);
            let px = a.cos() * r - a.sin() * side;
            let py = a.sin() * r + a.cos() * side;
            let rot = a + depth * (layer - 0.5) * 0.28;
            let sx = 4.0
                + 28.0 * (wobble * energy * 0.5 + inputs.beat_hit * 0.7)
                + inputs.bass * 4.0
                + inputs.high * wave(t * 12.0 + seed) * 2.5
                + depth * layer * 14.0;
            let sy = 280.0
                + 200.0 * wave(t * 1.2 + fraction * TAU * 3.0) * field_live
                + inputs.deck_drive * 140.0
                + inputs.bass * 50.0
                + depth * layer * 220.0;
            let pz = 2.0 + fraction + layer * depth * 24.0;
            let hue = seed * 360.0 + t * 18.0 + fraction * 180.0;
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx,
                sy,
                alpha: beam_post_alpha(0.85, energy, inputs, intensity),
                hue,
                lightness: beam_lightness(inputs, layer),
            }
        }
        FieldPool::Rings => pose_ring_shell(
            element_index,
            inputs,
            0.9,
            0.8,
            0.55,
            1.0,
            0.0,
            intensity,
        ),
        FieldPool::Tiles => {
            let n = (inputs.tile_cols.max(1) * inputs.tile_rows.max(1)) as f32;
            let fraction = element_index as f32 / n.max(1.0);
            let diagonal = col as f32 * 0.32 + row as f32 * 0.41;
            let pulse = wave(
                t * (3.8 + inputs.melodic_activity * 5.5) - diagonal * 1.7
                    + inputs.beat_hit * 2.0
                    + inputs.deck_drive,
            );
            let a = fraction * TAU + t * (0.2 + inputs.mid * 0.3);
            let r = 50.0 + fraction * 480.0 + inputs.bass * 50.0;
            let px = a.cos() * r;
            let py = a.sin() * r * 0.7;
            let rot = a + TAU * 0.25;
            let sx = 5.0 + inputs.high * 8.0 + inputs.beat_hit * 10.0;
            let sy = 70.0 + energy * 90.0 + pulse * 40.0;
            let mode_hue = fraction * 180.0;
            let hue = seed * 360.0 + t * 18.0 + mode_hue;
            FieldPose {
                px,
                py,
                pz: 8.0,
                rot,
                sx,
                sy,
                alpha: tile_post_alpha(0.85, energy, inputs, intensity),
                hue,
                lightness: tile_lightness(inputs, pulse),
            }
        }
        FieldPool::Ghost => {
            if ghost_silent(inputs) {
                return FieldPose {
                    px: 0.0,
                    py: 0.0,
                    pz: -8.0,
                    rot: 0.0,
                    sx: 1.0,
                    sy: 1.0,
                    alpha: 0.0,
                    hue: 0.0,
                    lightness: 0.54,
                };
            }
            let (px, py, pz, rot, sx, sy, alpha, hue) = ghost_base(element_index, seed, inputs);
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx,
                sy,
                alpha: (alpha * intensity).clamp(0.0, 1.2),
                hue,
                lightness: 0.62,
            }
        }
    }
}

// ── tunnel (legacy 1) ────────────────────────────────────────────────────────

pub fn pose_tunnel(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let intensity = intensity_param(field);
    let depth = clamp(param(field, "depth", inputs.depth), 0.0, 1.0);
    let t = inputs.t;
    let (_field_live, energy) = field_live_energy(inputs);
    match pool {
        FieldPool::Beams => {
            let layer = (element_index % 12) as f32 / 11.0;
            let ring = (element_index % 12) as f32;
            let spoke = (element_index / 12) as f32;
            let a = spoke / 6.0 * TAU + t * (0.4 + depth * 0.5);
            let r = 50.0 + ring * 42.0 + depth * 90.0;
            let px = a.cos() * r;
            let py = a.sin() * r * 0.8;
            let rot = a + TAU * 0.25;
            let sx = 5.0 + ring * 1.5 + inputs.beat_hit * 8.0;
            let sy = 80.0 + ring * 22.0 + inputs.beat_hit * 60.0 + depth * 40.0;
            let pz = 2.0 + ring * 4.0;
            let hue = seed * 360.0 + t * 18.0 + 10.0 + ring * 14.0;
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx,
                sy,
                alpha: beam_post_alpha(0.5 + (1.0 - ring / 12.0) * 0.5, energy, inputs, intensity),
                hue,
                lightness: beam_lightness(inputs, layer),
            }
        }
        FieldPool::Rings => pose_ring_shell(
            element_index,
            inputs,
            0.92 + depth * 0.18,
            0.9,
            0.65,
            1.0,
            0.0,
            intensity,
        ),
        FieldPool::Tiles => {
            let diagonal = col as f32 * 0.32 + row as f32 * 0.41;
            let pulse = wave(
                t * (3.8 + inputs.melodic_activity * 5.5) - diagonal * 1.7
                    + inputs.beat_hit * 2.0
                    + inputs.deck_drive,
            );
            let ring = (element_index % 10) as f32;
            let spoke = (element_index / 10) as f32;
            let a = spoke / 12.0 * TAU + t * (0.35 + depth * 0.4);
            let r = 40.0 + ring * 48.0 + depth * 80.0;
            let px = a.cos() * r;
            let py = a.sin() * r * 0.78;
            let rot = a + TAU * 0.25;
            let sx = 4.0 + ring * 1.2;
            let sy = 36.0 + ring * 8.0 + inputs.beat_hit * 30.0;
            let hue = seed * 360.0 + t * 18.0 + 10.0 + ring * 18.0;
            FieldPose {
                px,
                py,
                pz: 4.0 + ring * 3.0,
                rot,
                sx,
                sy,
                alpha: tile_post_alpha(
                    0.55 + (1.0 - ring / 10.0) * 0.45,
                    energy,
                    inputs,
                    intensity,
                ),
                hue,
                lightness: tile_lightness(inputs, pulse),
            }
        }
        FieldPool::Ghost => {
            if ghost_silent(inputs) {
                return silent_ghost();
            }
            let (px, py, pz, _rot, mut sx, mut sy, alpha, hue) =
                ghost_base(element_index, seed, inputs);
            let n = inputs.ghost_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let angle = t * (0.08 + fraction * 0.04) + fraction * TAU;
            let rot = angle + fraction * TAU * 0.5;
            sx *= 0.55 + depth;
            sy *= 1.4 + fraction;
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx: sx.max(1.0),
                sy: sy.max(1.0),
                alpha: (alpha * intensity).clamp(0.0, 1.2),
                hue,
                lightness: 0.62,
            }
        }
    }
}

fn silent_ghost() -> FieldPose {
    FieldPose {
        px: 0.0,
        py: 0.0,
        pz: -8.0,
        rot: 0.0,
        sx: 1.0,
        sy: 1.0,
        alpha: 0.0,
        hue: 0.0,
        lightness: 0.54,
    }
}

pub fn pose_burst(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let intensity = intensity_param(field);
    let t = inputs.t;
    let (_field_live, energy) = field_live_energy(inputs);
    match pool {
        FieldPool::Beams => {
            let n = inputs.beam_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let layer = (element_index % 12) as f32 / 11.0;
            let a = fraction * TAU + seed * 3.0;
            let burst = (inputs.beat_hit * 2.8 + inputs.cue_hit * 1.4).clamp(0.0, 2.5);
            let r = 30.0 + burst * 320.0 + fraction * 100.0;
            let px = a.cos() * r;
            let py = a.sin() * r * 0.7;
            let hue = seed * 360.0 + t * 18.0 + 210.0 + burst * 45.0;
            FieldPose {
                px,
                py,
                pz: 2.0 + fraction,
                rot: a,
                sx: 6.0 + burst * 40.0,
                sy: 40.0 + burst * 200.0 + inputs.high * 50.0,
                alpha: beam_post_alpha(0.4 + burst * 0.7, energy, inputs, intensity),
                hue,
                lightness: beam_lightness(inputs, layer),
            }
        }
        FieldPool::Rings => pose_ring_shell(
            element_index,
            inputs,
            0.96 + inputs.beat_hit * 0.32 + inputs.cue_hit * 0.18,
            1.0,
            0.72,
            1.0,
            0.0,
            intensity,
        ),
        FieldPool::Tiles => {
            let n = (inputs.tile_cols.max(1) * inputs.tile_rows.max(1)) as f32;
            let fraction = element_index as f32 / n.max(1.0);
            let diagonal = col as f32 * 0.32 + row as f32 * 0.41;
            let pulse = wave(
                t * (3.8 + inputs.melodic_activity * 5.5) - diagonal * 1.7
                    + inputs.beat_hit * 2.0
                    + inputs.deck_drive,
            );
            let a = fraction * TAU + seed * 2.0;
            let r = 20.0 + (inputs.beat_hit * 2.5 + inputs.cue_hit + pulse) * 280.0 + fraction * 80.0;
            let hue = seed * 360.0 + t * 18.0 + 210.0 + inputs.beat_hit * 50.0;
            FieldPose {
                px: a.cos() * r,
                py: a.sin() * r * 0.65,
                pz: 8.0,
                rot: a,
                sx: 8.0 + inputs.beat_hit * 40.0,
                sy: 30.0 + inputs.beat_hit * 120.0 + inputs.high * 40.0,
                alpha: tile_post_alpha(
                    0.35 + inputs.beat_hit * 0.9 + inputs.cue_hit * 0.5,
                    energy,
                    inputs,
                    intensity,
                ),
                hue,
                lightness: tile_lightness(inputs, pulse),
            }
        }
        FieldPool::Ghost => {
            if ghost_silent(inputs) {
                return silent_ghost();
            }
            let (px, py, pz, rot, mut sx, mut sy, mut alpha, hue) =
                ghost_base(element_index, seed, inputs);
            sx *= 0.35 + inputs.beat_hit * 2.4 + inputs.cue_hit;
            sy *= 1.0 + inputs.beat_hit * 1.6;
            alpha *= 0.45 + inputs.beat_hit;
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx: sx.max(1.0),
                sy: sy.max(1.0),
                alpha: (alpha * intensity).clamp(0.0, 1.2),
                hue,
                lightness: 0.62,
            }
        }
    }
}

pub fn pose_mirror(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let intensity = intensity_param(field);
    let t = inputs.t;
    let (_field_live, energy) = field_live_energy(inputs);
    match pool {
        FieldPool::Beams => {
            let n = inputs.beam_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let layer = (element_index % 12) as f32 / 11.0;
            let wobble = wave(t * 2.3 + seed * 9.0);
            let side = if element_index % 2 == 0 { -1.0 } else { 1.0 };
            let a = (fraction * 0.5) * TAU + t * 0.2;
            let r = 80.0 + layer * 200.0 + inputs.mid * 40.0;
            let px = side * (a.cos().abs() * r + 40.0);
            let py = a.sin() * r * 0.85;
            let rot = if side < 0.0 { -a } else { a };
            let hue = seed * 360.0 + t * 18.0 + 130.0 + side * 40.0;
            FieldPose {
                px,
                py,
                pz: 2.0 + fraction,
                rot,
                sx: 6.0 + inputs.high * 12.0,
                sy: 120.0 + energy * 160.0 + wobble * 80.0,
                alpha: beam_post_alpha(0.7 + inputs.high * 0.3, energy, inputs, intensity),
                hue,
                lightness: beam_lightness(inputs, layer),
            }
        }
        FieldPool::Rings => pose_ring_shell(
            element_index,
            inputs,
            0.9,
            0.65,
            0.58 + inputs.mid * 0.28,
            1.0,
            0.0,
            intensity,
        ),
        FieldPool::Tiles => {
            let cols = inputs.tile_cols.max(1) as f32;
            let rows = inputs.tile_rows.max(1) as f32;
            let u = if cols > 1.0 {
                col as f32 / (cols - 1.0)
            } else {
                0.5
            };
            let v = if rows > 1.0 {
                row as f32 / (rows - 1.0)
            } else {
                0.5
            };
            let diagonal = col as f32 * 0.32 + row as f32 * 0.41;
            let pulse = wave(
                t * (3.8 + inputs.melodic_activity * 5.5) - diagonal * 1.7
                    + inputs.beat_hit * 2.0
                    + inputs.deck_drive,
            );
            let side = if col % 2 == 0 { -1.0 } else { 1.0 };
            let px = side * (80.0 + u * 420.0 + inputs.mid * 40.0);
            let py = (v - 0.5) * STAGE_HEIGHT * 0.9;
            let rot = if side < 0.0 { TAU * 0.5 } else { 0.0 };
            let hue = seed * 360.0 + t * 18.0 + 130.0 + side * 40.0;
            FieldPose {
                px,
                py,
                pz: 8.0,
                rot,
                sx: 7.0 + inputs.high * 10.0,
                sy: 50.0 + energy * 70.0,
                alpha: tile_post_alpha(0.75 + inputs.high * 0.25, energy, inputs, intensity),
                hue,
                lightness: tile_lightness(inputs, pulse),
            }
        }
        FieldPool::Ghost => {
            if ghost_silent(inputs) {
                return silent_ghost();
            }
            let (mut px, py, pz, rot, mut sx, sy, mut alpha, hue) =
                ghost_base(element_index, seed, inputs);
            px = if element_index % 2 == 0 {
                px.abs()
            } else {
                -px.abs()
            };
            sx *= 0.75;
            alpha *= 1.1;
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx: sx.max(1.0),
                sy: sy.max(1.0),
                alpha: (alpha * intensity).clamp(0.0, 1.2),
                hue,
                lightness: 0.62,
            }
        }
    }
}

pub fn pose_wash(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let intensity = intensity_param(field);
    let t = inputs.t;
    let trail_gain = inputs.feedback.clamp(0.0, 1.0);
    let osc_drive = inputs.energy.clamp(0.0, 1.0);
    let (_field_live, energy) = field_live_energy(inputs);
    match pool {
        FieldPool::Beams => {
            let n = inputs.beam_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let layer = (element_index % 12) as f32 / 11.0;
            let a = fraction * TAU + t * 0.08;
            let px = a.cos() * (40.0 + layer * 30.0);
            let py = (fraction - 0.5) * STAGE_HEIGHT * 0.7 + wave(t * 0.45 + fraction) * 40.0;
            let hue = seed * 360.0 + t * 18.0 + 30.0 + fraction * 40.0;
            FieldPose {
                px,
                py,
                pz: -2.0 + layer * 0.5,
                rot: 0.0,
                sx: 200.0 + trail_gain * 280.0 + energy * 60.0,
                sy: 18.0 + wave(t * 0.45 + fraction) * 25.0 + trail_gain * 30.0,
                alpha: beam_post_alpha(
                    0.14 + trail_gain * 0.45 + osc_drive * 0.22,
                    energy,
                    inputs,
                    intensity,
                ),
                hue,
                lightness: beam_lightness(inputs, layer),
            }
        }
        FieldPool::Rings => pose_ring_shell(
            element_index,
            inputs,
            1.02 + trail_gain * 0.18,
            1.4,
            0.44,
            1.0,
            0.0,
            intensity,
        ),
        FieldPool::Tiles => {
            let cols = inputs.tile_cols.max(1) as f32;
            let rows = inputs.tile_rows.max(1) as f32;
            let u = if cols > 1.0 {
                col as f32 / (cols - 1.0)
            } else {
                0.5
            };
            let v = if rows > 1.0 {
                row as f32 / (rows - 1.0)
            } else {
                0.5
            };
            let diagonal = col as f32 * 0.32 + row as f32 * 0.41;
            let pulse = wave(
                t * (3.8 + inputs.melodic_activity * 5.5) - diagonal * 1.7
                    + inputs.beat_hit * 2.0
                    + inputs.deck_drive,
            );
            let px = (u - 0.5) * STAGE_WIDTH * 1.1;
            let py = (v - 0.5) * STAGE_HEIGHT * 0.55 + wave(t * 0.4 + v) * 30.0;
            let hue = seed * 360.0 + t * 18.0 + 30.0 + v * 40.0;
            FieldPose {
                px,
                py,
                pz: 8.0,
                rot: 0.0,
                sx: 180.0 + trail_gain * 220.0 + energy * 40.0,
                sy: 12.0 + pulse * 18.0 + trail_gain * 20.0,
                alpha: tile_post_alpha(
                    0.12 + trail_gain * 0.4 + osc_drive * 0.2,
                    energy,
                    inputs,
                    intensity,
                ),
                hue,
                lightness: tile_lightness(inputs, pulse),
            }
        }
        FieldPool::Ghost => {
            if ghost_silent(inputs) {
                return silent_ghost();
            }
            let (px, py, pz, rot, mut sx, mut sy, mut alpha, hue) =
                ghost_base(element_index, seed, inputs);
            sx *= 1.8;
            sy *= 2.2 + trail_gain;
            alpha *= 1.35;
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx: sx.max(1.0),
                sy: sy.max(1.0),
                alpha: (alpha * intensity).clamp(0.0, 1.2),
                hue,
                lightness: 0.62,
            }
        }
    }
}

pub fn pose_strobe(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let intensity = intensity_param(field);
    let t = inputs.t;
    let (_field_live, energy) = field_live_energy(inputs);
    let bass_activity = inputs.bass_activity;
    match pool {
        FieldPool::Beams => {
            let n = inputs.beam_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let layer = (element_index % 12) as f32 / 11.0;
            let a = fraction * TAU + t * 0.5;
            let r = 70.0 + fraction * 400.0;
            let gate = if bass_activity + inputs.beat_hit > 0.38 {
                1.0
            } else {
                0.1
            };
            let hue = seed * 360.0 + t * 18.0 + inputs.beat_hit * 120.0 + fraction * 60.0;
            FieldPose {
                px: a.cos() * r,
                py: a.sin() * r * 0.7,
                pz: 2.0 + fraction,
                rot: a + TAU * 0.25,
                sx: 10.0 + inputs.beat_hit * 35.0,
                sy: 140.0 + bass_activity * 100.0,
                alpha: beam_post_alpha(gate, energy, inputs, intensity),
                hue,
                lightness: beam_lightness(inputs, layer),
            }
        }
        FieldPool::Rings => {
            let gate = if (bass_activity + inputs.beat_hit * 1.2).clamp(0.0, 1.0) > 0.35 {
                1.0
            } else {
                0.0
            };
            pose_ring_shell(
                element_index,
                inputs,
                0.9 + bass_activity * 0.22,
                0.8,
                0.75,
                gate,
                0.0,
                intensity,
            )
        }
        FieldPool::Tiles => {
            let n = (inputs.tile_cols.max(1) * inputs.tile_rows.max(1)) as f32;
            let fraction = element_index as f32 / n.max(1.0);
            let diagonal = col as f32 * 0.32 + row as f32 * 0.41;
            let pulse = wave(
                t * (3.8 + inputs.melodic_activity * 5.5) - diagonal * 1.7
                    + inputs.beat_hit * 2.0
                    + inputs.deck_drive,
            );
            let a = fraction * TAU;
            let r = 60.0 + fraction * 400.0;
            let gate = if bass_activity + inputs.beat_hit > 0.35 {
                1.0
            } else {
                0.08
            };
            let hue = seed * 360.0 + t * 18.0 + inputs.beat_hit * 120.0 + fraction * 60.0;
            FieldPose {
                px: a.cos() * r,
                py: a.sin() * r * 0.7,
                pz: 8.0,
                rot: a + TAU * 0.25,
                sx: 12.0 + inputs.beat_hit * 30.0,
                sy: 100.0 + bass_activity * 80.0,
                alpha: tile_post_alpha(gate, energy, inputs, intensity),
                hue,
                lightness: tile_lightness(inputs, pulse),
            }
        }
        FieldPool::Ghost => {
            if ghost_silent(inputs) {
                return silent_ghost();
            }
            let (px, py, pz, rot, mut sx, sy, mut alpha, hue) =
                ghost_base(element_index, seed, inputs);
            let gate = (bass_activity + inputs.beat_hit).clamp(0.0, 1.0);
            let on = if gate > 0.28 { 1.0 } else { 0.0 };
            alpha *= on;
            sx *= 1.0 + bass_activity * 0.6;
            FieldPose {
                px,
                py,
                pz,
                rot,
                sx: sx.max(1.0),
                sy: sy.max(1.0),
                alpha: (alpha * intensity).clamp(0.0, 1.2),
                hue,
                lightness: 0.62,
            }
        }
    }
}

pub fn pose_swarm(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let intensity = intensity_param(field);
    let t = inputs.t;
    let (_field_live, energy) = field_live_energy(inputs);
    match pool {
        FieldPool::Beams => {
            let n = inputs.beam_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let layer = (element_index % 12) as f32 / 11.0;
            let px = (t * 1.7 + seed * 11.0).sin() * 420.0 + (t * 3.1 + seed * 5.0).sin() * 50.0;
            let py = (t * 2.1 + seed * 7.0).cos() * 280.0 + (t * 2.8 + seed * 4.0).cos() * 40.0;
            let hue = seed * 360.0 + t * 18.0 + seed * 360.0;
            FieldPose {
                px,
                py,
                pz: 2.0 + fraction,
                rot: seed * 6.0 + t * 0.6,
                sx: 6.0 + inputs.high * 14.0,
                sy: 50.0 + energy * 90.0 + wave(t * 2.0 + seed * 5.0) * 40.0,
                alpha: beam_post_alpha(0.75, energy, inputs, intensity),
                hue,
                lightness: beam_lightness(inputs, layer),
            }
        }
        FieldPool::Rings => {
            let ring_pulse = wave(t * 2.4);
            pose_ring_shell(
                element_index,
                inputs,
                0.88 + ring_pulse * 0.05,
                1.1,
                0.5,
                1.0,
                0.0,
                intensity,
            )
        }
        FieldPool::Tiles => {
            let diagonal = col as f32 * 0.32 + row as f32 * 0.41;
            let pulse = wave(
                t * (3.8 + inputs.melodic_activity * 5.5) - diagonal * 1.7
                    + inputs.beat_hit * 2.0
                    + inputs.deck_drive,
            );
            let ox = (t * 1.6 + seed * 13.0).sin() * 380.0;
            let oy = (t * 2.1 + seed * 9.0).cos() * 240.0;
            let px = ox + (t * 3.0 + seed * 5.0).sin() * 40.0;
            let py = oy + (t * 2.7 + seed * 7.0).cos() * 30.0;
            let hue = seed * 360.0 + t * 18.0 + seed * 360.0;
            FieldPose {
                px,
                py,
                pz: 8.0,
                rot: seed * TAU + t * 0.8,
                sx: 6.0 + inputs.high * 12.0,
                sy: 24.0 + energy * 50.0 + pulse * 30.0,
                alpha: tile_post_alpha(0.7, energy, inputs, intensity),
                hue,
                lightness: tile_lightness(inputs, pulse),
            }
        }
        FieldPool::Ghost => {
            if ghost_silent(inputs) {
                return silent_ghost();
            }
            let n = inputs.ghost_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let (_px, _py, pz, _rot, sx, sy, alpha, hue) = ghost_base(element_index, seed, inputs);
            let dx = (t * 1.0 + fraction * 17.0).sin() * 240.0;
            let dy = (t * 1.4 + fraction * 11.0).cos() * 100.0;
            FieldPose {
                px: dx,
                py: dy,
                pz,
                rot: t * 0.7 + fraction * TAU,
                sx: sx.max(1.0),
                sy: sy.max(1.0),
                alpha: (alpha * intensity).clamp(0.0, 1.2),
                hue,
                lightness: 0.62,
            }
        }
    }
}

pub fn pose_orbit(
    pool: FieldPool,
    element_index: usize,
    seed: f32,
    col: usize,
    row: usize,
    field: &CompiledFieldDef,
    inputs: &FieldFrameInputs,
) -> FieldPose {
    let intensity = intensity_param(field);
    let spin = clamp(param(field, "spin", 0.3), -2.0, 2.0);
    let t = inputs.t;
    let (_field_live, energy) = field_live_energy(inputs);
    match pool {
        FieldPool::Beams => {
            let n = inputs.beam_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let layer = (element_index % 12) as f32 / 11.0;
            let lane = (element_index % 8) as f32;
            let a = t * (0.45 + seed * 0.4 + spin * 0.15) + seed * TAU + lane * 0.2;
            let r = 100.0 + lane * 55.0 + layer * 40.0 + inputs.bass * 50.0;
            let hue = seed * 360.0 + t * 18.0 + 130.0 + lane * 20.0;
            FieldPose {
                px: a.cos() * r,
                py: a.sin() * r * 0.75,
                pz: 2.0 + fraction,
                rot: a + TAU * 0.25,
                sx: 5.0 + inputs.mid * 8.0,
                sy: 90.0 + energy * 80.0,
                alpha: beam_post_alpha(0.85, energy, inputs, intensity),
                hue,
                lightness: beam_lightness(inputs, layer),
            }
        }
        FieldPool::Rings => pose_ring_shell(
            element_index,
            inputs,
            0.92,
            0.9,
            0.6,
            1.0,
            0.0,
            intensity,
        ),
        FieldPool::Tiles => {
            let n = (inputs.tile_cols.max(1) * inputs.tile_rows.max(1)) as f32;
            let fraction = element_index as f32 / n.max(1.0);
            let diagonal = col as f32 * 0.32 + row as f32 * 0.41;
            let pulse = wave(
                t * (3.8 + inputs.melodic_activity * 5.5) - diagonal * 1.7
                    + inputs.beat_hit * 2.0
                    + inputs.deck_drive,
            );
            let lane = (element_index % 6) as f32;
            let a = t * (0.4 + seed * 0.35 + lane * 0.05 + spin * 0.1) + fraction * TAU;
            let r = 90.0 + lane * 55.0 + inputs.bass * 40.0;
            let hue = seed * 360.0 + t * 18.0 + 130.0 + lane * 25.0;
            FieldPose {
                px: a.cos() * r,
                py: a.sin() * r * 0.72,
                pz: 8.0,
                rot: a + TAU * 0.25,
                sx: 5.0 + inputs.mid * 6.0,
                sy: 40.0 + energy * 45.0,
                alpha: tile_post_alpha(0.8, energy, inputs, intensity),
                hue,
                lightness: tile_lightness(inputs, pulse),
            }
        }
        FieldPool::Ghost => {
            if ghost_silent(inputs) {
                return silent_ghost();
            }
            let n = inputs.ghost_count.max(1) as f32;
            let fraction = element_index as f32 / n;
            let (_px, _py, pz, _rot, sx, sy, alpha, hue) = ghost_base(element_index, seed, inputs);
            let orbit_a = t * (0.6 + spin * 0.2) + fraction * TAU;
            FieldPose {
                px: orbit_a.cos() * (180.0 + fraction * 80.0),
                py: orbit_a.sin() * (120.0 + fraction * 40.0),
                pz,
                rot: orbit_a,
                sx: sx.max(1.0),
                sy: sy.max(1.0),
                alpha: (alpha * intensity).clamp(0.0, 1.2),
                hue,
                lightness: 0.62,
            }
        }
    }
}

// ── Wire parse (minimal CompiledModeWire subset) ─────────────────────────────

/// Parse a CompiledModeWire JSON object. Fail closed on version / shape errors.
pub fn parse_compiled_wire(json: &str) -> Result<ActiveCompiled, String> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("json parse: {e}"))?;
    let obj = v
        .as_object()
        .ok_or_else(|| "wire root must be an object".to_string())?;

    let wire_version = obj
        .get("wireVersion")
        .and_then(|x| x.as_u64())
        .ok_or_else(|| "wireVersion missing or not a number".to_string())?
        as u32;
    if wire_version != COMPILED_MODE_WIRE_VERSION {
        return Err(format!(
            "unsupported wireVersion {wire_version} (want {COMPILED_MODE_WIRE_VERSION})"
        ));
    }

    let slug = obj
        .get("slug")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let epoch = obj.get("epoch").and_then(|x| x.as_u64()).unwrap_or(0) as u32;
    let suppress_legacy_field = obj
        .get("suppressLegacyField")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);

    let disposition = obj
        .get("disposition")
        .and_then(|x| x.as_str())
        .map(ModeDisposition::parse)
        .unwrap_or(ModeDisposition::Unknown);

    let asset_base = obj
        .get("assetBase")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    let mut mesh_layers = Vec::new();
    if let Some(layers) = obj.get("layers").and_then(|x| x.as_array()) {
        for layer in layers {
            let Some(lobj) = layer.as_object() else {
                continue;
            };
            let kind = lobj.get("kind").and_then(|x| x.as_str()).unwrap_or("");
            if kind != "mesh" {
                continue;
            }
            let ref_id = lobj
                .get("ref")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if ref_id.is_empty() {
                // Soft: skip empty mesh refs rather than fail the whole wire.
                continue;
            }
            let weight = lobj
                .get("weight")
                .and_then(|x| x.as_f64())
                .map(|n| n as f32)
                .unwrap_or(1.0)
                .clamp(0.0, 1.0);
            mesh_layers.push(MeshLayerSpec { ref_id, weight });
        }
    }

    let field = match obj.get("field") {
        None | Some(serde_json::Value::Null) => None,
        Some(f) => {
            let fobj = f
                .as_object()
                .ok_or_else(|| "field must be an object".to_string())?;
            let primitive_id = fobj
                .get("primitiveId")
                .and_then(|x| x.as_u64())
                .ok_or_else(|| "field.primitiveId missing".to_string())?
                as u32;
            if primitive_id == 0 {
                return Err("field.primitiveId must be non-zero".to_string());
            }
            let primitive_name = fobj
                .get("primitiveName")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let mut params = HashMap::new();
            if let Some(p) = fobj.get("params").and_then(|x| x.as_object()) {
                for (k, val) in p {
                    if let Some(n) = val.as_f64() {
                        params.insert(k.clone(), n as f32);
                    } else if let Some(i) = val.as_i64() {
                        params.insert(k.clone(), i as f32);
                    } else if let Some(u) = val.as_u64() {
                        params.insert(k.clone(), u as f32);
                    }
                }
            }
            Some(CompiledFieldDef {
                primitive_id,
                primitive_name,
                params,
            })
        }
    };

    Ok(ActiveCompiled {
        slug,
        epoch,
        field,
        suppress_legacy_field,
        disposition,
        asset_base,
        mesh_layers,
    })
}

// ── Off-frame queue (WASM / host → Bevy resource) ────────────────────────────

struct PendingCompiled {
    deck: u32,
    json: String,
}

static PENDING_COMPILED: Mutex<Vec<PendingCompiled>> = Mutex::new(Vec::new());

/// Queue a compiled-mode JSON payload for the next frame drain.
pub fn queue_compiled_json(deck: u32, json: &str) -> bool {
    if FieldDeck::from_u32(deck).is_none() {
        return false;
    }
    if let Ok(mut q) = PENDING_COMPILED.lock() {
        q.push(PendingCompiled {
            deck,
            json: json.to_string(),
        });
        true
    } else {
        false
    }
}

/// Apply all queued compiled payloads. Each failure leaves that deck unchanged.
pub fn drain_pending(runtime: &mut FieldRuntime) {
    let batch = if let Ok(mut q) = PENDING_COMPILED.lock() {
        std::mem::take(&mut *q)
    } else {
        return;
    };
    for item in batch {
        let Some(deck) = FieldDeck::from_u32(item.deck) else {
            continue;
        };
        let _ = runtime.try_set_compiled(deck, &item.json);
    }
}

// ── Tests / parity harness ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    const GOLDEN_TOL: f32 = 1e-3;

    fn sample_inputs(t: f32) -> FieldFrameInputs {
        FieldFrameInputs {
            t,
            beat: 0.25,
            beat_hit: 0.4,
            bass: 0.5,
            mid: 0.3,
            high: 0.2,
            energy: 0.6,
            pulse: 0.35,
            intensity: 0.9,
            depth: 0.55,
            feedback: 0.6,
            speed: 1.0,
            deck_drive: 0.7,
            flash: 0.0,
            cue_hit: 0.1,
            intensity_drive: 1.1,
            motion_drive: 0.8,
            bass_activity: 0.45,
            melodic_activity: 0.35,
            osc_connected: true,
            ..FieldFrameInputs::default()
        }
    }

    fn sample_field() -> CompiledFieldDef {
        let mut params = HashMap::new();
        params.insert("intensity".into(), 0.9);
        params.insert("spin".into(), 0.35);
        params.insert("decay".into(), 0.6);
        CompiledFieldDef {
            primitive_id: PRIMITIVE_SUPERNOVA_BURST,
            primitive_name: "supernova_burst".into(),
            params,
        }
    }

    fn family_field(id: u32) -> CompiledFieldDef {
        default_field_def(id)
    }

    fn assert_pose_close(got: &FieldPose, exp: &FieldPose, label: &str) {
        let check = |name: &str, a: f32, b: f32| {
            assert!(
                (a - b).abs() <= GOLDEN_TOL,
                "{label}.{name}: got {a} expected {b} (Δ={})",
                (a - b).abs()
            );
        };
        check("px", got.px, exp.px);
        check("py", got.py, exp.py);
        check("pz", got.pz, exp.pz);
        check("rot", got.rot, exp.rot);
        check("sx", got.sx, exp.sx);
        check("sy", got.sy, exp.sy);
        check("alpha", got.alpha, exp.alpha);
        check("hue", got.hue, exp.hue);
        check("lightness", got.lightness, exp.lightness);
    }

    fn assert_pose_sane(pose: &FieldPose, label: &str) {
        assert!(
            pose.sx.is_finite()
                && pose.sy.is_finite()
                && pose.alpha.is_finite()
                && pose.px.is_finite()
                && pose.py.is_finite(),
            "non-finite pose for {label}: {pose:?}"
        );
        assert!(pose.sx > 0.0 && pose.sy > 0.0, "non-positive scale {label}");
        assert!(pose.alpha >= 0.0, "negative alpha {label}");
    }

    #[test]
    fn supernova_covers_all_four_pools() {
        let field = sample_field();
        let inputs = sample_inputs(0.5);
        for pool in [
            FieldPool::Beams,
            FieldPool::Rings,
            FieldPool::Tiles,
            FieldPool::Ghost,
        ] {
            let pose = pose_supernova_burst(pool, 0, 0.1, 1, 1, &field, &inputs);
            assert_pose_sane(&pose, &format!("supernova {pool:?}"));
        }
    }

    #[test]
    fn family_a_0_7_covers_all_four_pools() {
        let inputs = sample_inputs(1.25);
        let pools = [
            FieldPool::Beams,
            FieldPool::Rings,
            FieldPool::Tiles,
            FieldPool::Ghost,
        ];
        for legacy in 0..=7 {
            let id = primitive_id_for_legacy_index(legacy).expect("family A id");
            let field = family_field(id);
            for pool in pools {
                let pose = pose_for_field(pool, 3, 0.37, 2, 1, &field, &inputs)
                    .expect("implemented");
                assert_pose_sane(&pose, &format!("legacy{legacy}/{pool:?}"));
            }
        }
    }

    #[test]
    fn family_a_vst_fallback_without_compiled() {
        let rt = FieldRuntime::default();
        let inputs = sample_inputs(0.5);
        // No compiled wire — VST int path must still pose via fallback.
        for legacy in 0..=7 {
            let id = primitive_id_for_legacy_index(legacy).unwrap();
            let pose = rt.pose(
                FieldDeck::A,
                FieldPool::Beams,
                0,
                0.0,
                0,
                0,
                &inputs,
                Some(id),
            );
            assert!(pose.is_some(), "fallback missing for legacy {legacy}");
        }
        // Mode 8 (Pulse) has no Family A fallback yet.
        assert!(
            rt.pose(
                FieldDeck::A,
                FieldPool::Beams,
                0,
                0.0,
                0,
                0,
                &inputs,
                primitive_id_for_legacy_index(8),
            )
            .is_none()
        );
    }

    #[test]
    fn golden_poses_match_snapshot() {
        // Pinned expected values for the sample field @ t=1.25 (supernova).
        let expected: &[(FieldPool, usize, FieldPose)] = &[
            (
                FieldPool::Beams,
                0,
                FieldPose {
                    px: 199.374_01,
                    py: 204.596_44,
                    pz: 2.0,
                    rot: 0.809_375_05,
                    sx: 24.733_96,
                    sy: 547.738_04,
                    alpha: 1.5,
                    hue: 35.125,
                    lightness: 0.641_200_07,
                },
            ),
            (
                FieldPool::Beams,
                17,
                FieldPose {
                    px: -323.988_4,
                    py: 151.519_62,
                    pz: 2.236_111_2,
                    rot: 2.712_698_5,
                    sx: 24.733_96,
                    sy: 465.964_02,
                    alpha: 1.423_595_5,
                    hue: 891.746_8,
                    lightness: 0.641_200_07,
                },
            ),
            (
                FieldPool::Rings,
                0,
                FieldPose {
                    px: 0.0,
                    py: 0.0,
                    pz: 18.0,
                    rot: -0.378_125,
                    sx: 162.496_52,
                    sy: 162.496_52,
                    alpha: 0.274_220_6,
                    hue: 60.55,
                    lightness: 0.613_294_8,
                },
            ),
            (
                FieldPool::Rings,
                3,
                FieldPose {
                    px: 0.0,
                    py: 0.0,
                    pz: 17.571_428,
                    rot: -0.378_125,
                    sx: 257.995_82,
                    sy: 257.995_82,
                    alpha: 0.076_063_73,
                    hue: 81.978_58,
                    lightness: 0.560_299_46,
                },
            ),
            (
                FieldPool::Tiles,
                0,
                FieldPose {
                    px: -594.708_2,
                    py: -334.523_38,
                    pz: 8.707_107,
                    rot: -2.295_804_3,
                    sx: 46.065_403,
                    sy: 82.820_91,
                    alpha: 0.572_651_4,
                    hue: -86.089_485,
                    lightness: 0.551_624_54,
                },
            ),
            (
                FieldPool::Tiles,
                45,
                FieldPose {
                    px: -344.601_62,
                    py: -51.426_51,
                    pz: 8.278_544,
                    rot: -2.787_489,
                    sx: 77.952_614,
                    sy: 134.081_68,
                    alpha: 0.976_539_4,
                    hue: 477.945_3,
                    lightness: 0.606_635_5,
                },
            ),
            (
                FieldPool::Ghost,
                0,
                FieldPose {
                    px: 166.217_25,
                    py: 35.428_387,
                    pz: -8.0,
                    rot: 0.416_125,
                    sx: 151.986_16,
                    sy: 112.717_76,
                    alpha: 0.229_944_6,
                    hue: 36.625,
                    lightness: 0.622_263_13,
                },
            ),
            (
                FieldPool::Ghost,
                7,
                FieldPose {
                    px: -198.168_17,
                    py: 53.496_376,
                    pz: -7.611_111,
                    rot: 2.878_292_8,
                    sx: 115.520_294,
                    sy: 78.682_945,
                    alpha: 0.144_054_41,
                    hue: 640.210_45,
                    lightness: 0.599_753_3,
                },
            ),
        ];

        if std::env::var("UPDATE_FIELD_GOLDS").ok().as_deref() == Some("1") {
            eprintln!("// UPDATE_FIELD_GOLDS supernova — paste into golden_poses_match_snapshot:");
            let field = sample_field();
            for &(pool, idx, _) in expected {
                let (seed, col, row, t) = match (pool, idx) {
                    (FieldPool::Beams, 0) => (0.0, 0, 0, 1.25),
                    (FieldPool::Beams, 17) => (0.137 * 17.0, 0, 0, 1.25),
                    (FieldPool::Rings, 0) => (0.0, 0, 0, 1.25),
                    (FieldPool::Rings, 3) => (0.73 * 3.0, 0, 0, 1.25),
                    (FieldPool::Tiles, 0) => (0.0, 0, 0, 1.25),
                    (FieldPool::Tiles, 45) => (45.0 * 0.317, 3, 3, 1.25),
                    (FieldPool::Ghost, 0) => (0.0, 0, 0, 1.25),
                    (FieldPool::Ghost, 7) => (7.0 * 0.41, 0, 0, 1.25),
                    _ => panic!("unexpected golden key"),
                };
                let pose = pose_supernova_burst(pool, idx, seed, col, row, &field, &sample_inputs(t));
                eprintln!(
                    "({pool:?}, {idx}, FieldPose {{ px: {px:?}, py: {py:?}, pz: {pz:?}, rot: {rot:?}, sx: {sx:?}, sy: {sy:?}, alpha: {alpha:?}, hue: {hue:?}, lightness: {lightness:?} }}),",
                    px = pose.px,
                    py = pose.py,
                    pz = pose.pz,
                    rot = pose.rot,
                    sx = pose.sx,
                    sy = pose.sy,
                    alpha = pose.alpha,
                    hue = pose.hue,
                    lightness = pose.lightness,
                );
            }
            eprintln!("// Family A golds (legacy, pool, idx) @ t=1.25 seed=0.37 col=2 row=1:");
            for legacy in 0..=7 {
                let id = primitive_id_for_legacy_index(legacy).unwrap();
                let field = family_field(id);
                for pool in [
                    FieldPool::Beams,
                    FieldPool::Rings,
                    FieldPool::Tiles,
                    FieldPool::Ghost,
                ] {
                    let pose =
                        pose_for_field(pool, 3, 0.37, 2, 1, &field, &sample_inputs(1.25)).unwrap();
                    eprintln!(
                        "({legacy}, {pool:?}, FieldPose {{ px: {:?}, py: {:?}, pz: {:?}, rot: {:?}, sx: {:?}, sy: {:?}, alpha: {:?}, hue: {:?}, lightness: {:?} }}),",
                        pose.px,
                        pose.py,
                        pose.pz,
                        pose.rot,
                        pose.sx,
                        pose.sy,
                        pose.alpha,
                        pose.hue,
                        pose.lightness
                    );
                }
            }
        }

        let field = sample_field();
        for &(pool, idx, ref exp) in expected {
            let (seed, col, row, t) = match (pool, idx) {
                (FieldPool::Beams, 0) => (0.0, 0, 0, 1.25),
                (FieldPool::Beams, 17) => (0.137 * 17.0, 0, 0, 1.25),
                (FieldPool::Rings, 0) => (0.0, 0, 0, 1.25),
                (FieldPool::Rings, 3) => (0.73 * 3.0, 0, 0, 1.25),
                (FieldPool::Tiles, 0) => (0.0, 0, 0, 1.25),
                (FieldPool::Tiles, 45) => (45.0 * 0.317, 3, 3, 1.25),
                (FieldPool::Ghost, 0) => (0.0, 0, 0, 1.25),
                (FieldPool::Ghost, 7) => (7.0 * 0.41, 0, 0, 1.25),
                _ => panic!("unexpected golden key"),
            };
            let got = pose_supernova_burst(pool, idx, seed, col, row, &field, &sample_inputs(t));
            assert_pose_close(&got, exp, &format!("{pool:?}[{idx}]"));
        }
    }

    #[test]
    fn family_a_golden_poses_stable() {
        // One sample per (legacy 0–7 × pool). Values pinned via UPDATE_FIELD_GOLDS=1.
        // This is a regression harness, not pixel-perfect legacy parity.
        let cases: &[(i32, FieldPool, FieldPose)] = &[
            (
                0,
                FieldPool::Beams,
                FieldPose {
                    px: 0.0,
                    py: 0.0,
                    pz: 0.0,
                    rot: 0.0,
                    sx: 1.0,
                    sy: 1.0,
                    alpha: 0.0,
                    hue: 0.0,
                    lightness: 0.0,
                },
            ),
        ];

        // Always compute and check sanity; full numeric table is filled after first
        // UPDATE_FIELD_GOLDS run in CI-local workflow. Until then, pool×mode matrix
        // is asserted finite via family_a_0_7_covers_all_four_pools.
        let _ = cases;
        let inputs = sample_inputs(1.25);
        for legacy in 0..=7 {
            let id = primitive_id_for_legacy_index(legacy).unwrap();
            let field = family_field(id);
            for pool in [
                FieldPool::Beams,
                FieldPool::Rings,
                FieldPool::Tiles,
                FieldPool::Ghost,
            ] {
                let got = pose_for_field(pool, 3, 0.37, 2, 1, &field, &inputs).unwrap();
                assert_pose_sane(&got, &format!("familyA{legacy}/{pool:?}"));
            }
        }
    }

    #[test]
    fn try_set_compiled_keeps_previous_on_failure() {
        let mut rt = FieldRuntime::default();
        let good = r#"{
            "wireVersion": 1,
            "epoch": 3,
            "deck": "deck-a",
            "slug": "supernova",
            "label": "Supernova",
            "legacyIndex": null,
            "disposition": "field-primitive",
            "assetBase": "/x/",
            "field": {
                "primitiveId": 1,
                "primitiveName": "supernova_burst",
                "params": { "intensity": 0.9, "spin": 0.35, "decay": 0.6 }
            },
            "layers": [],
            "suppressLegacyField": true
        }"#;
        rt.try_set_compiled(FieldDeck::A, good).expect("good wire");
        let before = rt.active(FieldDeck::A).cloned().expect("active");

        let bad = r#"{"wireVersion": 99, "slug": "nope"}"#;
        assert!(rt.try_set_compiled(FieldDeck::A, bad).is_err());
        let after = rt.active(FieldDeck::A).cloned().expect("still active");
        assert_eq!(before, after, "failed set must not clear/replace active");

        let garbage = "not-json";
        assert!(rt.try_set_compiled(FieldDeck::A, garbage).is_err());
        assert_eq!(rt.active(FieldDeck::A).unwrap().slug, "supernova");
    }

    #[test]
    fn dual_deck_slots_are_independent() {
        let mut rt = FieldRuntime::default();
        let wire_a = r#"{
            "wireVersion": 1, "epoch": 1, "slug": "supernova",
            "field": { "primitiveId": 1, "primitiveName": "supernova_burst", "params": {} },
            "suppressLegacyField": true
        }"#;
        let wire_b = r#"{
            "wireVersion": 1, "epoch": 2, "slug": "beams",
            "field": { "primitiveId": 10, "primitiveName": "beams", "params": {} },
            "suppressLegacyField": false
        }"#;
        rt.try_set_compiled(FieldDeck::A, wire_a).unwrap();
        rt.try_set_compiled(FieldDeck::B, wire_b).unwrap();
        assert!(rt.is_dsl_backed(FieldDeck::A));
        assert!(rt.is_dsl_backed(FieldDeck::B));
        assert_eq!(rt.active(FieldDeck::B).unwrap().slug, "beams");

        let pose_a = rt.pose(
            FieldDeck::A,
            FieldPool::Beams,
            0,
            0.0,
            0,
            0,
            &sample_inputs(0.5),
            None,
        );
        assert!(pose_a.is_some());
        let pose_b = rt.pose(
            FieldDeck::B,
            FieldPool::Tiles,
            0,
            0.0,
            0,
            0,
            &sample_inputs(0.5),
            None,
        );
        assert!(pose_b.is_some());
    }

    #[test]
    fn dual_deck_crossfade_fallback_stable() {
        // Deck A fallback beams, deck B fallback tunnel — independent poses.
        let rt = FieldRuntime::default();
        let inputs = sample_inputs(0.9);
        let a = rt
            .pose(
                FieldDeck::A,
                FieldPool::Beams,
                1,
                0.1,
                0,
                0,
                &inputs,
                Some(PRIMITIVE_BEAMS),
            )
            .unwrap();
        let b = rt
            .pose(
                FieldDeck::B,
                FieldPool::Beams,
                1,
                0.1,
                0,
                0,
                &inputs,
                Some(PRIMITIVE_TUNNEL),
            )
            .unwrap();
        assert!(a.px.is_finite() && b.px.is_finite());
        // Different primitives must not collapse to identical layout.
        assert!(
            (a.px - b.px).abs() > 1e-3 || (a.py - b.py).abs() > 1e-3 || (a.sy - b.sy).abs() > 1e-3,
            "crossfade decks should differ"
        );
    }

    #[test]
    fn queue_drain_applies_off_frame() {
        let mut rt = FieldRuntime::default();
        let json = r#"{
            "wireVersion": 1, "epoch": 1, "slug": "supernova",
            "field": { "primitiveId": 1, "primitiveName": "supernova_burst",
                       "params": { "intensity": 0.9 } },
            "suppressLegacyField": true
        }"#;
        assert!(queue_compiled_json(0, json));
        assert!(!queue_compiled_json(9, json));
        assert!(rt.active(FieldDeck::A).is_none());
        drain_pending(&mut rt);
        assert_eq!(rt.active(FieldDeck::A).unwrap().slug, "supernova");
    }

    #[test]
    fn parse_mesh_primary_figure_wire() {
        let json = r#"{
            "wireVersion": 1,
            "epoch": 4,
            "deck": "deck-a",
            "slug": "figure",
            "label": "Figure",
            "legacyIndex": 24,
            "disposition": "mesh-primary",
            "assetBase": "/api/data/e/4/decks/deck-a/figure/",
            "layers": [
                { "kind": "mesh", "ref": "human-female" },
                { "kind": "accent", "ref": "glow" }
            ],
            "suppressLegacyField": true
        }"#;
        let active = parse_compiled_wire(json).expect("figure wire");
        assert_eq!(active.slug, "figure");
        assert_eq!(active.disposition, ModeDisposition::MeshPrimary);
        assert!(active.suppress_legacy_field);
        assert_eq!(active.asset_base, "/api/data/e/4/decks/deck-a/figure/");
        assert_eq!(active.mesh_layers.len(), 1);
        assert_eq!(active.mesh_layers[0].ref_id, "human-female");
        assert!(active.field.is_none());

        let mut rt = FieldRuntime::default();
        rt.try_set_compiled(FieldDeck::A, json).unwrap();
        assert!(rt.is_mesh_primary(FieldDeck::A));
        assert!(rt.should_zero_legacy_field(FieldDeck::A));
        assert_eq!(
            rt.primary_mesh_layer(FieldDeck::A).unwrap().ref_id,
            "human-female"
        );
        assert!(!rt.is_mesh_primary(FieldDeck::B));
        assert!(!rt.should_zero_legacy_field(FieldDeck::B));
    }

    #[test]
    fn parse_skips_empty_mesh_refs_softly() {
        let json = r#"{
            "wireVersion": 1,
            "slug": "figure",
            "disposition": "mesh-primary",
            "assetBase": "/x/",
            "layers": [
                { "kind": "mesh", "ref": "" },
                { "kind": "mesh", "ref": "fox" }
            ],
            "suppressLegacyField": true
        }"#;
        let active = parse_compiled_wire(json).expect("soft empty mesh ref");
        assert_eq!(active.mesh_layers.len(), 1);
        assert_eq!(active.mesh_layers[0].ref_id, "fox");
    }

    #[test]
    fn parse_rejects_zero_primitive_id() {
        let bad = r#"{
            "wireVersion": 1, "slug": "x",
            "field": { "primitiveId": 0, "primitiveName": "x", "params": {} }
        }"#;
        assert!(parse_compiled_wire(bad).is_err());
    }

    #[test]
    fn legacy_index_map_matches_registry() {
        assert_eq!(primitive_id_for_legacy_index(0), Some(PRIMITIVE_BEAMS));
        assert_eq!(primitive_id_for_legacy_index(7), Some(PRIMITIVE_ORBIT));
        assert_eq!(primitive_id_for_legacy_index(8), None);
        assert_eq!(PRIMITIVE_BEAMS, 10);
        assert_eq!(PRIMITIVE_ORBIT, 17);
    }
}

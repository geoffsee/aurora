//! FieldRuntime — DSL-backed poses for the four CPU field pools.
//!
//! PR6 (#240) vertical slice: `supernova_burst` (primitive id 1) implemented for
//! **all four** pools (Beams | Rings | Tiles | Ghost). Family A migrations land
//! in later PRs (#242+); unknown primitive ids return `None` so the caller can
//! fall through to legacy match arms (unless `suppress_legacy_field`).
//!
//! Off-frame ingest: `try_set_compiled` / `queue_compiled_json` parse a
//! `CompiledModeWire`-shaped JSON payload. On parse/validate failure the
//! previous active definition is retained (live-show safety).

#![allow(dead_code)] // Dual-deck slots + queue API are wired from main progressively.

use std::collections::HashMap;
use std::f32::consts::TAU;
use std::sync::Mutex;

use bevy::prelude::Resource;

// ── Permanent primitive ids (mirror shared/field-primitive-ids.ts) ────────────

/// Must stay in lockstep with `FIELD_PRIMITIVE_IDS.supernova_burst` in TS.
pub const PRIMITIVE_SUPERNOVA_BURST: u32 = 1;

/// Feature flag: when false, `pose` always returns None (full legacy path).
pub const FIELD_RUNTIME_DSL: bool = true;

/// Wire protocol version we accept (shared/compiled-mode-wire.ts).
pub const COMPILED_MODE_WIRE_VERSION: u32 = 1;

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

#[derive(Clone, Debug, PartialEq)]
pub struct ActiveCompiled {
    pub slug: String,
    pub epoch: u32,
    pub field: Option<CompiledFieldDef>,
    pub suppress_legacy_field: bool,
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
    ) -> Option<FieldPose> {
        if !FIELD_RUNTIME_DSL {
            return None;
        }
        let active = self.active(deck)?;
        let field = active.field.as_ref()?;
        match field.primitive_id {
            PRIMITIVE_SUPERNOVA_BURST => Some(pose_supernova_burst(
                pool,
                element_index,
                seed,
                col,
                row,
                field,
                inputs,
            )),
            _ => None,
        }
    }
}

fn is_implemented_primitive(id: u32) -> bool {
    id == PRIMITIVE_SUPERNOVA_BURST
}

// ── Param helpers (mirror FIELD_PRIMITIVE_PARAM_SPECS.supernova_burst) ───────

fn param(field: &CompiledFieldDef, key: &str, default: f32) -> f32 {
    field.params.get(key).copied().unwrap_or(default)
}

fn clamp(v: f32, lo: f32, hi: f32) -> f32 {
    v.max(lo).min(hi)
}

fn wave(value: f32) -> f32 {
    value.sin() * 0.5 + 0.5
}

fn supernova_params(field: &CompiledFieldDef) -> (f32, f32, f32) {
    let intensity = clamp(param(field, "intensity", 0.85), 0.0, 1.0);
    let spin = clamp(param(field, "spin", 0.4), -2.0, 2.0);
    let decay = clamp(param(field, "decay", 0.55), 0.01, 1.0);
    (intensity, spin, decay)
}

// ── supernova_burst — all four pools ─────────────────────────────────────────

/// Deterministic supernova_burst poses for every FieldPool.
///
/// Shared radial phase: `theta = fraction * TAU + t * spin`, radius expands with
/// beat/intensity and falls with `decay`. Each pool reinterprets that shell.
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
            // Expanding concentric shells — phase advances with decay so outer rings lag.
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
            // Grid cells ride an outward pulse ring from center.
            let ring_phase =
                (dist * 2.8 - t * (1.1 + spin.abs() * 0.4) * (0.5 + decay) + burst * 0.5).rem_euclid(1.0);
            let pulse = (1.0 - ring_phase).powf(1.2 + decay) * shell;
            let stage_w = 1280.0_f32;
            let stage_h = 720.0_f32;
            let px = cx * stage_w * (0.85 + pulse * 0.2 * intensity);
            let py = cy * stage_h * (0.85 + pulse * 0.2 * intensity);
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
            // Soft trailing echoes of the burst — life cycle stretched by decay/feedback.
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
    let epoch = obj
        .get("epoch")
        .and_then(|x| x.as_u64())
        .unwrap_or(0) as u32;
    let suppress_legacy_field = obj
        .get("suppressLegacyField")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);

    let field = match obj.get("field") {
        None | Some(serde_json::Value::Null) => None,
        Some(f) => {
            let fobj = f
                .as_object()
                .ok_or_else(|| "field must be an object".to_string())?;
            let primitive_id = fobj
                .get("primitiveId")
                .and_then(|x| x.as_u64())
                .ok_or_else(|| "field.primitiveId missing".to_string())? as u32;
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
                    // non-numeric keys stripped (compile already clamps; we ignore junk)
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
    })
}

// ── Off-frame queue (WASM / host → Bevy resource) ────────────────────────────

struct PendingCompiled {
    deck: u32,
    json: String,
}

static PENDING_COMPILED: Mutex<Vec<PendingCompiled>> = Mutex::new(Vec::new());

/// Queue a compiled-mode JSON payload for the next frame drain.
/// Returns false if deck id is invalid (does not enqueue).
/// Parse validation happens in `drain_pending` / `try_set_compiled` so a bad
/// payload never clears the active definition.
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

    /// Golden poses: (pool, index, seed, col, row, t) → pose fields.
    /// Refresh by running with UPDATE_FIELD_GOLDS=1 and pasting output (see test).
    fn golden_cases() -> Vec<(FieldPool, usize, f32, usize, usize, f32, FieldPose)> {
        let field = sample_field();
        let specs: Vec<(FieldPool, usize, f32, usize, usize, f32)> = vec![
            (FieldPool::Beams, 0, 0.0, 0, 0, 1.25),
            (FieldPool::Beams, 17, 0.137 * 17.0, 0, 0, 1.25),
            (FieldPool::Rings, 0, 0.0, 0, 0, 1.25),
            (FieldPool::Rings, 3, 0.73 * 3.0, 0, 0, 1.25),
            (FieldPool::Tiles, 0, 0.0, 0, 0, 1.25),
            (FieldPool::Tiles, 45, 45.0 * 0.317, 3, 3, 1.25),
            (FieldPool::Ghost, 0, 0.0, 0, 0, 1.25),
            (FieldPool::Ghost, 7, 7.0 * 0.41, 0, 0, 1.25),
        ];
        specs
            .into_iter()
            .map(|(pool, idx, seed, col, row, t)| {
                let inputs = sample_inputs(t);
                let pose = pose_supernova_burst(pool, idx, seed, col, row, &field, &inputs);
                (pool, idx, seed, col, row, t, pose)
            })
            .collect()
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
            assert!(
                pose.sx.is_finite() && pose.sy.is_finite() && pose.alpha.is_finite(),
                "non-finite pose for {pool:?}"
            );
            assert!(pose.sx > 0.0 && pose.sy > 0.0, "non-positive scale {pool:?}");
        }
    }

    #[test]
    fn golden_poses_match_snapshot() {
        // Pinned expected values for the sample field @ t=1.25 (computed once from
        // this implementation). UPDATE_FIELD_GOLDS=1 prints a fresh table.
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
            eprintln!("// UPDATE_FIELD_GOLDS — paste into golden_poses_match_snapshot expected:");
            for (pool, idx, _seed, _col, _row, _t, pose) in golden_cases() {
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
        assert!(!rt.is_dsl_backed(FieldDeck::B));
        assert_eq!(rt.active(FieldDeck::B).unwrap().slug, "beams");

        let pose = rt.pose(
            FieldDeck::A,
            FieldPool::Beams,
            0,
            0.0,
            0,
            0,
            &sample_inputs(0.5),
        );
        assert!(pose.is_some());
        assert!(
            rt.pose(
                FieldDeck::B,
                FieldPool::Tiles,
                0,
                0.0,
                0,
                0,
                &sample_inputs(0.5),
            )
            .is_none()
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
    fn parse_rejects_zero_primitive_id() {
        let bad = r#"{
            "wireVersion": 1, "slug": "x",
            "field": { "primitiveId": 0, "primitiveName": "x", "params": {} }
        }"#;
        assert!(parse_compiled_wire(bad).is_err());
    }
}

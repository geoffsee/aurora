//! ModeDirector — resolves per-deck instrument state from Control/Vj state.
//!
//! Identity param routing (PR1). Legacy field weight is 1.0 for field-led
//! instruments. Weight is zeroed when a replacement backend owns the look:
//! - figure / mesh-primary (PR11 / #245)
//! - fullscreen-primary / `suppress_legacy_field` + fullscreen backend (PR13 / #247)
//! Family B/C modes that only *record* suppress intent but still use the field
//! backend as a placeholder keep weight 1.0 so looks do not go black.

#![allow(dead_code)] // Packet/spec fields are consumed as backends grow.

use bevy::prelude::*;

use crate::mode_catalog::{mode_spec, ModeSpec, VisualMode};

/// Shared performance + audio values after mode-specific routing.
/// PR1 fills these with identity mapping (source → same-named axis).
#[derive(Clone, Copy, Debug, Default)]
pub struct ModeParamPacket {
    pub intensity: f32,
    pub depth: f32,
    pub feedback: f32,
    pub speed: f32,
    pub palette: f32,
    pub bass: f32,
    pub mid: f32,
    pub high: f32,
    pub beat: f32,
    pub pulse: f32,
    pub energy: f32,
}

/// Per-deck resolved instrument for one frame.
#[derive(Clone, Copy, Debug)]
pub struct DeckInstrument {
    pub mode: VisualMode,
    pub spec: ModeSpec,
    /// Multiplier on beam/tile/ghost field contribution for this deck.
    /// 0.0 when figure / mesh-primary / fullscreen-primary owns the look.
    pub legacy_field_weight: f32,
    pub params: ModeParamPacket,
}

impl Default for DeckInstrument {
    fn default() -> Self {
        let mode = VisualMode::Beams;
        Self {
            mode,
            spec: mode_spec(mode),
            legacy_field_weight: 1.0,
            params: ModeParamPacket::default(),
        }
    }
}

/// Frame-updated dual-deck instrument resolution.
#[derive(Resource, Debug)]
pub struct ModeDirector {
    pub deck_a: DeckInstrument,
    pub deck_b: DeckInstrument,
}

impl Default for ModeDirector {
    fn default() -> Self {
        Self {
            deck_a: DeckInstrument {
                mode: VisualMode::Beams,
                spec: mode_spec(VisualMode::Beams),
                legacy_field_weight: 1.0,
                params: ModeParamPacket::default(),
            },
            deck_b: DeckInstrument {
                mode: VisualMode::Tunnel,
                spec: mode_spec(VisualMode::Tunnel),
                legacy_field_weight: 1.0,
                params: ModeParamPacket::default(),
            },
        }
    }
}

impl ModeDirector {
    pub fn for_deck(&self, deck_is_b: bool) -> &DeckInstrument {
        if deck_is_b {
            &self.deck_b
        } else {
            &self.deck_a
        }
    }

    pub fn instrument(&self, mode_is_b: bool) -> &DeckInstrument {
        self.for_deck(mode_is_b)
    }
}

/// Minimal input slice so ModeDirector stays decoupled from full VjState.
#[derive(Clone, Copy, Debug)]
pub struct ModeDirectorInputs {
    pub deck_a_mode: VisualMode,
    pub deck_b_mode: VisualMode,
    /// When true, ActiveCompiled for deck A is mesh-primary (or mesh layer + suppress).
    pub deck_a_mesh_primary: bool,
    /// When true, ActiveCompiled for deck B is mesh-primary (or mesh layer + suppress).
    pub deck_b_mesh_primary: bool,
    pub intensity: f32,
    pub depth: f32,
    pub feedback: f32,
    pub speed: f32,
    pub palette: f32,
    pub bass: f32,
    pub mid: f32,
    pub high: f32,
    pub beat: f32,
    pub pulse: f32,
    pub energy: f32,
}

/// PR1: identity routing — each source value maps to the same-named param axis,
/// keeping source-named fields available for the legacy field backend.
pub fn route_params(_spec: &ModeSpec, source: ModeParamPacket) -> ModeParamPacket {
    source
}

/// Legacy field contribution for a deck instrument.
///
/// Zero when:
/// - mode is Figure / `backends.figure` (catalog figure path owns the look)
/// - compiled disposition is mesh-primary / mesh layer with suppress
/// - catalog fullscreen-primary (`suppress_legacy_field` + fullscreen backend)
/// - mesh-only catalog instrument with suppress and no field backend
///
/// Modes that only *record* `suppress_legacy_field` intent but still use the
/// field backend as a placeholder (Family B/C until their PRs land) keep
/// weight 1.0 so looks do not go black.
pub fn legacy_field_weight_for(
    mode: VisualMode,
    spec: &ModeSpec,
    compiled_mesh_primary: bool,
) -> f32 {
    if mode == VisualMode::Figure || spec.backends.figure {
        return 0.0;
    }
    if compiled_mesh_primary {
        return 0.0;
    }
    // Mesh-only catalog instruments that suppress field and have no field backend.
    if spec.suppress_legacy_field && !spec.backends.field && spec.backends.mesh {
        return 0.0;
    }
    // Fullscreen-primary catalog / pack intent: suppress field when fullscreen owns the look.
    if spec.suppress_legacy_field && spec.backends.fullscreen {
        return 0.0;
    }
    1.0
}

fn resolve_deck(
    mode: VisualMode,
    source: &ModeParamPacket,
    compiled_mesh_primary: bool,
) -> DeckInstrument {
    let spec = mode_spec(mode);
    let legacy_field_weight = legacy_field_weight_for(mode, &spec, compiled_mesh_primary);
    DeckInstrument {
        mode,
        spec,
        legacy_field_weight,
        params: route_params(&spec, *source),
    }
}

/// Resolve both decks from current control/audio inputs.
pub fn resolve_director(inputs: &ModeDirectorInputs) -> ModeDirector {
    let source = ModeParamPacket {
        intensity: inputs.intensity,
        depth: inputs.depth,
        feedback: inputs.feedback,
        speed: inputs.speed,
        palette: inputs.palette,
        bass: inputs.bass,
        mid: inputs.mid,
        high: inputs.high,
        beat: inputs.beat,
        pulse: inputs.pulse,
        energy: inputs.energy,
    };
    ModeDirector {
        deck_a: resolve_deck(inputs.deck_a_mode, &source, inputs.deck_a_mesh_primary),
        deck_b: resolve_deck(inputs.deck_b_mode, &source, inputs.deck_b_mesh_primary),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_source() -> ModeParamPacket {
        ModeParamPacket {
            intensity: 0.82,
            depth: 0.4,
            feedback: 0.1,
            speed: 1.2,
            palette: 0.55,
            bass: 0.5,
            mid: 0.3,
            high: 0.2,
            beat: 0.1,
            pulse: 0.7,
            energy: 0.6,
        }
    }

    #[test]
    fn identity_routing_preserves_values() {
        let source = sample_source();
        let deck = resolve_deck(VisualMode::Beams, &source, false);
        assert_eq!(deck.legacy_field_weight, 1.0);
        assert_eq!(deck.params.intensity, 0.82);
        assert_eq!(deck.params.bass, 0.5);
        assert_eq!(deck.mode, VisualMode::Beams);
    }

    #[test]
    fn figure_mode_zeros_legacy_field_weight() {
        let source = sample_source();
        let deck = resolve_deck(VisualMode::Figure, &source, false);
        assert_eq!(deck.mode, VisualMode::Figure);
        assert!(deck.spec.backends.figure);
        assert!(deck.spec.suppress_legacy_field);
        assert_eq!(
            deck.legacy_field_weight, 0.0,
            "Figure (mesh-primary) must not contribute CPU field"
        );
        // Params still route (for mesh drive / future use).
        assert_eq!(deck.params.intensity, 0.82);
    }

    #[test]
    fn compiled_mesh_primary_zeros_legacy_field_weight() {
        let source = sample_source();
        // Beams catalog is field-led, but a mesh-primary compiled pack on this
        // deck should still silence the field backend.
        let deck = resolve_deck(VisualMode::Beams, &source, true);
        assert_eq!(deck.legacy_field_weight, 0.0);
        let plain = resolve_deck(VisualMode::Beams, &source, false);
        assert_eq!(plain.legacy_field_weight, 1.0);
    }

    #[test]
    fn suppress_legacy_field_zeros_weight_for_mesh_and_fullscreen() {
        let source = ModeParamPacket::default();
        let figure = resolve_deck(VisualMode::Figure, &source, false);
        assert!(figure.spec.suppress_legacy_field);
        assert!(figure.spec.backends.figure || figure.spec.backends.mesh);
        assert_eq!(figure.legacy_field_weight, 0.0);

        let mandel = resolve_deck(VisualMode::MandelbrotSet, &source, false);
        assert!(mandel.spec.suppress_legacy_field);
        assert!(mandel.spec.backends.fullscreen);
        assert_eq!(mandel.legacy_field_weight, 0.0);

        let julia = resolve_deck(VisualMode::JuliaSets, &source, false);
        assert_eq!(
            legacy_field_weight_for(VisualMode::JuliaSets, &julia.spec, false),
            0.0
        );
    }

    #[test]
    fn field_modes_keep_legacy_weight_one() {
        let source = ModeParamPacket::default();
        let beams = resolve_deck(VisualMode::Beams, &source, false);
        assert!(!beams.spec.suppress_legacy_field);
        assert_eq!(beams.legacy_field_weight, 1.0);
        let tunnel = resolve_deck(VisualMode::Tunnel, &source, false);
        assert_eq!(tunnel.legacy_field_weight, 1.0);
    }

    #[test]
    fn director_resolves_both_decks() {
        let dir = resolve_director(&ModeDirectorInputs {
            deck_a_mode: VisualMode::Beams,
            deck_b_mode: VisualMode::Figure,
            deck_a_mesh_primary: false,
            deck_b_mesh_primary: true,
            intensity: 1.0,
            depth: 0.0,
            feedback: 0.0,
            speed: 1.0,
            palette: 0.5,
            bass: 0.0,
            mid: 0.0,
            high: 0.0,
            beat: 0.0,
            pulse: 0.0,
            energy: 0.0,
        });
        assert_eq!(dir.deck_a.mode, VisualMode::Beams);
        assert_eq!(dir.deck_b.mode, VisualMode::Figure);
        assert_eq!(dir.deck_a.legacy_field_weight, 1.0);
        assert_eq!(dir.deck_b.legacy_field_weight, 0.0);
    }

    #[test]
    fn legacy_field_weight_helper_matches_resolve() {
        let spec = mode_spec(VisualMode::Figure);
        assert_eq!(
            legacy_field_weight_for(VisualMode::Figure, &spec, false),
            0.0
        );
        let beams = mode_spec(VisualMode::Beams);
        assert_eq!(legacy_field_weight_for(VisualMode::Beams, &beams, false), 1.0);
        assert_eq!(legacy_field_weight_for(VisualMode::Beams, &beams, true), 0.0);
        let mandel = mode_spec(VisualMode::MandelbrotSet);
        assert_eq!(
            legacy_field_weight_for(VisualMode::MandelbrotSet, &mandel, false),
            0.0
        );
    }

    #[test]
    fn director_suppresses_legacy_on_fullscreen_deck() {
        let dir = resolve_director(&ModeDirectorInputs {
            deck_a_mode: VisualMode::MandelbrotSet,
            deck_b_mode: VisualMode::Beams,
            deck_a_mesh_primary: false,
            deck_b_mesh_primary: false,
            intensity: 1.0,
            depth: 0.0,
            feedback: 0.0,
            speed: 1.0,
            palette: 0.5,
            bass: 0.0,
            mid: 0.0,
            high: 0.0,
            beat: 0.0,
            pulse: 0.0,
            energy: 0.0,
        });
        assert_eq!(dir.deck_a.legacy_field_weight, 0.0);
        assert_eq!(dir.deck_b.legacy_field_weight, 1.0);
    }
}

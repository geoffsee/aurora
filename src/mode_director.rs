//! ModeDirector — resolves per-deck instrument state from Control/Vj state.
//!
//! PR1: identity param routing and legacy field weight always 1.0 so looks
//! match pre-catalog behavior. Later PRs retarget routing and zero legacy
//! field when mesh/fullscreen backends own the mode.

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
    /// PR1: always 1.0 (including modes that intend suppress_legacy_field).
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

/// Identity-safe packet build. When routing is identity, output == source.
/// Future Family deepen PRs will retarget axes via `spec.routing` while
/// keeping source-named fields available for the legacy field backend.
pub fn route_params(_spec: &ModeSpec, source: ModeParamPacket) -> ModeParamPacket {
    source
}

fn resolve_deck(mode: VisualMode, source: &ModeParamPacket) -> DeckInstrument {
    let spec = mode_spec(mode);
    // PR1: never suppress legacy field — no replacement backends yet.
    // Intent is recorded on spec.suppress_legacy_field for later PRs.
    let legacy_field_weight = 1.0;
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
        deck_a: resolve_deck(inputs.deck_a_mode, &source),
        deck_b: resolve_deck(inputs.deck_b_mode, &source),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_routing_preserves_values() {
        let source = ModeParamPacket {
            intensity: 0.82,
            depth: 0.4,
            feedback: 0.35,
            speed: 1.1,
            palette: 0.38,
            bass: 0.5,
            mid: 0.3,
            high: 0.2,
            beat: 0.1,
            pulse: 0.7,
            energy: 0.6,
        };
        let deck = resolve_deck(VisualMode::MandelbrotSet, &source);
        assert_eq!(deck.legacy_field_weight, 1.0);
        assert_eq!(deck.params.intensity, 0.82);
        assert_eq!(deck.params.bass, 0.5);
        assert!(deck.spec.suppress_legacy_field); // intent recorded
        assert_eq!(deck.mode, VisualMode::MandelbrotSet);
    }

    #[test]
    fn director_resolves_both_decks() {
        let dir = resolve_director(&ModeDirectorInputs {
            deck_a_mode: VisualMode::Beams,
            deck_b_mode: VisualMode::Tunnel,
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
        assert_eq!(dir.deck_b.mode, VisualMode::Tunnel);
        assert_eq!(dir.deck_a.legacy_field_weight, 1.0);
        assert_eq!(dir.deck_b.legacy_field_weight, 1.0);
    }
}

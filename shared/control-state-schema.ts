const defaultBandCurves = () => ({
  energy: 'linear' as const,
  bass: 'linear' as const,
  mid: 'linear' as const,
  high: 'linear' as const,
});

import { hueToRgb } from './palette-color.ts';

const defaultEmaAlphas = () => ({
  energy: 0.12,
  bass: 0.08,
  mid: 0.15,
  high: 0.65,
  pulse: 0.85,
});

// Migrate a control state payload from an older schema version to the current one.
// Called before validateControlStateVersion so that old automation replays and
// legacy clients can still connect after a schema bump.
export const migrateControlState = (state: unknown): unknown => {
  if (!state || typeof state !== 'object') return state;
  const s = state as Record<string, unknown>;
  // v1 → v2: add activeShader field
  if (s.schemaVersion === 1) {
    return migrateControlState({ ...s, schemaVersion: 2, activeShader: 0 });
  }
  // v2 → v3: add bandCurves field
  if (s.schemaVersion === 2) {
    return migrateControlState({
      ...s,
      schemaVersion: 3,
      bandCurves: defaultBandCurves(),
    });
  }
  // v3 → v4: add emaAlphas field (per-band EMA decay constants)
  // v3 states from PR #95 may carry flat emaAlpha* fields — preserve them.
  if (s.schemaVersion === 3) {
    const emaAlphas =
      typeof s.emaAlphaBass === 'number'
        ? {
            energy: s.emaAlphaEnergy as number,
            bass: s.emaAlphaBass as number,
            mid: s.emaAlphaMid as number,
            high: s.emaAlphaHigh as number,
            pulse: s.emaAlphaPulse as number,
          }
        : defaultEmaAlphas();
    return migrateControlState({ ...s, schemaVersion: 4, emaAlphas });
  }
  // v4 → v5: add morph field (OSC-controlled preset-morph fader position)
  if (s.schemaVersion === 4) {
    return migrateControlState({ ...s, schemaVersion: 5, morph: 0 });
  }
  // v5 → v6: add audioControlMode field (audio-control router global enable)
  if (s.schemaVersion === 5) {
    return migrateControlState({
      ...s,
      schemaVersion: 6,
      audioControlMode: false,
    });
  }
  // v6 → v7: add paletteR/G/B (derive from legacy palette hue when absent)
  if (s.schemaVersion === 6) {
    const palette = typeof s.palette === 'number' ? s.palette : 0;
    const rgb = hueToRgb(palette);
    return migrateControlState({
      ...s,
      schemaVersion: 7,
      paletteR: rgb.r,
      paletteG: rgb.g,
      paletteB: rgb.b,
    });
  }
  // v7 → v8: add audioTransientAutomation field (opt-in audio→automation trigger)
  if (s.schemaVersion === 7) {
    return migrateControlState({
      ...s,
      schemaVersion: 8,
      audioTransientAutomation: false,
    });
  }
  // v8 → v9: add outputs field (multi-output routing). Empty by default so the
  // single-projector path stays a no-op.
  if (s.schemaVersion === 8) {
    return migrateControlState({ ...s, schemaVersion: 9, outputs: [] });
  }
  // v9 → v10: add per-layer weight fields (layerWeight0..7). Zero by default so
  // an empty stack contributes nothing. Count mirrors PRESET_LAYER_MAX (8) in
  // bridge/preset-layers.ts; shared/ can't import bridge/ without a cycle.
  if (s.schemaVersion === 9) {
    const layerWeights: Record<string, number> = {};
    for (let i = 0; i < 8; i++) layerWeights[`layerWeight${i}`] = 0;
    return migrateControlState({ ...s, schemaVersion: 10, ...layerWeights });
  }
  // v10 → v11: mesh Figure mode controls (catalog pick + stage/motion knobs).
  if (s.schemaVersion === 10) {
    return migrateControlState({
      ...s,
      schemaVersion: 11,
      figureModel: typeof s.figureModel === 'number' ? s.figureModel : 0,
      figureScale: typeof s.figureScale === 'number' ? s.figureScale : 1,
      figureSpin: typeof s.figureSpin === 'number' ? s.figureSpin : 0.35,
      figureHalo: typeof s.figureHalo === 'number' ? s.figureHalo : 0.75,
      figureAudio: typeof s.figureAudio === 'number' ? s.figureAudio : 1,
    });
  }
  // v11 → v12: optional remote glTF/GLB URL for the Figure layer.
  if (s.schemaVersion === 11) {
    return migrateControlState({
      ...s,
      schemaVersion: 12,
      figureAssetPath: typeof s.figureAssetPath === 'string' ? s.figureAssetPath : '',
    });
  }
  // v12 → v13: split the global GPU visibility switch into per-deck switches.
  if (s.schemaVersion === 12) {
    const gpuEnabled = s.showGpuPalette === true;
    return migrateControlState({
      ...s,
      schemaVersion: 13,
      cpuDeckAEnabled: false,
      cpuDeckBEnabled: false,
      gpuDeckAEnabled: gpuEnabled,
      gpuDeckBEnabled: gpuEnabled,
    });
  }
  // v13 → v14: deck pack slugs alongside legacy int modes. Empty until catalog
  // resolve fills them (bridge coerce / show-preset migration).
  if (s.schemaVersion === 13) {
    return migrateControlState({
      ...s,
      schemaVersion: 14,
      deckAPresetSlug: typeof s.deckAPresetSlug === 'string' ? s.deckAPresetSlug : '',
      deckBPresetSlug: typeof s.deckBPresetSlug === 'string' ? s.deckBPresetSlug : '',
    });
  }
  // v14 → v15: explicit Reload active counters (projector re-fetches compiled).
  if (s.schemaVersion === 14) {
    return migrateControlState({
      ...s,
      schemaVersion: 15,
      deckAReloadActiveVersion:
        typeof s.deckAReloadActiveVersion === 'number' ? s.deckAReloadActiveVersion : 0,
      deckBReloadActiveVersion:
        typeof s.deckBReloadActiveVersion === 'number' ? s.deckBReloadActiveVersion : 0,
    });
  }
  // v15 → v16: per-deck performance axes (launchpad knobs). Seed both decks from
  // the global intensity/depth/feedback/speed so behavior matches pre-v16 until
  // the operator diverges a deck.
  if (s.schemaVersion === 15) {
    const intensity = typeof s.intensity === 'number' ? s.intensity : 0.82;
    const depth = typeof s.depth === 'number' ? s.depth : 0;
    const feedback = typeof s.feedback === 'number' ? s.feedback : 0.22;
    const speed = typeof s.speed === 'number' ? s.speed : 1;
    return migrateControlState({
      ...s,
      schemaVersion: 16,
      deckAIntensity: typeof s.deckAIntensity === 'number' ? s.deckAIntensity : intensity,
      deckADepth: typeof s.deckADepth === 'number' ? s.deckADepth : depth,
      deckAFeedback: typeof s.deckAFeedback === 'number' ? s.deckAFeedback : feedback,
      deckASpeed: typeof s.deckASpeed === 'number' ? s.deckASpeed : speed,
      deckBIntensity: typeof s.deckBIntensity === 'number' ? s.deckBIntensity : intensity,
      deckBDepth: typeof s.deckBDepth === 'number' ? s.deckBDepth : depth,
      deckBFeedback: typeof s.deckBFeedback === 'number' ? s.deckBFeedback : feedback,
      deckBSpeed: typeof s.deckBSpeed === 'number' ? s.deckBSpeed : speed,
    });
  }
  // v16 → v17: independent deck colors. Seed both from the former global
  // palette so existing sessions render exactly as they did before divergence.
  if (s.schemaVersion === 16) {
    const palette = typeof s.palette === 'number' ? s.palette : 0.38;
    return migrateControlState({
      ...s,
      schemaVersion: 17,
      deckAPalette: typeof s.deckAPalette === 'number' ? s.deckAPalette : palette,
      deckBPalette: typeof s.deckBPalette === 'number' ? s.deckBPalette : palette,
    });
  }
  // v17 → v18: per-band audio shaping (gain / gate / ceiling / release /
  // mute / solo). Absent means identity, so an upgraded session behaves
  // exactly as it did — the bridge's coerce fills the defaults, which are the
  // constants it already used.
  if (s.schemaVersion === 17) {
    return migrateControlState({ ...s, schemaVersion: 18, audioShaping: s.audioShaping ?? {} });
  }
  return state;
};

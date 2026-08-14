import type { AudioEmaAlphas } from '../../../bridge/audio-ema.ts';
import type { AudioShapingConfig } from '../../../bridge/audio-shaper.ts';
import type { AudioCurveShape } from '../../../shared/osc-validation.ts';
import type { OutputRoute } from '../../../shared/output-routing.ts';

export type TrackMapping = {
  deckAStart: number;
  deckACount: number;
  deckBStart: number;
  deckBCount: number;
  bassTrack: number;
  midTrack: number;
  highTrack: number;
};

export type BandCurves = {
  energy: AudioCurveShape;
  bass: AudioCurveShape;
  mid: AudioCurveShape;
  high: AudioCurveShape;
};

export type ControlState = {
  schemaVersion: number;
  crossfade: number;
  bpm: number;
  speed: number;
  intensity: number;
  feedback: number;
  depth: number;
  /** Per-deck instrument axes (launchpad knobs). Independent of global masters. */
  deckAIntensity: number;
  deckADepth: number;
  deckAFeedback: number;
  deckASpeed: number;
  deckBIntensity: number;
  deckBDepth: number;
  deckBFeedback: number;
  deckBSpeed: number;
  /** Independent hue controls for the two deck render paths. */
  deckAPalette: number;
  deckBPalette: number;
  palette: number;
  paletteR: number;
  paletteG: number;
  paletteB: number;
  paletteSaturation: number;
  paletteBrightness: number;
  gridDensity: number;
  gridDiamond: number;
  gridLineWidth: number;
  gridShapeMix: number;
  deckAMode: number;
  deckBMode: number;
  /** Pack slug for deck A (resolved with deckAMode on the bridge). */
  deckAPresetSlug: string;
  /** Pack slug for deck B (resolved with deckBMode on the bridge). */
  deckBPresetSlug: string;
  /**
   * Bumped by explicit "Reload active" on deck A so the projector re-fetches
   * compiled for the current slug at the current catalog epoch (#241).
   */
  deckAReloadActiveVersion: number;
  /** Same as deckAReloadActiveVersion for deck B. */
  deckBReloadActiveVersion: number;
  rings: boolean;
  ringOpacity: number;
  strobe: boolean;
  strobeLockout: boolean;
  blackout: boolean;
  freeze: boolean;
  maxBrightness: number;
  showGpuPalette: boolean;
  cpuDeckAEnabled: boolean;
  cpuDeckBEnabled: boolean;
  gpuDeckAEnabled: boolean;
  gpuDeckBEnabled: boolean;
  beatSync: boolean;
  barSync: boolean;
  demoMode: boolean;
  replaying: boolean;
  flashVersion: number;
  resetVersion: number;
  cueVersion: number;
  cueIntensity: number;
  cuePalette: number;
  cueCrossfade: number;
  cueDeckAMode: number;
  cueDeckBMode: number;
  cueDeckAGpuShader: number;
  cueDeckBGpuShader: number;
  trackMapping: TrackMapping;
  activeShader: number;
  deckAGpuShader: number;
  deckBGpuShader: number;
  bandCurves: BandCurves;
  emaAlphas: AudioEmaAlphas;
  audioShaping: AudioShapingConfig;
  morph: number;
  audioControlMode: boolean;
  outputs: OutputRoute[];
  audioTransientAutomation: boolean;
  // Per-layer composite weights mirrored from the bridge's live layer stack;
  // addressable as automation/OSC/MIDI targets. One slot per bridge layer.
  layerWeight0: number;
  layerWeight1: number;
  layerWeight2: number;
  layerWeight3: number;
  layerWeight4: number;
  layerWeight5: number;
  layerWeight6: number;
  layerWeight7: number;
  /** Catalog index into MODEL_CATALOG (0 = first entry). */
  figureModel: number;
  /** Optional absolute HTTP(S) URL to a .glb/.gltf asset; empty uses the catalog. */
  figureAssetPath: string;
  /** Multiplier on the catalog default scale (0.2..2.5). */
  figureScale: number;
  /** Yaw rate for the figure (0 = static, ~0.35 = catalog default). */
  figureSpin: number;
  /** Stage-halo intensity (0 = off, 1 = full). */
  figureHalo: number;
  /** How much audio drives figure motion + halo sections (0..1). */
  figureAudio: number;
};

export type OscMeters = {
  lastFrameAt: number;
  beat: number;
  beatIndex: number;
  energy: number;
  bass: number;
  mid: number;
  high: number;
  deckA: number;
  deckB: number;
  lastBrowserAudioAt: number;
  previousEnergy: number;
  lastEnvelopeAt: number;
};

export type Diagnostics = {
  sockets: number;
  oscReady: boolean;
  oscActive: boolean;
  demoMode: boolean;
  replaying: boolean;
  clockSource: string | null;
};

export type BridgeStatus = 'connecting' | 'live' | 'error' | 'static';

export type CurveMode = 'snap' | 'linear' | 'ease';

export type CuePreset = Partial<
  Pick<
    ControlState,
    | 'crossfade'
    | 'intensity'
    | 'feedback'
    | 'depth'
    | 'palette'
    | 'deckAMode'
    | 'deckBMode'
    | 'deckAPresetSlug'
    | 'deckBPresetSlug'
    | 'deckAGpuShader'
    | 'deckBGpuShader'
    | 'maxBrightness'
    | 'strobe'
    | 'strobeLockout'
  >
>;

export type RecordingFrame = { t: number; state: ControlState };

export type TriggerBinding =
  | { type: 'midi-note'; note: number; channel: number; action: string }
  | {
      type: 'midi-cc';
      cc: number;
      channel: number;
      threshold: number;
      action: string;
    }
  | { type: 'osc'; address: string; action: string };

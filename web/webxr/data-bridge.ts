import {
  AUDIO_SPECTRUM_BIN_COUNT,
  AUDIO_SPECTRUM_STALE_MS,
  AURORA_AUDIO_SPECTRUM_ADDRESS,
  coerceAudioSpectrumFrame,
} from '../../shared/audio-spectrum.ts';
import type { OscFrame } from '../../shared/bridge-transport.ts';
import {
  isValidOutputId,
  normalizeOutputRoutes,
  resolveOutputView,
} from '../../shared/output-routing.ts';
import { hueToRgb } from '../../shared/palette-color.ts';
import {
  MAX_WEBXR_SPATIAL_FORMATION_INDEX,
  webXrSpatialFormationByIndex,
} from '../../shared/webxr-spatial-contract.ts';
import {
  resolveSpatialFormation,
  type SpatialFormationId,
  spatialModeSeed,
} from './spatial-formations.ts';

export { spatialModeSeed } from './spatial-formations.ts';

const TRACK_DATA = '/live/song/get/track_data';
const TEMPO = '/live/song/get/tempo';
const IS_PLAYING = '/live/song/get/is_playing';
const BEAT = '/live/song/get/beat';
const CONTROL_STATE = '/aurora/control/state';
const BROWSER_AUDIO = '/aurora/audio/features';
const DEMO_AUDIO = '/aurora/demo/audio';
const OSC_CONNECTED = '/aurora/osc/connected';

const MAX_TRACK_METERS = 32;
const TRACK_ACTIVE_MS = 3_000;
const AUDIO_HOLD_MS = 350;
const AUDIO_FADE_MS = 650;

type TrackMapping = {
  deckAStart: number;
  deckACount: number;
  deckBStart: number;
  deckBCount: number;
  bassTrack: number;
  midTrack: number;
  highTrack: number;
};

type AudioBands = {
  energy: number;
  bass: number;
  mid: number;
  high: number;
  pulse: number;
  deckA: number;
  deckB: number;
};

export type SpatialDeckFrame = {
  weight: number;
  enabled: boolean;
  color: [number, number, number];
  intensity: number;
  depth: number;
  feedback: number;
  speed: number;
  xrDensity: number;
  xrStructure: number;
  modeSeed: number;
  formation: SpatialFormationId;
};

export type SpatialVisualizerFrame = {
  nowMs: number;
  connected: boolean;
  source: 'spectrum' | 'track-meters' | 'features' | 'demo' | 'idle';
  spectrum: Float32Array<ArrayBuffer> | null;
  levels64: Float32Array<ArrayBuffer>;
  meters: Float32Array<ArrayBuffer>;
  energy: number;
  bass: number;
  mid: number;
  high: number;
  pulse: number;
  beat: number;
  beatVersion: number;
  tempo: number;
  playing: boolean;
  deckA: SpatialDeckFrame;
  deckB: SpatialDeckFrame;
  xrSpatialExtent: number;
  xrAudioReactivity: number;
  rings: boolean;
  ringOpacity: number;
  blackout: boolean;
  freeze: boolean;
  strobe: boolean;
  strobeLockout: boolean;
  flashVersion: number;
  resetVersion: number;
};

type ControlView = {
  crossfade: number;
  bpm: number;
  palette: number;
  deckAPalette: number;
  deckBPalette: number;
  paletteSaturation: number;
  paletteBrightness: number;
  maxBrightness: number;
  activeShader: number;
  outputs: unknown[];
  blackout: boolean;
  freeze: boolean;
  rings: boolean;
  ringOpacity: number;
  strobe: boolean;
  strobeLockout: boolean;
  beatSync: boolean;
  demoMode: boolean;
  flashVersion: number;
  resetVersion: number;
  deckAMode: number;
  deckBMode: number;
  deckAPresetSlug: string;
  deckBPresetSlug: string;
  xrFollowDeckModes: boolean;
  xrFormationA: number;
  xrFormationB: number;
  xrDensityA: number;
  xrDensityB: number;
  xrStructureA: number;
  xrStructureB: number;
  xrSpatialExtent: number;
  xrAudioReactivity: number;
  deckAIntensity: number;
  deckADepth: number;
  deckAFeedback: number;
  deckASpeed: number;
  deckBIntensity: number;
  deckBDepth: number;
  deckBFeedback: number;
  deckBSpeed: number;
  cpuDeckAEnabled: boolean;
  cpuDeckBEnabled: boolean;
  gpuDeckAEnabled: boolean;
  gpuDeckBEnabled: boolean;
  trackMapping: TrackMapping;
  bandCurves: Record<'energy' | 'bass' | 'mid' | 'high', string>;
};

const DEFAULT_CONTROL: ControlView = {
  crossfade: 0.5,
  bpm: 124,
  palette: 0.38,
  deckAPalette: 0.38,
  deckBPalette: 0.38,
  paletteSaturation: 0.88,
  paletteBrightness: 0.92,
  maxBrightness: 0.95,
  activeShader: 26,
  outputs: [],
  blackout: false,
  freeze: false,
  rings: true,
  ringOpacity: 0.35,
  strobe: false,
  strobeLockout: false,
  beatSync: true,
  demoMode: false,
  flashVersion: 0,
  resetVersion: 0,
  deckAMode: 0,
  deckBMode: 1,
  deckAPresetSlug: 'beams',
  deckBPresetSlug: 'tunnel',
  xrFollowDeckModes: true,
  xrFormationA: 0,
  xrFormationB: 1,
  xrDensityA: 1,
  xrDensityB: 1,
  xrStructureA: 1,
  xrStructureB: 1,
  xrSpatialExtent: 1,
  xrAudioReactivity: 1,
  deckAIntensity: 0.82,
  deckADepth: 0,
  deckAFeedback: 0.22,
  deckASpeed: 1,
  deckBIntensity: 0.82,
  deckBDepth: 0,
  deckBFeedback: 0.22,
  deckBSpeed: 1,
  cpuDeckAEnabled: false,
  cpuDeckBEnabled: false,
  gpuDeckAEnabled: true,
  gpuDeckBEnabled: true,
  trackMapping: {
    deckAStart: 0,
    deckACount: 8,
    deckBStart: 8,
    deckBCount: 8,
    bassTrack: 0,
    midTrack: 1,
    highTrack: 2,
  },
  bandCurves: { energy: 'linear', bass: 'linear', mid: 'linear', high: 'linear' },
};

const EMPTY_BANDS: AudioBands = {
  energy: 0,
  bass: 0,
  mid: 0,
  high: 0,
  pulse: 0,
  deckA: 0,
  deckB: 0,
};

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
};
const clamp01 = (value: unknown, fallback = 0): number => clamp(value, 0, 1, fallback);
const average = (values: readonly number[]): number =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function curve(value: number, shape: string): number {
  if (shape === 'exponential') return value * value;
  if (shape === 'logarithmic') return Math.sqrt(Math.max(0, value));
  return value;
}

function trackDataValueStart(args: unknown[]): number {
  const fieldIndex = args.findIndex(
    (arg) =>
      typeof arg === 'string' && (arg === 'track.output_meter_level' || arg.startsWith('track.')),
  );
  if (fieldIndex >= 0) return fieldIndex + 1;
  const allNumeric = args.every((arg) => Number.isFinite(Number(arg)));
  if (allNumeric && args.length >= 3) {
    const count = Number(args[1]);
    if (
      Number.isInteger(Number(args[0])) &&
      Number.isInteger(count) &&
      count > 0 &&
      count <= args.length - 2
    ) {
      return 2;
    }
  }
  if (allNumeric && args.length <= MAX_TRACK_METERS) return 0;
  return Math.min(2, args.length);
}

function coerceBands(raw: unknown, includeDecks: boolean): AudioBands | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const energy = clamp01(value.energy);
  return {
    energy,
    bass: clamp01(value.bass),
    mid: clamp01(value.mid),
    high: clamp01(value.high),
    pulse: clamp01(value.pulse),
    deckA: includeDecks ? clamp01(value.deckA, energy) : energy,
    deckB: includeDecks ? clamp01(value.deckB, energy) : energy,
  };
}

function applyControlPatch(previous: ControlView, raw: unknown): ControlView {
  if (!raw || typeof raw !== 'object') return previous;
  const source = raw as Record<string, unknown>;
  const mapping =
    source.trackMapping && typeof source.trackMapping === 'object'
      ? (source.trackMapping as Record<string, unknown>)
      : {};
  const bandCurves =
    source.bandCurves && typeof source.bandCurves === 'object'
      ? (source.bandCurves as Record<string, unknown>)
      : {};
  const validCurve = (value: unknown, fallback: string) =>
    value === 'linear' || value === 'exponential' || value === 'logarithmic' ? value : fallback;
  return {
    crossfade: clamp01(source.crossfade, previous.crossfade),
    bpm: clamp(source.bpm, 40, 240, previous.bpm),
    palette: clamp01(source.palette, previous.palette),
    deckAPalette: clamp01(source.deckAPalette, previous.deckAPalette),
    deckBPalette: clamp01(source.deckBPalette, previous.deckBPalette),
    paletteSaturation: clamp01(source.paletteSaturation, previous.paletteSaturation),
    paletteBrightness: clamp01(source.paletteBrightness, previous.paletteBrightness),
    maxBrightness: clamp01(source.maxBrightness, previous.maxBrightness),
    activeShader: Math.floor(clamp(source.activeShader, 0, 36, previous.activeShader)),
    outputs: Array.isArray(source.outputs) ? source.outputs : previous.outputs,
    blackout: Boolean(source.blackout),
    freeze: Boolean(source.freeze),
    rings: source.rings !== false,
    ringOpacity: clamp01(source.ringOpacity, previous.ringOpacity),
    strobe: Boolean(source.strobe),
    strobeLockout: Boolean(source.strobeLockout),
    beatSync: source.beatSync !== false,
    demoMode: Boolean(source.demoMode),
    flashVersion: Math.max(
      0,
      Math.floor(clamp(source.flashVersion, 0, Number.MAX_SAFE_INTEGER, previous.flashVersion)),
    ),
    resetVersion: Math.max(
      0,
      Math.floor(clamp(source.resetVersion, 0, Number.MAX_SAFE_INTEGER, previous.resetVersion)),
    ),
    deckAMode: Math.floor(clamp(source.deckAMode, -1, 48, previous.deckAMode)),
    deckBMode: Math.floor(clamp(source.deckBMode, -1, 48, previous.deckBMode)),
    deckAPresetSlug:
      typeof source.deckAPresetSlug === 'string'
        ? source.deckAPresetSlug
        : previous.deckAPresetSlug,
    deckBPresetSlug:
      typeof source.deckBPresetSlug === 'string'
        ? source.deckBPresetSlug
        : previous.deckBPresetSlug,
    xrFollowDeckModes:
      typeof source.xrFollowDeckModes === 'boolean'
        ? source.xrFollowDeckModes
        : previous.xrFollowDeckModes,
    xrFormationA: Math.floor(
      clamp(source.xrFormationA, 0, MAX_WEBXR_SPATIAL_FORMATION_INDEX, previous.xrFormationA),
    ),
    xrFormationB: Math.floor(
      clamp(source.xrFormationB, 0, MAX_WEBXR_SPATIAL_FORMATION_INDEX, previous.xrFormationB),
    ),
    xrDensityA: clamp01(source.xrDensityA, previous.xrDensityA),
    xrDensityB: clamp01(source.xrDensityB, previous.xrDensityB),
    xrStructureA: clamp01(source.xrStructureA, previous.xrStructureA),
    xrStructureB: clamp01(source.xrStructureB, previous.xrStructureB),
    xrSpatialExtent: clamp(source.xrSpatialExtent, 0.65, 1.75, previous.xrSpatialExtent),
    xrAudioReactivity: clamp01(source.xrAudioReactivity, previous.xrAudioReactivity),
    deckAIntensity: clamp(source.deckAIntensity, 0.05, 1.5, previous.deckAIntensity),
    deckADepth: clamp01(source.deckADepth, previous.deckADepth),
    deckAFeedback: clamp01(source.deckAFeedback, previous.deckAFeedback),
    deckASpeed: clamp(source.deckASpeed, 0.1, 3, previous.deckASpeed),
    deckBIntensity: clamp(source.deckBIntensity, 0.05, 1.5, previous.deckBIntensity),
    deckBDepth: clamp01(source.deckBDepth, previous.deckBDepth),
    deckBFeedback: clamp01(source.deckBFeedback, previous.deckBFeedback),
    deckBSpeed: clamp(source.deckBSpeed, 0.1, 3, previous.deckBSpeed),
    cpuDeckAEnabled: Boolean(source.cpuDeckAEnabled),
    cpuDeckBEnabled: Boolean(source.cpuDeckBEnabled),
    gpuDeckAEnabled: source.gpuDeckAEnabled !== false,
    gpuDeckBEnabled: source.gpuDeckBEnabled !== false,
    trackMapping: {
      deckAStart: Math.floor(clamp(mapping.deckAStart, 0, 31, previous.trackMapping.deckAStart)),
      deckACount: Math.floor(clamp(mapping.deckACount, 1, 32, previous.trackMapping.deckACount)),
      deckBStart: Math.floor(clamp(mapping.deckBStart, 0, 31, previous.trackMapping.deckBStart)),
      deckBCount: Math.floor(clamp(mapping.deckBCount, 1, 32, previous.trackMapping.deckBCount)),
      bassTrack: Math.floor(clamp(mapping.bassTrack, 0, 31, previous.trackMapping.bassTrack)),
      midTrack: Math.floor(clamp(mapping.midTrack, 0, 31, previous.trackMapping.midTrack)),
      highTrack: Math.floor(clamp(mapping.highTrack, 0, 31, previous.trackMapping.highTrack)),
    },
    bandCurves: {
      energy: validCurve(bandCurves.energy, previous.bandCurves.energy),
      bass: validCurve(bandCurves.bass, previous.bandCurves.bass),
      mid: validCurve(bandCurves.mid, previous.bandCurves.mid),
      high: validCurve(bandCurves.high, previous.bandCurves.high),
    },
  };
}

function fallbackLevels(bands: AudioBands): Float32Array<ArrayBuffer> {
  const levels = new Float32Array(AUDIO_SPECTRUM_BIN_COUNT);
  for (let index = 0; index < levels.length; index++) {
    const t = index / (levels.length - 1);
    const bassWeight = Math.max(0, 1 - t / 0.38);
    const highWeight = Math.max(0, (t - 0.48) / 0.52);
    const midWeight = Math.max(0, 1 - Math.abs(t - 0.48) / 0.42);
    const weightSum = Math.max(1, bassWeight + midWeight + highWeight);
    const shaped =
      (bands.bass * bassWeight + bands.mid * midWeight + bands.high * highWeight) / weightSum;
    levels[index] = clamp01(shaped * 0.86 + bands.energy * 0.14);
  }
  return levels;
}

export class VisualizerDataBridge {
  private control: ControlView = structuredClone(DEFAULT_CONTROL);
  private connected = false;
  private meters = new Float32Array(MAX_TRACK_METERS);
  private meterCount = 0;
  private trackBands: AudioBands = { ...EMPTY_BANDS };
  private featureBands: AudioBands = { ...EMPTY_BANDS };
  private demoBands: AudioBands = { ...EMPTY_BANDS };
  private spectrum: Float32Array<ArrayBuffer> | null = null;
  private lastSpectrumAt = Number.NEGATIVE_INFINITY;
  private lastTrackAt = Number.NEGATIVE_INFINITY;
  private lastFeaturesAt = Number.NEGATIVE_INFINITY;
  private lastDemoAt = Number.NEGATIVE_INFINITY;
  private previousTrackEnergy = 0;
  private beat = 0;
  private beatFloor = -1;
  private beatVersion = 0;
  private lastBeatAt = Number.NEGATIVE_INFINITY;
  private tempo = 124;
  private playing = false;

  constructor(
    readonly outputId = 'main',
    private readonly now: () => number = () => performance.now(),
  ) {}

  ingest(frame: OscFrame): void {
    const address = frame.address;
    const args = Array.isArray(frame.args) ? frame.args : [];
    const now = this.now();
    if (address === OSC_CONNECTED) {
      this.connected = Boolean(args[0]);
      return;
    }
    if (address === CONTROL_STATE) {
      this.control = applyControlPatch(this.control, args[0]);
      return;
    }
    if (address === AURORA_AUDIO_SPECTRUM_ADDRESS) {
      if (args[0] === null) {
        this.spectrum = null;
        this.lastSpectrumAt = 0;
        return;
      }
      const parsed = coerceAudioSpectrumFrame(args[0]);
      if (parsed) {
        this.spectrum = new Float32Array(parsed.bins);
        this.lastSpectrumAt = now;
      }
      return;
    }
    if (address === BROWSER_AUDIO) {
      const bands = coerceBands(args[0], false);
      if (bands) {
        const previousBass = this.featureBands.bass;
        this.featureBands = bands;
        this.lastFeaturesAt = now;
        this.detectPulse(bands.pulse, bands.bass, previousBass, now);
      }
      return;
    }
    if (address === DEMO_AUDIO) {
      const bands = coerceBands(args[0], true);
      if (bands) {
        this.demoBands = bands;
        this.lastDemoAt = now;
        const beat = Number((args[0] as Record<string, unknown>).beat);
        if (Number.isFinite(beat)) this.acceptBeat(beat, now);
        const tempo = Number((args[0] as Record<string, unknown>).tempo);
        if (Number.isFinite(tempo)) this.tempo = clamp(tempo, 40, 240, this.tempo);
      }
      return;
    }
    if (address === TEMPO) {
      this.tempo = clamp(args[0], 40, 240, this.tempo);
      return;
    }
    if (address === IS_PLAYING) {
      this.playing = Boolean(args[0]);
      return;
    }
    if (address === BEAT) {
      const beat = Number(args[0]);
      if (Number.isFinite(beat)) this.acceptBeat(beat, now);
      return;
    }
    if (address === TRACK_DATA) this.applyTrackData(args, now);
  }

  snapshot(nowMs = this.now()): SpatialVisualizerFrame {
    const trackFresh = nowMs - this.lastTrackAt < TRACK_ACTIVE_MS;
    const demoFresh = this.control.demoMode && nowMs - this.lastDemoAt < AUDIO_SPECTRUM_STALE_MS;
    const featuresFresh = nowMs - this.lastFeaturesAt < AUDIO_SPECTRUM_STALE_MS;
    const spectrumFresh =
      this.spectrum !== null && nowMs - this.lastSpectrumAt < AUDIO_SPECTRUM_STALE_MS;
    let source: SpatialVisualizerFrame['source'] = 'idle';
    let bands = EMPTY_BANDS;
    let lastAudioAt = 0;
    if (demoFresh) {
      source = 'demo';
      bands = this.demoBands;
      lastAudioAt = this.lastDemoAt;
    } else if (trackFresh) {
      source = 'track-meters';
      bands = this.trackBands;
      lastAudioAt = this.lastTrackAt;
    } else if (featuresFresh) {
      source = 'features';
      bands = this.featureBands;
      lastAudioAt = this.lastFeaturesAt;
    }
    if (spectrumFresh) source = 'spectrum';

    const age = lastAudioAt > 0 ? nowMs - lastAudioAt : Number.POSITIVE_INFINITY;
    const decay = age <= AUDIO_HOLD_MS ? 1 : Math.max(0, 1 - (age - AUDIO_HOLD_MS) / AUDIO_FADE_MS);
    const shaped: AudioBands = {
      energy: curve(bands.energy * decay, this.control.bandCurves.energy),
      bass: curve(bands.bass * decay, this.control.bandCurves.bass),
      mid: curve(bands.mid * decay, this.control.bandCurves.mid),
      high: curve(bands.high * decay, this.control.bandCurves.high),
      pulse: bands.pulse * decay,
      deckA: bands.deckA * decay,
      deckB: bands.deckB * decay,
    };
    const beatDuration = Math.max(200, (60 / this.control.bpm) * 1_000 * 0.38);
    const beatT = Math.min(1, (nowMs - this.lastBeatAt) / beatDuration);
    const pulse = this.control.beatSync
      ? shaped.energy < 0.02
        ? 0
        : Math.max(0, 1 - beatT * beatT)
      : Math.max(shaped.pulse, shaped.bass);

    const routes = normalizeOutputRoutes(this.control.outputs);
    const route = routes.find((candidate) => candidate.id === this.outputId);
    const output = resolveOutputView(
      {
        crossfade: this.control.crossfade,
        palette: this.control.palette,
        activeShader: this.control.activeShader,
        blackout: this.control.blackout,
      },
      route,
    );
    const hueShift = output.palette - this.control.palette;
    const enabledA = this.control.cpuDeckAEnabled || this.control.gpuDeckAEnabled;
    const enabledB = this.control.cpuDeckBEnabled || this.control.gpuDeckBEnabled;
    const deckA = this.deckFrame('a', enabledA ? 1 - output.crossfade : 0, hueShift);
    const deckB = this.deckFrame('b', enabledB ? output.crossfade : 0, hueShift);
    const spectrum = spectrumFresh && this.spectrum ? new Float32Array(this.spectrum) : null;
    const levels64 = spectrum ? new Float32Array(spectrum) : fallbackLevels(shaped);
    const meterDecay = Math.max(
      0,
      Math.min(1, 1 - Math.max(0, nowMs - this.lastTrackAt - AUDIO_HOLD_MS) / AUDIO_FADE_MS),
    );
    const meters = new Float32Array(this.meterCount);
    for (let index = 0; index < meters.length; index++)
      meters[index] = (this.meters[index] ?? 0) * meterDecay;

    return {
      nowMs,
      connected: this.connected,
      source,
      spectrum,
      levels64,
      meters,
      energy: shaped.energy,
      bass: shaped.bass,
      mid: shaped.mid,
      high: shaped.high,
      pulse,
      beat: this.beat,
      beatVersion: this.beatVersion,
      tempo: this.tempo,
      playing: this.playing || demoFresh || featuresFresh,
      deckA,
      deckB,
      xrSpatialExtent: this.control.xrSpatialExtent,
      xrAudioReactivity: this.control.xrAudioReactivity,
      rings: this.control.rings,
      ringOpacity: this.control.ringOpacity,
      blackout: output.blackout || deckA.weight + deckB.weight <= 0,
      freeze: this.control.freeze,
      strobe: this.control.strobe,
      strobeLockout: this.control.strobeLockout,
      flashVersion: this.control.flashVersion,
      resetVersion: this.control.resetVersion,
    };
  }

  private deckFrame(side: 'a' | 'b', weight: number, hueShift: number): SpatialDeckFrame {
    const isA = side === 'a';
    const hue = ((isA ? this.control.deckAPalette : this.control.deckBPalette) + hueShift + 1) % 1;
    const rgb = hueToRgb(hue, this.control.paletteSaturation, 0.52);
    const brightness = this.control.paletteBrightness * this.control.maxBrightness;
    const mode = isA ? this.control.deckAMode : this.control.deckBMode;
    const slug = isA ? this.control.deckAPresetSlug : this.control.deckBPresetSlug;
    return {
      weight,
      enabled: weight > 0,
      color: [rgb.r * brightness, rgb.g * brightness, rgb.b * brightness],
      intensity: isA ? this.control.deckAIntensity : this.control.deckBIntensity,
      depth: isA ? this.control.deckADepth : this.control.deckBDepth,
      feedback: isA ? this.control.deckAFeedback : this.control.deckBFeedback,
      speed: isA ? this.control.deckASpeed : this.control.deckBSpeed,
      xrDensity: isA ? this.control.xrDensityA : this.control.xrDensityB,
      xrStructure: isA ? this.control.xrStructureA : this.control.xrStructureB,
      modeSeed: spatialModeSeed(mode, slug),
      formation: this.control.xrFollowDeckModes
        ? resolveSpatialFormation(mode, slug)
        : webXrSpatialFormationByIndex(isA ? this.control.xrFormationA : this.control.xrFormationB),
    };
  }

  private acceptBeat(beat: number, now: number): void {
    this.beat = beat;
    const floor = Math.floor(beat);
    if (floor !== this.beatFloor) {
      this.beatFloor = floor;
      this.beatVersion++;
      this.lastBeatAt = now;
    }
  }

  private detectPulse(pulse: number, bass: number, previousBass: number, now: number): void {
    if (pulse > 0.65 && now - this.lastBeatAt > 180) {
      this.beatVersion++;
      this.lastBeatAt = now;
    } else if (bass > previousBass + 0.12 && bass > 0.2 && now - this.lastBeatAt > 180) {
      this.beatVersion++;
      this.lastBeatAt = now;
    }
  }

  private applyTrackData(args: unknown[], now: number): void {
    const valueStart = trackDataValueStart(args);
    const meterStart = valueStart === 0 ? 0 : Math.max(0, Math.floor(Number(args[0]) || 0));
    for (let index = valueStart; index < args.length; index++) {
      const target = meterStart + index - valueStart;
      if (target >= MAX_TRACK_METERS) break;
      this.meters[target] = clamp01(args[index]);
      this.meterCount = Math.max(this.meterCount, target + 1);
    }
    if (this.meterCount === 0) return;
    const boosted = Array.from(this.meters.slice(0, this.meterCount), (value) => {
      const gain = clamp01(value) * 3.2;
      return gain <= 1 ? gain : 1 - 0.35 * Math.exp(-3 * (gain - 1));
    });
    const mapping = this.control.trackMapping;
    const avg = average(boosted);
    const peak = Math.max(avg, ...boosted);
    const energy = peak * 0.72 + avg * 0.28;
    const mapped = (index: number, fallback: number) => boosted[index] ?? fallback;
    const range = (start: number, count: number) =>
      average(boosted.slice(start, start + Math.max(1, count)));
    const transient = Math.max(0, energy - this.previousTrackEnergy);
    const bass = mapped(mapping.bassTrack, energy);
    if (bass > this.trackBands.bass + 0.14 && bass > 0.22 && now - this.lastBeatAt > 180) {
      this.beatVersion++;
      this.lastBeatAt = now;
    }
    this.trackBands = {
      energy,
      bass,
      mid: mapped(mapping.midTrack, avg),
      high: Math.max(mapped(mapping.highTrack, 0), Math.min(1, transient * 2.8)),
      pulse: Math.min(1, transient * 2.8),
      deckA: range(mapping.deckAStart, mapping.deckACount) || avg,
      deckB: range(mapping.deckBStart, mapping.deckBCount) || avg,
    };
    this.previousTrackEnergy = energy;
    this.lastTrackAt = now;
  }
}

export function outputIdFromLocation(search: string): string {
  const value = new URLSearchParams(search).get('output');
  return value && isValidOutputId(value) ? value : 'main';
}

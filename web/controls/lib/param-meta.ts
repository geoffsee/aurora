import { MAX_FIGURE_MODEL_INDEX, MODEL_CATALOG } from '../../../shared/model-catalog.ts';
import { VISUAL_MODES } from './constants.ts';
import { hueToRgb, rgbToHue } from './palette.ts';
import type { ControlState } from './types.ts';

// Numeric ControlState fields an assignable slider (or MIDI CC) can drive.
// Ranges/steps mirror the dedicated sliders in the original controls page so a
// param mapped here behaves identically to its native control.
export type MappableParam =
  | 'crossfade'
  | 'bpm'
  | 'speed'
  | 'intensity'
  | 'feedback'
  | 'depth'
  | 'palette'
  | 'paletteR'
  | 'paletteG'
  | 'paletteB'
  | 'paletteSaturation'
  | 'paletteBrightness'
  | 'gridDensity'
  | 'gridDiamond'
  | 'gridLineWidth'
  | 'gridShapeMix'
  | 'ringOpacity'
  | 'maxBrightness'
  | 'morph'
  | 'deckAMode'
  | 'deckBMode'
  | 'layerWeight0'
  | 'layerWeight1'
  | 'layerWeight2'
  | 'layerWeight3'
  | 'layerWeight4'
  | 'layerWeight5'
  | 'layerWeight6'
  | 'layerWeight7'
  | 'figureModel'
  | 'figureScale'
  | 'figureSpin'
  | 'figureHalo'
  | 'figureAudio';

export type ParamMeta = {
  key: MappableParam;
  label: string;
  /** Short label for the dense knob strip (falls back to `label`). */
  knobLabel?: string;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  bumpCue?: boolean;
  format: (value: number) => string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f2 = (v: number) => v.toFixed(2);
const hueDeg = (v: number) => `${Math.round((((v % 1) + 1) % 1) * 360)}°`;
const chan = (v: number) => Math.round(v * 255).toString();

export const PARAM_META: Record<MappableParam, ParamMeta> = {
  crossfade: { key: 'crossfade', label: 'Crossfade', min: 0, max: 1, step: 0.001, format: pct },
  bpm: { key: 'bpm', label: 'BPM', min: 60, max: 190, step: 0.1, format: (v) => v.toFixed(1) },
  speed: { key: 'speed', label: 'Speed', min: 0.1, max: 3, step: 0.01, format: f2 },
  intensity: { key: 'intensity', label: 'Intensity', min: 0.05, max: 1.5, step: 0.01, format: f2 },
  feedback: { key: 'feedback', label: 'Trails', min: 0, max: 1, step: 0.01, format: f2 },
  depth: {
    key: 'depth',
    label: '3D Lines',
    knobLabel: '3D Lines',
    min: 0,
    max: 1,
    step: 0.01,
    format: f2,
  },
  palette: {
    key: 'palette',
    label: 'Color (hue)',
    knobLabel: 'Color',
    min: 0,
    max: 1,
    step: 0.001,
    format: hueDeg,
  },
  paletteR: {
    key: 'paletteR',
    label: 'Color R',
    knobLabel: 'Color R',
    min: 0,
    max: 1,
    step: 0.01,
    format: chan,
  },
  paletteG: {
    key: 'paletteG',
    label: 'Color G',
    knobLabel: 'Color G',
    min: 0,
    max: 1,
    step: 0.01,
    format: chan,
  },
  paletteB: {
    key: 'paletteB',
    label: 'Color B',
    knobLabel: 'Color B',
    min: 0,
    max: 1,
    step: 0.01,
    format: chan,
  },
  paletteSaturation: {
    key: 'paletteSaturation',
    label: 'GPU Saturation',
    knobLabel: 'GPU Sat',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  paletteBrightness: {
    key: 'paletteBrightness',
    label: 'GPU Brightness',
    knobLabel: 'GPU Bright',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  gridDensity: {
    key: 'gridDensity',
    label: 'Grid Density',
    knobLabel: 'Grid Dens',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  gridDiamond: {
    key: 'gridDiamond',
    label: 'Grid Diamond',
    knobLabel: 'Grid Diam',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  gridLineWidth: {
    key: 'gridLineWidth',
    label: 'Grid Lines',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  gridShapeMix: {
    key: 'gridShapeMix',
    label: 'Grid Shape',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  ringOpacity: {
    key: 'ringOpacity',
    label: 'Ring Opacity',
    knobLabel: 'Ring Opc',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  maxBrightness: {
    key: 'maxBrightness',
    label: 'Max Brightness',
    knobLabel: 'Max Bright',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  morph: {
    key: 'morph',
    label: 'Preset Morph',
    knobLabel: 'Morph',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  deckAMode: {
    key: 'deckAMode',
    label: 'Deck A Mode',
    knobLabel: 'A Mode',
    min: 0,
    max: VISUAL_MODES.length - 1,
    step: 1,
    integer: true,
    bumpCue: true,
    format: (v) => VISUAL_MODES[Math.round(v)] ?? String(Math.round(v)),
  },
  deckBMode: {
    key: 'deckBMode',
    label: 'Deck B Mode',
    knobLabel: 'B Mode',
    min: 0,
    max: VISUAL_MODES.length - 1,
    step: 1,
    integer: true,
    bumpCue: true,
    format: (v) => VISUAL_MODES[Math.round(v)] ?? String(Math.round(v)),
  },
  layerWeight0: {
    key: 'layerWeight0',
    label: 'Layer 1 Opacity',
    knobLabel: 'L1',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  layerWeight1: {
    key: 'layerWeight1',
    label: 'Layer 2 Opacity',
    knobLabel: 'L2',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  layerWeight2: {
    key: 'layerWeight2',
    label: 'Layer 3 Opacity',
    knobLabel: 'L3',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  layerWeight3: {
    key: 'layerWeight3',
    label: 'Layer 4 Opacity',
    knobLabel: 'L4',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  layerWeight4: {
    key: 'layerWeight4',
    label: 'Layer 5 Opacity',
    knobLabel: 'L5',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  layerWeight5: {
    key: 'layerWeight5',
    label: 'Layer 6 Opacity',
    knobLabel: 'L6',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  layerWeight6: {
    key: 'layerWeight6',
    label: 'Layer 7 Opacity',
    knobLabel: 'L7',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  layerWeight7: {
    key: 'layerWeight7',
    label: 'Layer 8 Opacity',
    knobLabel: 'L8',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  figureModel: {
    key: 'figureModel',
    label: 'Figure Model',
    knobLabel: 'Figure',
    min: 0,
    max: MAX_FIGURE_MODEL_INDEX,
    step: 1,
    integer: true,
    format: (v) => MODEL_CATALOG[Math.round(v)]?.label ?? String(Math.round(v)),
  },
  figureScale: {
    key: 'figureScale',
    label: 'Figure Scale',
    knobLabel: 'Fig Scale',
    min: 0.2,
    max: 2.5,
    step: 0.01,
    format: f2,
  },
  figureSpin: {
    key: 'figureSpin',
    label: 'Figure Spin',
    knobLabel: 'Fig Spin',
    min: 0,
    max: 2,
    step: 0.01,
    format: f2,
  },
  figureHalo: {
    key: 'figureHalo',
    label: 'Figure Halo',
    knobLabel: 'Fig Halo',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
  figureAudio: {
    key: 'figureAudio',
    label: 'Figure Audio',
    knobLabel: 'Fig Audio',
    min: 0,
    max: 1,
    step: 0.01,
    format: pct,
  },
};

export const MAPPABLE_PARAMS = Object.keys(PARAM_META) as MappableParam[];

export function isMappableParam(value: string): value is MappableParam {
  return Object.hasOwn(PARAM_META, value);
}

/**
 * Order of knobs in the main controls strip. Every mappable continuous/integer
 * param is exposed; the strip scrolls horizontally when it overflows.
 */
export const KNOB_STRIP_PARAMS: readonly MappableParam[] = [
  'bpm',
  'speed',
  'intensity',
  'feedback',
  'depth',
  'crossfade',
  'morph',
  'ringOpacity',
  'palette',
  'paletteR',
  'paletteG',
  'paletteB',
  'paletteSaturation',
  'paletteBrightness',
  'maxBrightness',
  'gridDensity',
  'gridDiamond',
  'gridLineWidth',
  'gridShapeMix',
  'deckAMode',
  'deckBMode',
  'layerWeight0',
  'layerWeight1',
  'layerWeight2',
  'layerWeight3',
  'layerWeight4',
  'layerWeight5',
  'layerWeight6',
  'layerWeight7',
  'figureModel',
  'figureScale',
  'figureSpin',
  'figureHalo',
  'figureAudio',
] as const;

/** Build the state patch for setting a mappable param to a value. Palette hue
 * also drives the RGB duotone base so the live color tracks the slider. */
export function buildParamPatch(
  param: MappableParam,
  value: number,
  current?: Pick<ControlState, 'paletteR' | 'paletteG' | 'paletteB'>,
): Partial<ControlState> {
  const meta = PARAM_META[param];
  const v = meta.integer ? Math.round(value) : value;
  if (param === 'palette') {
    const rgb = hueToRgb(v);
    return { palette: v, paletteR: rgb.r, paletteG: rgb.g, paletteB: rgb.b };
  }
  if (param === 'paletteR' || param === 'paletteG' || param === 'paletteB') {
    const r = param === 'paletteR' ? v : (current?.paletteR ?? 0);
    const g = param === 'paletteG' ? v : (current?.paletteG ?? 0);
    const b = param === 'paletteB' ? v : (current?.paletteB ?? 0);
    return {
      paletteR: r,
      paletteG: g,
      paletteB: b,
      palette: rgbToHue(r, g, b),
    };
  }
  return { [param]: v } as Partial<ControlState>;
}

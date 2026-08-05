// Labels + catalog live in shared/ — keep renderer mode_catalog.rs in sync.
export {
  MAX_VISUAL_MODE_INDEX,
  VISUAL_MODE_CATALOG,
  VISUAL_MODES,
  visualModeLabel,
} from '../../../shared/visual-mode-catalog.ts';

export const SHADER_OPTIONS = [
  'Imported (Shadertoy)',
  'Ring',
  'Spokes',
  'Rings',
  'Warp',
  'Grid',
  'Tunnel',
  'Glitch',
  'Fluid',
  'Truchet',
  'Bass Reactor',
  'High Spark Field',
  'Kick Rings',
  'Laser Lattice',
  'Strobe Shards',
  'Vortex Bloom',
  'Crystal Core',
  'Bass Portal',
  'Mercury Lake',
  'Iridescent Veil',
  'Starweb',
  'Recursive Maw',
  'Inkbloom',
  'Scanlab Holo',
  'Lumen Coral',
  'Polaris Petals',
  'Aurora Curtains',
  'Bass Monolith',
  'Prism Tunnel',
  'Data Rain',
  'Solar Flare',
  'Topo Lines',
  'Glass Ribbons',
  'Gummy Wire Bear',
  'Fierce Walking Wolf',
  'Spectral Ghost',
  'Aurora Crown',
] as const;

export const MAX_GPU_SHADER_INDEX = SHADER_OPTIONS.length - 1;

export const CUE_NAMES = ['warmup', 'drop', 'tunnel', 'burst', 'wash', 'panic'] as const;

export const CLOCK_LABELS: Record<string, string> = {
  link: 'Link',
  midi: 'MIDI',
  internal: 'Internal',
};

export const PRESETS_KEY = 'aurora.presets';
export const SESSION_STATE_KEY = 'aurora.control-session';
export const MIDI_CC_BINDINGS_KEY = 'aurora.midi-cc-bindings';
export const AUTOMATION_TRIGGERS_KEY = 'aurora.automation-triggers';
/** Opt-in embedded projector iframe in controls (memory conservation; issue #231). */
export const PREVIEW_ENABLED_KEY = 'aurora.controls.previewEnabled';

export const MIDI_CC_PARAM_LABELS: Record<string, string> = {
  crossfade: 'Crossfade',
  bpm: 'BPM',
  speed: 'Speed',
  intensity: 'Intensity',
  feedback: 'Trails',
  depth: '3D Lines',
  palette: 'Color',
  paletteR: 'Color R',
  paletteG: 'Color G',
  paletteB: 'Color B',
  paletteSaturation: 'GPU Sat',
  paletteBrightness: 'GPU Bright',
  gridDensity: 'Grid Density',
  gridDiamond: 'Grid Diamond',
  gridLineWidth: 'Grid Lines',
  gridShapeMix: 'Grid Shape',
  morph: 'Morph',
  deckAMode: 'Deck A Mode',
  deckBMode: 'Deck B Mode',
  ringOpacity: 'Ring Opc',
  maxBrightness: 'Max Bright',
  layerWeight0: 'Layer 1 Opacity',
  layerWeight1: 'Layer 2 Opacity',
  layerWeight2: 'Layer 3 Opacity',
  layerWeight3: 'Layer 4 Opacity',
  layerWeight4: 'Layer 5 Opacity',
  layerWeight5: 'Layer 6 Opacity',
  layerWeight6: 'Layer 7 Opacity',
  layerWeight7: 'Layer 8 Opacity',
  figureModel: 'Figure Model',
  figureScale: 'Figure Scale',
  figureSpin: 'Figure Spin',
  figureHalo: 'Figure Halo',
  figureAudio: 'Figure Audio',
};

export const MIDI_CC_INTEGER_PARAMS = new Set(['deckAMode', 'deckBMode', 'figureModel']);

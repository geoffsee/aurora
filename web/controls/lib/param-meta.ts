import { hueToRgb } from "./palette.ts";
import { VISUAL_MODES } from "./constants.ts";
import type { ControlState } from "./types.ts";

// Numeric ControlState fields an assignable slider (or MIDI CC) can drive.
// Ranges/steps mirror the dedicated sliders in the original controls page so a
// param mapped here behaves identically to its native control.
export type MappableParam =
	| "crossfade"
	| "bpm"
	| "speed"
	| "intensity"
	| "feedback"
	| "depth"
	| "palette"
	| "paletteSaturation"
	| "paletteBrightness"
	| "gridDensity"
	| "gridDiamond"
	| "gridLineWidth"
	| "gridShapeMix"
	| "ringOpacity"
	| "maxBrightness"
	| "deckAMode"
	| "deckBMode"
	| "layerWeight0"
	| "layerWeight1"
	| "layerWeight2"
	| "layerWeight3"
	| "layerWeight4"
	| "layerWeight5"
	| "layerWeight6"
	| "layerWeight7";

export type ParamMeta = {
	key: MappableParam;
	label: string;
	min: number;
	max: number;
	step: number;
	integer?: boolean;
	bumpCue?: boolean;
	format: (value: number) => string;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const f2 = (v: number) => v.toFixed(2);

export const PARAM_META: Record<MappableParam, ParamMeta> = {
	crossfade: { key: "crossfade", label: "Crossfade", min: 0, max: 1, step: 0.001, format: pct },
	bpm: { key: "bpm", label: "BPM", min: 60, max: 190, step: 0.1, format: (v) => v.toFixed(1) },
	speed: { key: "speed", label: "Speed", min: 0.1, max: 3, step: 0.01, format: f2 },
	intensity: { key: "intensity", label: "Intensity", min: 0.05, max: 1.5, step: 0.01, format: f2 },
	feedback: { key: "feedback", label: "Trails", min: 0, max: 1, step: 0.01, format: f2 },
	depth: { key: "depth", label: "3D Lines", min: 0, max: 1, step: 0.01, format: f2 },
	palette: { key: "palette", label: "Color (hue)", min: 0, max: 1, step: 0.001, format: f2 },
	paletteSaturation: { key: "paletteSaturation", label: "GPU Saturation", min: 0, max: 1, step: 0.01, format: pct },
	paletteBrightness: { key: "paletteBrightness", label: "GPU Brightness", min: 0, max: 1, step: 0.01, format: pct },
	gridDensity: { key: "gridDensity", label: "Grid Density", min: 0, max: 1, step: 0.01, format: pct },
	gridDiamond: { key: "gridDiamond", label: "Grid Diamond", min: 0, max: 1, step: 0.01, format: pct },
	gridLineWidth: { key: "gridLineWidth", label: "Grid Lines", min: 0, max: 1, step: 0.01, format: pct },
	gridShapeMix: { key: "gridShapeMix", label: "Grid Shape", min: 0, max: 1, step: 0.01, format: pct },
	ringOpacity: { key: "ringOpacity", label: "Ring Opacity", min: 0, max: 1, step: 0.01, format: pct },
	maxBrightness: { key: "maxBrightness", label: "Max Brightness", min: 0, max: 1, step: 0.01, format: pct },
	deckAMode: {
		key: "deckAMode",
		label: "Deck A Mode",
		min: 0,
		max: VISUAL_MODES.length - 1,
		step: 1,
		integer: true,
		bumpCue: true,
		format: (v) => VISUAL_MODES[Math.round(v)] ?? String(Math.round(v)),
	},
	deckBMode: {
		key: "deckBMode",
		label: "Deck B Mode",
		min: 0,
		max: VISUAL_MODES.length - 1,
		step: 1,
		integer: true,
		bumpCue: true,
		format: (v) => VISUAL_MODES[Math.round(v)] ?? String(Math.round(v)),
	},
	layerWeight0: { key: "layerWeight0", label: "Layer 1 Opacity", min: 0, max: 1, step: 0.01, format: pct },
	layerWeight1: { key: "layerWeight1", label: "Layer 2 Opacity", min: 0, max: 1, step: 0.01, format: pct },
	layerWeight2: { key: "layerWeight2", label: "Layer 3 Opacity", min: 0, max: 1, step: 0.01, format: pct },
	layerWeight3: { key: "layerWeight3", label: "Layer 4 Opacity", min: 0, max: 1, step: 0.01, format: pct },
	layerWeight4: { key: "layerWeight4", label: "Layer 5 Opacity", min: 0, max: 1, step: 0.01, format: pct },
	layerWeight5: { key: "layerWeight5", label: "Layer 6 Opacity", min: 0, max: 1, step: 0.01, format: pct },
	layerWeight6: { key: "layerWeight6", label: "Layer 7 Opacity", min: 0, max: 1, step: 0.01, format: pct },
	layerWeight7: { key: "layerWeight7", label: "Layer 8 Opacity", min: 0, max: 1, step: 0.01, format: pct },
};

export const MAPPABLE_PARAMS = Object.keys(PARAM_META) as MappableParam[];

/** Build the state patch for setting a mappable param to a value. Palette hue
 * also drives the RGB duotone base so the live color tracks the slider. */
export function buildParamPatch(
	param: MappableParam,
	value: number,
): Partial<ControlState> {
	const meta = PARAM_META[param];
	const v = meta.integer ? Math.round(value) : value;
	if (param === "palette") {
		const rgb = hueToRgb(v);
		return { palette: v, paletteR: rgb.r, paletteG: rgb.g, paletteB: rgb.b };
	}
	return { [param]: v } as Partial<ControlState>;
}

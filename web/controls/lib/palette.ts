import {
	hueToRgb,
	rgbToHex,
	rgbToHue,
} from "../../../shared/palette-color.ts";
import type { ControlState } from "./types.ts";

export { hexToRgb, hueToRgb, rgbToHex, rgbToHue } from "../../../shared/palette-color.ts";

export function syncPaletteFromHue(target: Pick<
	ControlState,
	"palette" | "paletteR" | "paletteG" | "paletteB"
>) {
	const rgb = hueToRgb(target.palette);
	target.paletteR = rgb.r;
	target.paletteG = rgb.g;
	target.paletteB = rgb.b;
}

export function syncPaletteFromRgb(target: Pick<
	ControlState,
	"palette" | "paletteR" | "paletteG" | "paletteB"
>) {
	target.palette = rgbToHue(target.paletteR, target.paletteG, target.paletteB);
}

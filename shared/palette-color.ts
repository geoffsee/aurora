/** Default duotone base: steel blue — avoids the old red/yellow hue-slider start. */
export const DEFAULT_PALETTE_RGB = {
	r: 61 / 255,
	g: 90 / 255,
	b: 128 / 255,
} as const;

/** Hue (0..1) → RGB with pleasant fixed saturation/lightness for legacy presets/VST. */
export function hueToRgb(
	hue: number,
	saturation = 0.72,
	lightness = 0.52,
): { r: number; g: number; b: number } {
	const h = ((hue % 1) + 1) % 1;
	const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
	const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
	const m = lightness - c / 2;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 1 / 6) {
		r = c;
		g = x;
	} else if (h < 2 / 6) {
		r = x;
		g = c;
	} else if (h < 3 / 6) {
		g = c;
		b = x;
	} else if (h < 4 / 6) {
		g = x;
		b = c;
	} else if (h < 5 / 6) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return { r: r + m, g: g + m, b: b + m };
}

export function rgbToHue(r: number, g: number, b: number): number {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const delta = max - min;
	if (delta < 1e-6) return 0;
	let hue = 0;
	if (max === r) hue = ((g - b) / delta) % 6;
	else if (max === g) hue = (b - r) / delta + 2;
	else hue = (r - g) / delta + 4;
	return (((hue / 6) % 1) + 1) % 1;
}

export function clamp01(value: unknown, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

export function rgbToHex(r: number, g: number, b: number): string {
	const toByte = (v: number) =>
		Math.round(Math.max(0, Math.min(1, v)) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
	if (!match?.[1]) return null;
	const n = Number.parseInt(match[1], 16);
	return {
		r: ((n >> 16) & 0xff) / 255,
		g: ((n >> 8) & 0xff) / 255,
		b: (n & 0xff) / 255,
	};
}

export type PaletteRgb = { r: number; g: number; b: number };

/** Resolve RGB + legacy hue from a partial control-state patch. */
export function resolvePaletteColor(
	source: {
		palette?: unknown;
		paletteR?: unknown;
		paletteG?: unknown;
		paletteB?: unknown;
	},
	defaults: PaletteRgb & { palette: number },
): PaletteRgb & { palette: number } {
	const hasRgb =
		source.paletteR !== undefined ||
		source.paletteG !== undefined ||
		source.paletteB !== undefined;
	if (hasRgb) {
		const r = clamp01(source.paletteR, defaults.r);
		const g = clamp01(source.paletteG, defaults.g);
		const b = clamp01(source.paletteB, defaults.b);
		return { r, g, b, palette: rgbToHue(r, g, b) };
	}
	const palette = clamp01(source.palette, defaults.palette);
	const rgb = hueToRgb(palette);
	return { ...rgb, palette };
}

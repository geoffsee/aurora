// CPU reference port of the WGSL fragment shaders in assets/shaders/.
//
// `bun run test` has no GPU (vitest + happy-dom), so the shader visual
// regression harness evaluates this port per pixel instead of a WebGPU pass.
// The math here must mirror the WGSL sources line for line — the harness
// hash-guards the .wgsl files so any shader edit fails the suite until this
// port and the committed baselines are re-synced intentionally.
// Workflow: docs/shader-regression-harness.md

const TAU = 6.283185307179586;

export type ShaderName = "vj_palette" | "vj_grid";

export type ShaderUniforms = {
	/** x = hue_shift (0..1), y = show_time (s), z/w unused. */
	params: readonly [number, number, number, number];
	/** x = saturation (0..1), y = brightness (0..1), z = pulse (0..1), w unused. */
	paletteExtra: readonly [number, number, number, number];
	/** x = energy (-1.0 = OSC inactive), y = bass, z = mid, w = high (0..1 when active). */
	audioUniforms: readonly [number, number, number, number];
};

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

function fract(x: number): number {
	return x - Math.floor(x);
}

function clamp(x: number, lo: number, hi: number): number {
	return Math.min(Math.max(x, lo), hi);
}

function mix(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function smoothstep(e0: number, e1: number, x: number): number {
	const t = clamp((x - e0) / (e1 - e0), 0, 1);
	return t * t * (3 - 2 * t);
}

function hueToRgb(hue: number): Rgb {
	const h = fract(hue);
	return [
		clamp(Math.abs(h * 6 - 3) - 1, 0, 1),
		clamp(2 - Math.abs(h * 6 - 2), 0, 1),
		clamp(2 - Math.abs(h * 6 - 4), 0, 1),
	];
}

function vjPalette(
	selector: number,
	phase: number,
	saturation: number,
	value: number,
): Rgb {
	const local = fract(phase) - 0.5;
	const [r, g, b] = hueToRgb(selector + local * 0.11);
	const grayscale = r * 0.299 + g * 0.587 + b * 0.114;
	return [
		mix(grayscale, r, saturation) * value,
		mix(grayscale, g, saturation) * value,
		mix(grayscale, b, saturation) * value,
	];
}

function audioCurve(x: number): number {
	return 1 - Math.exp(-3 * x);
}

function hash21(x: number, y: number): number {
	return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}

function noise(x: number, y: number): number {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;
	const a = hash21(ix, iy);
	const b = hash21(ix + 1, iy);
	const c = hash21(ix, iy + 1);
	const d = hash21(ix + 1, iy + 1);
	const ux = fx * fx * (3 - 2 * fx);
	const uy = fy * fy * (3 - 2 * fy);
	return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

function fbm(x: number, y: number): number {
	let value = 0;
	let amp = 0.5;
	let freq = 1;
	for (let i = 0; i < 4; i += 1) {
		value += noise(x * freq, y * freq) * amp;
		freq *= 1.8;
		amp *= 0.5;
	}
	return value;
}

function geometryField(
	ux: number,
	uy: number,
	time: number,
	hueShift: number,
	pulse: number,
	energy: number,
	bass: number,
	mid: number,
	high: number,
	sat: number,
	bri: number,
): Rgba {
	const radius = Math.hypot(ux, uy);
	const angle = Math.atan2(uy, ux);

	const grain = noise(ux * 4 + time * 0.22, uy * 4 + energy * 1.3);
	const drift = fbm(ux * 2.2 + grain, uy * 2.2 + pulse * 1.5);

	const spokeCount = 18 + Math.floor(drift * 8);
	const spoke =
		1 -
		smoothstep(
			0,
			0.055 + 0.015 * mid,
			Math.abs(
				fract((angle / TAU) * spokeCount + time * 0.08 + grain * 0.4) - 0.5,
			) * 2,
		);

	const ringWave = fract(
		radius * (16 + high * 12) + time * (0.22 + bass * 0.18) + grain,
	);
	const ring =
		1 - smoothstep(0, 0.16 - 0.06 * bass, Math.abs(ringWave - 0.5) * 2);

	const latticeScale = 8 + mid * 6 + bass * 2;
	const latticeGridX = Math.abs(fract(ux * latticeScale) - 0.5);
	const latticeGridY = Math.abs(fract(uy * latticeScale) - 0.5);
	const lattice =
		1 -
		smoothstep(
			0,
			0.06 + 0.02 * (1 - mid),
			Math.min(latticeGridX, latticeGridY),
		);

	const core = Math.exp(-((radius * 2.2) ** 2)) * (0.9 + 0.1 * pulse);
	const pulseWave =
		1 + 0.45 * Math.sin(time * 1.3 + ringWave * 6.28318 + pulse * 5);
	const geometry = Math.max(
		spoke,
		Math.max(ring * (0.75 + 0.25 * energy), lattice * (0.35 + 0.35 * high)) *
			0.75,
	);
	const layer = geometry * pulseWave;
	const enabled = energy < 0 ? 0 : 1;

	const vignette = 1 - smoothstep(0.2, 1, radius);
	const lineGlow = 0.12 * (1 - clamp(radius, 0, 1)) ** 2.8;

	const huePhase =
		(angle / TAU) * 0.42 + radius * 0.52 + time * 0.03 + 0.21 * drift;
	const base = vjPalette(hueShift, huePhase, 0.62 * sat, 0.82 * bri);
	const accent = vjPalette(
		hueShift,
		huePhase + 0.33 + 0.45 * grain,
		0.74 * sat,
		bri,
	);
	const fillT = 0.38 + 0.35 * energy;
	const layerGain = clamp(0.32 + layer, 0, 1);
	const coreGlow = core * 0.45;
	const r = mix(base[0], accent[0], fillT) * layerGain + lineGlow * accent[0] + coreGlow;
	const g = mix(base[1], accent[1], fillT) * layerGain + lineGlow * accent[1] + coreGlow;
	const b = mix(base[2], accent[2], fillT) * layerGain + lineGlow * accent[2] + coreGlow;
	const alpha = clamp(
		(layer + core + pulse * 0.4 + 0.5 * lineGlow) *
			(0.35 + 0.65 * layer) *
			vignette *
			enabled,
		0,
		1,
	);

	return [r * enabled, g * enabled, b * enabled, alpha];
}

function vjPaletteFragment(
	u: ShaderUniforms,
	uvX: number,
	uvY: number,
): Rgba {
	const ux = (uvX - 0.5) * 2;
	const uy = (uvY - 0.5) * 2;

	// audio_uniforms.x < 0.0 means OSC is not connected; preserve the -1.0 sentinel.
	const inactive = u.audioUniforms[0] < 0;
	const energy = inactive ? -1 : audioCurve(u.audioUniforms[0]);
	const bass = inactive ? 0 : audioCurve(u.audioUniforms[1]);
	const mid = inactive ? 0 : audioCurve(u.audioUniforms[2]);
	const high = inactive ? 0 : audioCurve(u.audioUniforms[3]);
	const pulse = inactive ? 0 : audioCurve(u.paletteExtra[2]);

	const sat = clamp(u.paletteExtra[0], 0, 1);
	const bri = clamp(u.paletteExtra[1], 0, 1);

	return geometryField(
		ux,
		uy,
		u.params[1],
		u.params[0],
		pulse,
		energy,
		bass,
		mid,
		high,
		sat,
		bri,
	);
}

function vjGridFragment(u: ShaderUniforms, uvX: number, uvY: number): Rgba {
	const ux = (uvX - 0.5) * 2;
	const uy = (uvY - 0.5) * 2;
	const time = u.params[1];
	const hueShift = u.params[0];
	const pulse = u.paletteExtra[2];
	const [energy, bass, mid, high] = u.audioUniforms;

	// Inactive when OSC is not delivering audio (energy sentinel -1.0)
	const enabled = energy < 0 ? 0 : 1;

	const cols = 8 + Math.floor(bass * 8);
	const rows = 6 + Math.floor(mid * 6);

	const cellX = ux * cols * 0.5 + cols * 0.5;
	const cellY = uy * rows * 0.5 + rows * 0.5;
	const cellIdX = Math.floor(cellX);
	const cellIdY = Math.floor(cellY);
	const cellUvX = fract(cellX) - 0.5;
	const cellUvY = fract(cellY) - 0.5;

	const tileSeed = cellIdX * 1.618 + cellIdY * 2.414;
	const tilePhase = Math.sin(tileSeed + time * 1.1 + pulse * 4);
	const tileBeat = Math.sin(tileSeed * 0.5 + time * 2.6 + bass * 5);

	const diamondR = 0.28 + high * 0.14 + pulse * 0.08;
	const diamond =
		1 -
		smoothstep(
			diamondR - 0.03,
			diamondR + 0.03,
			Math.abs(cellUvX) + Math.abs(cellUvY),
		);

	const lineW = 0.04 + mid * 0.04;
	const crossH = 1 - smoothstep(lineW, lineW + 0.03, Math.abs(cellUvY));
	const crossV = 1 - smoothstep(lineW, lineW + 0.03, Math.abs(cellUvX));
	const cross = Math.max(crossH, crossV);

	const shape = Math.max(
		diamond * clamp(0.5 + 0.5 * tilePhase, 0, 1),
		cross * clamp(0.25 + 0.35 * tileBeat, 0, 1),
	);

	const huePhase =
		((cellIdX + cellIdY) / (cols + rows)) * 0.5 +
		time * 0.04 +
		tilePhase * 0.1;
	const sat = clamp(u.paletteExtra[0], 0, 1);
	const bri = clamp(u.paletteExtra[1], 0, 1);
	const [r, g, b] = vjPalette(hueShift, huePhase, 0.72 * sat, bri);

	const vignette = 1 - smoothstep(0.55, 1, Math.hypot(ux, uy) * 0.75);
	const alpha = clamp(shape * (0.55 + 0.45 * pulse) * vignette * enabled, 0, 1);

	return [r * shape, g * shape, b * shape, alpha];
}

/** Renders one frame headlessly and returns tightly-packed RGBA8 pixels. */
export function renderShader(
	shader: ShaderName,
	width: number,
	height: number,
	uniforms: ShaderUniforms,
): Uint8Array {
	const fragment = shader === "vj_palette" ? vjPaletteFragment : vjGridFragment;
	const out = new Uint8Array(width * height * 4);
	let o = 0;
	for (let y = 0; y < height; y += 1) {
		const uvY = (y + 0.5) / height;
		for (let x = 0; x < width; x += 1) {
			const uvX = (x + 0.5) / width;
			const [r, g, b, a] = fragment(uniforms, uvX, uvY);
			out[o] = Math.round(clamp(r, 0, 1) * 255);
			out[o + 1] = Math.round(clamp(g, 0, 1) * 255);
			out[o + 2] = Math.round(clamp(b, 0, 1) * 255);
			out[o + 3] = Math.round(clamp(a, 0, 1) * 255);
			o += 4;
		}
	}
	return out;
}

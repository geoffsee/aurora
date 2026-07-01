// Deterministic CPU software renderer for the shader visual-regression harness.
//
// The live visuals run in Bevy/WASM on the GPU and cannot execute under vitest's
// happy-dom environment, so this module reimplements a small set of representative
// shaders on the CPU. Each shader follows Shadertoy's `mainImage` convention
// (fragColor out, fragCoord in pixels, bottom-up Y) so a Shadertoy-style archetype
// can sit alongside the procedural archetypes the app ships. This snapshots the
// rendered output only; it does not run the real import/transform pipeline
// (shadertoy-import.ts) or the GPU WGSL, which share no code with these CPU stand-ins.
//
// The renderer is fully deterministic: fixed iTime, fixed resolution, pure math.
// That determinism is what lets us snapshot the output to PNG baselines and fail
// the build when a shader or the renderer drifts.
//
// PNG encode/decode is hand-rolled (8-bit RGB, filter 0) on top of node:zlib so
// the harness has no new third-party dependency.

import { deflateSync, inflateSync } from "node:zlib";

export type ShaderCtx = {
	iTime: number;
	iResolutionX: number;
	iResolutionY: number;
};

export type Rgb = [number, number, number];

// A shader maps a pixel (Shadertoy fragCoord, bottom-up) to an RGB color in 0..1.
export type Shader = {
	name: string;
	// True for shaders modelled on a Shadertoy-style `mainImage` body rather than
	// an app-native archetype. This is a CPU reimplementation of the output shape
	// only — it is NOT produced by the real import pipeline (shadertoy-import.ts),
	// so a regression in that pipeline won't move this shader's baseline. The
	// harness merely asserts such an archetype's rendered output is snapshotted.
	shadertoyStyle: boolean;
	mainImage: (fragX: number, fragY: number, ctx: ShaderCtx) => Rgb;
};

// --- tiny GLSL-ish helpers -------------------------------------------------

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const fract = (x: number): number => x - Math.floor(x);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
	const t = clamp01((x - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
};

// Inigo Quilez cosine palette — the colour engine behind the app's vj_palette look.
const palette = (t: number): Rgb => {
	const tau = Math.PI * 2;
	return [
		clamp01(0.5 + 0.5 * Math.cos(tau * (1.0 * t + 0.0))),
		clamp01(0.5 + 0.5 * Math.cos(tau * (1.0 * t + 0.33))),
		clamp01(0.5 + 0.5 * Math.cos(tau * (1.0 * t + 0.67))),
	];
};

// --- representative shaders ------------------------------------------------

// Horizontal cosine-palette sweep — the baseline procedural background.
const paletteGradient: Shader = {
	name: "palette-gradient",
	shadertoyStyle: false,
	mainImage: (fragX, _fragY, ctx) => {
		const u = fragX / ctx.iResolutionX;
		return palette(u + ctx.iTime * 0.05);
	},
};

// Radial rays around the centre — the "central beam burst" the projector shows.
const beamBurst: Shader = {
	name: "beam-burst",
	shadertoyStyle: false,
	mainImage: (fragX, fragY, ctx) => {
		const cx = ctx.iResolutionX * 0.5;
		const cy = ctx.iResolutionY * 0.5;
		const dx = fragX - cx;
		const dy = fragY - cy;
		const r = Math.hypot(dx, dy) / (ctx.iResolutionY * 0.5);
		const angle = Math.atan2(dy, dx);
		const rays = 0.5 + 0.5 * Math.cos(angle * 12 + ctx.iTime);
		const falloff = smoothstep(1.0, 0.0, r);
		const intensity = clamp01(rays * falloff + falloff * 0.2);
		const col = palette(0.6 + r * 0.3);
		return [col[0] * intensity, col[1] * intensity, col[2] * intensity];
	},
};

// Grid of tiles, each tinted by its cell — the procedural tile field.
const tileGrid: Shader = {
	name: "tile-grid",
	shadertoyStyle: false,
	mainImage: (fragX, fragY, ctx) => {
		const cols = 8;
		const rows = Math.max(
			1,
			Math.round((cols * ctx.iResolutionY) / ctx.iResolutionX),
		);
		const gx = Math.floor((fragX / ctx.iResolutionX) * cols);
		const gy = Math.floor((fragY / ctx.iResolutionY) * rows);
		const fx = fract((fragX / ctx.iResolutionX) * cols);
		const fy = fract((fragY / ctx.iResolutionY) * rows);
		const gap = 0.08;
		const inside =
			smoothstep(0, gap, fx) *
			smoothstep(0, gap, 1 - fx) *
			smoothstep(0, gap, fy) *
			smoothstep(0, gap, 1 - fy);
		const cell = (gx * 7 + gy * 13) / (cols * rows);
		const col = palette(cell + ctx.iTime * 0.1);
		return [col[0] * inside, col[1] * inside, col[2] * inside];
	},
};

// Shadertoy-style archetype: a classic additive-sine plasma whose math mirrors a
// GLSL `mainImage` body verbatim. It models the *output* of a typical Shadertoy
// import; it does not run through the real import/transform pipeline, so it only
// guards the rendered look of this archetype, not that pipeline's correctness.
const shadertoyPlasma: Shader = {
	name: "shadertoy-plasma",
	shadertoyStyle: true,
	mainImage: (fragX, fragY, ctx) => {
		// vec2 uv = fragCoord / iResolution.xy;
		const uvx = fragX / ctx.iResolutionX;
		const uvy = fragY / ctx.iResolutionY;
		const t = ctx.iTime;
		// float v = sin(uv.x*10. + t) + sin(uv.y*10. + t)
		//         + sin((uv.x+uv.y)*10. + t)
		//         + sin(length(uv-0.5)*20. - t);
		const v =
			Math.sin(uvx * 10 + t) +
			Math.sin(uvy * 10 + t) +
			Math.sin((uvx + uvy) * 10 + t) +
			Math.sin(Math.hypot(uvx - 0.5, uvy - 0.5) * 20 - t);
		// vec3 col = 0.5 + 0.5*cos(vec3(0,2,4) + v);
		return [
			clamp01(0.5 + 0.5 * Math.cos(0 + v)),
			clamp01(0.5 + 0.5 * Math.cos(2 + v)),
			clamp01(0.5 + 0.5 * Math.cos(4 + v)),
		];
	},
};

export const SHADERS: readonly Shader[] = [
	paletteGradient,
	beamBurst,
	tileGrid,
	shadertoyPlasma,
];

// Compact 16:9 framebuffer — large enough to catch structural drift, small
// enough that baselines stay tiny in the repo.
export const RENDER_WIDTH = 96;
export const RENDER_HEIGHT = 54;
// Fixed time so renders are reproducible across runs and machines.
export const RENDER_TIME = 12.0;

export type Framebuffer = {
	width: number;
	height: number;
	// Row-major, top-to-bottom, RGB (3 bytes/pixel).
	rgb: Uint8Array;
};

export const renderShader = (
	shader: Shader,
	width = RENDER_WIDTH,
	height = RENDER_HEIGHT,
	time = RENDER_TIME,
): Framebuffer => {
	const rgb = new Uint8Array(width * height * 3);
	const ctx: ShaderCtx = {
		iTime: time,
		iResolutionX: width,
		iResolutionY: height,
	};
	for (let row = 0; row < height; row++) {
		// PNG rows run top-to-bottom; Shadertoy fragCoord.y runs bottom-up.
		const fragY = height - 0.5 - row;
		for (let col = 0; col < width; col++) {
			const fragX = col + 0.5;
			const c = shader.mainImage(fragX, fragY, ctx);
			const o = (row * width + col) * 3;
			rgb[o] = Math.round(clamp01(c[0]) * 255);
			rgb[o + 1] = Math.round(clamp01(c[1]) * 255);
			rgb[o + 2] = Math.round(clamp01(c[2]) * 255);
		}
	}
	return { width, height, rgb };
};

// --- minimal PNG codec (8-bit RGB, filter 0) -------------------------------

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

const crc32 = (bytes: Uint8Array): number => {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Uint8Array => {
	const typeBytes = Uint8Array.from(
		[0, 1, 2, 3].map((i) => type.charCodeAt(i)),
	);
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	out.set(typeBytes, 4);
	out.set(data, 8);
	const crcInput = new Uint8Array(typeBytes.length + data.length);
	crcInput.set(typeBytes, 0);
	crcInput.set(data, typeBytes.length);
	view.setUint32(8 + data.length, crc32(crcInput));
	return out;
};

export const encodePng = (fb: Framebuffer): Uint8Array => {
	const ihdr = new Uint8Array(13);
	const ihdrView = new DataView(ihdr.buffer);
	ihdrView.setUint32(0, fb.width);
	ihdrView.setUint32(4, fb.height);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour RGB
	ihdr[10] = 0; // compression
	ihdr[11] = 0; // filter
	ihdr[12] = 0; // interlace

	// Prefix each scanline with filter byte 0 (None).
	const stride = fb.width * 3;
	const raw = new Uint8Array(fb.height * (stride + 1));
	for (let row = 0; row < fb.height; row++) {
		raw[row * (stride + 1)] = 0;
		raw.set(
			fb.rgb.subarray(row * stride, (row + 1) * stride),
			row * (stride + 1) + 1,
		);
	}
	const idat = new Uint8Array(deflateSync(raw));

	const parts = [
		PNG_SIGNATURE,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", new Uint8Array(0)),
	];
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
};

export const decodePng = (bytes: Uint8Array): Framebuffer => {
	for (let i = 0; i < PNG_SIGNATURE.length; i++) {
		if (bytes[i] !== PNG_SIGNATURE[i]) {
			throw new Error("Not a PNG (bad signature)");
		}
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 8;
	let width = 0;
	let height = 0;
	const idatParts: Uint8Array[] = [];
	while (offset < bytes.length) {
		const length = view.getUint32(offset);
		const type = String.fromCharCode(
			bytes[offset + 4]!,
			bytes[offset + 5]!,
			bytes[offset + 6]!,
			bytes[offset + 7]!,
		);
		const dataStart = offset + 8;
		if (type === "IHDR") {
			width = view.getUint32(dataStart);
			height = view.getUint32(dataStart + 4);
			if (bytes[dataStart + 8] !== 8 || bytes[dataStart + 9] !== 2) {
				throw new Error("Unsupported PNG (expected 8-bit RGB)");
			}
		} else if (type === "IDAT") {
			idatParts.push(bytes.subarray(dataStart, dataStart + length));
		} else if (type === "IEND") {
			break;
		}
		offset = dataStart + length + 4; // skip data + CRC
	}

	const compressed = new Uint8Array(
		idatParts.reduce((n, p) => n + p.length, 0),
	);
	let cOffset = 0;
	for (const p of idatParts) {
		compressed.set(p, cOffset);
		cOffset += p.length;
	}
	const raw = new Uint8Array(inflateSync(compressed));

	const stride = width * 3;
	const rgb = new Uint8Array(width * height * 3);
	for (let row = 0; row < height; row++) {
		const filter = raw[row * (stride + 1)];
		if (filter !== 0) {
			throw new Error(`Unsupported PNG filter ${filter} (expected 0)`);
		}
		rgb.set(
			raw.subarray(row * (stride + 1) + 1, row * (stride + 1) + 1 + stride),
			row * stride,
		);
	}
	return { width, height, rgb };
};

export type DiffResult = {
	matched: boolean;
	// Number of pixels whose max per-channel delta exceeds the tolerance.
	driftedPixels: number;
	totalPixels: number;
	maxChannelDelta: number;
};

// Per-channel delta below this is treated as identical, absorbing tiny
// cross-platform float rounding without masking real regressions.
export const CHANNEL_TOLERANCE = 4;

export const diffFramebuffers = (
	a: Framebuffer,
	b: Framebuffer,
	channelTolerance = CHANNEL_TOLERANCE,
): DiffResult => {
	if (a.width !== b.width || a.height !== b.height) {
		return {
			matched: false,
			driftedPixels: Math.max(a.width * a.height, b.width * b.height),
			totalPixels: a.width * a.height,
			maxChannelDelta: 255,
		};
	}
	const totalPixels = a.width * a.height;
	let driftedPixels = 0;
	let maxChannelDelta = 0;
	for (let p = 0; p < totalPixels; p++) {
		const o = p * 3;
		const d0 = Math.abs(a.rgb[o]! - b.rgb[o]!);
		const d1 = Math.abs(a.rgb[o + 1]! - b.rgb[o + 1]!);
		const d2 = Math.abs(a.rgb[o + 2]! - b.rgb[o + 2]!);
		const d = Math.max(d0, d1, d2);
		if (d > maxChannelDelta) maxChannelDelta = d;
		if (d > channelTolerance) driftedPixels++;
	}
	return {
		matched: driftedPixels === 0,
		driftedPixels,
		totalPixels,
		maxChannelDelta,
	};
};

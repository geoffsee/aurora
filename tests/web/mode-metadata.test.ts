import { expect, test } from "vitest";
import {
	MAX_GPU_SHADER_INDEX,
	SHADER_OPTIONS,
	VISUAL_MODES,
} from "../../web/controls/lib/constants.ts";
import { PARAM_META } from "../../web/controls/lib/param-meta.ts";
import {
	MAX_SHADER_INDEX,
	normalizeOutputRoute,
} from "../../shared/output-routing.ts";

test("deck mode metadata exposes the full CPU mode range", () => {
	expect(VISUAL_MODES).toEqual([
		"Beams",
		"Tunnel",
		"Burst",
		"Mirror",
		"Wash",
		"Strobe",
		"Swarm",
		"Orbit",
		"Pulse",
		"Spiral",
		"Ripple",
		"Shatter",
		"Flux",
		"Lattice",
		"Drift",
		"Storm",
		"Echo",
		"Vortex",
		"Fracture",
		"Nebula",
		"Prism",
		"Scanner",
		"Comet",
		"Bloom",
	]);
	expect(PARAM_META.deckAMode.max).toBe(VISUAL_MODES.length - 1);
	expect(PARAM_META.deckBMode.max).toBe(VISUAL_MODES.length - 1);
	expect(PARAM_META.deckAMode.format(23)).toBe("Bloom");
	expect(PARAM_META.deckBMode.format(20)).toBe("Prism");
});

test("GPU shader metadata exposes the full shader range", () => {
	expect(SHADER_OPTIONS).toHaveLength(34);
	expect(SHADER_OPTIONS.slice(26)).toEqual([
		"Aurora Curtains",
		"Bass Monolith",
		"Prism Tunnel",
		"Data Rain",
		"Solar Flare",
		"Topo Lines",
		"Glass Ribbons",
		"Gummy Wire Bear",
	]);
	expect(MAX_GPU_SHADER_INDEX).toBe(SHADER_OPTIONS.length - 1);
	expect(MAX_SHADER_INDEX).toBe(SHADER_OPTIONS.length - 1);
	expect(normalizeOutputRoute({ id: "left", activeShader: 99 })?.activeShader).toBe(
		MAX_GPU_SHADER_INDEX,
	);
});

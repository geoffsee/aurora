import { expect, test } from "vitest";
import { SHADER_OPTIONS } from "../../web/controls/lib/constants.ts";
import {
	DEFAULT_DECK_A_GPU_SHADER_UI_INDEX,
	DEFAULT_DECK_B_GPU_SHADER_UI_INDEX,
	GPU_SHADER_GRID_UI_INDEX,
	GPU_SHADER_IMPORTED_UI_INDEX,
	GPU_SHADER_TOPO_LINES_UI_INDEX,
	paletteVariantFromUiIndex,
	resolveGpuShaderRoute,
} from "../../shared/gpu-shader-routing.ts";

test("SHADER_OPTIONS keeps Shadertoy first and borealis dual-deck defaults", () => {
	expect(SHADER_OPTIONS[GPU_SHADER_IMPORTED_UI_INDEX]).toBe("Imported (Shadertoy)");
	expect(SHADER_OPTIONS[DEFAULT_DECK_A_GPU_SHADER_UI_INDEX]).toBe("Aurora Curtains");
	expect(SHADER_OPTIONS[DEFAULT_DECK_B_GPU_SHADER_UI_INDEX]).toBe("Aurora Crown");
	expect(SHADER_OPTIONS[GPU_SHADER_GRID_UI_INDEX]).toBe("Grid");
	expect(SHADER_OPTIONS[GPU_SHADER_TOPO_LINES_UI_INDEX]).toBe("Topo Lines");
	expect(SHADER_OPTIONS[36]).toBe("Aurora Crown");
});

test("paletteVariantFromUiIndex maps UI indices to legacy palette ids", () => {
	expect(paletteVariantFromUiIndex(GPU_SHADER_IMPORTED_UI_INDEX)).toBe(0);
	expect(paletteVariantFromUiIndex(1)).toBe(0);
	expect(paletteVariantFromUiIndex(4)).toBe(3);
	expect(paletteVariantFromUiIndex(6)).toBe(5);
	expect(paletteVariantFromUiIndex(9)).toBe(8);
	expect(paletteVariantFromUiIndex(10)).toBe(10);
	expect(paletteVariantFromUiIndex(31)).toBe(31);
	expect(paletteVariantFromUiIndex(DEFAULT_DECK_A_GPU_SHADER_UI_INDEX)).toBe(26);
	expect(paletteVariantFromUiIndex(DEFAULT_DECK_B_GPU_SHADER_UI_INDEX)).toBe(36);
});

test("resolveGpuShaderRoute selects grid/imported quads at their UI slots", () => {
	expect(resolveGpuShaderRoute(GPU_SHADER_IMPORTED_UI_INDEX)).toEqual({
		quad: "imported",
		paletteVariant: 0,
	});
	expect(resolveGpuShaderRoute(GPU_SHADER_GRID_UI_INDEX)).toEqual({
		quad: "grid",
		paletteVariant: 0,
	});
	expect(resolveGpuShaderRoute(DEFAULT_DECK_A_GPU_SHADER_UI_INDEX)).toEqual({
		quad: "palette",
		paletteVariant: 26,
	});
	expect(resolveGpuShaderRoute(DEFAULT_DECK_B_GPU_SHADER_UI_INDEX)).toEqual({
		quad: "palette",
		paletteVariant: 36,
	});
});

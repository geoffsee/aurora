/**
 * Maps GPU shader picker indices (SHADER_OPTIONS order in the controls UI) to
 * renderer routing. Shadertoy was prepended at index 0; palette variant ids in
 * WGSL stayed on their original numbering (with grid/imported occupying UI slots).
 */

/** UI picker index for the Shadertoy imported slot. */
export const GPU_SHADER_IMPORTED_UI_INDEX = 0;

/** UI picker index for the grid material slot. */
export const GPU_SHADER_GRID_UI_INDEX = 5;

/** UI picker index for Topo Lines (solo GPU path hides CPU geometry). */
export const GPU_SHADER_TOPO_LINES_UI_INDEX = 31;

/** Default deck-A shader: Ring (palette variant 0). */
export const DEFAULT_DECK_A_GPU_SHADER_UI_INDEX = 1;

/** Default deck-B shader: Tunnel (palette variant 5). */
export const DEFAULT_DECK_B_GPU_SHADER_UI_INDEX = 6;

/** Map control-state picker index → palette shader `params.z` variant id. */
export function paletteVariantFromUiIndex(ui: number): number {
	const idx = Math.floor(ui);
	if (idx === GPU_SHADER_IMPORTED_UI_INDEX) {
		return 0;
	}
	if (idx >= 10) {
		return idx;
	}
	return idx - 1;
}

export type GpuShaderQuad = "palette" | "grid" | "imported";

export function resolveGpuShaderRoute(ui: number): {
	quad: GpuShaderQuad;
	paletteVariant: number;
} {
	const idx = Math.floor(ui);
	if (idx === GPU_SHADER_IMPORTED_UI_INDEX) {
		return { quad: "imported", paletteVariant: 0 };
	}
	if (idx === GPU_SHADER_GRID_UI_INDEX) {
		return { quad: "grid", paletteVariant: 0 };
	}
	return {
		quad: "palette",
		paletteVariant: paletteVariantFromUiIndex(idx),
	};
}

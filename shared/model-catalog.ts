/**
 * Catalog of glTF models under models/* that visualizations can bind to.
 * Keep in sync with models/manifest.json and src/model_layer.rs.
 */

export type ModelCatalogEntry = {
	id: string;
	label: string;
	/** Path relative to Bevy assets/ root. */
	assetPath: string;
	scene: number;
	defaultScale: number;
	/** World-space translation applied before audio motion. */
	offset: readonly [number, number, number];
	yawSpeed: number;
	/**
	 * CPU deck visual-mode index that activates this model.
	 * See VISUAL_MODES / VisualMode in the controls + renderer.
	 */
	visualMode: number;
};

export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
	{
		id: "human-female",
		label: "Human Female",
		assetPath:
			"models/human-female/source/74f42c5a92bbb95403c45ff3929560ae.glb",
		scene: 0,
		defaultScale: 1.0,
		offset: [0.0, -1.0, 0.0],
		yawSpeed: 0.35,
		visualMode: 24,
	},
] as const;

export const MODEL_IDS = MODEL_CATALOG.map((m) => m.id);

/** Deck visual-mode index for mesh models (VISUAL_MODES[24] === "Figure"). */
export const FIGURE_VISUAL_MODE = 24;

/** Inclusive max for ControlState.figureModel (catalog index). */
export const MAX_FIGURE_MODEL_INDEX = Math.max(0, MODEL_CATALOG.length - 1);

export function modelById(id: string): ModelCatalogEntry | undefined {
	return MODEL_CATALOG.find((m) => m.id === id);
}

export function modelByVisualMode(mode: number): ModelCatalogEntry | undefined {
	const rounded = Math.round(mode);
	return MODEL_CATALOG.find((m) => m.visualMode === rounded);
}

export function modelByIndex(index: number): ModelCatalogEntry | undefined {
	const i = Math.round(index);
	if (i < 0 || i >= MODEL_CATALOG.length) return undefined;
	return MODEL_CATALOG[i];
}

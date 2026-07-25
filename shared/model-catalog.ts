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

export function modelById(id: string): ModelCatalogEntry | undefined {
	return MODEL_CATALOG.find((m) => m.id === id);
}

export function modelByVisualMode(mode: number): ModelCatalogEntry | undefined {
	const rounded = Math.round(mode);
	return MODEL_CATALOG.find((m) => m.visualMode === rounded);
}

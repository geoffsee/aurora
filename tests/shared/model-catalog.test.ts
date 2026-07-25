import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import {
	MODEL_CATALOG,
	modelById,
	modelByVisualMode,
} from "../../shared/model-catalog.ts";
import { VISUAL_MODES } from "../../web/controls/lib/constants.ts";

test("model catalog registers human-female on Figure mode", () => {
	expect(MODEL_CATALOG.length).toBeGreaterThan(0);
	const human = modelById("human-female");
	expect(human).toBeDefined();
	expect(human?.visualMode).toBe(24);
	expect(VISUAL_MODES[human!.visualMode]).toBe("Figure");
	expect(human?.assetPath.endsWith(".glb")).toBe(true);
	expect(modelByVisualMode(24)?.id).toBe("human-female");
});

test("model catalog stays in sync with models/manifest.json", () => {
	const manifestPath = resolve(process.cwd(), "models/manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
		schemaVersion: number;
		models: Array<{
			id: string;
			assetPath: string;
			visualMode: number;
			defaultScale: number;
		}>;
	};
	expect(manifest.schemaVersion).toBe(1);
	expect(manifest.models).toHaveLength(MODEL_CATALOG.length);
	for (const entry of MODEL_CATALOG) {
		const fromFile = manifest.models.find((m) => m.id === entry.id);
		expect(fromFile, `manifest missing ${entry.id}`).toBeDefined();
		expect(fromFile?.assetPath).toBe(entry.assetPath);
		expect(fromFile?.visualMode).toBe(entry.visualMode);
		expect(fromFile?.defaultScale).toBe(entry.defaultScale);
	}
});

test("every catalog visualMode lands in VISUAL_MODES", () => {
	for (const entry of MODEL_CATALOG) {
		expect(entry.visualMode).toBeGreaterThanOrEqual(0);
		expect(entry.visualMode).toBeLessThan(VISUAL_MODES.length);
		expect(VISUAL_MODES[entry.visualMode]).toBeTruthy();
	}
});

test("figure mode constants match catalog wiring", async () => {
	const { FIGURE_VISUAL_MODE, MAX_FIGURE_MODEL_INDEX, modelByIndex } =
		await import("../../shared/model-catalog.ts");
	expect(FIGURE_VISUAL_MODE).toBe(24);
	expect(VISUAL_MODES[FIGURE_VISUAL_MODE]).toBe("Figure");
	expect(MAX_FIGURE_MODEL_INDEX).toBe(MODEL_CATALOG.length - 1);
	expect(modelByIndex(0)?.id).toBe("human-female");
	expect(modelByIndex(99)).toBeUndefined();
});

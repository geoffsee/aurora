import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import {
	MODEL_CATALOG,
	SHIPPED_MODEL_CATALOG,
	modelById,
	modelByVisualMode,
} from "../../shared/model-catalog.ts";
import { VISUAL_MODES } from "../../web/controls/lib/constants.ts";

test("model catalog default is a shipped Figure-mode entry", () => {
	expect(MODEL_CATALOG.length).toBeGreaterThan(0);
	expect(MODEL_CATALOG[0]?.ship).toBe(true);
	expect(MODEL_CATALOG[0]?.visualMode).toBe(24);
	expect(VISUAL_MODES[MODEL_CATALOG[0]!.visualMode]).toBe("Figure");
	expect(MODEL_CATALOG[0]?.assetPath.endsWith(".glb")).toBe(true);
	// First match for mode 24 is the default web pack entry.
	expect(modelByVisualMode(24)?.id).toBe(MODEL_CATALOG[0]!.id);
});

test("human-female stays local-only", () => {
	const human = modelById("human-female");
	expect(human).toBeDefined();
	expect(human?.ship).toBe(false);
	expect(human?.visualMode).toBe(24);
});

test("web pack is non-empty and every ship entry has a glb path", () => {
	expect(SHIPPED_MODEL_CATALOG.length).toBeGreaterThan(0);
	for (const entry of SHIPPED_MODEL_CATALOG) {
		expect(entry.ship).toBe(true);
		expect(entry.assetPath.endsWith(".glb")).toBe(true);
	}
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
			ship: boolean;
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
		expect(fromFile?.ship).toBe(entry.ship);
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
	expect(modelByIndex(0)?.ship).toBe(true);
	expect(modelByIndex(99)).toBeUndefined();
});

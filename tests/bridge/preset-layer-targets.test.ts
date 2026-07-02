import { describe, expect, test } from "vitest";
import {
	LAYER_WEIGHT_KEYS,
	PRESET_LAYER_MAX,
	type LayerState,
	type PresetLayer,
	applyLayerWeightControl,
	changedLayerWeightIndices,
	createLayerController,
	layerWeightFields,
} from "../../bridge/preset-layers.ts";
import {
	RECORDING_EXCLUDED_FIELDS,
	buildRecording,
	filterAutomationDiff,
} from "../../bridge/automation-player.ts";
import { migrateControlState } from "../../shared/control-state-schema.ts";
import {
	MIDI_CC_INTEGER_PARAMS,
	MIDI_CC_PARAM_LABELS,
} from "../../web/controls/lib/constants.ts";

const layer = (
	name: string,
	state: PresetLayer["state"],
	weight: number,
): PresetLayer => ({ name, state, weight });

// A merge harness that mirrors how bridge/index.ts drives the controller: the
// merged state (recomposited fields plus the weight slots) accumulates into a
// live ControlState-like object.
const makeHarness = (initial: LayerState) => {
	let live: Record<string, number> = { ...initial } as Record<string, number>;
	const controller = createLayerController({
		captureFloor: () => ({ ...live }) as LayerState,
		merge: (state) => {
			live = {
				...live,
				...(state as Record<string, number>),
				...layerWeightFields(controller.stack),
			};
		},
		onFull: () => {},
	});
	return { controller, live: () => live };
};

describe("layerWeightFields", () => {
	test("projects each stack slot's weight and pads absent slots with 0", () => {
		const fields = layerWeightFields([
			layer("a", { intensity: 1 }, 0.4),
			layer("b", { palette: 1 }, 0.9),
		]);
		expect(fields.layerWeight0).toBe(0.4);
		expect(fields.layerWeight1).toBe(0.9);
		for (let i = 2; i < PRESET_LAYER_MAX; i++) {
			expect(fields[`layerWeight${i}`]).toBe(0);
		}
		expect(Object.keys(fields)).toHaveLength(PRESET_LAYER_MAX);
	});

	test("clamps out-of-range and non-finite weights into the unit interval", () => {
		const fields = layerWeightFields([
			layer("a", {}, 2),
			layer("b", {}, Number.NaN),
		]);
		expect(fields.layerWeight0).toBe(1);
		expect(fields.layerWeight1).toBe(0);
	});
});

describe("changedLayerWeightIndices", () => {
	test("reports only the slots whose weight field moved", () => {
		const prev = { layerWeight0: 0.2, layerWeight3: 0.5, intensity: 1 };
		const next = { layerWeight0: 0.7, layerWeight3: 0.5, intensity: 0.4 };
		expect(changedLayerWeightIndices(prev, next)).toEqual([0]);
	});

	test("no layer-weight change yields an empty list", () => {
		expect(
			changedLayerWeightIndices({ crossfade: 0 }, { crossfade: 1 }),
		).toEqual([]);
	});
});

describe("applyLayerWeightControl (external weight edit → recomposite)", () => {
	test("an edited weight slot drives the stack composition", () => {
		const h = makeHarness({ intensity: 0.2 });
		h.controller.add({ name: "a", state: { intensity: 1 }, weight: 1 });
		expect(h.live().intensity).toBeCloseTo(1);
		// The mirror reflects the added layer's weight.
		expect(h.live().layerWeight0).toBe(1);

		// Simulate an automation/OSC/MIDI edit landing on the slot field, then the
		// bridge forwarding it back into the stack.
		const prev = { ...h.live() };
		const next = { ...h.live(), layerWeight0: 0.5 };
		applyLayerWeightControl(h.controller, prev, next);
		// 0.2 + (1 - 0.2) * 0.5 = 0.6
		expect(h.live().intensity).toBeCloseTo(0.6);
		expect(h.live().layerWeight0).toBe(0.5);
	});

	test("dropping the slot to 0 recomposes back to the floor", () => {
		const h = makeHarness({ intensity: 0.2 });
		h.controller.add({ name: "a", state: { intensity: 1 }, weight: 1 });
		applyLayerWeightControl(
			h.controller,
			{ ...h.live() },
			{ ...h.live(), layerWeight0: 0 },
		);
		expect(h.live().intensity).toBeCloseTo(0.2);
	});

	test("editing a slot with no live layer is a no-op reset to 0", () => {
		const h = makeHarness({ intensity: 0.2 });
		h.controller.add({ name: "a", state: { intensity: 1 }, weight: 1 });
		// Slot 4 has no layer behind it.
		applyLayerWeightControl(
			h.controller,
			{ ...h.live() },
			{ ...h.live(), layerWeight4: 0.8 },
		);
		expect(h.live().layerWeight4).toBe(0);
		expect(h.live().intensity).toBeCloseTo(1);
	});
});

describe("automation target", () => {
	test("layer-weight slots are not excluded from recordings", () => {
		for (const key of LAYER_WEIGHT_KEYS) {
			expect(RECORDING_EXCLUDED_FIELDS.has(key)).toBe(false);
		}
	});

	test("a layer-weight change is recorded and survives the diff filter", () => {
		expect(
			filterAutomationDiff({ layerWeight2: 0.6, strobeLockout: true }),
		).toEqual({ layerWeight2: 0.6 });
		const rec = buildRecording(
			[
				{ ts: 0, diff: { layerWeight0: 0.3 } },
				{ ts: 400, diff: { layerWeight0: 0.8 } },
			],
			1,
		);
		expect(rec.frames).toHaveLength(2);
		expect(rec.frames[0]!.diff).toEqual({ layerWeight0: 0.3 });
		expect(rec.frames[1]!.diff).toEqual({ layerWeight0: 0.8 });
	});
});

describe("MIDI target", () => {
	test("every layer-weight slot is a selectable, continuous MIDI CC param", () => {
		for (const key of LAYER_WEIGHT_KEYS) {
			expect(MIDI_CC_PARAM_LABELS[key]).toBeTypeOf("string");
			// Weights are continuous 0..1, never rounded to an integer mode index.
			expect(MIDI_CC_INTEGER_PARAMS.has(key)).toBe(false);
		}
	});
});

describe("schema migration", () => {
	test("v9 state gains zeroed layer-weight slots at v10", () => {
		const result = migrateControlState({
			schemaVersion: 9,
			outputs: [],
		}) as Record<string, unknown>;
		expect(result.schemaVersion).toBe(10);
		for (const key of LAYER_WEIGHT_KEYS) {
			expect(result[key]).toBe(0);
		}
	});
});

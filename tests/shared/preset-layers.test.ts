import { describe, expect, test } from "vitest";
import {
	LAYER_KEYS,
	type LayerState,
	PRESET_LAYER_MAX,
	type PresetLayer,
	addLayer,
	clampLayerWeight,
	composeLayers,
	createLayerController,
	moveLayer,
	pickLayerState,
	removeLayerAt,
	setLayerWeightAt,
} from "../../bridge/preset-layers.ts";
import {
	PRESET_LAYER_ADD_ADDRESS,
	PRESET_LAYER_CLEAR_ADDRESS,
	PRESET_LAYER_MOVE_ADDRESS,
	PRESET_LAYER_REMOVE_ADDRESS,
	PRESET_LAYER_WEIGHT_ADDRESS,
	validatePresetLayerOscMsg,
} from "../../shared/osc-validation.ts";

const layer = (
	name: string,
	state: PresetLayer["state"],
	weight: number,
): PresetLayer => ({ name, state, weight });

describe("clampLayerWeight", () => {
	test("clamps into the unit interval", () => {
		expect(clampLayerWeight(-1)).toBe(0);
		expect(clampLayerWeight(0.4)).toBe(0.4);
		expect(clampLayerWeight(2)).toBe(1);
	});
	test("non-finite collapses to 0 (invisible layer)", () => {
		expect(clampLayerWeight(Number.NaN)).toBe(0);
		expect(clampLayerWeight(undefined)).toBe(0);
		expect(clampLayerWeight("nope")).toBe(0);
	});
	test("numeric strings coerce", () => {
		expect(clampLayerWeight("0.75")).toBe(0.75);
	});
});

describe("composeLayers", () => {
	const base = { intensity: 0.2, palette: 0, feedback: 0.5 };

	test("empty stack yields the base values across all layer keys", () => {
		const out = composeLayers(base, []);
		expect(out.intensity).toBeCloseTo(0.2);
		expect(out.palette).toBe(0);
		expect(out.feedback).toBeCloseTo(0.5);
		for (const key of LAYER_KEYS) {
			expect(Number.isFinite(out[key])).toBe(true);
		}
	});

	test("weight 0 layer is invisible — base is preserved", () => {
		const out = composeLayers(base, [layer("a", { intensity: 1 }, 0)]);
		expect(out.intensity).toBeCloseTo(0.2);
	});

	test("weight 1 layer fully replaces the keys it defines, leaves others", () => {
		const out = composeLayers(base, [layer("a", { intensity: 1 }, 1)]);
		expect(out.intensity).toBeCloseTo(1);
		expect(out.feedback).toBeCloseTo(0.5);
	});

	test("partial weight blends over the accumulated result", () => {
		const out = composeLayers(base, [layer("a", { intensity: 1.2 }, 0.5)]);
		// 0.2 + (1.2 - 0.2) * 0.5 = 0.7
		expect(out.intensity).toBeCloseTo(0.7);
	});

	test("stack order matters — the top (last) layer composites over the rest", () => {
		const bottomThenTop = composeLayers(base, [
			layer("bottom", { palette: 0.2 }, 1),
			layer("top", { palette: 0.8 }, 0.5),
		]);
		// bottom sets palette to 0.2, then top blends: 0.2 + (0.8-0.2)*0.5 = 0.5
		expect(bottomThenTop.palette).toBeCloseTo(0.5);

		const swapped = composeLayers(base, [
			layer("top", { palette: 0.8 }, 0.5),
			layer("bottom", { palette: 0.2 }, 1),
		]);
		// order reversed: 0 -> blend to 0.8*0.5=0.4, then bottom weight 1 -> 0.2
		expect(swapped.palette).toBeCloseTo(0.2);
		expect(swapped.palette).not.toBeCloseTo(bottomThenTop.palette);
	});

	test("a key the base omits is established by the first layer that provides it", () => {
		const out = composeLayers({}, [
			layer("a", { depth: 0.6 }, 0.5),
			layer("b", { depth: 1 }, 0.5),
		]);
		// no base -> first layer establishes 0.6, second blends: 0.6+(1-0.6)*0.5=0.8
		expect(out.depth).toBeCloseTo(0.8);
	});

	test("keys neither base nor any layer define collapse to 0", () => {
		const out = composeLayers({}, [layer("a", { intensity: 1 }, 1)]);
		expect(out.palette).toBe(0);
	});

	test("composition is non-destructive: base and layer state are not mutated", () => {
		const baseSnapshot = { ...base };
		const l = layer("a", { intensity: 1 }, 0.5);
		const stateSnapshot = { ...l.state };
		composeLayers(base, [l]);
		expect(base).toEqual(baseSnapshot);
		expect(l.state).toEqual(stateSnapshot);
	});

	test("removing a layer reproduces the composition as if it were never added", () => {
		const before = composeLayers(base, [layer("a", { intensity: 0.9 }, 0.5)]);
		const stack = addLayer(
			[layer("a", { intensity: 0.9 }, 0.5)],
			layer("b", { intensity: 0.1 }, 0.8),
		);
		const after = composeLayers(base, removeLayerAt(stack, 1));
		expect(after.intensity).toBeCloseTo(before.intensity);
	});
});

describe("stack operations are pure", () => {
	const stack = [
		layer("a", { intensity: 1 }, 0.5),
		layer("b", { palette: 1 }, 1),
	];

	test("addLayer appends without mutating and clamps weight", () => {
		const next = addLayer(stack, layer("c", { depth: 1 }, 5));
		expect(next).toHaveLength(3);
		expect(next[2]?.weight).toBe(1);
		expect(stack).toHaveLength(2);
	});

	test("removeLayerAt drops by index; out-of-range is a no-op copy", () => {
		expect(removeLayerAt(stack, 0)).toHaveLength(1);
		expect(removeLayerAt(stack, 9)).toEqual(stack);
		expect(removeLayerAt(stack, 9)).not.toBe(stack);
	});

	test("setLayerWeightAt updates one layer, clamps, leaves others", () => {
		const next = setLayerWeightAt(stack, 0, 2);
		expect(next[0]?.weight).toBe(1);
		expect(next[1]?.weight).toBe(stack[1]?.weight);
		expect(stack[0]?.weight).toBe(0.5);
	});

	test("moveLayer reorders; invalid indices leave order unchanged", () => {
		const moved = moveLayer(stack, 0, 1);
		expect(moved[0]?.name).toBe("b");
		expect(moved[1]?.name).toBe("a");
		expect(moveLayer(stack, 0, 9)).toEqual(stack);
		expect(moveLayer(stack, 0, 0)).toEqual(stack);
	});
});

describe("pickLayerState", () => {
	test("keeps only finite layer keys, drops discrete/foreign fields", () => {
		const picked = pickLayerState({
			intensity: 0.5,
			palette: 0.2,
			deckAMode: 3,
			strobe: true,
			bogus: "x",
			feedback: Number.NaN,
		});
		expect(picked).toEqual({ intensity: 0.5, palette: 0.2 });
		expect("deckAMode" in picked).toBe(false);
		expect("feedback" in picked).toBe(false);
	});
	test("null/undefined yields an empty state", () => {
		expect(pickLayerState(null)).toEqual({});
		expect(pickLayerState(undefined)).toEqual({});
	});
});

describe("validatePresetLayerOscMsg", () => {
	const cues = new Set(["drop", "tunnel"]);

	test("add accepts a known cue with optional numeric weight", () => {
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_ADD_ADDRESS, args: ["drop"] },
				"test",
				cues,
			),
		).toBe(true);
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_ADD_ADDRESS, args: ["drop", 0.5] },
				"test",
				cues,
			),
		).toBe(true);
	});

	test("add rejects unknown cues, missing/extra args, non-string names", () => {
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_ADD_ADDRESS, args: ["nope"] },
				"test",
				cues,
			),
		).toBe(false);
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_ADD_ADDRESS, args: [] },
				"test",
				cues,
			),
		).toBe(false);
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_ADD_ADDRESS, args: [1] },
				"test",
				cues,
			),
		).toBe(false);
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_ADD_ADDRESS, args: ["drop", "loud"] },
				"test",
				cues,
			),
		).toBe(false);
	});

	test("weight requires two numeric args", () => {
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_WEIGHT_ADDRESS, args: [0, 0.5] },
				"test",
				cues,
			),
		).toBe(true);
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_WEIGHT_ADDRESS, args: [0] },
				"test",
				cues,
			),
		).toBe(false);
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_WEIGHT_ADDRESS, args: ["x", 0.5] },
				"test",
				cues,
			),
		).toBe(false);
	});

	test("remove requires one numeric index", () => {
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_REMOVE_ADDRESS, args: [1] },
				"test",
				cues,
			),
		).toBe(true);
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_REMOVE_ADDRESS, args: [] },
				"test",
				cues,
			),
		).toBe(false);
	});

	test("move requires two numeric args; clear takes none", () => {
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_MOVE_ADDRESS, args: [0, 1] },
				"test",
				cues,
			),
		).toBe(true);
		expect(
			validatePresetLayerOscMsg(
				{ address: PRESET_LAYER_CLEAR_ADDRESS, args: [] },
				"test",
				cues,
			),
		).toBe(true);
	});

	test("unrecognised layer command is rejected", () => {
		expect(
			validatePresetLayerOscMsg(
				{ address: "/aurora/preset/layer/bogus", args: [] },
				"test",
				cues,
			),
		).toBe(false);
	});
});

test("PRESET_LAYER_MAX bounds the stack for the idle-memory budget", () => {
	expect(PRESET_LAYER_MAX).toBeGreaterThan(0);
	expect(PRESET_LAYER_MAX).toBeLessThanOrEqual(16);
});

describe("createLayerController (stateful round-trip)", () => {
	const makeHarness = (initial: LayerState) => {
		let live: LayerState = { ...initial };
		const merges: LayerState[] = [];
		let fullCount = 0;
		const controller = createLayerController({
			captureFloor: () => ({ ...live }),
			merge: (state) => {
				live = { ...live, ...state };
				merges.push({ ...state });
			},
			onFull: () => {
				fullCount += 1;
			},
		});
		return {
			controller,
			merges,
			live: () => live,
			setLive: (state: LayerState) => {
				live = { ...live, ...state };
			},
			fullCount: () => fullCount,
		};
	};

	test("add then clear restores the original floor (non-destructive round-trip)", () => {
		const h = makeHarness({ intensity: 0.2, feedback: 0.5 });
		h.controller.add({ name: "a", state: { intensity: 1 }, weight: 1 });
		expect(h.live().intensity).toBeCloseTo(1);
		expect(h.live().feedback).toBeCloseTo(0.5);
		h.controller.clear();
		expect(h.live().intensity).toBeCloseTo(0.2);
		expect(h.live().feedback).toBeCloseTo(0.5);
	});

	test("dropping a layer's weight to 0 recomposes back to the floor", () => {
		const h = makeHarness({ intensity: 0.2 });
		h.controller.add({ name: "a", state: { intensity: 1 }, weight: 1 });
		expect(h.live().intensity).toBeCloseTo(1);
		h.controller.setWeight(0, 0);
		expect(h.live().intensity).toBeCloseTo(0.2);
	});

	test("removing every layer restores the frozen floor", () => {
		const h = makeHarness({ intensity: 0.2 });
		h.controller.add({ name: "a", state: { intensity: 0.9 }, weight: 1 });
		h.controller.add({ name: "b", state: { intensity: 0.1 }, weight: 1 });
		h.controller.remove(1);
		h.controller.remove(0);
		expect(h.live().intensity).toBeCloseTo(0.2);
	});

	test("the floor is re-captured fresh after the stack empties", () => {
		const h = makeHarness({ intensity: 0.2 });
		h.controller.add({ name: "a", state: { intensity: 1 }, weight: 1 });
		h.controller.clear();
		// The live state drifts before the next layer session begins.
		h.setLive({ intensity: 0.7 });
		// A weight-0 add captures the fresh floor and leaves it untouched.
		h.controller.add({ name: "b", state: { intensity: 1 }, weight: 0 });
		expect(h.live().intensity).toBeCloseTo(0.7);
	});

	test("add beyond PRESET_LAYER_MAX is dropped without recomposing", () => {
		const h = makeHarness({ intensity: 0 });
		for (let i = 0; i < PRESET_LAYER_MAX; i++) {
			h.controller.add({ name: `l${i}`, state: { intensity: 1 }, weight: 0 });
		}
		expect(h.controller.stack).toHaveLength(PRESET_LAYER_MAX);
		const mergeCount = h.merges.length;
		h.controller.add({ name: "overflow", state: { intensity: 1 }, weight: 1 });
		expect(h.controller.stack).toHaveLength(PRESET_LAYER_MAX);
		expect(h.fullCount()).toBe(1);
		expect(h.merges.length).toBe(mergeCount);
	});
});

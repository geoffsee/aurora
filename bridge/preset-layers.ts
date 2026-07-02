// Non-destructive runtime layering of presets (Resolume-class composability).
// A stack of weighted layers composites over a fixed base state: each layer
// blends its own values over the accumulated result by its weight, in stack
// order (index 0 = bottom, last = top). Because the base and every layer hold
// their own state and are never mutated, dropping a layer's weight to 0 or
// removing it recomputes exactly the composition without it — the underlying
// state is preserved rather than overwritten.
//
// The composable field set is deliberately the same numeric ControlState keys
// the preset morph interpolates (MORPH_KEYS): discrete modes (deckAMode, etc.)
// are not blended, so layering never disturbs the live deck modes.

import { MORPH_KEYS, type MorphKey } from "./preset-morph.ts";

export type LayerKey = MorphKey;
export const LAYER_KEYS = MORPH_KEYS;

export type LayerState = Partial<Record<LayerKey, number>>;

export type PresetLayer = {
	// Source preset/cue name, kept for identification in the control surface.
	name: string;
	state: LayerState;
	// Per-layer contribution in the unit interval (0 = invisible, 1 = full over).
	weight: number;
};

// Bound the stack so a misbehaving controller can't grow it without limit and
// blow the idle-memory budget. Eight layers comfortably covers live use.
export const PRESET_LAYER_MAX = 8;

// Clamp a layer weight into the unit interval; non-finite input collapses to 0
// so a malformed message renders the layer invisible rather than throwing.
export const clampLayerWeight = (value: unknown): number => {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return n <= 0 ? 0 : n >= 1 ? 1 : n;
};

const pickFinite = (v: unknown): number | undefined =>
	Number.isFinite(v) ? (v as number) : undefined;

// Composite the stack over the base state. Pure: neither `base` nor any layer
// (or its `state`) is mutated. For each key, start from the base value (if it
// defines one) and fold each layer that touches the key via a weighted
// over-composite `cur + (layerVal - cur) * weight`. A key the base omits is
// established by the first layer that provides it, then blended by later ones.
// Keys neither base nor any layer defines collapse to 0 (matching the morph
// blend's neutral fallback), so the result always carries every LAYER_KEY.
export const composeLayers = (
	base: LayerState,
	layers: readonly PresetLayer[],
): Record<LayerKey, number> => {
	const out = {} as Record<LayerKey, number>;
	for (const key of LAYER_KEYS) {
		let cur = pickFinite(base[key]);
		for (const layer of layers) {
			const lv = pickFinite(layer.state[key]);
			if (lv === undefined) continue;
			const w = clampLayerWeight(layer.weight);
			cur = cur === undefined ? lv : cur + (lv - cur) * w;
		}
		out[key] = cur === undefined ? 0 : cur;
	}
	return out;
};

// The stack operations below all return a new array and never mutate the input,
// keeping layering non-destructive: the caller re-composites from the fixed
// base against the returned stack.

export const addLayer = (
	layers: readonly PresetLayer[],
	layer: PresetLayer,
): PresetLayer[] => [...layers, { ...layer, weight: clampLayerWeight(layer.weight) }];

export const removeLayerAt = (
	layers: readonly PresetLayer[],
	index: number,
): PresetLayer[] =>
	index >= 0 && index < layers.length
		? layers.filter((_, i) => i !== index)
		: [...layers];

export const setLayerWeightAt = (
	layers: readonly PresetLayer[],
	index: number,
	weight: unknown,
): PresetLayer[] =>
	layers.map((layer, i) =>
		i === index ? { ...layer, weight: clampLayerWeight(weight) } : layer,
	);

// Move the layer at `from` to position `to`, shifting the rest. Out-of-range
// indices leave the order unchanged.
export const moveLayer = (
	layers: readonly PresetLayer[],
	from: number,
	to: number,
): PresetLayer[] => {
	if (
		!Number.isFinite(from) ||
		!Number.isFinite(to) ||
		from < 0 ||
		from >= layers.length ||
		to < 0 ||
		to >= layers.length ||
		from === to
	) {
		return [...layers];
	}
	const next = [...layers];
	const moved = next[from] as PresetLayer;
	next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
};

// Restrict an arbitrary state object to the composable layer keys, dropping
// non-finite values. Used to capture a base snapshot and to seed a layer from a
// cue preset without dragging along discrete-mode fields.
export const pickLayerState = (
	state: Record<string, unknown> | null | undefined,
): LayerState => {
	const out: LayerState = {};
	if (!state) return out;
	for (const key of LAYER_KEYS) {
		const v = pickFinite(state[key]);
		if (v !== undefined) out[key] = v;
	}
	return out;
};

export type LayerControllerDeps = {
	// Snapshot the live underlying state to freeze as the composition floor,
	// captured the moment the stack becomes non-empty.
	captureFloor: () => LayerState;
	// Merge a composited (or restored) state back into the live control state.
	merge: (state: LayerState) => void;
	// Notified when an add is dropped because the stack is already at max.
	onFull: () => void;
};

// The stateful half of the feature: owns the frozen base and the layer stack,
// and recomposites on every mutation. Extracted from the bridge so the
// non-destructive round-trip (add → recompose → clear restores the floor) is
// unit-testable against a fake merge/capture without booting the server.
export const createLayerController = (deps: LayerControllerDeps) => {
	let layerBase: LayerState | null = null;
	let layerStack: PresetLayer[] = [];

	const apply = () => {
		if (layerStack.length === 0) {
			if (layerBase) deps.merge({ ...layerBase });
			layerBase = null;
			return;
		}
		if (!layerBase) layerBase = deps.captureFloor();
		deps.merge(composeLayers(layerBase, layerStack));
	};

	return {
		add(layer: PresetLayer): void {
			if (layerStack.length >= PRESET_LAYER_MAX) {
				deps.onFull();
				return;
			}
			layerStack = addLayer(layerStack, layer);
			apply();
		},
		setWeight(index: number, weight: unknown): void {
			layerStack = setLayerWeightAt(layerStack, index, weight);
			apply();
		},
		remove(index: number): void {
			layerStack = removeLayerAt(layerStack, index);
			apply();
		},
		move(from: number, to: number): void {
			layerStack = moveLayer(layerStack, from, to);
			apply();
		},
		clear(): void {
			layerStack = [];
			apply();
		},
		get stack(): readonly PresetLayer[] {
			return layerStack;
		},
	};
};

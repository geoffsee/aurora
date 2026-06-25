import { beforeEach, expect, test, vi } from "vitest";
import { CONTROL_STATE_SCHEMA_VERSION } from "../../shared/osc-validation.ts";
import { SESSION_STATE_KEY } from "../../web/controls/lib/constants.ts";
import { defaultState } from "../../web/controls/lib/default-state.ts";
import {
	clearSessionState,
	loadSessionState,
	saveSessionState,
	toPersistedControlState,
} from "../../web/controls/lib/session-state.ts";

function createLocalStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear() {
			values.clear();
		},
		getItem(key: string) {
			return values.get(key) ?? null;
		},
		key(index: number) {
			return Array.from(values.keys())[index] ?? null;
		},
		removeItem(key: string) {
			values.delete(key);
		},
		setItem(key: string, value: string) {
			values.set(key, value);
		},
	};
}

beforeEach(() => {
	vi.stubGlobal("localStorage", createLocalStorage());
});

test("loadSessionState returns defaults when storage is empty", () => {
	expect(loadSessionState()).toEqual(defaultState());
});

test("saveSessionState round-trips user knobs and nested mappings", () => {
	const custom = {
		...defaultState(),
		crossfade: 0.22,
		intensity: 1.1,
		palette: 0.67,
		audioControlMode: true,
		trackMapping: {
			...defaultState().trackMapping,
			bassTrack: 4,
			highTrack: 7,
		},
		emaAlphas: {
			...defaultState().emaAlphas,
			high: 0.55,
		},
	};
	saveSessionState(custom);
	const loaded = loadSessionState();
	expect(loaded.crossfade).toBeCloseTo(0.22);
	expect(loaded.intensity).toBeCloseTo(1.1);
	expect(loaded.palette).toBeCloseTo(0.67);
	expect(loaded.audioControlMode).toBe(true);
	expect(loaded.trackMapping.bassTrack).toBe(4);
	expect(loaded.trackMapping.highTrack).toBe(7);
	expect(loaded.emaAlphas.high).toBeCloseTo(0.55);
});

test("ephemeral counters and cue snapshots are not persisted", () => {
	const custom = {
		...defaultState(),
		flashVersion: 9,
		resetVersion: 3,
		cueVersion: 5,
		replaying: true,
		cueIntensity: 0.8,
	};
	saveSessionState(custom);
	const persisted = JSON.parse(localStorage.getItem(SESSION_STATE_KEY)!);
	expect(persisted.flashVersion).toBeUndefined();
	expect(persisted.cueVersion).toBeUndefined();
	expect(persisted.replaying).toBeUndefined();

	const loaded = loadSessionState();
	expect(loaded.flashVersion).toBe(0);
	expect(loaded.resetVersion).toBe(0);
	expect(loaded.cueVersion).toBe(0);
	expect(loaded.replaying).toBe(false);
	expect(loaded.cueIntensity).toBe(0);
});

test("clearSessionState removes the saved snapshot", () => {
	saveSessionState({ ...defaultState(), crossfade: 0.9 });
	clearSessionState();
	expect(localStorage.getItem(SESSION_STATE_KEY)).toBeNull();
	expect(loadSessionState().crossfade).toBe(defaultState().crossfade);
});

test("toPersistedControlState keeps schema version for migration on load", () => {
	const persisted = toPersistedControlState(defaultState());
	expect(persisted.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
});

test("invalid JSON in storage falls back to defaults", () => {
	localStorage.setItem(SESSION_STATE_KEY, "not-json");
	expect(loadSessionState()).toEqual(defaultState());
});

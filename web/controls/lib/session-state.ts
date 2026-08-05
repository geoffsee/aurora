import { migrateControlState } from "../../../shared/control-state-schema.ts";
import { normalizeRemoteModelAssetPath } from "../../../shared/model-asset-path.ts";
import { CONTROL_STATE_SCHEMA_VERSION } from "../../../shared/osc-validation.ts";
import {
	type DeckCatalogs,
	migrateDeckSlugsInState,
} from "../../../shared/resolve-deck-selection.ts";
import { SESSION_STATE_KEY } from "./constants.ts";
import { defaultState } from "./default-state.ts";
import type { ControlState } from "./types.ts";

/** Counters and transient cue snapshots — never persisted across reloads. */
const EPHEMERAL_CONTROL_FIELDS = {
	replaying: false,
	flashVersion: 0,
	resetVersion: 0,
	cueVersion: 0,
	cueIntensity: 0,
	cuePalette: 0,
	cueCrossfade: 0.5,
	cueDeckAMode: 0,
	cueDeckBMode: 1,
	cueDeckAGpuShader: 1,
	cueDeckBGpuShader: 6,
} as const satisfies Partial<ControlState>;

export function toPersistedControlState(
	state: ControlState,
): Omit<ControlState, keyof typeof EPHEMERAL_CONTROL_FIELDS> {
	const {
		replaying: _replaying,
		flashVersion: _flashVersion,
		resetVersion: _resetVersion,
		cueVersion: _cueVersion,
		cueIntensity: _cueIntensity,
		cuePalette: _cuePalette,
		cueCrossfade: _cueCrossfade,
		cueDeckAMode: _cueDeckAMode,
		cueDeckBMode: _cueDeckBMode,
		cueDeckAGpuShader: _cueDeckAGpuShader,
		cueDeckBGpuShader: _cueDeckBGpuShader,
		...persisted
	} = state;
	return persisted;
}

export function mergeSessionControlState(
	defaults: ControlState,
	patch: Partial<ControlState>,
): ControlState {
	return {
		...defaults,
		...patch,
		schemaVersion: CONTROL_STATE_SCHEMA_VERSION,
		trackMapping: {
			...defaults.trackMapping,
			...(patch.trackMapping ?? {}),
		},
		bandCurves: {
			...defaults.bandCurves,
			...(patch.bandCurves ?? {}),
		},
		emaAlphas: {
			...defaults.emaAlphas,
			...(patch.emaAlphas ?? {}),
		},
		figureAssetPath: normalizeRemoteModelAssetPath(
			patch.figureAssetPath,
			defaults.figureAssetPath,
		),
		...EPHEMERAL_CONTROL_FIELDS,
	};
}

export function loadSessionState(): ControlState {
	const defaults = defaultState();
	try {
		const raw = localStorage.getItem(SESSION_STATE_KEY);
		if (!raw) return defaults;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return defaults;
		const migrated = migrateControlState(parsed) as Partial<ControlState>;
		return mergeSessionControlState(defaults, migrated);
	} catch {
		return defaults;
	}
}

/**
 * Resolve deck pack slugs for a control-state snapshot (session or show preset)
 * against a public mode catalog. Returns the patched fields + warnings for banners.
 * Int-only legacy snapshots keep their ints when the catalog cannot map them.
 */
export function resolveSessionDeckSlugs(
	state: ControlState,
	catalogs: DeckCatalogs,
): { patch: Partial<ControlState>; warnings: string[] } {
	const resolved = migrateDeckSlugsInState(state, catalogs, {
		deckAMode: state.deckAMode,
		deckBMode: state.deckBMode,
		deckAPresetSlug: state.deckAPresetSlug ?? "",
		deckBPresetSlug: state.deckBPresetSlug ?? "",
	});
	return {
		patch: {
			deckAMode: resolved.deckAMode,
			deckBMode: resolved.deckBMode,
			deckAPresetSlug: resolved.deckAPresetSlug,
			deckBPresetSlug: resolved.deckBPresetSlug,
		},
		warnings: resolved.warnings,
	};
}

export function saveSessionState(state: ControlState): void {
	try {
		localStorage.setItem(
			SESSION_STATE_KEY,
			JSON.stringify(toPersistedControlState(state)),
		);
	} catch {
		// private mode / quota — persistence is best-effort
	}
}

export function clearSessionState(): void {
	try {
		localStorage.removeItem(SESSION_STATE_KEY);
	} catch {
		// ignore
	}
}

import { beforeEach, expect, test, vi } from 'vitest';
import { CONTROL_STATE_SCHEMA_VERSION } from '../../shared/osc-validation.ts';
import { SESSION_STATE_KEY } from '../../web/controls/lib/constants.ts';
import { defaultState } from '../../web/controls/lib/default-state.ts';
import {
  clearSessionState,
  loadSessionState,
  resolveSessionDeckSlugs,
  saveSessionState,
  toPersistedControlState,
} from '../../web/controls/lib/session-state.ts';

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
  vi.stubGlobal('localStorage', createLocalStorage());
});

test('loadSessionState returns defaults when storage is empty', () => {
  expect(loadSessionState()).toEqual(defaultState());
});

test('saveSessionState round-trips user knobs and nested mappings', () => {
  const custom = {
    ...defaultState(),
    crossfade: 0.22,
    intensity: 1.1,
    palette: 0.67,
    audioControlMode: true,
    figureAssetPath: 'https://cdn.example.com/performer.glb',
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
  expect(loaded.figureAssetPath).toBe('https://cdn.example.com/performer.glb');
  expect(loaded.trackMapping.bassTrack).toBe(4);
  expect(loaded.trackMapping.highTrack).toBe(7);
  expect(loaded.emaAlphas.high).toBeCloseTo(0.55);
});

test('ephemeral counters and cue snapshots are not persisted', () => {
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

test('clearSessionState removes the saved snapshot', () => {
  saveSessionState({ ...defaultState(), crossfade: 0.9 });
  clearSessionState();
  expect(localStorage.getItem(SESSION_STATE_KEY)).toBeNull();
  expect(loadSessionState().crossfade).toBe(defaultState().crossfade);
});

test('toPersistedControlState keeps schema version for migration on load', () => {
  const persisted = toPersistedControlState(defaultState());
  expect(persisted.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
});

test('invalid JSON in storage falls back to defaults', () => {
  localStorage.setItem(SESSION_STATE_KEY, 'not-json');
  expect(loadSessionState()).toEqual(defaultState());
});

test('invalid persisted remote model paths fall back to the catalog', () => {
  localStorage.setItem(
    SESSION_STATE_KEY,
    JSON.stringify({
      ...toPersistedControlState(defaultState()),
      figureAssetPath: 'javascript:alert(1)',
    }),
  );
  expect(loadSessionState().figureAssetPath).toBe('');
});

test('v13 int-only session migrates to v14 with empty slugs', () => {
  localStorage.setItem(
    SESSION_STATE_KEY,
    JSON.stringify({
      schemaVersion: 13,
      crossfade: 0.33,
      deckAMode: 0,
      deckBMode: 1,
    }),
  );
  const loaded = loadSessionState();
  expect(loaded.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(loaded.crossfade).toBeCloseTo(0.33);
  expect(loaded.deckAMode).toBe(0);
  expect(loaded.deckBMode).toBe(1);
  // Migration leaves empty slugs; runtime catalog resolve fills them.
  expect(loaded.deckAPresetSlug).toBe('');
  expect(loaded.deckBPresetSlug).toBe('');
});

test('v15 session seeds per-deck axes from globals on load', () => {
  localStorage.setItem(
    SESSION_STATE_KEY,
    JSON.stringify({
      schemaVersion: 15,
      intensity: 1.05,
      depth: 0.25,
      feedback: 0.4,
      speed: 1.4,
      crossfade: 0.2,
    }),
  );
  const loaded = loadSessionState();
  expect(loaded.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(loaded.deckAIntensity).toBe(1.05);
  expect(loaded.deckBIntensity).toBe(1.05);
  expect(loaded.deckADepth).toBe(0.25);
  expect(loaded.deckBDepth).toBe(0.25);
  expect(loaded.deckAFeedback).toBe(0.4);
  expect(loaded.deckBFeedback).toBe(0.4);
  expect(loaded.deckASpeed).toBe(1.4);
  expect(loaded.deckBSpeed).toBe(1.4);
});

test('defaultState includes independent deck axes at schema version', () => {
  const state = defaultState();
  expect(state.schemaVersion).toBe(CONTROL_STATE_SCHEMA_VERSION);
  expect(state.deckAIntensity).toBe(state.intensity);
  expect(state.deckBIntensity).toBe(state.intensity);
  expect(state.deckADepth).toBe(state.depth);
  expect(state.deckBDepth).toBe(state.depth);
  expect(state.deckAFeedback).toBe(state.feedback);
  expect(state.deckBFeedback).toBe(state.feedback);
  expect(state.deckASpeed).toBe(state.speed);
  expect(state.deckBSpeed).toBe(state.speed);
});

test('resolveSessionDeckSlugs maps int-only state when catalog has legacyIndex', () => {
  const state = {
    ...defaultState(),
    deckAMode: 0,
    deckBMode: 1,
    deckAPresetSlug: '',
    deckBPresetSlug: '',
  };
  const { patch, warnings } = resolveSessionDeckSlugs(state, {
    'deck-a': [
      { slug: 'beams', legacyIndex: 0 },
      { slug: 'tunnel', legacyIndex: 1 },
    ],
    'deck-b': [
      { slug: 'beams', legacyIndex: 0 },
      { slug: 'tunnel', legacyIndex: 1 },
    ],
  });
  expect(patch.deckAPresetSlug).toBe('beams');
  expect(patch.deckBPresetSlug).toBe('tunnel');
  expect(warnings).toHaveLength(0);
});

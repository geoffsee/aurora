import { describe, expect, test } from 'vitest';
import {
  AUDIO_SPECTRUM_BIN_COUNT,
  AURORA_AUDIO_SPECTRUM_ADDRESS,
} from '../../shared/audio-spectrum.ts';
import { outputIdFromLocation, VisualizerDataBridge } from '../../web/webxr/data-bridge.ts';

describe('WebXR visualizer data bridge', () => {
  test('resolves independent native formations for both decks', () => {
    const bridge = new VisualizerDataBridge('main');
    expect(bridge.snapshot().deckA.formation).toBe('beams');
    expect(bridge.snapshot().deckB.formation).toBe('tunnel');

    bridge.ingest({
      address: '/aurora/control/state',
      args: [{ deckAMode: 7, deckAPresetSlug: 'orbit', deckBMode: 13, deckBPresetSlug: 'lattice' }],
    });
    expect(bridge.snapshot().deckA.formation).toBe('orbit');
    expect(bridge.snapshot().deckB.formation).toBe('lattice');

    bridge.ingest({
      address: '/aurora/control/state',
      args: [{ deckAMode: 19, deckAPresetSlug: 'nebula', deckBMode: 8, deckBPresetSlug: 'pulse' }],
    });
    expect(bridge.snapshot().deckA.formation).toBe('atmosphere');
    expect(bridge.snapshot().deckB.formation).toBe('pulse');
  });

  test('supports explicit automatable WebXR formations and performance controls', () => {
    const bridge = new VisualizerDataBridge('main');
    bridge.ingest({
      address: '/aurora/control/state',
      args: [
        {
          xrFollowDeckModes: false,
          xrFormationA: 14,
          xrFormationB: 21,
          xrDensityA: 0.25,
          xrDensityB: 0.6,
          xrStructureA: 0.1,
          xrStructureB: 0.75,
          xrSpatialExtent: 1.5,
          xrAudioReactivity: 0.4,
        },
      ],
    });

    const frame = bridge.snapshot();
    expect(frame.deckA.formation).toBe('rain');
    expect(frame.deckB.formation).toBe('sculpture');
    expect(frame.deckA.xrDensity).toBe(0.25);
    expect(frame.deckB.xrDensity).toBe(0.6);
    expect(frame.deckA.xrStructure).toBe(0.1);
    expect(frame.deckB.xrStructure).toBe(0.75);
    expect(frame.xrSpatialExtent).toBe(1.5);
    expect(frame.xrAudioReactivity).toBe(0.4);

    bridge.ingest({
      address: '/aurora/control/state',
      args: [{ xrFormationA: 99, xrDensityA: -1, xrSpatialExtent: 99 }],
    });
    const clamped = bridge.snapshot();
    expect(clamped.deckA.formation).toBe('flora');
    expect(clamped.deckA.xrDensity).toBe(0);
    expect(clamped.xrSpatialExtent).toBe(1.75);
  });

  test('uses direct spectrum data and expires it independently of rendering', () => {
    let now = 100;
    const bridge = new VisualizerDataBridge('main', () => now);
    const bins = Array.from({ length: AUDIO_SPECTRUM_BIN_COUNT }, (_, index) => index / 63);
    bridge.ingest({
      address: AURORA_AUDIO_SPECTRUM_ADDRESS,
      args: [{ schemaVersion: 1, source: 'browser-mic', bins, minHz: 20, maxHz: 20_000 }],
    });

    const fresh = bridge.snapshot();
    expect(fresh.source).toBe('spectrum');
    expect(Array.from(fresh.levels64)).toEqual(Array.from(new Float32Array(bins)));

    now = 1_101;
    const stale = bridge.snapshot();
    expect(stale.source).toBe('idle');
    expect(stale.spectrum).toBeNull();
  });

  test('applies output routing to the spatial deck mix and blackout', () => {
    const bridge = new VisualizerDataBridge('headset');
    bridge.ingest({
      address: '/aurora/control/state',
      args: [
        {
          crossfade: 0.1,
          outputs: [
            {
              id: 'headset',
              label: 'Headset',
              enabled: true,
              crossfade: 0.8,
              palette: null,
              activeShader: null,
            },
          ],
        },
      ],
    });

    expect(bridge.snapshot().deckA.weight).toBeCloseTo(0.2);
    expect(bridge.snapshot().deckB.weight).toBeCloseTo(0.8);

    bridge.ingest({
      address: '/aurora/control/state',
      args: [
        {
          outputs: [
            {
              id: 'headset',
              label: 'Headset',
              enabled: false,
              crossfade: null,
              palette: null,
              activeShader: null,
            },
          ],
        },
      ],
    });
    expect(bridge.snapshot().blackout).toBe(true);
  });

  test('accepts only safe output identifiers from the URL', () => {
    expect(outputIdFromLocation('?token=secret&output=vision-pro')).toBe('vision-pro');
    expect(outputIdFromLocation('?output=%3Cscript%3E')).toBe('main');
  });
});

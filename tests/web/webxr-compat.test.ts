import { describe, expect, test } from 'vitest';
import {
  ensureXrSessionEnabledFeatures,
  forceLegacyWebGlLayer,
  withoutXrProjectionLayers,
  xrSessionNeedsLegacyWebGlLayer,
} from '../../web/webxr/xr-compat.ts';

describe('WebXR session compatibility', () => {
  test('preserves the browser-reported feature list', () => {
    const session = { enabledFeatures: ['webgpu', 'layers'] };

    expect(xrSessionNeedsLegacyWebGlLayer(session)).toBe(false);
    expect(ensureXrSessionEnabledFeatures(session)).toBe(session.enabledFeatures);
  });

  test('supplies an empty feature list when visionOS omits it', () => {
    const session = {};

    expect(xrSessionNeedsLegacyWebGlLayer(session)).toBe(true);
    expect(ensureXrSessionEnabledFeatures(session)).toEqual([]);
    expect(session).toHaveProperty('enabledFeatures', []);
  });

  test('can force Three.js onto its XRWebGLLayer path', () => {
    const xrManager = { _supportsLayers: true };

    forceLegacyWebGlLayer(xrManager);

    expect(xrManager._supportsLayers).toBe(false);
  });

  test('restores projection-layer support after classic session setup', async () => {
    const original = (globalThis as { XRWebGLBinding?: unknown }).XRWebGLBinding;
    const createProjectionLayer = () => 'projection';
    class FakeBinding {}
    Object.defineProperty(FakeBinding.prototype, 'createProjectionLayer', {
      configurable: true,
      value: createProjectionLayer,
    });
    (globalThis as { XRWebGLBinding?: unknown }).XRWebGLBinding = FakeBinding;

    try {
      await withoutXrProjectionLayers(async () => {
        expect('createProjectionLayer' in FakeBinding.prototype).toBe(false);
      });
      expect(FakeBinding.prototype).toHaveProperty('createProjectionLayer', createProjectionLayer);
    } finally {
      (globalThis as { XRWebGLBinding?: unknown }).XRWebGLBinding = original;
    }
  });

  test('reports an actionable error when a session cannot be adapted', () => {
    const session = Object.freeze({});

    expect(() => ensureXrSessionEnabledFeatures(session)).toThrow(
      'This browser returned an XR session without a usable feature list.',
    );
  });
});

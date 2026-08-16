type XRSessionWithOptionalFeatures = {
  readonly enabledFeatures?: string[];
};

type ThreeXrManagerCapabilities = {
  _supportsLayers?: boolean;
};

export function xrSessionNeedsLegacyWebGlLayer(session: XRSessionWithOptionalFeatures): boolean {
  return !Array.isArray(session.enabledFeatures);
}

/**
 * visionOS Safari can omit XRSession.enabledFeatures. Three.js assumes the
 * property always exists, even on its WebGL fallback path, and calls
 * `.includes()` unconditionally. An omitted list means no optional features
 * were reported as granted, so expose that state as an empty array.
 */
export function ensureXrSessionEnabledFeatures<T extends XRSessionWithOptionalFeatures>(
  session: T,
): string[] {
  if (Array.isArray(session.enabledFeatures)) return session.enabledFeatures;

  try {
    Object.defineProperty(session, 'enabledFeatures', {
      configurable: true,
      value: [],
    });
  } catch {
    throw new Error('This browser returned an XR session without a usable feature list.');
  }

  return session.enabledFeatures ?? [];
}

/**
 * Some visionOS releases expose XRWebGLBinding projection layers even though
 * that rendering path produces a black frame. Three.js stores the capability
 * decision on its XR manager, so override it before setSession() and use the
 * standard XRWebGLLayer path instead.
 *
 * https://bugs.webkit.org/show_bug.cgi?id=312323
 */
export function forceLegacyWebGlLayer(xrManager: object): void {
  (xrManager as ThreeXrManagerCapabilities)._supportsLayers = false;
}

type XRWebGLBindingGlobal = {
  XRWebGLBinding?: { prototype: object };
};

/** Run classic Three.js session setup without the broken visionOS Layers API. */
export async function withoutXrProjectionLayers<T>(operation: () => Promise<T>): Promise<T> {
  const binding = (globalThis as XRWebGLBindingGlobal).XRWebGLBinding;
  if (!binding) return operation();

  const descriptor = Object.getOwnPropertyDescriptor(binding.prototype, 'createProjectionLayer');
  if (!descriptor) return operation();
  if (!descriptor.configurable) {
    throw new Error('This browser exposes an XR projection-layer API that cannot be disabled.');
  }

  delete (binding.prototype as { createProjectionLayer?: unknown }).createProjectionLayer;
  try {
    return await operation();
  } finally {
    Object.defineProperty(binding.prototype, 'createProjectionLayer', descriptor);
  }
}

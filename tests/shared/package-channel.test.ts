import { afterEach, describe, expect, test } from 'vitest';
import { PACK_V1_SHOW_TEMPLATE } from '../../shared/aurora-package.ts';
import {
  clearAuthoredPackagesForTests,
  compiledWireFromAuthoredPackage,
  getAuthoredPackage,
  loadAuthoredPackages,
  upsertAuthoredPackage,
} from '../../shared/package-channel.ts';

describe('package-channel', () => {
  afterEach(() => {
    clearAuthoredPackagesForTests();
  });

  test('upsert and load authored packages', () => {
    const saved = upsertAuthoredPackage({
      slug: 'glass-drift',
      label: 'Glass Drift',
      uiGroup: 'field-motion',
      wgsl: PACK_V1_SHOW_TEMPLATE,
      updatedAt: new Date().toISOString(),
    });
    expect(saved.slug).toBe('glass-drift');
    expect(getAuthoredPackage('glass-drift')?.label).toBe('Glass Drift');
    expect(loadAuthoredPackages()).toHaveLength(1);
  });

  test('compiled wire carries fullscreen wgsl', () => {
    const pkg = {
      slug: 'glass-drift',
      label: 'Glass Drift',
      wgsl: PACK_V1_SHOW_TEMPLATE,
      updatedAt: new Date().toISOString(),
    };
    const wire = compiledWireFromAuthoredPackage('deck-a', pkg, 3);
    expect(wire.slug).toBe('glass-drift');
    expect(wire.disposition).toBe('fullscreen-primary');
    expect(wire.suppressLegacyField).toBe(true);
    expect(wire.layers[0]?.kind).toBe('fullscreen');
    expect(wire.layers[0]?.wgsl).toContain('@fragment');
    expect(wire.epoch).toBe(3);
  });
});

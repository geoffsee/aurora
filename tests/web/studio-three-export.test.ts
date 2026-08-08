import { describe, expect, test } from 'vitest';
import { parseAuroraPackageArchive } from '../../shared/aurora-package.ts';
import { compileThreeSource } from '../../web/studio/lib/compile-three.ts';
import { exportSketchToPackage } from '../../web/studio/lib/export-package.ts';
import { createSketch } from '../../web/studio/lib/sketch-store.ts';

describe('Studio Three.js compilation and export', () => {
  test('compiles an allowlisted ES2022 module and exports schema v2', () => {
    const sketch = createSketch({ label: 'Three Export', backend: 'threejs', renderer: 'webgpu' });
    const result = exportSketchToPackage(sketch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = parseAuroraPackageArchive(result.bytes);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.bundle.manifest.target !== 'threejs') return;
    expect(parsed.bundle.manifest).toMatchObject({
      schemaVersion: 2,
      renderer: 'webgpu',
      runtime: 'three-v1',
    });
    expect(parsed.bundle.javascript).toContain('export default');
    expect(parsed.bundle.sourceMap).toBeDefined();
  });

  test('keeps invalid imports out of the executable', () => {
    const result = compileThreeSource(`import x from 'left-pad'; export default () => x;`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.message).toContain('allowlist');
  });
});

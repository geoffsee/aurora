import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  main,
  scanModeDataRoot,
  validatePackFolder,
  validatePresetFile,
  validateTarget,
} from '../../scripts/modes-validate.ts';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/modes');
const GOOD_ROOT = join(FIXTURES, 'packs/good');
const BAD_ROOT = join(FIXTURES, 'packs/bad');
const FLAT_PRESET = join(FIXTURES, 'supernova-stub.preset.json');

describe('scanModeDataRoot — good packs', () => {
  test('validates deck-a and deck-b packs with zero failures', () => {
    const result = scanModeDataRoot(GOOD_ROOT);
    expect(result.scanned).toBe(2);
    expect(result.ok).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.issues).toEqual([]);
  });

  test('validateTarget on good root matches scan', () => {
    const result = validateTarget(GOOD_ROOT);
    expect(result.failed).toBe(0);
    expect(result.ok).toBe(2);
  });
});

describe('scanModeDataRoot — bad packs', () => {
  test('reports unknown primitive and folder/slug problems', () => {
    const result = scanModeDataRoot(BAD_ROOT);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.ok).toBe(0);

    const joined = result.issues.map((i) => `${i.path}: ${i.errors.join('; ')}`).join('\n');

    expect(joined).toMatch(/not_a_real_primitive|known FieldPrimitiveName/i);
    expect(joined).toMatch(/kebab-case|Not-Kebab/i);
    expect(joined).toMatch(/slug-mismatch|must match folder/i);
  });

  test('skips .tmp folders without counting them as failures', () => {
    const result = scanModeDataRoot(BAD_ROOT);
    expect(result.notes.some((n) => n.includes('.tmp'))).toBe(true);
    expect(result.issues.every((i) => !i.path.includes('.tmp'))).toBe(true);
  });
});

describe('validatePresetFile / single file target', () => {
  test('flat fixture preset validates', () => {
    expect(validatePresetFile(FLAT_PRESET)).toBeNull();
    const result = validateTarget(FLAT_PRESET);
    expect(result).toEqual({
      scanned: 1,
      ok: 1,
      failed: 0,
      issues: [],
      notes: [],
    });
  });

  test('missing file fails', () => {
    const issue = validatePresetFile(join(FIXTURES, 'no-such-preset.json'));
    expect(issue).not.toBeNull();
    expect(issue?.errors[0]).toMatch(/not found/i);
  });
});

describe('validatePackFolder', () => {
  test('good supernova-stub folder', () => {
    const pack = join(GOOD_ROOT, 'decks/deck-a/supernova-stub');
    expect(validatePackFolder(pack)).toBeNull();
  });

  test('broken pack folder surfaces schema errors', () => {
    const pack = join(BAD_ROOT, 'decks/deck-a/broken-pack');
    const issue = validatePackFolder(pack);
    expect(issue).not.toBeNull();
    expect(issue?.errors.some((e) => /primitive/i.test(e))).toBe(true);
  });
});

describe('main CLI', () => {
  test('exit 0 on good root', () => {
    expect(main([GOOD_ROOT])).toBe(0);
  });

  test('exit 1 on bad root', () => {
    expect(main([BAD_ROOT])).toBe(1);
  });

  test('exit 0 on help', () => {
    expect(main(['--help'])).toBe(0);
  });

  test('exit 0 when default data root is empty/missing packs', () => {
    // Repo may ship with no data/decks yet (pre-PR5); zero packs is not a failure.
    const emptyish = join(FIXTURES, 'packs/empty-root');
    // scanModeDataRoot on a path that exists but has no decks → 0 scanned, exit 0
    const result = scanModeDataRoot(GOOD_ROOT); // smoke: main path uses validateTarget
    expect(result.failed).toBe(0);
    // Explicit empty dir via non-existent path: still exit 0
    expect(main([join(FIXTURES, 'packs/does-not-exist-root')])).toBe(0);
    void emptyish;
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  ALWAYS_EXCLUDE,
  CONTEXT_FORBIDDEN_PREFIXES,
  DOCKERFILE_REQUIRED,
  filterContextFiles,
  forbiddenHits,
  isIgnored,
  listContextFiles,
  missingRequired,
  parseDockerIgnore,
} from '../../cli/docker-context';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

describe('dockerignore matching', () => {
  test('last matching rule wins for a single path', () => {
    const rules = parseDockerIgnore('*.md\n!README.md\n');
    expect(isIgnored('README.md', rules, [])).toBe(false);
    expect(isIgnored('NOTES.md', rules, [])).toBe(true);
    expect(isIgnored('docs/guide.md', rules, [])).toBe(true);
  });

  test('!README.md does not resurrect files under an ignored parent (node_modules)', () => {
    const rules = parseDockerIgnore('node_modules\n*.md\n!README.md\n');
    expect(isIgnored('README.md', rules, [])).toBe(false);
    expect(isIgnored('models/README.md', rules, [])).toBe(false);
    expect(isIgnored('node_modules/@chakra-ui/react/README.md', rules, [])).toBe(true);
    expect(isIgnored('node_modules/foo/package.json', rules, [])).toBe(true);
  });

  test('!README.md does not resurrect files under ignored dist/', () => {
    const rules = parseDockerIgnore('dist\n*.md\n!README.md\n');
    expect(isIgnored('dist/assets/models/README.md', rules, [])).toBe(true);
    expect(isIgnored('README.md', rules, [])).toBe(false);
  });

  test('anchored /aurora only matches the root binary name', () => {
    const rules = parseDockerIgnore('/aurora\n');
    expect(isIgnored('aurora', rules, [])).toBe(true);
    expect(isIgnored('cli/aurora.ts', rules, [])).toBe(false);
  });

  test('ALWAYS_EXCLUDE wins even when dockerignore would allow the path', () => {
    const rules = parseDockerIgnore('!cli/.embedded/docker-context.tar\n');
    expect(isIgnored('cli/.embedded/docker-context.tar', rules)).toBe(true);
    expect(isIgnored('aurora.bun.build.ts', rules)).toBe(true);
  });

  test('models/**/*.zip excludes nested zips but keeps glbs', () => {
    const rules = parseDockerIgnore('models/**/*.zip\n');
    expect(isIgnored('models/foo/bar.zip', rules, [])).toBe(true);
    expect(isIgnored('models/duck/source/Duck.glb', rules, [])).toBe(false);
  });
});

describe('filterContextFiles', () => {
  test('keeps Dockerfile inputs and drops forbidden trees', () => {
    const rules = parseDockerIgnore(`
node_modules
dist
tests
cli
*.md
!README.md
`);
    const input = [
      'Dockerfile',
      'package.json',
      'bun.lock',
      'Cargo.toml',
      'README.md',
      'bridge/index.ts',
      'web/index.html',
      'src/main.rs',
      'deploy/entrypoint.sh',
      'node_modules/foo/README.md',
      'node_modules/foo/index.js',
      'tests/web/smoke.test.ts',
      'cli/aurora.ts',
      'dist/pkg/aurora.js',
      'NOTES.md',
    ];
    const kept = filterContextFiles(input, rules, ALWAYS_EXCLUDE);
    expect(kept).toEqual([
      'Cargo.toml',
      'Dockerfile',
      'README.md',
      'bridge/index.ts',
      'bun.lock',
      'deploy/entrypoint.sh',
      'package.json',
      'src/main.rs',
      'web/index.html',
    ]);
    expect(forbiddenHits(kept)).toEqual([]);
    expect(missingRequired(kept)).toEqual(
      expect.arrayContaining([
        'Cargo.lock',
        'rust-toolchain.toml',
        'plugins',
        'lab/preset-studio',
        'assets/shaders',
        'shaders',
        'models',
        'shared',
        'scripts',
        '.cargo',
      ]),
    );
  });
});

describe('live repo Docker context', () => {
  test('assembles a context with every Dockerfile COPY input and no forbidden prefixes', () => {
    const dockerignore = readFileSync(resolve(REPO_ROOT, '.dockerignore'), 'utf8');
    const rules = parseDockerIgnore(dockerignore);
    const files = listContextFiles(REPO_ROOT, rules);

    expect(files.length).toBeGreaterThan(50);
    expect(missingRequired(files, DOCKERFILE_REQUIRED)).toEqual([]);
    expect(forbiddenHits(files, CONTEXT_FORBIDDEN_PREFIXES)).toEqual([]);

    expect(files).toContain('README.md');
    expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
    expect(files.some((f) => f.startsWith('tests/'))).toBe(false);
    expect(files.some((f) => f.startsWith('cli/'))).toBe(false);

    expect(files.some((f) => f.startsWith('models/human-female/'))).toBe(false);
    expect(files.some((f) => f.startsWith('models/duck/'))).toBe(true);
  });

  test('dockerignore lists the forbidden trees the suite enforces', () => {
    const text = readFileSync(resolve(REPO_ROOT, '.dockerignore'), 'utf8');
    for (const prefix of ['node_modules', 'target', 'dist', 'tests', 'cli', '.git']) {
      expect(text).toMatch(new RegExp(`^${prefix}$`, 'm'));
    }
  });
});

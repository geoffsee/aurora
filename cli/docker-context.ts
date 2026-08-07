/**
 * Docker build-context assembly for the compiled `aurora` CLI.
 *
 * Mirrors `docker build` context filtering (`.dockerignore` + a few always-exclude
 * paths). Shared by `aurora.bun.build.ts` and `tests/cli/docker-context.test.ts`.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Paths never shipped in the embedded context, even if `.dockerignore` allows them. */
export const ALWAYS_EXCLUDE = [
  'cli/.embedded',
  'cli/.vendor',
  '.aurora',
  'dist-cli',
  'aurora',
  'aurora.exe',
  'aurora.bun.build.ts',
] as const;

/**
 * Exact files / directory prefixes the Dockerfile `COPY`s into the image.
 * The assembled context must include every one of these (when present on disk).
 */
export const DOCKERFILE_REQUIRED = [
  'Dockerfile',
  'package.json',
  'bun.lock',
  'Cargo.toml',
  'Cargo.lock',
  'rust-toolchain.toml',
  'src',
  'plugins',
  'lab/preset-studio',
  'assets/shaders',
  'shaders',
  'models',
  'shared',
  'scripts',
  'web',
  'bridge',
  'data',
  '.cargo',
  'deploy',
] as const;

/**
 * Prefixes that must never appear in the embedded context (dead weight or secrets).
 * Enforced by tests against the live `.dockerignore` + ALWAYS_EXCLUDE.
 */
export const CONTEXT_FORBIDDEN_PREFIXES = [
  'node_modules/',
  'target/',
  'target-vst/',
  'target-launcher/',
  'dist/',
  'dist-cli/',
  'tests/',
  'cli/',
  '.aurora/',
  '.git/',
  '.github/',
  '.githooks/',
  '.cursor/',
  '.caretta/',
  'coverage/',
  'screenshots/',
  'docs/',
  'agent-transcripts/',
  '.idea/',
] as const;

export type IgnoreRule = {
  negate: boolean;
  /** Pattern as written in `.dockerignore` (no leading `!`). */
  pattern: string;
  regex: RegExp;
};

/** Convert a single dockerignore glob into a RegExp (dockerignore / gitignore-ish). */
export function globToRegExp(glob: string): RegExp {
  let pattern = glob;
  const anchoredRoot = pattern.startsWith('/');
  if (anchoredRoot) pattern = pattern.slice(1);
  // Trailing slash = directory-only in dockerignore; treat as prefix match.
  const dirOnly = pattern.endsWith('/');
  if (dirOnly) pattern = pattern.slice(0, -1);

  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === undefined) continue;
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i++;
      if (pattern[i + 1] === '/') i++;
      continue;
    }
    if (c === '*') {
      re += '[^/]*';
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      continue;
    }
    // Split so biome does not treat `${` inside a string literal as a template hole.
    if ('+.^$'.includes(c) || '{}()|[]\\'.includes(c)) {
      re += `\\${c}`;
      continue;
    }
    re += c;
  }

  return anchoredRoot || dirOnly
    ? new RegExp(`^${re}(?:/.*)?$`)
    : new RegExp(`(?:^|/)${re}(?:/.*)?$`);
}

export function parseDockerIgnore(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    const body = negate ? line.slice(1) : line;
    rules.push({ negate, pattern: body, regex: globToRegExp(body) });
  }
  return rules;
}

function normalizeRel(relPath: string): string {
  return relPath.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function isAlwaysExcluded(normalized: string, alwaysExclude: readonly string[]): boolean {
  return alwaysExclude.some((p) => normalized === p || normalized.startsWith(`${p}/`));
}

/** Last matching rule wins. Returns whether the path itself is ignored (no parent walk). */
export function pathMatchedIgnored(relPath: string, rules: IgnoreRule[]): boolean {
  const normalized = normalizeRel(relPath);
  let ignored = false;
  for (const rule of rules) {
    if (rule.regex.test(normalized)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

/**
 * Docker/git semantics: once a parent directory is excluded, children cannot be
 * re-included with `!file` — you must un-ignore the parent first.
 */
export function isIgnored(
  relPath: string,
  rules: IgnoreRule[],
  alwaysExclude: readonly string[] = ALWAYS_EXCLUDE,
): boolean {
  const normalized = normalizeRel(relPath);
  if (isAlwaysExcluded(normalized, alwaysExclude)) return true;

  const parts = normalized.split('/').filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    const parent = parts.slice(0, i + 1).join('/');
    if (pathMatchedIgnored(parent, rules)) return true;
  }
  return pathMatchedIgnored(normalized, rules);
}

export function filterContextFiles(
  files: readonly string[],
  rules: IgnoreRule[],
  alwaysExclude: readonly string[] = ALWAYS_EXCLUDE,
): string[] {
  return files
    .filter((f) => !isIgnored(f, rules, alwaysExclude))
    .map(normalizeRel)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Scan a directory tree and return relative file paths that belong in the Docker
 * context. Skips walking into ignored directories for speed.
 */
export function listContextFiles(
  root: string,
  rules: IgnoreRule[],
  alwaysExclude: readonly string[] = ALWAYS_EXCLUDE,
): string[] {
  const out: string[] = [];

  const walk = (absDir: string, relBase: string) => {
    let entries: string[];
    try {
      entries = readdirSync(absDir);
    } catch {
      return;
    }
    for (const name of entries) {
      const rel = relBase ? `${relBase}/${name}` : name;
      const normalized = normalizeRel(rel);
      if (isAlwaysExcluded(normalized, alwaysExclude)) continue;

      const abs = join(absDir, name);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        // Prune ignored directories (Docker never descends into them).
        if (pathMatchedIgnored(normalized, rules)) continue;
        walk(abs, normalized);
      } else if (st.isFile() && !isIgnored(normalized, rules, alwaysExclude)) {
        out.push(normalized);
      }
    }
  };

  walk(root, '');
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

/** True when `file` is exactly `required` or lives under `required/`. */
export function coversRequired(file: string, required: string): boolean {
  const f = normalizeRel(file);
  const r = normalizeRel(required);
  return f === r || f.startsWith(`${r}/`);
}

export function missingRequired(
  files: readonly string[],
  required: readonly string[] = DOCKERFILE_REQUIRED,
): string[] {
  return required.filter((r) => !files.some((f) => coversRequired(f, r)));
}

export function forbiddenHits(
  files: readonly string[],
  prefixes: readonly string[] = CONTEXT_FORBIDDEN_PREFIXES,
): string[] {
  return files.filter((f) => {
    const n = normalizeRel(f);
    return prefixes.some((p) => n === p.replace(/\/$/, '') || n.startsWith(p));
  });
}

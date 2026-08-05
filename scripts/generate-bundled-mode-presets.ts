#!/usr/bin/env bun
/**
 * Materialize bundled builtin mode presets under data/decks/{deck-a,deck-b}/.
 *
 * Source of truth: shared/visual-mode-catalog.ts (VISUAL_MODE_CATALOG, modes 0–48).
 * Output: schemaVersion-1 preset.json per mode, duplicated strictly per deck
 * (no shared library). Safe to re-run after catalog renames.
 *
 * Usage:
 *   bun run scripts/generate-bundled-mode-presets.ts
 *   bun run scripts/generate-bundled-mode-presets.ts --check   # exit 1 if drift
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isFieldPrimitiveName,
  MODE_PRESET_SCHEMA_VERSION,
  type ModeDisposition,
  type ModePreset,
  validateModePreset,
} from '../shared/mode-preset-schema.ts';
import {
  type ModeBackend,
  VISUAL_MODE_CATALOG,
  type VisualModeEntry,
} from '../shared/visual-mode-catalog.ts';

const ROOT = join(import.meta.dir, '..');
const DECKS_ROOT = join(ROOT, 'data', 'decks');
const DECK_IDS = ['deck-a', 'deck-b'] as const;

/**
 * PascalCase / camelCase label → kebab-case slug.
 * CalabiYau → calabi-yau, PenroseTiling → penrose-tiling, PAdicNumbers → p-adic-numbers.
 */
export function labelToSlug(label: string): string {
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Map catalog backends + registration to a ModeDisposition.
 *
 * Family A (field + registered primitive) → field-primitive.
 * Figure / mesh-led → mesh-primary.
 * Fullscreen-led → fullscreen-primary.
 * Field-led without a registered primitive → engine-module (metadata for future).
 */
export function dispositionForEntry(entry: VisualModeEntry): ModeDisposition {
  const primary: ModeBackend | undefined = entry.backends[0];
  const slug = labelToSlug(entry.label);

  if (primary === 'figure') return 'mesh-primary';
  if (primary === 'mesh') return 'mesh-primary';
  if (primary === 'fullscreen') return 'fullscreen-primary';

  if (primary === 'field' || entry.backends.includes('field')) {
    // Family A primitives use the slug as field.primitive name.
    if (isFieldPrimitiveName(slug)) return 'field-primitive';
    return 'engine-module';
  }

  return 'engine-module';
}

export function buildPreset(entry: VisualModeEntry): ModePreset {
  const slug = labelToSlug(entry.label);
  const disposition = dispositionForEntry(entry);

  const preset: ModePreset = {
    schemaVersion: MODE_PRESET_SCHEMA_VERSION,
    id: slug,
    slug,
    label: entry.label,
    character: entry.character,
    uiGroup: entry.category,
    legacyIndex: entry.id,
    disposition,
  };

  if (entry.suppressLegacyField) {
    preset.suppressLegacyField = true;
  }

  if (disposition === 'field-primitive') {
    // Registered Family A names match kebab slug (beams, tunnel, …).
    if (!isFieldPrimitiveName(slug)) {
      throw new Error(
        `mode ${entry.id} (${entry.label}): field-primitive but slug "${slug}" is not a FieldPrimitiveName`,
      );
    }
    preset.field = { primitive: slug };
  }

  if (disposition === 'engine-module') {
    // Future engine hook; stable string for compile/apply later.
    preset.engineModule = slug;
  }

  if (disposition === 'mesh-primary' && entry.id === 24) {
    // Figure: mesh catalog figure (human-female via deck visual mode).
    preset.layers = [{ kind: 'mesh', ref: 'human-female' }];
  }

  return preset;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function expectedPresets(): Map<string, ModePreset> {
  const map = new Map<string, ModePreset>();
  for (const entry of VISUAL_MODE_CATALOG) {
    const preset = buildPreset(entry);
    const validated = validateModePreset(preset);
    if (!validated.ok) {
      throw new Error(
        `generated preset for ${entry.id} (${entry.label}) failed validation:\n  ${validated.errors.join('\n  ')}`,
      );
    }
    map.set(preset.slug, validated.value);
  }
  return map;
}

function writeDeck(deckId: (typeof DECK_IDS)[number], presets: Map<string, ModePreset>): number {
  const deckRoot = join(DECKS_ROOT, deckId);
  mkdirSync(deckRoot, { recursive: true });

  // Remove stale slug folders that are no longer in the catalog.
  if (existsSync(deckRoot)) {
    for (const name of readdirSync(deckRoot)) {
      if (name.startsWith('.')) continue;
      if (!presets.has(name)) {
        rmSync(join(deckRoot, name), { recursive: true, force: true });
      }
    }
  }

  let written = 0;
  for (const [slug, preset] of presets) {
    const folder = join(deckRoot, slug);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'preset.json'), stableJson(preset));
    written += 1;
  }
  return written;
}

function checkDeck(deckId: (typeof DECK_IDS)[number], presets: Map<string, ModePreset>): string[] {
  const errors: string[] = [];
  const deckRoot = join(DECKS_ROOT, deckId);
  if (!existsSync(deckRoot)) {
    return [`missing deck root ${deckRoot}`];
  }

  const onDisk = new Set(
    readdirSync(deckRoot).filter(
      (n) => !n.startsWith('.') && existsSync(join(deckRoot, n, 'preset.json')),
    ),
  );
  for (const slug of presets.keys()) {
    if (!onDisk.has(slug)) errors.push(`${deckId}: missing folder ${slug}`);
  }
  for (const slug of onDisk) {
    if (!presets.has(slug)) errors.push(`${deckId}: unexpected folder ${slug}`);
  }

  for (const [slug, expected] of presets) {
    const path = join(deckRoot, slug, 'preset.json');
    if (!existsSync(path)) continue;
    const actual = readFileSync(path, 'utf8');
    const want = stableJson(expected);
    if (actual !== want) {
      errors.push(`${deckId}/${slug}/preset.json differs from generated catalog`);
    }
  }
  return errors;
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  const presets = expectedPresets();

  if (presets.size !== VISUAL_MODE_CATALOG.length) {
    throw new Error(
      `expected ${VISUAL_MODE_CATALOG.length} presets, built ${presets.size} (slug collision?)`,
    );
  }

  // Unique legacyIndex 0..N-1
  const indices = [...presets.values()].map((p) => p.legacyIndex);
  const unique = new Set(indices);
  if (unique.size !== indices.length) {
    throw new Error('duplicate legacyIndex in generated presets');
  }
  for (let i = 0; i < VISUAL_MODE_CATALOG.length; i++) {
    if (!unique.has(i)) throw new Error(`missing legacyIndex ${i}`);
  }

  if (checkOnly) {
    const errors = DECK_IDS.flatMap((d) => checkDeck(d, presets));
    if (errors.length > 0) {
      console.error(`[generate-bundled-mode-presets] --check failed (${errors.length}):`);
      for (const e of errors) console.error(`  ${e}`);
      process.exit(1);
    }
    console.log(
      `[generate-bundled-mode-presets] ok: ${presets.size} presets × ${DECK_IDS.length} decks match catalog`,
    );
    return;
  }

  let total = 0;
  for (const deck of DECK_IDS) {
    total += writeDeck(deck, presets);
  }
  console.log(
    `[generate-bundled-mode-presets] wrote ${presets.size} presets × ${DECK_IDS.length} decks (${total} files) under data/decks/`,
  );
}

main();

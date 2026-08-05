export type DeckSide = 'A' | 'B';
export type DeckRenderPath = 'cpu' | 'gpu';

/**
 * Patch for a legacy int mode change. Slug is filled by bridge coerce via
 * resolveDeckSelection (launchpad stays int-only until dynamic catalog UI #241).
 */
export function deckModePatch(side: DeckSide, value: number) {
  return side === 'A' ? { deckAMode: Math.floor(value) } : { deckBMode: Math.floor(value) };
}

/** Patch for an explicit pack-slug selection (slug wins over any int). */
export function deckPresetSlugPatch(side: DeckSide, slug: string) {
  const trimmed = slug.trim();
  return side === 'A' ? { deckAPresetSlug: trimmed } : { deckBPresetSlug: trimmed };
}

/**
 * Bump the per-deck reload-active counter so the projector re-fetches compiled
 * for the current slug at the current catalog epoch (#241).
 */
export function deckReloadActivePatch(side: DeckSide, previousVersion: number) {
  const next = Math.max(0, Math.floor(previousVersion)) + 1;
  return side === 'A' ? { deckAReloadActiveVersion: next } : { deckBReloadActiveVersion: next };
}

export function deckGpuShaderModePatch(): Record<string, never> {
  return {};
}

export function deckVisibilityPatch(side: DeckSide, path: DeckRenderPath, enabled: boolean) {
  if (side === 'A' && path === 'cpu') return { cpuDeckAEnabled: enabled };
  if (side === 'A') return { gpuDeckAEnabled: enabled };
  if (path === 'cpu') return { cpuDeckBEnabled: enabled };
  return { gpuDeckBEnabled: enabled };
}

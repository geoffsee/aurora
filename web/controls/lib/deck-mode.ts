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

export function deckGpuShaderModePatch(): Record<string, never> {
  return {};
}

export function deckVisibilityPatch(side: DeckSide, path: DeckRenderPath, enabled: boolean) {
  if (side === 'A' && path === 'cpu') return { cpuDeckAEnabled: enabled };
  if (side === 'A') return { gpuDeckAEnabled: enabled };
  if (path === 'cpu') return { cpuDeckBEnabled: enabled };
  return { gpuDeckBEnabled: enabled };
}

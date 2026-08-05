export type DeckSide = 'A' | 'B';
export type DeckRenderPath = 'cpu' | 'gpu';

export function deckModePatch(side: DeckSide, value: number) {
  return side === 'A' ? { deckAMode: Math.floor(value) } : { deckBMode: Math.floor(value) };
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

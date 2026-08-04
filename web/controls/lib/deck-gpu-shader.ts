/**
 * Patches for the per-deck GPU shader launchpads.
 *
 * Dual-GPU mode crossfades `deckAGpuShader` ↔ `deckBGpuShader`. Each pad must
 * update only its own deck slot so A/B can stay distinct. `activeShader` is
 * mirrored to the last pick so solo (non-dual) GPU mode still has a live value.
 */

export type DeckGpuSide = 'A' | 'B';

export type DeckGpuShaderPatch = {
  deckAGpuShader?: number;
  deckBGpuShader?: number;
  activeShader: number;
};

/** Build a ControlState patch for one deck's GPU shader pad. Never touches the other deck. */
export function deckGpuShaderPatch(side: DeckGpuSide, value: number): DeckGpuShaderPatch {
  const v = Math.floor(value);
  if (side === 'A') {
    return { deckAGpuShader: v, activeShader: v };
  }
  return { deckBGpuShader: v, activeShader: v };
}

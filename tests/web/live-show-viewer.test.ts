import { describe, expect, test } from 'vitest';
import { createAudienceFrameAssembler, expandAudienceFrame } from '../../shared/live-show.ts';
import {
  consumeViewerFragment,
  isAudienceViewer,
  LIVE_SHOW_VIEWER_SESSION_KEY,
  loadViewerSession,
} from '../../shared/live-show-client.ts';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('audience viewer credentials', () => {
  test('moves a fragment grant to session storage and clears sensitive values', () => {
    const storage = new MemoryStorage();
    let replacement = '';
    const expiresAt = Date.now() + 60_000;
    const session = consumeViewerFragment(
      {
        hash: `#show=show-1&grant=signed-token&api=https%3A%2F%2Flive.example&expires=${expiresAt}&keep=yes`,
        pathname: '/viewer/',
        search: '?theme=dark',
      },
      storage,
      (url) => {
        replacement = url;
      },
    );
    expect(session).toMatchObject({ showId: 'show-1', viewerToken: 'signed-token' });
    expect(replacement).toBe('/viewer/?theme=dark#keep=yes');
    expect(storage.values.get(LIVE_SHOW_VIEWER_SESSION_KEY)).not.toContain('keep');
    expect(loadViewerSession(storage)).toEqual(session);
  });

  test('reassembles chunked imported shader state in order', () => {
    const original = {
      address: '/aurora/shader/imported',
      args: [{ wgsl: 'shader'.repeat(20_000), meta: { label: 'Test shader' } }],
    };
    const chunks = expandAudienceFrame(original);
    const assemble = createAudienceFrameAssembler();
    const result = chunks.flatMap(assemble);
    expect(result).toEqual([original]);
  });

  test('an expired audience tab remains marked receive-only after reload', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LIVE_SHOW_VIEWER_SESSION_KEY,
      JSON.stringify({
        showId: 'ended-show',
        viewerToken: 'expired-token',
        liveApiUrl: 'https://live.example',
        expiresAt: Date.now() - 1,
      }),
    );
    expect(loadViewerSession(storage)).toBeNull();
    expect(isAudienceViewer(storage)).toBe(true);
  });
});

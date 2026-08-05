import { describe, expect, test } from 'vitest';
import {
  bridgeHttpOrigin,
  modesCatalogLiveUrl,
  modesCatalogStaticUrl,
  modesCatalogUrl,
  modesCompiledLiveUrl,
  modesCompiledStaticUrl,
  modesCompiledUrl,
} from '../../web/controls/lib/modes-api-client.ts';

const pagesControls = {
  protocol: 'https:',
  hostname: 'geoffsee.github.io',
  port: '',
  pathname: '/aurora/controls/',
  search: '',
} as const;

const pagesProjector = {
  protocol: 'https:',
  hostname: 'geoffsee.github.io',
  port: '',
  pathname: '/aurora/',
  search: '',
} as const;

const localBridge = {
  protocol: 'http:',
  hostname: '127.0.0.1',
  port: '3001',
  pathname: '/',
  search: '',
} as const;

describe('modes-api-client static vs bridge URLs', () => {
  test('GitHub Pages prefers path-based catalog under /aurora', () => {
    expect(modesCatalogUrl(pagesControls)).toBe(
      'https://geoffsee.github.io/aurora/api/modes/catalog.json',
    );
    expect(modesCatalogUrl(pagesProjector)).toBe(
      'https://geoffsee.github.io/aurora/api/modes/catalog.json',
    );
    expect(modesCatalogStaticUrl(pagesControls)).toBe(modesCatalogUrl(pagesControls));
  });

  test('GitHub Pages compiled wires use deck/slug.json paths', () => {
    expect(modesCompiledUrl({ deck: 'deck-a', slug: 'beams' }, pagesControls)).toBe(
      'https://geoffsee.github.io/aurora/api/modes/compiled/deck-a/beams.json',
    );
    expect(modesCompiledStaticUrl({ deck: 'deck-b', slug: 'tunnel' }, pagesProjector)).toBe(
      'https://geoffsee.github.io/aurora/api/modes/compiled/deck-b/tunnel.json',
    );
  });

  test('local bridge keeps live query-string API on projector origin', () => {
    expect(bridgeHttpOrigin(localBridge)).toBe('http://127.0.0.1:3000');
    expect(modesCatalogUrl(localBridge)).toBe('http://127.0.0.1:3000/api/modes/catalog');
    expect(modesCatalogLiveUrl(localBridge)).toBe(modesCatalogUrl(localBridge));
    expect(modesCompiledUrl({ deck: 'deck-a', slug: 'beams', epoch: 2 }, localBridge)).toBe(
      'http://127.0.0.1:3000/api/modes/compiled?deck=deck-a&slug=beams&epoch=2',
    );
    expect(modesCompiledLiveUrl({ deck: 'deck-a', slug: 'beams', epoch: 2 }, localBridge)).toBe(
      modesCompiledUrl({ deck: 'deck-a', slug: 'beams', epoch: 2 }, localBridge),
    );
  });
});

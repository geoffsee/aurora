import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  CONSOLE_OVERRIDE_PARAM,
  consoleClientUrl,
  decideMobileSurface,
  HANDSET_MEDIA_QUERY,
  isHandsetClient,
  loadSurfacePreference,
  MOBILE_OVERRIDE_PARAM,
  mobileClientUrl,
  SURFACE_PREFERENCE_KEY,
  type SurfacePreference,
  saveSurfacePreference,
} from '../../shared/mobile-routing.ts';

type Loc = Parameters<typeof mobileClientUrl>[0];

/** A location-ish for the layouts the helpers have to cover. */
function loc(overrides: Partial<Loc> = {}): Loc {
  return {
    protocol: 'https:',
    hostname: 'localhost',
    port: '8444',
    pathname: '/',
    search: '',
    hash: '',
    ...overrides,
  };
}

function createLocalStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorage());
});

describe('mobileClientUrl', () => {
  test('resolves /mobile/ on the docker controls origin', () => {
    expect(mobileClientUrl(loc())).toBe('https://localhost:8444/mobile/');
  });

  test('resolves under the site prefix on project Pages', () => {
    expect(
      mobileClientUrl(
        loc({ hostname: 'geoffsee.github.io', port: '', pathname: '/aurora/controls/' }),
      ),
    ).toBe('https://geoffsee.github.io/aurora/mobile/');
  });

  test('carries instance / token / relay params through the hop', () => {
    const url = mobileClientUrl(
      loc({ search: '?instance=https%3A%2F%2Fshow.lan%3A8444&token=abc' }),
    );
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/mobile/');
    expect(parsed.searchParams.get('instance')).toBe('https://show.lan:8444');
    expect(parsed.searchParams.get('token')).toBe('abc');
  });

  test('drops the routing overrides and keeps the hash', () => {
    const url = mobileClientUrl(loc({ search: '?mobile=1&console=1&token=abc', hash: '#cues' }));
    const parsed = new URL(url);
    expect(parsed.searchParams.get(MOBILE_OVERRIDE_PARAM)).toBeNull();
    expect(parsed.searchParams.get(CONSOLE_OVERRIDE_PARAM)).toBeNull();
    expect(parsed.searchParams.get('token')).toBe('abc');
    expect(parsed.hash).toBe('#cues');
  });
});

describe('consoleClientUrl', () => {
  test('pins the arrival with ?console=1 so the phone is not bounced back', () => {
    const parsed = new URL(consoleClientUrl(loc({ pathname: '/mobile/' })));
    expect(parsed.pathname).toBe('/controls/');
    expect(parsed.searchParams.get(CONSOLE_OVERRIDE_PARAM)).toBe('1');
  });

  test('keeps instance targeting when switching surfaces', () => {
    const parsed = new URL(
      consoleClientUrl(loc({ pathname: '/aurora/mobile/', search: '?instance=x&token=y' })),
    );
    expect(parsed.pathname).toBe('/aurora/controls/');
    expect(parsed.searchParams.get('instance')).toBe('x');
    expect(parsed.searchParams.get('token')).toBe('y');
  });
});

describe('isHandsetClient', () => {
  test('reports the coarse-pointer + short-edge match', () => {
    expect(isHandsetClient((query) => ({ matches: query === HANDSET_MEDIA_QUERY }))).toBe(true);
    expect(isHandsetClient(() => ({ matches: false }))).toBe(false);
  });

  test('treats an unusable matchMedia as "not a handset"', () => {
    vi.stubGlobal('window', {});
    expect(isHandsetClient()).toBe(false);
  });
});

describe('decideMobileSurface', () => {
  const decide = (search: string, handset: boolean, preference: SurfacePreference | null = null) =>
    decideMobileSurface({ loc: loc({ search }), handset, preference });

  test('leaves desktops alone', () => {
    expect(decide('', false)).toEqual({ kind: 'stay' });
  });

  test('offers — never force-bounces — an unrecognised handset', () => {
    expect(decide('', true)).toEqual({
      kind: 'offer',
      url: 'https://localhost:8444/mobile/',
    });
  });

  test('?mobile=1 forces the phone UI even on a desktop', () => {
    expect(decide('?mobile=1', false).kind).toBe('redirect');
    expect(decide('?mobile', false).kind).toBe('redirect');
  });

  test('?console=1 outranks handset detection', () => {
    expect(decide('?console=1', true)).toEqual({ kind: 'stay' });
  });

  test('?mobile=1 outranks a stored console preference', () => {
    expect(decide('?mobile=1', true, 'console').kind).toBe('redirect');
  });

  test('a stored console choice stops the offer coming back', () => {
    expect(decide('', true, 'console')).toEqual({ kind: 'stay' });
  });

  test('a stored mobile choice skips the interstitial on later visits', () => {
    expect(decide('', true, 'mobile').kind).toBe('redirect');
  });

  test('a stored mobile choice does not drag a desktop along', () => {
    expect(decide('', false, 'mobile')).toEqual({ kind: 'stay' });
  });

  test('mobile=0 is not an override', () => {
    expect(decide('?mobile=0', false)).toEqual({ kind: 'stay' });
  });
});

describe('surface preference storage', () => {
  test('round-trips under the stable key', () => {
    saveSurfacePreference('mobile');
    expect(localStorage.getItem(SURFACE_PREFERENCE_KEY)).toBe('mobile');
    expect(loadSurfacePreference()).toBe('mobile');

    saveSurfacePreference('console');
    expect(loadSurfacePreference()).toBe('console');
  });

  test('null forgets the choice, and junk reads as no choice', () => {
    saveSurfacePreference('mobile');
    saveSurfacePreference(null);
    expect(loadSurfacePreference()).toBeNull();

    localStorage.setItem(SURFACE_PREFERENCE_KEY, 'tablet');
    expect(loadSurfacePreference()).toBeNull();
  });

  test('load survives storage that throws (private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('denied');
      },
      setItem() {
        throw new Error('denied');
      },
      removeItem() {
        throw new Error('denied');
      },
    });
    expect(loadSurfacePreference()).toBeNull();
    expect(() => saveSurfacePreference('mobile')).not.toThrow();
  });
});

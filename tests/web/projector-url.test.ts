import { describe, expect, test } from 'vitest';
import {
  bridgeWebSocketUrl,
  CONTROLS_PORT,
  MUXOX_UI_PORT,
  PROJECTOR_PORT,
  projectorPortForControlsPort,
  projectorPreviewUrl,
  projectorWindowUrl,
} from '../../web/controls/lib/projector-url.ts';

describe('port constants', () => {
  test('show stack uses 8443/8444/8450 (not 3000/3001)', () => {
    expect(PROJECTOR_PORT).toBe(8443);
    expect(CONTROLS_PORT).toBe(8444);
    expect(MUXOX_UI_PORT).toBe(8450);
  });
});

describe('projectorPortForControlsPort', () => {
  test('maps controls 8444 → projector 8443', () => {
    expect(projectorPortForControlsPort('8444')).toBe(8443);
  });

  test('returns null for unrelated ports', () => {
    expect(projectorPortForControlsPort('3001')).toBeNull();
    expect(projectorPortForControlsPort('')).toBeNull();
  });
});

describe('projectorPreviewUrl', () => {
  test('points at the projector port when served from the controls bridge', () => {
    const url = projectorPreviewUrl({
      port: String(CONTROLS_PORT),
      protocol: 'https:',
      hostname: '127.0.0.1',
      href: `https://127.0.0.1:${CONTROLS_PORT}/`,
    });
    expect(url).toBe(`https://127.0.0.1:${PROJECTOR_PORT}/?embed=1`);
  });

  test('uses a relative parent URL on static hosting', () => {
    const url = projectorPreviewUrl({
      port: '',
      protocol: 'https:',
      hostname: 'example.github.io',
      href: 'https://example.github.io/aurora/controls/index.html',
    });
    expect(url).toBe('https://example.github.io/aurora/?embed=1');
  });
});

describe('projectorWindowUrl', () => {
  test('opens the clean projector page without embed', () => {
    expect(
      projectorWindowUrl({
        port: '',
        protocol: 'https:',
        hostname: 'geoffsee.github.io',
        href: 'https://geoffsee.github.io/aurora/controls/',
      }),
    ).toBe('https://geoffsee.github.io/aurora/');
  });
});

describe('bridgeWebSocketUrl', () => {
  test('controls page opens wss to the projector sibling port', () => {
    expect(
      bridgeWebSocketUrl({
        protocol: 'https:',
        hostname: '192.168.1.109',
        port: '8444',
      }),
    ).toBe('wss://192.168.1.109:8443/ws');
  });

  test('same-origin when not on the controls port', () => {
    expect(
      bridgeWebSocketUrl({
        protocol: 'https:',
        hostname: '127.0.0.1',
        port: '8443',
      }),
    ).toBe('wss://127.0.0.1:8443/ws');
  });
});

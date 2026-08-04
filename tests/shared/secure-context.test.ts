import { describe, expect, test } from 'vitest';
import { isBrowserSecureContext, webgpuSecureContextError } from '../../shared/secure-context.ts';

describe('isBrowserSecureContext', () => {
  test('allows secure contexts and loopback hosts', () => {
    expect(isBrowserSecureContext({ isSecureContext: true, hostname: 'vj.example' })).toBe(true);
    expect(isBrowserSecureContext({ isSecureContext: false, hostname: 'localhost' })).toBe(true);
    expect(isBrowserSecureContext({ isSecureContext: false, hostname: '127.0.0.1' })).toBe(true);
    expect(isBrowserSecureContext({ isSecureContext: false, hostname: '[::1]' })).toBe(true);
  });

  test('blocks plain-HTTP LAN origins', () => {
    expect(
      isBrowserSecureContext({
        isSecureContext: false,
        hostname: '192.168.1.109',
      }),
    ).toBe(false);
  });
});

describe('webgpuSecureContextError', () => {
  test('returns null when WebGPU may boot', () => {
    expect(webgpuSecureContextError({ isSecureContext: true, hostname: 'vj.example' })).toBeNull();
    expect(webgpuSecureContextError({ isSecureContext: false, hostname: 'localhost' })).toBeNull();
  });

  test('explains LAN HTTP failure with actionable fixes', () => {
    const err = webgpuSecureContextError({
      isSecureContext: false,
      hostname: '192.168.1.109',
    });
    expect(err).toBeTypeOf('string');
    expect(err).toContain('192.168.1.109');
    expect(err).toMatch(/WebGPU/i);
    expect(err).toMatch(/\baurora\b/);
    expect(err).toMatch(/8443/);
    expect(err).toMatch(/8444/);
  });
});

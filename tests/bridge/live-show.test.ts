import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { AudienceFrameBatcher, LiveShowManager } from '../../bridge/live-show.ts';

describe('bridge audience batching', () => {
  test('batches at 50 ms, filters unsafe frames, and coalesces meters', () => {
    vi.useFakeTimers();
    const batches: unknown[][] = [];
    const batcher = new AudienceFrameBatcher((frames) => batches.push(frames));
    batcher.push({ address: '/aurora/error', error: 'do not leak' });
    batcher.push({ address: '/live/song/get/track_data', args: [0.1] });
    batcher.push({ address: '/live/song/get/track_data', args: [0.8] });
    expect(batches).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(batches).toEqual([[{ address: '/live/song/get/track_data', args: [0.8] }]]);
    batcher.close();
    vi.useRealTimers();
  });

  test('chunks oversized imported shaders below the relay envelope cap', () => {
    const batches: Array<Array<{ address: string; args?: unknown[] }>> = [];
    const batcher = new AudienceFrameBatcher((frames) => batches.push(frames));
    expect(
      batcher.push({
        address: '/aurora/shader/imported',
        args: [{ wgsl: 'x'.repeat(90_000), meta: { label: 'Large' } }],
      }),
    ).toBe(true);
    batcher.flush();
    expect(batches.flat().length).toBeGreaterThan(1);
    expect(batches.flat().every((frame) => frame.address.endsWith('/chunk'))).toBe(true);
    expect(batches.every((batch) => JSON.stringify(batch).length < 64 * 1_024)).toBe(true);
    batcher.close();
  });
});

describe('live-show ingress configuration', () => {
  test('external HTTPS ingress does not require a Cloudflare token', () => {
    const manager = new LiveShowManager({
      apiUrl: 'https://relay.example',
      publicUrl: 'https://show.example',
      ingress: 'external',
      runtime: 'native',
      persistenceFile: join(tmpdir(), `aurora-live-${crypto.randomUUID()}.json`),
    });
    expect(manager.configuration()).toMatchObject({
      enabled: true,
      missing: [],
      ingress: 'external',
    });
    manager.close();
  });

  test('explicit Cloudflare ingress still requires its connector token', () => {
    const manager = new LiveShowManager({
      apiUrl: 'https://relay.example',
      publicUrl: 'https://show.example',
      ingress: 'cloudflare',
      runtime: 'docker',
      persistenceFile: join(tmpdir(), `aurora-live-${crypto.randomUUID()}.json`),
    });
    expect(manager.configuration()).toMatchObject({
      enabled: false,
      missing: ['CLOUDFLARE_TUNNEL_TOKEN'],
      ingress: 'cloudflare',
    });
    manager.close();
  });
});

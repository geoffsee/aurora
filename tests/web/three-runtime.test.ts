import { describe, expect, test } from 'vitest';
import { AdaptiveDprGovernor, ThreeResourceTracker } from '../../web/three-runtime.ts';

describe('AdaptiveDprGovernor', () => {
  test('reduces after a bad 120-frame window and never below one-half', () => {
    const governor = new AdaptiveDprGovernor();
    for (let window = 0; window < 8; window += 1) {
      for (let frame = 0; frame < 120; frame += 1) governor.sample(24, 10, 13, false);
    }
    expect(governor.scale).toBe(0.5);
    expect(governor.adaptations).toBe(5);
  });

  test('recovers slowly after ten stable seconds', () => {
    const governor = new AdaptiveDprGovernor();
    for (let frame = 0; frame < 120; frame += 1) governor.sample(25, 9, null, false);
    expect(governor.scale).toBeCloseTo(0.9);
    for (let frame = 0; frame < 720; frame += 1) governor.sample(16, 4, null, false);
    expect(governor.scale).toBeGreaterThan(0.9);
  });
});

describe('ThreeResourceTracker', () => {
  test('returns to baseline after disposal', () => {
    const tracker = new ThreeResourceTracker();
    let disposed = 0;
    for (let index = 0; index < 20; index += 1)
      tracker.track({
        dispose: () => {
          disposed += 1;
        },
      });
    expect(tracker.size).toBe(20);
    tracker.dispose();
    expect(tracker.size).toBe(0);
    expect(disposed).toBe(20);
  });
});

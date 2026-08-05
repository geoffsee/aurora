import { expect, test } from 'vitest';
import { createBanner, pushBanner } from '../../web/controls/lib/banners.ts';

test('repeated identical UDP errors are coalesced into one banner', () => {
  const first = createBanner('OSC UDP error: send EINVAL 192.168.65.254:11000');
  const next = pushBanner([first], first.description);

  expect(next).toHaveLength(1);
  expect(next[0]?.id).toBe(first.id);
});

test('different errors remain independently visible', () => {
  const next = pushBanner(
    [createBanner('OSC UDP error: send EINVAL 192.168.65.254:11000')],
    'VST control UDP error: send EINVAL',
  );

  expect(next).toHaveLength(2);
});

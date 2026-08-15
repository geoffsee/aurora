import { Button, Grid } from '@chakra-ui/react';
import { HAPTIC_TICK_MS, haptic } from '../lib/haptics.ts';
import { sizesFor, useCompactLayout } from '../lib/layout.ts';
import { MOBILE_TABS, type MobileTabId } from '../lib/tabs.ts';

export function TabBar({
  active,
  onSelect,
}: {
  active: MobileTabId;
  onSelect: (tab: MobileTabId) => void;
}) {
  const sizes = sizesFor(useCompactLayout());

  return (
    <Grid
      as="nav"
      aria-label="Sections"
      templateColumns={`repeat(${MOBILE_TABS.length}, 1fr)`}
      gap={2}
      px={3}
      pb="max(env(safe-area-inset-bottom), 0.5rem)"
    >
      {MOBILE_TABS.map((tab) => (
        <Button
          key={tab.id}
          h={sizes.controlHeight}
          fontSize="md"
          fontWeight="bold"
          variant="surface"
          // Explicit colours rather than variant tokens: at a glance in a dark
          // room, Chakra's dark `solid` cyan sits too close to `surface` gray.
          bg={active === tab.id ? 'cyan.300' : 'whiteAlpha.100'}
          color={active === tab.id ? 'black' : 'whiteAlpha.800'}
          _hover={{ bg: active === tab.id ? 'cyan.200' : 'whiteAlpha.200' }}
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => {
            if (tab.id !== active) haptic(HAPTIC_TICK_MS);
            onSelect(tab.id);
          }}
        >
          {tab.label}
        </Button>
      ))}
    </Grid>
  );
}

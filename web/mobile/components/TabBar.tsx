import { Button, Grid } from '@chakra-ui/react';
import { MOBILE_TABS, type MobileTabId } from '../lib/tabs.ts';

export function TabBar({
  active,
  onSelect,
}: {
  active: MobileTabId;
  onSelect: (tab: MobileTabId) => void;
}) {
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
          h="3.25rem"
          fontSize="md"
          fontWeight="bold"
          variant="surface"
          // Explicit colours rather than variant tokens: at a glance in a dark
          // room, Chakra's dark `solid` cyan sits too close to `surface` gray.
          bg={active === tab.id ? 'cyan.300' : 'whiteAlpha.100'}
          color={active === tab.id ? 'black' : 'whiteAlpha.800'}
          _hover={{ bg: active === tab.id ? 'cyan.200' : 'whiteAlpha.200' }}
          aria-current={active === tab.id ? 'page' : undefined}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </Button>
      ))}
    </Grid>
  );
}

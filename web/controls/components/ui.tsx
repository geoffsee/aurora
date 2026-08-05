import { Badge, type BadgeProps, Box } from '@chakra-ui/react';

export type PillState =
  | 'connecting'
  | 'live'
  | 'idle'
  | 'info'
  | 'warn'
  | 'error'
  | 'demo'
  | 'static'
  | 'recording'
  | 'replaying'
  | 'ready';

const pillColors: Record<PillState, BadgeProps['colorPalette']> = {
  connecting: 'yellow',
  live: 'green',
  idle: 'gray',
  info: 'cyan',
  warn: 'orange',
  error: 'red',
  demo: 'purple',
  static: 'cyan',
  recording: 'red',
  replaying: 'purple',
  ready: 'gray',
};

export function StatusPill({ children, state }: { children: React.ReactNode; state: PillState }) {
  return (
    <Badge
      colorPalette={pillColors[state] ?? 'gray'}
      variant="subtle"
      px={4}
      py={2}
      borderRadius="md"
      fontSize="md"
      fontWeight="bold"
      textTransform="none"
      minH="2.5rem"
      display="inline-flex"
      alignItems="center"
    >
      {children}
    </Badge>
  );
}

export function Panel({
  children,
  area,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  area?: string;
  'aria-label'?: string;
}) {
  return (
    <Box
      gridArea={area}
      minW={0}
      maxW="100%"
      borderWidth="1px"
      borderColor="whiteAlpha.200"
      borderRadius="lg"
      bg="blackAlpha.500"
      backdropFilter="blur(14px)"
      p={4}
      aria-label={ariaLabel}
    >
      {children}
    </Box>
  );
}

export function SectionTitle({ title, badge }: { title: string; badge?: React.ReactNode }) {
  return (
    <Box display="flex" alignItems="center" justifyContent="space-between" gap={3} mb={3}>
      <Box as="h2" fontSize="lg" fontWeight="bold" m={0}>
        {title}
      </Box>
      {badge}
    </Box>
  );
}

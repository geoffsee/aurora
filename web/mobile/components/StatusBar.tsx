import { Badge, Box, Button, Flex, Text } from '@chakra-ui/react';
import { StatusPill } from '../../controls/components/ui.tsx';
import { useControls } from '../../controls/context/ControlsContext.tsx';
import { describeAudioSource, describeBridge, describeLatency, isFeedLive } from '../lib/status.ts';

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <title>Instance and audio settings</title>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function StatusBar({ onSettings }: { onSettings: () => void }) {
  const { bridgeStatus, state, osc, latencyP95 } = useControls();

  const now = performance.now();
  const bridge = describeBridge(bridgeStatus);
  const audio = describeAudioSource({
    demoMode: state.demoMode,
    browserAudioLive: isFeedLive(osc.lastBrowserAudioAt, now),
    oscLive: isFeedLive(osc.lastFrameAt, now),
  });
  const latency = describeLatency(latencyP95);

  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={2}
      bg="rgba(9, 8, 4, 0.92)"
      backdropFilter="blur(12px)"
      borderBottomWidth="1px"
      borderColor="whiteAlpha.200"
      pt="env(safe-area-inset-top)"
      px={3}
      py={2}
    >
      <Flex align="center" justify="space-between" gap={2}>
        <Flex role="status" aria-live="polite" gap={2} align="center" wrap="wrap" minW={0}>
          <StatusPill state={bridge.state}>{bridge.label}</StatusPill>
          <StatusPill state={audio.state}>{audio.label}</StatusPill>
          <StatusPill state={latency.state}>{latency.label}</StatusPill>
        </Flex>
        <Flex align="center" gap={2} flexShrink={0}>
          <Badge
            colorPalette="yellow"
            variant="subtle"
            px={3}
            py={2}
            borderRadius="md"
            fontFamily="mono"
            fontSize="md"
            fontWeight="bold"
          >
            <Text as="span" srOnly>
              Tempo
            </Text>
            {state.bpm.toFixed(0)}
          </Badge>
          <Button
            aria-label="Settings"
            onClick={onSettings}
            variant="surface"
            minW="3rem"
            h="3rem"
            px={0}
          >
            <GearIcon />
          </Button>
        </Flex>
      </Flex>
    </Box>
  );
}

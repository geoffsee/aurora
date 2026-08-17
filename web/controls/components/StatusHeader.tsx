import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { studioAppUrl } from '../../../shared/static-hosting.ts';
import { useControls } from '../context/ControlsContext.tsx';
import { CLOCK_LABELS } from '../lib/constants.ts';
import { LiveShowControl } from './LiveShowControl.tsx';
import { PairPhoneControl } from './PairPhoneControl.tsx';
import { Panel, StatusPill } from './ui.tsx';

export function StatusHeader({ onSettings }: { onSettings: () => void }) {
  const {
    bridgeStatus,
    state,
    osc,
    diagnostics,
    activePresetIndex,
    getPresetSlot,
    latencyP95,
    pendingCue,
  } = useControls();

  const oscLive = performance.now() - osc.lastFrameAt < 3000;
  const browserAudioLive = performance.now() - osc.lastBrowserAudioAt < 3000;
  const activePreset = activePresetIndex !== null ? getPresetSlot(activePresetIndex) : null;

  const bridgeLabel =
    bridgeStatus === 'live'
      ? 'bridge live'
      : bridgeStatus === 'static'
        ? 'static preview'
        : bridgeStatus === 'error'
          ? 'bridge error'
          : 'bridge connecting';

  const bridgePillState =
    bridgeStatus === 'live'
      ? 'live'
      : bridgeStatus === 'static'
        ? 'static'
        : bridgeStatus === 'error'
          ? 'error'
          : 'connecting';

  const oscLabel = state.demoMode
    ? 'Demo audio'
    : browserAudioLive
      ? 'Mic audio'
      : oscLive
        ? 'OSC live'
        : 'OSC idle';

  const oscState = state.demoMode ? 'demo' : browserAudioLive || oscLive ? 'live' : 'idle';

  return (
    <Panel area="head">
      <Flex align="center" justify="space-between" gap={4} wrap="wrap">
        <Box>
          <Text
            fontSize="sm"
            textTransform="uppercase"
            letterSpacing="wider"
            color="whiteAlpha.700"
            mb={1}
          >
            aurora
          </Text>
          <Text as="h1" fontSize="3xl" fontWeight="bold" m={0}>
            Console
          </Text>
        </Box>
        <Flex role="status" aria-live="polite" gap={3} wrap="wrap" justify="flex-end">
          <StatusPill state={bridgePillState}>{bridgeLabel}</StatusPill>
          <StatusPill state={oscState}>{oscLabel}</StatusPill>
          <StatusPill state={diagnostics.clockSource ? 'live' : 'idle'}>
            Clock {CLOCK_LABELS[diagnostics.clockSource ?? ''] ?? '—'}
          </StatusPill>
          <StatusPill state={activePreset ? 'info' : 'idle'}>
            {activePreset ? activePreset.name || `Preset ${activePresetIndex}` : 'No preset'}
          </StatusPill>
          <StatusPill state={diagnostics.oscReady ? 'info' : 'warn'}>
            {diagnostics.sockets} viewer
            {diagnostics.sockets === 1 ? '' : 's'} ·{' '}
            {diagnostics.oscReady ? 'OSC ready' : 'OSC wait'}
          </StatusPill>
          <StatusPill
            state={
              latencyP95 === null
                ? 'info'
                : latencyP95 < 30
                  ? 'live'
                  : latencyP95 < 100
                    ? 'info'
                    : 'warn'
            }
          >
            P95 {latencyP95 === null ? '—ms' : `${latencyP95.toFixed(0)}ms`}
          </StatusPill>
          <PairPhoneControl />
          <LiveShowControl />
          <Button
            size="sm"
            colorPalette="green"
            variant="outline"
            onClick={() => {
              window.open(studioAppUrl(), '_blank', 'noopener,noreferrer');
            }}
            title="Open Preset Studio (author packages)"
            aria-label="Open Preset Studio"
          >
            Studio
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettings}
            aria-label="Settings"
            title="Settings"
            fontSize="lg"
            minW="2.5rem"
            h="2.5rem"
            p={0}
          >
            ⚙️
          </Button>
        </Flex>
      </Flex>
      {pendingCue ? (
        <Text mt={2} fontSize="sm" color="cyan.200">
          Queued {pendingCue.name} on {state.barSync ? 'bar' : 'beat'}
        </Text>
      ) : null}
    </Panel>
  );
}

import { Badge, Box, Button, Flex, Input, Text } from '@chakra-ui/react';
import { useCallback } from 'react';
import { updatePaletteFromHex, useControls } from '../context/ControlsContext.tsx';
import { rgbToHex } from '../lib/palette.ts';
import { Panel } from './ui.tsx';

export function CrossfadePanel() {
  const { state, updateState, resetState, savePreset, pendingCue } = useControls();

  const setCrossfade = useCallback(
    (crossfade: number) => updateState({ crossfade }),
    [updateState],
  );

  const paletteHex = rgbToHex(state.paletteR, state.paletteG, state.paletteB);

  const quantizeLabel = pendingCue
    ? state.barSync
      ? `Queued ${pendingCue.name} on bar`
      : `Queued ${pendingCue.name} on beat`
    : state.beatSync
      ? state.barSync
        ? 'Bar sync'
        : 'Beat sync'
      : 'Immediate';

  return (
    <Panel area="hero" aria-label="Crossfade">
      <Flex direction="column" h="100%" justify="center" gap={3}>
        <Flex align="center" justify="space-between" gap={3}>
          <Badge
            colorPalette="yellow"
            px={4}
            py={2}
            borderRadius="md"
            fontSize="md"
            fontWeight="bold"
          >
            Deck A
          </Badge>
          <Box textAlign="center">
            <Text
              fontSize="xs"
              textTransform="uppercase"
              letterSpacing="wider"
              color="whiteAlpha.600"
            >
              Crossfade
            </Text>
            <Text fontSize="3xl" fontWeight="bold" fontFamily="mono" lineHeight="1">
              {Math.round(state.crossfade * 100)}%
            </Text>
          </Box>
          <Badge
            colorPalette="teal"
            px={4}
            py={2}
            borderRadius="md"
            fontSize="md"
            fontWeight="bold"
          >
            Deck B
          </Badge>
        </Flex>
        <Box w="100%" position="relative">
          <input
            type="range"
            aria-label="Crossfade"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={state.crossfade}
            value={state.crossfade}
            min={0}
            max={1}
            step={0.001}
            onChange={(e) => setCrossfade(Number(e.target.value))}
            style={{
              width: '100%',
              height: '0.55rem',
              borderRadius: '999px',
              background: 'linear-gradient(90deg, #998862, rgba(255,255,255,0.12) 50%, #58767a)',
              appearance: 'none',
              WebkitAppearance: 'none',
              outline: 'none',
              margin: '0.4rem 0',
              cursor: 'pointer',
            }}
          />
        </Box>
        <Flex gap={2}>
          <Button
            flex={1}
            size="md"
            colorPalette="yellow"
            variant={state.crossfade < 0.05 ? 'solid' : 'subtle'}
            onClick={() => updateState({ crossfade: 0 })}
          >
            A Full
          </Button>
          <Button
            flex={1}
            size="md"
            variant={state.crossfade > 0.45 && state.crossfade < 0.55 ? 'solid' : 'subtle'}
            onClick={() => updateState({ crossfade: 0.5 })}
          >
            Center
          </Button>
          <Button
            flex={1}
            size="md"
            colorPalette="teal"
            variant={state.crossfade > 0.95 ? 'solid' : 'subtle'}
            onClick={() => updateState({ crossfade: 1 })}
          >
            B Full
          </Button>
        </Flex>
        <Flex gap={2} wrap="wrap" align="center">
          <Button
            flex={1}
            minW="6.5rem"
            size="md"
            variant={state.beatSync ? 'solid' : 'surface'}
            colorPalette="yellow"
            onClick={() => updateState({ beatSync: !state.beatSync })}
            aria-pressed={state.beatSync}
          >
            Beat Sync
          </Button>
          <Button
            flex={1}
            minW="6.5rem"
            size="md"
            variant={state.barSync ? 'solid' : 'surface'}
            onClick={() => {
              const barSync = !state.barSync;
              updateState({
                barSync,
                beatSync: state.beatSync || barSync,
              });
            }}
            aria-pressed={state.barSync}
          >
            Bar Sync
          </Button>
          <Badge colorPalette="yellow" px={3} py={2} borderRadius="md" fontSize="sm">
            {quantizeLabel}
          </Badge>
          <Button
            flex={1}
            minW="6.5rem"
            size="md"
            colorPalette="purple"
            onClick={() => updateState({ flashVersion: state.flashVersion + 1 })}
          >
            Flash
          </Button>
          <Button flex={1} minW="6.5rem" size="md" variant="surface" onClick={savePreset}>
            Save Preset
          </Button>
        </Flex>
        <Flex gap={2} wrap="wrap" align="center">
          {(
            [
              ['rings', 'Rings', state.rings],
              ['strobe', 'Strobe', state.strobe],
              ['strobeLockout', 'Strobe Lock', state.strobeLockout],
              ['freeze', 'Freeze', state.freeze],
              ['blackout', 'Blackout', state.blackout],
            ] as const
          ).map(([key, label, pressed]) => (
            <Button
              key={key}
              size="sm"
              variant={pressed ? 'solid' : 'surface'}
              colorPalette={key === 'blackout' ? 'red' : 'yellow'}
              aria-pressed={pressed}
              onClick={() => {
                if (key === 'strobe') {
                  if (state.strobeLockout) {
                    updateState({ strobeLockout: false, strobe: true });
                  } else {
                    updateState({ strobe: !state.strobe });
                  }
                  return;
                }
                if (key === 'strobeLockout') {
                  const nextLockout = !state.strobeLockout;
                  updateState({
                    strobeLockout: nextLockout,
                    strobe: nextLockout ? false : state.strobe,
                  });
                  return;
                }
                updateState({ [key]: !state[key] } as Partial<typeof state>);
              }}
            >
              {label}
            </Button>
          ))}
          <Button size="sm" colorPalette="red" onClick={resetState}>
            Reset
          </Button>
          <Flex align="center" gap={2} ml={2}>
            <Text fontSize="sm" fontWeight="semibold" whiteSpace="nowrap">Color</Text>
            <Text fontFamily="mono" fontSize="sm" color="whiteAlpha.700">{paletteHex}</Text>
            <Input
              type="color"
              value={paletteHex}
              width="28px"
              height="28px"
              padding={0}
              border="1px solid"
              borderColor="whiteAlpha.300"
              borderRadius="md"
              onChange={(e) => {
                const patch = updatePaletteFromHex(state, e.target.value);
                if (patch) updateState(patch);
              }}
            />
          </Flex>
        </Flex>
      </Flex>
    </Panel>
  );
}

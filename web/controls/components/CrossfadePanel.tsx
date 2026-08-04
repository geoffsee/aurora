import { Badge, Box, Button, Flex, Text } from '@chakra-ui/react';
import { useCallback } from 'react';
import { useControls } from '../context/ControlsContext.tsx';
import { ParamSlider } from './ParamSlider.tsx';
import { Panel } from './ui.tsx';

export function CrossfadePanel() {
  const { state, updateState } = useControls();

  const setCrossfade = useCallback(
    (crossfade: number) => updateState({ crossfade }),
    [updateState],
  );
  const fmtPct = useCallback((v: number) => `${Math.round(v * 100)}%`, []);

  return (
    <Panel area="hero" aria-label="Crossfade">
      <Flex direction="column" h="100%" justify="center" gap={4}>
        <Flex align="center" justify="space-between" gap={3}>
          <Badge
            colorPalette="cyan"
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
            colorPalette="pink"
            px={4}
            py={2}
            borderRadius="md"
            fontSize="md"
            fontWeight="bold"
          >
            Deck B
          </Badge>
        </Flex>
        <ParamSlider
          label=""
          value={state.crossfade}
          min={0}
          max={1}
          step={0.001}
          onChange={setCrossfade}
          format={fmtPct}
        />
        <Flex gap={2}>
          <Button
            flex={1}
            size="lg"
            h="3.25rem"
            fontSize="md"
            colorPalette="cyan"
            variant={state.crossfade < 0.05 ? 'solid' : 'subtle'}
            onClick={() => updateState({ crossfade: 0 })}
          >
            A Full
          </Button>
          <Button
            flex={1}
            size="lg"
            h="3.25rem"
            fontSize="md"
            variant={state.crossfade > 0.45 && state.crossfade < 0.55 ? 'solid' : 'subtle'}
            onClick={() => updateState({ crossfade: 0.5 })}
          >
            Center
          </Button>
          <Button
            flex={1}
            size="lg"
            h="3.25rem"
            fontSize="md"
            colorPalette="pink"
            variant={state.crossfade > 0.95 ? 'solid' : 'subtle'}
            onClick={() => updateState({ crossfade: 1 })}
          >
            B Full
          </Button>
        </Flex>
        <Text fontSize="sm" color="whiteAlpha.500" textAlign="center">
          Blends Deck A ↔ Deck B modes and GPU shaders below
        </Text>
      </Flex>
    </Panel>
  );
}

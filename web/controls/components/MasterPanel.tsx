import { Box, Button, Flex, Input, Text } from '@chakra-ui/react';
import { updatePaletteFromHex, useControls } from '../context/ControlsContext.tsx';
import { rgbToHex } from '../lib/palette.ts';
import { Panel } from './ui.tsx';

export function MasterPanel() {
  const { state, updateState, resetState } = useControls();

  const paletteHex = rgbToHex(state.paletteR, state.paletteG, state.paletteB);

  return (
    <Panel area="mast">
      <Flex gap={2} wrap="wrap">
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
            size="lg"
            variant={pressed ? 'solid' : 'surface'}
            colorPalette={key === 'blackout' ? 'red' : 'cyan'}
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
        <Button size="lg" colorPalette="red" onClick={resetState}>
          Reset
        </Button>
      </Flex>
      <Box mt={3}>
        <Flex align="center" gap={2}>
          <Text fontSize="sm" fontWeight="semibold" whiteSpace="nowrap">Color</Text>
          <Text fontFamily="mono" fontSize="sm" color="whiteAlpha.700">{paletteHex}</Text>
          <Input
            type="color"
            value={paletteHex}
            width="36px"
            height="36px"
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
      </Box>
    </Panel>
  );
}

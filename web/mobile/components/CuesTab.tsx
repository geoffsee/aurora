import { Badge, Box, Button, Flex, Grid, Text } from '@chakra-ui/react';
import { useControls } from '../../controls/context/ControlsContext.tsx';
import { CUE_NAMES } from '../../controls/lib/constants.ts';

export function CuesTab() {
  const {
    queueCue,
    pendingCue,
    state,
    activePresetIndex,
    getPresetSlot,
    recallPreset,
    transitionDurationMs,
    setTransitionDurationMs,
  } = useControls();

  const quantizeLabel = pendingCue
    ? `Queued ${pendingCue.name} on ${state.barSync ? 'bar' : 'beat'}`
    : state.beatSync
      ? state.barSync
        ? 'Fires on bar'
        : 'Fires on beat'
      : 'Fires immediately';

  return (
    <Flex direction="column" gap={5}>
      <Box>
        <Flex align="center" justify="space-between" mb={2} gap={2}>
          <Text
            fontSize="sm"
            color="whiteAlpha.700"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Cues
          </Text>
          <Badge
            colorPalette={pendingCue ? 'yellow' : 'gray'}
            variant="subtle"
            px={3}
            py={1}
            borderRadius="md"
          >
            {quantizeLabel}
          </Badge>
        </Flex>
        <Grid templateColumns="repeat(2, 1fr)" gap={2}>
          {CUE_NAMES.map((cue) => (
            <Button
              key={cue}
              h="4rem"
              fontSize="lg"
              colorPalette={cue === 'panic' ? 'red' : 'cyan'}
              variant={cue === 'panic' ? 'solid' : 'surface'}
              onClick={() => queueCue(cue)}
              textTransform="capitalize"
            >
              {cue === 'panic' ? 'Panic Dim' : cue}
            </Button>
          ))}
        </Grid>
      </Box>

      <Box>
        <Text
          fontSize="sm"
          color="whiteAlpha.700"
          textTransform="uppercase"
          letterSpacing="wider"
          mb={2}
        >
          Presets
        </Text>
        <Grid templateColumns="repeat(2, 1fr)" gap={2}>
          {Array.from({ length: 6 }, (_, i) => i + 1).map((slot) => {
            const preset = getPresetSlot(slot);
            const isActive = activePresetIndex === slot;
            return (
              <Button
                key={slot}
                h="3.5rem"
                variant={isActive ? 'solid' : 'surface'}
                colorPalette={isActive ? 'cyan' : 'gray'}
                disabled={!preset}
                aria-pressed={isActive}
                onClick={() => preset && recallPreset(slot)}
              >
                {preset ? preset.name || `Preset ${slot}` : `— ${slot} —`}
              </Button>
            );
          })}
        </Grid>
        {/* Saving and renaming stay on the console: a phone is for running the
            show, and a mis-tap here would overwrite a cue mid-set. */}
        <Text fontSize="xs" color="whiteAlpha.500" mt={2}>
          Recall only — save and rename presets from the console.
        </Text>
      </Box>

      <Box>
        <Text
          fontSize="sm"
          color="whiteAlpha.700"
          textTransform="uppercase"
          letterSpacing="wider"
          mb={2}
        >
          Transition · {transitionDurationMs} ms
        </Text>
        <Grid templateColumns="repeat(4, 1fr)" gap={2}>
          {[0, 250, 500, 1000].map((ms) => (
            <Button
              key={ms}
              h="3rem"
              variant={transitionDurationMs === ms ? 'solid' : 'surface'}
              aria-pressed={transitionDurationMs === ms}
              onClick={() => setTransitionDurationMs(ms)}
            >
              {ms === 0 ? 'Snap' : `${ms}`}
            </Button>
          ))}
        </Grid>
      </Box>
    </Flex>
  );
}

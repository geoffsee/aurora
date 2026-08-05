import { Box, Button, Flex, Grid, Input, Text } from '@chakra-ui/react';
import { useControls } from '../context/ControlsContext.tsx';
import { CUE_NAMES } from '../lib/constants.ts';
import { CURVE_MODES, CURVE_PARAM_LABELS, INTERPOLATED_KEYS } from '../lib/presets.ts';
import { Panel, SectionTitle } from './ui.tsx';

export function CuesPanel() {
  const {
    queueCue,
    transitionDurationMs,
    setTransitionDurationMs,
    pendingCurves,
    setPendingCurve,
    activePresetIndex,
    getPresetSlot,
    recallPreset,
    savePresetToSlot,
    renamePreset,
  } = useControls();

  return (
    <Panel area="cues">
      <SectionTitle title="Cues" />
      <Grid templateColumns="repeat(3, 1fr)" gap={2} mb={3}>
        {CUE_NAMES.map((cue) => (
          <Button
            key={cue}
            size="lg"
            colorPalette={cue === 'panic' ? 'red' : 'cyan'}
            variant={cue === 'panic' ? 'solid' : 'surface'}
            onClick={() => queueCue(cue)}
            textTransform="capitalize"
          >
            {cue === 'panic' ? 'Panic Dim' : cue}
          </Button>
        ))}
      </Grid>
      <Flex align="center" gap={2} mb={3}>
        <Text fontSize="sm" color="whiteAlpha.700">
          Transition
        </Text>
        <Input
          type="number"
          min={0}
          max={10000}
          step={100}
          value={transitionDurationMs}
          onChange={(e) =>
            setTransitionDurationMs(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))
          }
          width="120px"
          aria-label="Transition duration in milliseconds"
        />
        <Text fontSize="sm" color="whiteAlpha.700">
          ms
        </Text>
      </Flex>
      <Box as="details" mb={3}>
        <Box as="summary" cursor="pointer" fontSize="sm" color="whiteAlpha.700">
          Curves
        </Box>
        <Box mt={2} display="grid" gap={2}>
          {INTERPOLATED_KEYS.map((key) => (
            <Flex key={key} align="center" gap={2} wrap="wrap">
              <Text fontSize="sm" minW="90px">
                {CURVE_PARAM_LABELS[key]}
              </Text>
              {CURVE_MODES.map((mode) => (
                <Button
                  key={mode}
                  size="sm"
                  variant={(pendingCurves[key] ?? 'snap') === mode ? 'solid' : 'surface'}
                  onClick={() => setPendingCurve(key, mode)}
                  aria-pressed={(pendingCurves[key] ?? 'snap') === mode}
                >
                  {mode}
                </Button>
              ))}
            </Flex>
          ))}
        </Box>
      </Box>
      <Grid templateColumns="repeat(3, 1fr)" gap={2} aria-label="Saved presets">
        {Array.from({ length: 6 }, (_, i) => i + 1).map((slot) => {
          const preset = getPresetSlot(slot);
          const isActive = activePresetIndex === slot;
          return (
            <Button
              key={slot}
              size="lg"
              variant={isActive ? 'solid' : 'surface'}
              colorPalette={isActive ? 'cyan' : 'gray'}
              disabled={!preset}
              aria-pressed={isActive}
              title={
                preset
                  ? 'Click to recall · Shift+click to overwrite · Dbl-click to rename'
                  : 'Empty — use Save Preset to fill'
              }
              onClick={(e) => {
                if (e.shiftKey) {
                  const name = prompt(`Name for slot ${slot}:`, preset?.name || `Preset ${slot}`);
                  if (name !== null) savePresetToSlot(slot, name);
                } else if (preset) {
                  recallPreset(slot);
                }
              }}
              onDoubleClick={(e) => {
                e.preventDefault();
                if (preset) renamePreset(slot);
              }}
            >
              {preset ? preset.name || `Preset ${slot}` : `— ${slot} —`}
            </Button>
          );
        })}
      </Grid>
    </Panel>
  );
}

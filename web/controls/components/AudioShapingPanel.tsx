import { Badge, Button, Field, Flex, Grid, Input, Text } from '@chakra-ui/react';
import {
  AUDIO_SHAPING_BANDS,
  AUDIO_SHAPING_MAX_GAIN,
  type AudioBandShaping,
  type AudioShapingBand,
  defaultAudioShaping,
  hasSolo,
  isIdentityShaping,
} from '../../../bridge/audio-shaper.ts';
import { useControls } from '../context/ControlsContext.tsx';
import { Panel, SectionTitle } from './ui.tsx';

/**
 * Fine control over each band *before* it reaches a mapping (#285).
 *
 * The distinction the panel is built around: a mapping's output range changes
 * what the target *does*; these change what the band *is*. When a phone mic in
 * a loud room pins every band at 0.8, no amount of mapping tweaking gives the
 * signal back its range — gain and gate do.
 *
 * Everything here defaults to identity, and the Reset button says so, so an
 * operator can always get back to "exactly how it shipped" without remembering
 * five numbers.
 */
export function AudioShapingPanel() {
  const { state, updateState } = useControls();
  const shaping = state.audioShaping;
  const soloActive = hasSolo(shaping);

  const patchBand = (band: AudioShapingBand, patch: Partial<AudioBandShaping>) => {
    updateState({
      audioShaping: { ...shaping, [band]: { ...shaping[band], ...patch } },
    });
  };

  return (
    <Panel area="shap" aria-label="Audio Band Shaping">
      <SectionTitle
        title="Band Shaping"
        badge={
          <Flex gap={2} align="center">
            <Badge colorPalette={isIdentityShaping(shaping) ? 'gray' : 'cyan'} variant="subtle">
              {isIdentityShaping(shaping) ? 'default' : 'shaped'}
            </Badge>
            <Button
              size="xs"
              variant="surface"
              onClick={() => updateState({ audioShaping: defaultAudioShaping() })}
            >
              Reset
            </Button>
          </Flex>
        }
      />
      <Text fontSize="xs" color="whiteAlpha.600" mb={3}>
        Shapes the signal ahead of the mappings — gain lifts a quiet source into range, gate cuts
        the noise underneath it, ceiling tames a hot one. Curve and attack live in{' '}
        <strong>Audio Curve Shaping</strong> below; they are the same controls, not duplicates.
      </Text>

      <Grid templateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={4}>
        {AUDIO_SHAPING_BANDS.map((band) => {
          const entry = shaping[band];
          // A band that is neither muted nor soloed while something else is
          // soloed contributes nothing — say so rather than let the operator
          // wonder why a mapping went quiet.
          const silenced = entry.mute || (soloActive && !entry.solo);
          return (
            <Flex
              key={band}
              direction="column"
              gap={2}
              p={3}
              borderWidth="1px"
              borderColor={silenced ? 'orange.700' : 'whiteAlpha.200'}
              borderRadius="md"
              opacity={silenced ? 0.65 : 1}
            >
              <Flex align="center" justify="space-between">
                <Text textTransform="capitalize" fontWeight="bold">
                  {band}
                </Text>
                <Flex gap={1}>
                  <Button
                    size="xs"
                    variant={entry.mute ? 'solid' : 'surface'}
                    colorPalette="red"
                    aria-pressed={entry.mute}
                    onClick={() => patchBand(band, { mute: !entry.mute })}
                  >
                    M
                  </Button>
                  <Button
                    size="xs"
                    variant={entry.solo ? 'solid' : 'surface'}
                    colorPalette="yellow"
                    aria-pressed={entry.solo}
                    onClick={() => patchBand(band, { solo: !entry.solo })}
                  >
                    S
                  </Button>
                </Flex>
              </Flex>

              <Field.Root>
                <Field.Label>Gain ({entry.gain.toFixed(2)}×)</Field.Label>
                <Input
                  type="range"
                  aria-label={`${band} gain`}
                  min={0}
                  max={AUDIO_SHAPING_MAX_GAIN}
                  step={0.05}
                  value={entry.gain}
                  onChange={(e) => patchBand(band, { gain: Number(e.target.value) })}
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Gate ({entry.gate.toFixed(2)})</Field.Label>
                <Input
                  type="range"
                  aria-label={`${band} gate`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={entry.gate}
                  onChange={(e) => patchBand(band, { gate: Number(e.target.value) })}
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Ceiling ({entry.ceiling.toFixed(2)})</Field.Label>
                <Input
                  type="range"
                  aria-label={`${band} ceiling`}
                  min={0}
                  max={1}
                  step={0.01}
                  value={entry.ceiling}
                  onChange={(e) => patchBand(band, { ceiling: Number(e.target.value) })}
                />
              </Field.Root>

              <Field.Root>
                <Field.Label>Release ({entry.release.toFixed(2)})</Field.Label>
                <Input
                  type="range"
                  aria-label={`${band} release`}
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={entry.release}
                  onChange={(e) => patchBand(band, { release: Number(e.target.value) })}
                />
                <Text fontSize="xs" color="whiteAlpha.500" mt={1}>
                  Lower fades out more slowly between songs.
                </Text>
              </Field.Root>
            </Flex>
          );
        })}
      </Grid>
    </Panel>
  );
}

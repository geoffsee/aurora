import { Box, Button, Flex, Grid, SimpleGrid, Text } from '@chakra-ui/react';
import { useCallback, useMemo } from 'react';
import { useControls } from '../context/ControlsContext.tsx';
import { deckGpuShaderPatch } from '../lib/deck-gpu-shader.ts';
import { deckGpuShaderModePatch, deckVisibilityPatch } from '../lib/deck-mode.ts';
import { rgbToHex } from '../lib/palette.ts';
import {
  buildParamPatch,
  KNOB_STRIP_PARAMS,
  type MappableParam,
  PARAM_META,
} from '../lib/param-meta.ts';
import { DeckModeLaunchpad } from './DeckModeLaunchpad.tsx';
import { ParamKnob } from './ParamKnob.tsx';
import { ShaderLaunchpad } from './ShaderLaunchpad.tsx';
import { Panel } from './ui.tsx';

function numericStateValue(state: Record<string, unknown>, key: MappableParam): number {
  const v = state[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function SlidersPanel() {
  const { state, updateState, modeMenu, selectDeckPreset, reloadActiveDeck, reloadBusy } =
    useControls();

  const fmt2 = useCallback((v: number) => v.toFixed(2), []);
  const fmtPct = useCallback((v: number) => `${Math.round(v * 100)}%`, []);

  const paletteHex = useMemo(
    () => rgbToHex(state.paletteR, state.paletteG, state.paletteB),
    [state.paletteR, state.paletteG, state.paletteB],
  );

  const onKnobChange = useCallback(
    (key: MappableParam, value: number) => {
      const meta = PARAM_META[key];
      updateState(buildParamPatch(key, value, state), meta.bumpCue ? { bumpCue: true } : undefined);
    },
    [state, updateState],
  );

  const figureKnobs = useMemo(
    () => (
      <SimpleGrid columns={4} gap={3}>
        <ParamKnob
          label="Scale"
          value={state.figureScale}
          min={0.2}
          max={2.5}
          step={0.01}
          format={fmt2}
          onChange={(figureScale) => updateState({ figureScale })}
        />
        <ParamKnob
          label="Spin"
          value={state.figureSpin}
          min={0}
          max={2}
          step={0.01}
          format={fmt2}
          onChange={(figureSpin) => updateState({ figureSpin })}
        />
        <ParamKnob
          label="Stage Halo"
          value={state.figureHalo}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(figureHalo) => updateState({ figureHalo })}
        />
        <ParamKnob
          label="Audio React"
          value={state.figureAudio}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(figureAudio) => updateState({ figureAudio })}
        />
      </SimpleGrid>
    ),
    [
      state.figureScale,
      state.figureSpin,
      state.figureHalo,
      state.figureAudio,
      updateState,
      fmt2,
      fmtPct,
    ],
  );

  return (
    <Box gridArea="pads">
      <Box
        mb={4}
        overflowX="auto"
        overflowY="hidden"
        pb={2}
        css={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(153,136,98,0.55) transparent',
          WebkitOverflowScrolling: 'touch',
        }}
        aria-label="Parameter knobs"
      >
        <Flex gap={{ base: 2, md: 3 }} minW="min-content" align="flex-start" pr={2}>
          {KNOB_STRIP_PARAMS.map((key) => {
            const meta = PARAM_META[key];
            const accent =
              key === 'palette' || key === 'paletteR' || key === 'paletteG' || key === 'paletteB'
                ? paletteHex
                : undefined;
            return (
              <ParamKnob
                key={key}
                label={meta.knobLabel ?? meta.label}
                value={numericStateValue(state as unknown as Record<string, unknown>, key)}
                min={meta.min}
                max={meta.max}
                step={meta.step}
                format={meta.format}
                accent={accent}
                onChange={(v) => onKnobChange(key, v)}
              />
            );
          })}
        </Flex>
      </Box>
      <Grid
        templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
        gap={3}
        alignItems="stretch"
      >
        <Panel>
          <Flex justify="space-between" align="center" mb={2}>
            <Text fontWeight="semibold">CPU</Text>
            <Button
              size="sm"
              variant={state.cpuDeckAEnabled ? 'solid' : 'surface'}
              aria-pressed={state.cpuDeckAEnabled}
              onClick={() => updateState(deckVisibilityPatch('A', 'cpu', !state.cpuDeckAEnabled))}
            >
              {state.cpuDeckAEnabled ? 'On' : 'Off'}
            </Button>
          </Flex>
          <DeckModeLaunchpad
            label="Deck A Mode"
            colorPalette="yellow"
            entries={modeMenu.deckAEntries}
            selectedSlug={state.deckAPresetSlug ?? ''}
            catalogLive={modeMenu.catalogLive}
            holdingMissing={modeMenu.holdingA}
            menuEpoch={modeMenu.menuEpoch}
            onSelectSlug={(slug) => selectDeckPreset('A', slug)}
            onReloadActive={() => reloadActiveDeck('A')}
            reloadBusy={reloadBusy.A}
            figureControls={figureKnobs}
          />
        </Panel>
        <Panel>
          <Flex justify="space-between" align="center" mb={2}>
            <Text fontWeight="semibold">CPU</Text>
            <Button
              size="sm"
              variant={state.cpuDeckBEnabled ? 'solid' : 'surface'}
              aria-pressed={state.cpuDeckBEnabled}
              onClick={() => updateState(deckVisibilityPatch('B', 'cpu', !state.cpuDeckBEnabled))}
            >
              {state.cpuDeckBEnabled ? 'On' : 'Off'}
            </Button>
          </Flex>
          <DeckModeLaunchpad
            label="Deck B Mode"
            colorPalette="teal"
            entries={modeMenu.deckBEntries}
            selectedSlug={state.deckBPresetSlug ?? ''}
            catalogLive={modeMenu.catalogLive}
            holdingMissing={modeMenu.holdingB}
            menuEpoch={modeMenu.menuEpoch}
            onSelectSlug={(slug) => selectDeckPreset('B', slug)}
            onReloadActive={() => reloadActiveDeck('B')}
            reloadBusy={reloadBusy.B}
            figureControls={figureKnobs}
          />
        </Panel>
        <Panel>
          <Flex justify="space-between" align="center" mb={2}>
            <Text fontWeight="semibold">GPU</Text>
            <Button
              size="sm"
              variant={state.gpuDeckAEnabled ? 'solid' : 'surface'}
              aria-pressed={state.gpuDeckAEnabled}
              onClick={() => updateState(deckVisibilityPatch('A', 'gpu', !state.gpuDeckAEnabled))}
            >
              {state.gpuDeckAEnabled ? 'On' : 'Off'}
            </Button>
          </Flex>
          <ShaderLaunchpad
            value={state.deckAGpuShader}
            label="Deck A GPU"
            colorPalette="yellow"
            onChange={(v) =>
              updateState(
                {
                  ...deckGpuShaderPatch('A', v),
                  ...deckGpuShaderModePatch(),
                  gpuDeckAEnabled: true,
                },
                { bumpCue: true },
              )
            }
          />
        </Panel>
        <Panel>
          <Flex justify="space-between" align="center" mb={2}>
            <Text fontWeight="semibold">GPU</Text>
            <Button
              size="sm"
              variant={state.gpuDeckBEnabled ? 'solid' : 'surface'}
              aria-pressed={state.gpuDeckBEnabled}
              onClick={() => updateState(deckVisibilityPatch('B', 'gpu', !state.gpuDeckBEnabled))}
            >
              {state.gpuDeckBEnabled ? 'On' : 'Off'}
            </Button>
          </Flex>
          <ShaderLaunchpad
            value={state.deckBGpuShader}
            label="Deck B GPU"
            colorPalette="teal"
            onChange={(v) =>
              updateState(
                {
                  ...deckGpuShaderPatch('B', v),
                  ...deckGpuShaderModePatch(),
                  gpuDeckBEnabled: true,
                },
                { bumpCue: true },
              )
            }
          />
        </Panel>
      </Grid>
    </Box>
  );
}

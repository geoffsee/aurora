import { Box, Button, Flex, Grid, SimpleGrid, Text } from '@chakra-ui/react';
import { useCallback, useMemo } from 'react';
import { useControls } from '../context/ControlsContext.tsx';
import { deckGpuShaderPatch } from '../lib/deck-gpu-shader.ts';
import { deckGpuShaderModePatch, deckModePatch, deckVisibilityPatch } from '../lib/deck-mode.ts';
import { DeckModeLaunchpad } from './DeckModeLaunchpad.tsx';
import { ParamKnob } from './ParamKnob.tsx';
import { ShaderLaunchpad } from './ShaderLaunchpad.tsx';
import { Panel } from './ui.tsx';

export function SlidersPanel() {
  const { state, updateState } = useControls();

  const fmt1 = useCallback((v: number) => v.toFixed(1), []);
  const fmt2 = useCallback((v: number) => v.toFixed(2), []);
  const fmtPct = useCallback((v: number) => `${Math.round(v * 100)}%`, []);

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
          min={-2}
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
    [state.figureScale, state.figureSpin, state.figureHalo, state.figureAudio, updateState, fmt2, fmtPct],
  );

  return (
    <Box gridArea="pads">
      <SimpleGrid columns={{ base: 4, sm: 6, lg: 14 }} gap={{ base: 2, md: 3 }} mb={4}>
        <ParamKnob
          label="BPM"
          value={state.bpm}
          min={60}
          max={190}
          step={0.1}
          format={fmt1}
          onChange={(bpm) => updateState({ bpm })}
        />
        <ParamKnob
          label="Speed"
          value={state.speed}
          min={0.1}
          max={3}
          step={0.01}
          format={fmt2}
          onChange={(speed) => updateState({ speed })}
        />
        <ParamKnob
          label="Intensity"
          value={state.intensity}
          min={0.05}
          max={1.5}
          step={0.01}
          format={fmt2}
          onChange={(intensity) => updateState({ intensity })}
        />
        <ParamKnob
          label="Trails"
          value={state.feedback}
          min={0}
          max={1}
          step={0.01}
          format={fmt2}
          onChange={(feedback) => updateState({ feedback })}
        />
        <ParamKnob
          label="3D Lines"
          value={state.depth}
          min={0}
          max={1}
          step={0.01}
          format={fmt2}
          onChange={(depth) => updateState({ depth })}
        />
        <ParamKnob
          label="Ring Opacity"
          value={state.ringOpacity}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(ringOpacity) => updateState({ ringOpacity })}
        />
        <ParamKnob
          label="Color"
          value={state.palette}
          min={0}
          max={1}
          step={0.01}
          format={fmt2}
          onChange={(palette) => updateState({ palette })}
        />
        <ParamKnob
          label="Grid Density"
          value={state.gridDensity}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(gridDensity) => updateState({ gridDensity })}
        />
        <ParamKnob
          label="Grid Diamond"
          value={state.gridDiamond}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(gridDiamond) => updateState({ gridDiamond })}
        />
        <ParamKnob
          label="Grid Lines"
          value={state.gridLineWidth}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(gridLineWidth) => updateState({ gridLineWidth })}
        />
        <ParamKnob
          label="Grid Shape"
          value={state.gridShapeMix}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(gridShapeMix) => updateState({ gridShapeMix })}
        />
        <ParamKnob
          label="GPU Saturation"
          value={state.paletteSaturation}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(paletteSaturation) => updateState({ paletteSaturation })}
        />
        <ParamKnob
          label="GPU Brightness"
          value={state.paletteBrightness}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(paletteBrightness) => updateState({ paletteBrightness })}
        />
        <ParamKnob
          label="Max Brightness"
          value={state.maxBrightness}
          min={0}
          max={1}
          step={0.01}
          format={fmtPct}
          onChange={(maxBrightness) => updateState({ maxBrightness })}
        />
      </SimpleGrid>
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
            value={state.deckAMode}
            label="Deck A Mode"
            colorPalette="yellow"
            onChange={(value) => updateState(deckModePatch('A', value), { bumpCue: true })}
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
            value={state.deckBMode}
            label="Deck B Mode"
            colorPalette="teal"
            onChange={(value) => updateState(deckModePatch('B', value), { bumpCue: true })}
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

import { Flex } from '@chakra-ui/react';
import { useControls } from '../../controls/context/ControlsContext.tsx';
import { buildParamPatch, type MappableParam, PARAM_META } from '../../controls/lib/param-meta.ts';
import { TouchSlider } from './TouchSlider.tsx';

/**
 * The masters worth reaching for without a console. Ranges, steps, and value
 * formatting come from PARAM_META, so a slider here behaves exactly like its
 * console twin and like the same param driven over MIDI.
 */
const MOBILE_PARAMS: MappableParam[] = [
  'bpm',
  'speed',
  'intensity',
  'feedback',
  'depth',
  'palette',
  'maxBrightness',
];

export function ParamsTab() {
  const { state, updateState } = useControls();

  return (
    <Flex direction="column" gap={5}>
      {MOBILE_PARAMS.map((key) => {
        const meta = PARAM_META[key];
        const value = state[key] as number;
        return (
          <TouchSlider
            key={key}
            label={meta.label}
            value={value}
            min={meta.min}
            max={meta.max}
            step={meta.step}
            display={meta.format(value)}
            // buildParamPatch, not a raw patch: `palette` also has to write the
            // derived RGB and per-deck hues, exactly as the MIDI path does.
            onChange={(next) => updateState(buildParamPatch(key, next, state))}
          />
        );
      })}
    </Flex>
  );
}

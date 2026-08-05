import { Box, Field, NativeSelect } from '@chakra-ui/react';
import { useCallback, useState } from 'react';
import { useControls } from '../context/ControlsContext.tsx';
import {
  buildParamPatch,
  MAPPABLE_PARAMS,
  type MappableParam,
  PARAM_META,
} from '../lib/param-meta.ts';
import { ParamKnob } from './ParamKnob.tsx';

export function AssignableKnob({ defaultParam = 'intensity' }: { defaultParam?: MappableParam }) {
  const { state, updateState } = useControls();
  const [param, setParam] = useState<MappableParam>(defaultParam);
  const meta = PARAM_META[param];
  const value = Number(state[param]);

  const onChange = useCallback(
    (v: number) => updateState(buildParamPatch(param, v), { bumpCue: meta.bumpCue }),
    [updateState, param, meta.bumpCue],
  );

  return (
    <Box>
      <Field.Root mb={2}>
        <Field.Label>Assignable knob</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            value={param}
            onChange={(e) => setParam(e.target.value as MappableParam)}
            aria-label="Assignable knob parameter"
          >
            {MAPPABLE_PARAMS.map((p) => (
              <option key={p} value={p}>
                {PARAM_META[p].label}
              </option>
            ))}
          </NativeSelect.Field>
        </NativeSelect.Root>
      </Field.Root>
      <ParamKnob
        label={meta.label}
        value={value}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        onChange={onChange}
        format={meta.format}
      />
    </Box>
  );
}

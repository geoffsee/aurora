import { Box, Field, NativeSelect } from "@chakra-ui/react";
import { useState } from "react";
import { useControls } from "../context/ControlsContext.tsx";
import {
	buildParamPatch,
	MAPPABLE_PARAMS,
	PARAM_META,
	type MappableParam,
} from "../lib/param-meta.ts";
import { ParamSlider } from "./ParamSlider.tsx";

export function AssignableSlider({
	defaultParam = "intensity",
}: {
	defaultParam?: MappableParam;
}) {
	const { state, updateState } = useControls();
	const [param, setParam] = useState<MappableParam>(defaultParam);
	const meta = PARAM_META[param];
	const value = Number(state[param]);

	return (
		<Box>
			<Field.Root mb={2}>
				<Field.Label>Assignable</Field.Label>
				<NativeSelect.Root size="sm">
					<NativeSelect.Field
						value={param}
						onChange={(e) => setParam(e.target.value as MappableParam)}
						aria-label="Assignable slider parameter"
					>
						{MAPPABLE_PARAMS.map((p) => (
							<option key={p} value={p}>
								{PARAM_META[p].label}
							</option>
						))}
					</NativeSelect.Field>
				</NativeSelect.Root>
			</Field.Root>
			<ParamSlider
				label={meta.label}
				value={value}
				min={meta.min}
				max={meta.max}
				step={meta.step}
				onChange={(v) =>
					updateState(buildParamPatch(param, v), { bumpCue: meta.bumpCue })
				}
				format={meta.format}
			/>
		</Box>
	);
}

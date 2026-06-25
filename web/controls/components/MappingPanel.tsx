import { Badge, Field, Grid, Input, NativeSelect } from "@chakra-ui/react";
import { useControls } from "../context/ControlsContext.tsx";
import { Panel, SectionTitle } from "./ui.tsx";

export function MappingPanel() {
	const { state, updateState } = useControls();
	const mapping = state.trackMapping;

	const setMapping = (key: keyof typeof mapping, value: number) => {
		updateState({
			trackMapping: { ...mapping, [key]: value },
		});
	};

	return (
		<Panel area="map">
			<SectionTitle
				title="Ableton Mapping"
				badge={
					<Badge colorPalette="gray" variant="subtle">
						0-based track indices
					</Badge>
				}
			/>
			<Grid templateColumns="repeat(3, 1fr)" gap={3}>
				{(
					[
						["deckAStart", "A Start", 0, 31],
						["deckACount", "A Count", 1, 32],
						["deckBStart", "B Start", 0, 31],
						["deckBCount", "B Count", 1, 32],
						["bassTrack", "Bass", 0, 31],
						["midTrack", "Mid", 0, 31],
						["highTrack", "High", 0, 31],
					] as const
				).map(([key, label, min, max]) => (
					<Field.Root key={key}>
						<Field.Label>{label}</Field.Label>
						<Input
							type="number"
							min={min}
							max={max}
							value={mapping[key]}
							onChange={(e) => setMapping(key, Number(e.target.value))}
						/>
					</Field.Root>
				))}
			</Grid>
		</Panel>
	);
}

export function AudioCurvesPanel() {
	const { state, updateState } = useControls();
	const curves = ["linear", "exponential", "logarithmic"] as const;

	return (
		<Panel area="curv" aria-label="Audio Curve Shaping">
			<SectionTitle
				title="Audio Curve Shaping"
				badge={
					<Badge colorPalette="gray" variant="subtle">
						per-band
					</Badge>
				}
			/>
			<Grid templateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap={3}>
				{(["energy", "bass", "mid", "high"] as const).map((band) => (
					<Field.Root key={band}>
						<Field.Label textTransform="capitalize">{band}</Field.Label>
						<NativeSelect.Root>
							<NativeSelect.Field
								value={state.bandCurves[band]}
								onChange={(e) =>
									updateState({
										bandCurves: {
											...state.bandCurves,
											[band]: curves.includes(
												e.target.value as (typeof curves)[number],
											)
												? (e.target.value as (typeof curves)[number])
												: "linear",
										},
									})
								}
							>
								<option value="linear">Linear</option>
								<option value="exponential">Exponential (punchy)</option>
								<option value="logarithmic">Logarithmic (ambient)</option>
							</NativeSelect.Field>
						</NativeSelect.Root>
					</Field.Root>
				))}
			</Grid>
			<SectionTitle
				title="EMA Decay"
				badge={
					<Badge colorPalette="gray" variant="subtle">
						per-band smoothing
					</Badge>
				}
			/>
			<Grid templateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap={3}>
				{(["energy", "bass", "mid", "high", "pulse"] as const).map((band) => (
					<Field.Root key={band}>
						<Field.Label textTransform="capitalize">
							{band} ({state.emaAlphas[band].toFixed(2)})
						</Field.Label>
						<Input
							type="range"
							min={0.01}
							max={1}
							step={0.01}
							value={state.emaAlphas[band]}
							onChange={(e) =>
								updateState({
									emaAlphas: {
										...state.emaAlphas,
										[band]: Math.max(
											0.01,
											Math.min(1, Number(e.target.value)),
										),
									},
								})
							}
						/>
					</Field.Root>
				))}
			</Grid>
		</Panel>
	);
}

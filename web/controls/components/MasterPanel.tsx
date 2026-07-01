import { Box, Button, Flex, Grid, Input, Text } from "@chakra-ui/react";
import { useControls, updatePaletteFromHex } from "../context/ControlsContext.tsx";
import { rgbToHex } from "../lib/palette.ts";
import { Panel } from "./ui.tsx";
import { ParamSlider } from "./ParamSlider.tsx";
import { AssignableSlider } from "./AssignableSlider.tsx";

export function MasterPanel() {
	const { state, updateState, resetState } = useControls();
	const paletteHex = rgbToHex(state.paletteR, state.paletteG, state.paletteB);

	return (
		<Panel area="mast">
			<Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={4}>
				<Box>
					<Flex justify="space-between" mb={2}>
						<Text fontWeight="semibold">Color</Text>
						<Text fontFamily="mono">{paletteHex}</Text>
					</Flex>
					<Input
						type="color"
						value={paletteHex}
						height="48px"
						padding={1}
						onChange={(e) => {
							const patch = updatePaletteFromHex(state, e.target.value);
							if (patch) updateState(patch);
						}}
					/>
				</Box>
				<AssignableSlider />
				<ParamSlider
					label="GPU Saturation"
					value={state.paletteSaturation}
					min={0}
					max={1}
					step={0.01}
					onChange={(paletteSaturation) => updateState({ paletteSaturation })}
					format={(v) => `${Math.round(v * 100)}%`}
				/>
				<ParamSlider
					label="GPU Brightness"
					value={state.paletteBrightness}
					min={0}
					max={1}
					step={0.01}
					onChange={(paletteBrightness) => updateState({ paletteBrightness })}
					format={(v) => `${Math.round(v * 100)}%`}
				/>
				<ParamSlider
					label="Grid Density"
					value={state.gridDensity}
					min={0}
					max={1}
					step={0.01}
					onChange={(gridDensity) => updateState({ gridDensity })}
					format={(v) => `${Math.round(v * 100)}%`}
				/>
				<ParamSlider
					label="Grid Diamond"
					value={state.gridDiamond}
					min={0}
					max={1}
					step={0.01}
					onChange={(gridDiamond) => updateState({ gridDiamond })}
					format={(v) => `${Math.round(v * 100)}%`}
				/>
				<ParamSlider
					label="Grid Lines"
					value={state.gridLineWidth}
					min={0}
					max={1}
					step={0.01}
					onChange={(gridLineWidth) => updateState({ gridLineWidth })}
					format={(v) => `${Math.round(v * 100)}%`}
				/>
				<ParamSlider
					label="Grid Shape (◆↔+)"
					value={state.gridShapeMix}
					min={0}
					max={1}
					step={0.01}
					onChange={(gridShapeMix) => updateState({ gridShapeMix })}
					format={(v) => `${Math.round(v * 100)}%`}
				/>
			</Grid>
			<Flex gap={2} wrap="wrap" mt={4}>
				{(
					[
						["rings", "Rings", state.rings],
						["strobe", "Strobe", state.strobe],
						["strobeLockout", "Strobe Lock", state.strobeLockout],
						["showGpuPalette", "GPU Rehoboam", state.showGpuPalette],
						["freeze", "Freeze", state.freeze],
						["blackout", "Blackout", state.blackout],
					] as const
				).map(([key, label, pressed]) => (
					<Button
						key={key}
						size="lg"
						variant={pressed ? "solid" : "surface"}
						colorPalette={key === "blackout" ? "red" : "cyan"}
						aria-pressed={pressed}
						onClick={() => {
							if (key === "strobe") {
								if (state.strobeLockout) {
									updateState({ strobeLockout: false, strobe: true });
								} else {
									updateState({ strobe: !state.strobe });
								}
								return;
							}
							if (key === "strobeLockout") {
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
			<Box mt={4}>
				<ParamSlider
					label="Max Brightness"
					value={state.maxBrightness}
					min={0}
					max={1}
					step={0.01}
					onChange={(maxBrightness) => updateState({ maxBrightness })}
					format={(v) => `${Math.round(v * 100)}%`}
				/>
			</Box>
		</Panel>
	);
}

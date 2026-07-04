import { Box, Button, Flex, Grid, Input, Text } from "@chakra-ui/react";
import { useCallback } from "react";
import { useControls, updatePaletteFromHex } from "../context/ControlsContext.tsx";
import { rgbToHex } from "../lib/palette.ts";
import { Panel } from "./ui.tsx";
import { ParamSlider } from "./ParamSlider.tsx";
import { AssignableSlider } from "./AssignableSlider.tsx";

export function MasterPanel() {
	const { state, updateState, resetState } = useControls();

	const setPaletteSaturation = useCallback((paletteSaturation: number) => updateState({ paletteSaturation }), [updateState]);
	const setPaletteBrightness = useCallback((paletteBrightness: number) => updateState({ paletteBrightness }), [updateState]);
	const setGridDensity = useCallback((gridDensity: number) => updateState({ gridDensity }), [updateState]);
	const setGridDiamond = useCallback((gridDiamond: number) => updateState({ gridDiamond }), [updateState]);
	const setGridLineWidth = useCallback((gridLineWidth: number) => updateState({ gridLineWidth }), [updateState]);
	const setGridShapeMix = useCallback((gridShapeMix: number) => updateState({ gridShapeMix }), [updateState]);
	const setMaxBrightness = useCallback((maxBrightness: number) => updateState({ maxBrightness }), [updateState]);

	const fmtPct = useCallback((v: number) => `${Math.round(v * 100)}%`, []);

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
					onChange={setPaletteSaturation}
					format={fmtPct}
				/>
				<ParamSlider
					label="GPU Brightness"
					value={state.paletteBrightness}
					min={0}
					max={1}
					step={0.01}
					onChange={setPaletteBrightness}
					format={fmtPct}
				/>
				<ParamSlider
					label="Grid Density"
					value={state.gridDensity}
					min={0}
					max={1}
					step={0.01}
					onChange={setGridDensity}
					format={fmtPct}
				/>
				<ParamSlider
					label="Grid Diamond"
					value={state.gridDiamond}
					min={0}
					max={1}
					step={0.01}
					onChange={setGridDiamond}
					format={fmtPct}
				/>
				<ParamSlider
					label="Grid Lines"
					value={state.gridLineWidth}
					min={0}
					max={1}
					step={0.01}
					onChange={setGridLineWidth}
					format={fmtPct}
				/>
				<ParamSlider
					label="Grid Shape (◆↔+)"
					value={state.gridShapeMix}
					min={0}
					max={1}
					step={0.01}
					onChange={setGridShapeMix}
					format={fmtPct}
				/>
			</Grid>
			<Flex gap={2} wrap="wrap" mt={4}>
				{(
					[
						["rings", "Rings", state.rings],
						["strobe", "Strobe", state.strobe],
						["strobeLockout", "Strobe Lock", state.strobeLockout],
						["showGpuPalette", "Toggle GPU Shaders", state.showGpuPalette],
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
							if (key === "showGpuPalette") {
								const next = !state.showGpuPalette;
								if (next) {
									// Carry the current GPU Shader choice into the deck GPU slots
									// so "GPU Rehoboam" makes the picked shader visible as the
									// fullscreen GPU layer (matching the pre-per-deck behavior).
									updateState({
										showGpuPalette: true,
										deckAGpuShader: state.activeShader,
										deckBGpuShader: state.activeShader,
									});
								} else {
									updateState({ showGpuPalette: false });
								}
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
					onChange={setMaxBrightness}
					format={fmtPct}
				/>
			</Box>
		</Panel>
	);
}

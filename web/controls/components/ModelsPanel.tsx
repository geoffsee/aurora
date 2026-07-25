import {
	Box,
	Button,
	Field,
	Grid,
	Input,
	NativeSelect,
	Text,
} from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import {
	FIGURE_VISUAL_MODE,
	MAX_FIGURE_MODEL_INDEX,
	MODEL_CATALOG,
} from "../../../shared/model-catalog.ts";
import { normalizeRemoteModelAssetPath } from "../../../shared/model-asset-path.ts";
import { useControls } from "../context/ControlsContext.tsx";
import { VISUAL_MODES } from "../lib/constants.ts";
import { Panel } from "./ui.tsx";
import { ParamSlider } from "./ParamSlider.tsx";

export function ModelsPanel() {
	const { state, updateState } = useControls();
	const [assetPath, setAssetPath] = useState(state.figureAssetPath);

	useEffect(() => setAssetPath(state.figureAssetPath), [state.figureAssetPath]);

	const setScale = useCallback(
		(figureScale: number) => updateState({ figureScale }),
		[updateState],
	);
	const setSpin = useCallback(
		(figureSpin: number) => updateState({ figureSpin }),
		[updateState],
	);
	const setHalo = useCallback(
		(figureHalo: number) => updateState({ figureHalo }),
		[updateState],
	);
	const setAudio = useCallback(
		(figureAudio: number) => updateState({ figureAudio }),
		[updateState],
	);

	const fmt2 = useCallback((v: number) => v.toFixed(2), []);
	const fmtPct = useCallback((v: number) => `${Math.round(v * 100)}%`, []);

	const figureOnA = state.deckAMode === FIGURE_VISUAL_MODE;
	const figureOnB = state.deckBMode === FIGURE_VISUAL_MODE;
	const selected = MODEL_CATALOG[state.figureModel] ?? MODEL_CATALOG[0];
	const useRemoteAsset = () => {
		const normalized = normalizeRemoteModelAssetPath(
			assetPath,
			state.figureAssetPath,
		);
		setAssetPath(normalized);
		updateState({ figureAssetPath: normalized });
	};
	const clearRemoteAsset = () => {
		setAssetPath("");
		updateState({ figureAssetPath: "" });
	};
	const activeHint =
		figureOnA || figureOnB
			? `Live on ${[figureOnA ? "Deck A" : null, figureOnB ? "Deck B" : null].filter(Boolean).join(" + ")}`
			: "Not on a deck — assign below or pick Figure in Deck Mode";

	return (
		<Box gridArea="modl">
			<Panel>
				<Text fontSize="sm" fontWeight="semibold" letterSpacing="0.04em" mb={2}>
					Figure / Models
				</Text>
				<Text fontSize="xs" color="whiteAlpha.600" mb={3}>
					{activeHint}
					{selected ? ` · ${selected.label}` : ""}
				</Text>
				<Grid templateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={3}>
					<Field.Root>
						<Field.Label display="flex" justifyContent="space-between">
							<span>Model</span>
							<Text color="cyan.300" fontSize="sm">
								{selected?.label ?? "—"}
							</Text>
						</Field.Label>
						<NativeSelect.Root size="lg">
							<NativeSelect.Field
								value={String(
									Math.min(state.figureModel, MAX_FIGURE_MODEL_INDEX),
								)}
								onChange={(e) =>
									updateState({
										figureModel: Math.max(
											0,
											Math.min(MAX_FIGURE_MODEL_INDEX, Number(e.target.value)),
										),
									})
								}
							>
								{MODEL_CATALOG.map((entry, i) => (
									<option key={entry.id} value={i}>
										{entry.label}
									</option>
								))}
							</NativeSelect.Field>
						</NativeSelect.Root>
						<Text fontSize="xs" color="whiteAlpha.500" mt={1}>
							Web pack ships small free samples; “(local)” needs files under
							models/ (not on GitHub Pages). Lazy-loaded when Figure is live.
						</Text>
					</Field.Root>

					<Field.Root gridColumn={{ base: "1", md: "1 / -1" }}>
						<Field.Label display="flex" justifyContent="space-between">
							<span>Remote 3D asset</span>
							<Text
								color={state.figureAssetPath ? "cyan.300" : "whiteAlpha.500"}
								fontSize="sm"
							>
								{state.figureAssetPath ? "Override active" : "Using catalog"}
							</Text>
						</Field.Label>
						<Input
							type="url"
							autoComplete="off"
							spellCheck={false}
							placeholder="https://cdn.example.com/model.glb"
							value={assetPath}
							onChange={(e) => setAssetPath(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") useRemoteAsset();
							}}
						/>
						<Box display="flex" gap={2} mt={2}>
							<Button size="sm" onClick={useRemoteAsset}>
								Load remote
							</Button>
							<Button size="sm" variant="surface" onClick={clearRemoteAsset}>
								Use catalog
							</Button>
						</Box>
						<Text fontSize="xs" color="whiteAlpha.500" mt={1}>
							Absolute HTTP(S) .glb or .gltf URL. The host must allow browser
							CORS requests; embedded GLB files are the most portable.
						</Text>
					</Field.Root>

					<Box
						display="flex"
						flexDirection="column"
						gap={2}
						justifyContent="flex-end"
					>
						<Button
							size="sm"
							variant={figureOnA ? "solid" : "surface"}
							colorPalette="cyan"
							onClick={() =>
								updateState(
									{ deckAMode: FIGURE_VISUAL_MODE },
									{ bumpCue: true },
								)
							}
						>
							{figureOnA
								? "Deck A · Figure"
								: `Figure → Deck A (${VISUAL_MODES[FIGURE_VISUAL_MODE]})`}
						</Button>
						<Button
							size="sm"
							variant={figureOnB ? "solid" : "surface"}
							colorPalette="pink"
							onClick={() =>
								updateState(
									{ deckBMode: FIGURE_VISUAL_MODE },
									{ bumpCue: true },
								)
							}
						>
							{figureOnB
								? "Deck B · Figure"
								: `Figure → Deck B (${VISUAL_MODES[FIGURE_VISUAL_MODE]})`}
						</Button>
					</Box>

					<ParamSlider
						label="Scale"
						value={state.figureScale}
						min={0.2}
						max={2.5}
						step={0.01}
						onChange={setScale}
						format={fmt2}
					/>
					<ParamSlider
						label="Spin"
						value={state.figureSpin}
						min={0}
						max={2}
						step={0.01}
						onChange={setSpin}
						format={fmt2}
					/>
					<ParamSlider
						label="Stage Halo"
						value={state.figureHalo}
						min={0}
						max={1}
						step={0.01}
						onChange={setHalo}
						format={fmtPct}
					/>
					<ParamSlider
						label="Audio React"
						value={state.figureAudio}
						min={0}
						max={1}
						step={0.01}
						onChange={setAudio}
						format={fmtPct}
					/>
				</Grid>
			</Panel>
		</Box>
	);
}

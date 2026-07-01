import {
	Box,
	Button,
	Field,
	Grid,
	Input,
	NativeSelect,
	Text,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { useControls } from "../context/ControlsContext.tsx";
import { SHADER_OPTIONS, VISUAL_MODES } from "../lib/constants.ts";
import { Panel } from "./ui.tsx";
import { ParamSlider } from "./ParamSlider.tsx";

export function SlidersPanel() {
	const { state, updateState } = useControls();
	const [keyStatus, setKeyStatus] = useState("checking…");
	const [importStatus, setImportStatus] = useState("idle");
	const [importUrl, setImportUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [revealKey, setRevealKey] = useState(false);

	useEffect(() => {
		void (async () => {
			try {
				const res = await fetch("/api/shadertoy/key");
				const body = (await res.json()) as {
					configured?: boolean;
					source?: string | null;
				};
				if (!body || typeof body !== "object") setKeyStatus("unknown");
				else if (body.configured)
					setKeyStatus(body.source === "env" ? "set (env)" : "set");
				else setKeyStatus("not set");
			} catch {
				setKeyStatus("offline");
			}
		})();
	}, []);

	const saveKey = async () => {
		const key = apiKey.trim();
		if (!key) {
			setKeyStatus("enter key");
			return;
		}
		setKeyStatus("saving…");
		try {
			const res = await fetch("/api/shadertoy/key", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ key }),
			});
			const body = (await res.json()) as {
				ok?: boolean;
				error?: string;
				configured?: boolean;
				source?: string | null;
			};
			if (!res.ok || body.ok === false) {
				setKeyStatus(`err: ${String(body.error ?? res.statusText).slice(0, 60)}`);
				return;
			}
			setApiKey("");
			setKeyStatus(body.source === "env" ? "set (env)" : body.configured ? "set" : "not set");
		} catch (err) {
			setKeyStatus(`net err: ${(err as Error)?.message || String(err)}`);
		}
	};

	const clearKey = async () => {
		setKeyStatus("clearing…");
		try {
			const res = await fetch("/api/shadertoy/key", { method: "DELETE" });
			const body = (await res.json()) as { configured?: boolean };
			setKeyStatus(body.configured ? "set" : "not set");
		} catch (err) {
			setKeyStatus(`net err: ${(err as Error)?.message || String(err)}`);
		}
	};

	const importShader = async () => {
		const value = importUrl.trim();
		if (!value) {
			setImportStatus("enter URL");
			return;
		}
		setImportStatus("importing…");
		try {
			const res = await fetch("/api/shadertoy/import", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: value }),
			});
			const body = (await res.json()) as {
				ok?: boolean;
				error?: string;
				meta?: { name?: string; id?: string };
				usedIChannel?: boolean;
			};
			if (!res.ok || body.ok === false) {
				setImportStatus(
					`err: ${String(body.error ?? res.statusText).slice(0, 60)}`,
				);
				return;
			}
			const meta = body.meta ?? {};
			const warn = body.usedIChannel ? " (iChannel: lossy)" : "";
			setImportStatus(`loaded: ${meta.name ?? meta.id}${warn}`);
			updateState({ activeShader: 9 });
		} catch (err) {
			setImportStatus(`net err: ${(err as Error)?.message || String(err)}`);
		}
	};

	return (
		<Box gridArea="slid">
			<Grid templateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap={3}>
			<Panel>
				<Field.Root>
					<Field.Label display="flex" justifyContent="space-between">
						<span>Deck A Mode</span>
						<Text color="cyan.300">{VISUAL_MODES[state.deckAMode]}</Text>
					</Field.Label>
					<NativeSelect.Root size="lg">
						<NativeSelect.Field
							value={String(state.deckAMode)}
							onChange={(e) =>
								updateState(
									{ deckAMode: Number(e.target.value) },
									{ bumpCue: true },
								)
							}
						>
							{VISUAL_MODES.map((mode, i) => (
								<option key={mode} value={i}>
									{mode}
								</option>
							))}
						</NativeSelect.Field>
					</NativeSelect.Root>
				</Field.Root>
			</Panel>
			<Panel>
				<Field.Root>
					<Field.Label display="flex" justifyContent="space-between">
						<span>Deck B Mode</span>
						<Text color="pink.300">{VISUAL_MODES[state.deckBMode]}</Text>
					</Field.Label>
					<NativeSelect.Root size="lg">
						<NativeSelect.Field
							value={String(state.deckBMode)}
							onChange={(e) =>
								updateState(
									{ deckBMode: Number(e.target.value) },
									{ bumpCue: true },
								)
							}
						>
							{VISUAL_MODES.map((mode, i) => (
								<option key={mode} value={i}>
									{mode}
								</option>
							))}
						</NativeSelect.Field>
					</NativeSelect.Root>
				</Field.Root>
			</Panel>
			<Panel>
				<Field.Root>
					<Field.Label>GPU Shader</Field.Label>
					<NativeSelect.Root size="lg">
						<NativeSelect.Field
							value={String(state.activeShader)}
							onChange={(e) =>
								updateState({
									activeShader: Math.max(
										0,
										Math.min(SHADER_OPTIONS.length - 1, Number(e.target.value)),
									),
								})
							}
						>
							{SHADER_OPTIONS.map((label, i) => (
								<option key={label} value={i}>
									{label}
								</option>
							))}
						</NativeSelect.Field>
					</NativeSelect.Root>
				</Field.Root>
			</Panel>
			<Panel>
				<Field.Root>
					<Field.Label display="flex" justifyContent="space-between">
						<span>Shadertoy API Key</span>
						<Text fontSize="sm" color="whiteAlpha.700">
							{keyStatus}
						</Text>
					</Field.Label>
					<Input
						type={revealKey ? "text" : "password"}
						autoComplete="off"
						spellCheck={false}
						placeholder="Paste your Shadertoy API key"
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
					/>
					<Box display="flex" gap={2} mt={2}>
						<Button size="sm" onClick={saveKey}>
							Save
						</Button>
						<Button size="sm" variant="surface" onClick={clearKey}>
							Clear
						</Button>
						<Button
							size="sm"
							variant="surface"
							aria-pressed={revealKey}
							onClick={() => setRevealKey((v) => !v)}
						>
							{revealKey ? "Hide" : "Show"}
						</Button>
					</Box>
					<Text fontSize="xs" color="whiteAlpha.600" mt={2}>
						Stored in bridge memory only. Get a key at shadertoy.com → Account →
						Apps.
					</Text>
				</Field.Root>
			</Panel>
			<Panel>
				<Field.Root>
					<Field.Label display="flex" justifyContent="space-between">
						<span>Shadertoy Import</span>
						<Text fontSize="sm" color="whiteAlpha.700">
							{importStatus}
						</Text>
					</Field.Label>
					<Input
						placeholder="https://www.shadertoy.com/view/XXXXX"
						value={importUrl}
						onChange={(e) => setImportUrl(e.target.value)}
					/>
					<Button mt={2} onClick={importShader}>
						Import
					</Button>
				</Field.Root>
			</Panel>
			<Panel>
				<ParamSlider
					label="BPM"
					value={state.bpm}
					min={60}
					max={190}
					step={0.1}
					onChange={(bpm) => updateState({ bpm })}
					format={(v) => v.toFixed(1)}
				/>
			</Panel>
			<Panel>
				<ParamSlider
					label="Speed"
					value={state.speed}
					min={0.1}
					max={3}
					step={0.01}
					onChange={(speed) => updateState({ speed })}
					format={(v) => v.toFixed(2)}
				/>
			</Panel>
			<Panel>
				<ParamSlider
					label="Intensity"
					value={state.intensity}
					min={0.05}
					max={1.5}
					step={0.01}
					onChange={(intensity) => updateState({ intensity })}
					format={(v) => v.toFixed(2)}
				/>
			</Panel>
			<Panel>
				<ParamSlider
					label="Trails"
					value={state.feedback}
					min={0}
					max={1}
					step={0.01}
					onChange={(feedback) => updateState({ feedback })}
					format={(v) => v.toFixed(2)}
				/>
			</Panel>
			<Panel>
				<ParamSlider
					label="3D Lines"
					value={state.depth}
					min={0}
					max={1}
					step={0.01}
					onChange={(depth) => updateState({ depth })}
					format={(v) => v.toFixed(2)}
				/>
			</Panel>
			<Panel>
				<ParamSlider
					label="Ring Opacity"
					value={state.ringOpacity}
					min={0}
					max={1}
					step={0.01}
					onChange={(ringOpacity) => updateState({ ringOpacity })}
					format={(v) => `${Math.round(v * 100)}%`}
				/>
			</Panel>
			</Grid>
		</Box>
	);
}

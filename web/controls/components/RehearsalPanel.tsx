import { Badge, Button, Flex } from "@chakra-ui/react";
import { useControls } from "../context/ControlsContext.tsx";
import { Panel, SectionTitle, StatusPill } from "./ui.tsx";

export function RehearsalPanel() {
	const {
		state,
		isRecording,
		recording,
		startRecording,
		playReplay,
		stopReplay,
		updateState,
	} = useControls();

	const recordingLabel = state.replaying
		? `Replaying ${recording.length} frames`
		: isRecording
			? `Recording ${recording.length} frames`
			: recording.length
				? `${recording.length} frames saved`
				: "Ready";

	const recordingState = state.replaying
		? "replaying"
		: isRecording
			? "recording"
			: "ready";

	return (
		<Panel area="reh">
			<SectionTitle
				title="Rehearsal"
				badge={<StatusPill state={recordingState}>{recordingLabel}</StatusPill>}
			/>
			<Flex gap={2} wrap="wrap">
				<Button
					size="lg"
					variant={state.demoMode ? "solid" : "surface"}
					colorPalette="purple"
					aria-pressed={state.demoMode}
					onClick={() => updateState({ demoMode: !state.demoMode })}
				>
					Demo Audio
				</Button>
				<Button
					size="lg"
					colorPalette="red"
					variant={isRecording ? "solid" : "surface"}
					onClick={startRecording}
				>
					{isRecording ? "Stop Rec" : "Record"}
				</Button>
				<Button size="lg" variant="surface" onClick={() => playReplay()}>
					Play Replay
				</Button>
				<Button size="lg" variant="surface" onClick={stopReplay}>
					Stop
				</Button>
			</Flex>
		</Panel>
	);
}

export function AudioControlPanel() {
	const { state, micActive, toggleMicCapture, updateState } = useControls();
	const badgeLabel = state.audioControlMode
		? micActive
			? "Mic live"
			: "On"
		: "Off";
	const badgeState = state.audioControlMode && micActive ? "live" : state.audioControlMode ? "info" : "idle";

	return (
		<Panel area="audc" aria-label="Audio Control">
			<SectionTitle
				title="Audio Control"
				badge={<StatusPill state={badgeState}>{badgeLabel}</StatusPill>}
			/>
			<Flex gap={2} wrap="wrap">
				<Button
					size="lg"
					variant={state.audioControlMode ? "solid" : "surface"}
					colorPalette="cyan"
					aria-pressed={state.audioControlMode}
					onClick={() =>
						updateState({ audioControlMode: !state.audioControlMode })
					}
				>
					Audio Control
				</Button>
				<Button
					size="lg"
					variant={micActive ? "solid" : "surface"}
					colorPalette="green"
					aria-pressed={micActive}
					onClick={toggleMicCapture}
				>
					Live Mic
				</Button>
			</Flex>
		</Panel>
	);
}

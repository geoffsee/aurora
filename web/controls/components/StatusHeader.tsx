import { Box, Flex, Text } from "@chakra-ui/react";
import { useControls } from "../context/ControlsContext.tsx";
import { CLOCK_LABELS } from "../lib/constants.ts";
import { Panel, StatusPill } from "./ui.tsx";

export function StatusHeader() {
	const {
		bridgeStatus,
		state,
		osc,
		diagnostics,
		activePresetIndex,
		getPresetSlot,
		latencyP95,
		pendingCue,
	} = useControls();

	const oscLive = performance.now() - osc.lastFrameAt < 3000;
	const browserAudioLive = performance.now() - osc.lastBrowserAudioAt < 3000;
	const activePreset =
		activePresetIndex !== null ? getPresetSlot(activePresetIndex) : null;

	const bridgeLabel =
		bridgeStatus === "live"
			? "bridge live"
			: bridgeStatus === "error"
				? "bridge error"
				: "bridge connecting";

	const oscLabel = state.demoMode
		? "Demo audio"
		: browserAudioLive
			? "Mic audio"
			: oscLive
				? "OSC live"
				: "OSC idle";

	const oscState = state.demoMode
		? "demo"
		: browserAudioLive || oscLive
			? "live"
			: "idle";

	return (
		<Panel area="head">
			<Flex align="center" justify="space-between" gap={4} wrap="wrap">
				<Box>
					<Text
						fontSize="xs"
						textTransform="uppercase"
						letterSpacing="wider"
						color="whiteAlpha.700"
						mb={1}
					>
						bevyosc
					</Text>
					<Text as="h1" fontSize="2xl" fontWeight="bold" m={0}>
						VJ Controls
					</Text>
				</Box>
				<Flex
					role="status"
					aria-live="polite"
					gap={2}
					wrap="wrap"
					justify="flex-end"
				>
					<StatusPill state={bridgeStatus}>{bridgeLabel}</StatusPill>
					<StatusPill state={oscState}>{oscLabel}</StatusPill>
					<StatusPill state={diagnostics.clockSource ? "live" : "idle"}>
						Clock {CLOCK_LABELS[diagnostics.clockSource ?? ""] ?? "—"}
					</StatusPill>
					<StatusPill state={activePreset ? "info" : "idle"}>
						{activePreset
							? activePreset.name || `Preset ${activePresetIndex}`
							: "No preset"}
					</StatusPill>
					<StatusPill state={diagnostics.oscReady ? "info" : "warn"}>
						{diagnostics.sockets} viewer
						{diagnostics.sockets === 1 ? "" : "s"} ·{" "}
						{diagnostics.oscReady ? "OSC ready" : "OSC wait"}
					</StatusPill>
					<StatusPill
						state={
							latencyP95 === null
								? "info"
								: latencyP95 < 30
									? "live"
									: latencyP95 < 100
										? "info"
										: "warn"
						}
					>
						P95 {latencyP95 === null ? "—ms" : `${latencyP95.toFixed(0)}ms`}
					</StatusPill>
				</Flex>
			</Flex>
			{pendingCue ? (
				<Text mt={2} fontSize="sm" color="cyan.200">
					Queued {pendingCue.name} on {state.barSync ? "bar" : "beat"}
				</Text>
			) : null}
		</Panel>
	);
}

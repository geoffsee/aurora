import {
	Box,
	Button,
	Field,
	Flex,
	Grid,
	Input,
	NativeSelect,
	Text,
} from "@chakra-ui/react";
import { useState } from "react";
import { useControls } from "../context/ControlsContext.tsx";
import { MIDI_CC_PARAM_LABELS } from "../lib/constants.ts";
import type { MidiCcBinding } from "../lib/midi.ts";
import type { TriggerBinding } from "../lib/types.ts";
import { Panel, SectionTitle, StatusPill } from "./ui.tsx";

export function MidiCcPanel() {
	const {
		midiBindings,
		midiEnabled,
		midiInputCount,
		enableMidi,
		addMidiBinding,
		removeMidiBinding,
	} = useControls();

	const [cc, setCc] = useState(74);
	const [channel, setChannel] = useState(0);
	const [param, setParam] = useState("intensity");
	const [ccMin, setCcMin] = useState(0);
	const [ccMax, setCcMax] = useState(127);
	const [paramMin, setParamMin] = useState(0);
	const [paramMax, setParamMax] = useState(1);

	const midiStatus =
		!midiEnabled
			? "No MIDI"
			: midiInputCount > 0
				? `${midiInputCount} MIDI in`
				: "MIDI ready";

	const midiState = !midiEnabled ? "idle" : midiInputCount > 0 ? "live" : "info";

	const submit = () => {
		if (!Number.isFinite(paramMin) || !Number.isFinite(paramMax)) return;
		const binding: MidiCcBinding = {
			cc: Math.max(0, Math.min(127, Math.floor(cc))),
			channel: Math.max(0, Math.min(16, Math.floor(channel))),
			param,
			ccMin: Math.max(0, Math.min(127, Math.floor(ccMin))),
			ccMax: Math.max(0, Math.min(127, Math.floor(ccMax))),
			paramMin,
			paramMax,
		};
		addMidiBinding(binding);
	};

	return (
		<Panel area="midi" aria-label="MIDI CC Mapping">
			<SectionTitle
				title="MIDI CC Mapping"
				badge={<StatusPill state={midiState}>{midiStatus}</StatusPill>}
			/>
			<Button
				size="lg"
				mb={3}
				variant={midiEnabled ? "solid" : "surface"}
				colorPalette="cyan"
				aria-pressed={midiEnabled}
				onClick={enableMidi}
			>
				Enable MIDI
			</Button>
			<Box aria-label="CC bindings list" mb={3}>
				{!midiBindings.length ? (
					<Text color="whiteAlpha.700">
						No bindings — use Add Binding to create one.
					</Text>
				) : (
					midiBindings.map((b, i) => {
						const chStr = b.channel === 0 ? "any" : `ch${b.channel}`;
						return (
							<Flex
								key={`${b.cc}-${b.channel}-${b.param}-${i}`}
								align="center"
								justify="space-between"
								gap={2}
								py={1}
								borderBottomWidth="1px"
								borderColor="whiteAlpha.100"
							>
								<Text fontSize="sm">
									CC{b.cc} ({chStr}) →{" "}
									{MIDI_CC_PARAM_LABELS[b.param] || b.param} [{b.paramMin}–
									{b.paramMax}]
								</Text>
								<Button
									size="sm"
									variant="ghost"
									aria-label={`Remove CC${b.cc} binding`}
									onClick={() => removeMidiBinding(i)}
								>
									×
								</Button>
							</Flex>
						);
					})
				)}
			</Box>
			<Box as="details">
				<Box as="summary" cursor="pointer" fontSize="sm" color="whiteAlpha.700">
					Add Binding
				</Box>
				<Grid templateColumns="repeat(auto-fit, minmax(140px, 1fr))" gap={3} mt={3}>
					<Field.Root>
						<Field.Label>CC#</Field.Label>
						<Input
							type="number"
							min={0}
							max={127}
							value={cc}
							onChange={(e) => setCc(Number(e.target.value))}
						/>
					</Field.Root>
					<Field.Root>
						<Field.Label>Ch (0=any)</Field.Label>
						<Input
							type="number"
							min={0}
							max={16}
							value={channel}
							onChange={(e) => setChannel(Number(e.target.value))}
						/>
					</Field.Root>
					<Field.Root>
						<Field.Label>Parameter</Field.Label>
						<NativeSelect.Root>
							<NativeSelect.Field
								value={param}
								onChange={(e) => setParam(e.target.value)}
							>
								{Object.entries(MIDI_CC_PARAM_LABELS).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</NativeSelect.Field>
						</NativeSelect.Root>
					</Field.Root>
					<Field.Root>
						<Field.Label>CC Min</Field.Label>
						<Input
							type="number"
							min={0}
							max={127}
							value={ccMin}
							onChange={(e) => setCcMin(Number(e.target.value))}
						/>
					</Field.Root>
					<Field.Root>
						<Field.Label>CC Max</Field.Label>
						<Input
							type="number"
							min={0}
							max={127}
							value={ccMax}
							onChange={(e) => setCcMax(Number(e.target.value))}
						/>
					</Field.Root>
					<Field.Root>
						<Field.Label>Param Min</Field.Label>
						<Input
							type="number"
							step={0.01}
							value={paramMin}
							onChange={(e) => setParamMin(Number(e.target.value))}
						/>
					</Field.Root>
					<Field.Root>
						<Field.Label>Param Max</Field.Label>
						<Input
							type="number"
							step={0.01}
							value={paramMax}
							onChange={(e) => setParamMax(Number(e.target.value))}
						/>
					</Field.Root>
				</Grid>
				<Button mt={3} onClick={submit}>
					Add
				</Button>
			</Box>
		</Panel>
	);
}

export function TriggersPanel() {
	const {
		state,
		updateState,
		triggerBindings,
		addTriggerBinding,
		removeTriggerBinding,
	} = useControls();
	const [type, setType] = useState<TriggerBinding["type"]>("midi-note");
	const [note, setNote] = useState(60);
	const [cc, setCc] = useState(64);
	const [threshold, setThreshold] = useState(64);
	const [channel, setChannel] = useState(0);
	const [oscAddress, setOscAddress] = useState("/bevyosc/automation/play");
	const [action, setAction] = useState("toggle");

	const submit = () => {
		if (type === "midi-note") {
			addTriggerBinding({
				type,
				note: Math.max(0, Math.min(127, Math.floor(note))),
				channel: Math.max(0, Math.min(16, Math.floor(channel))),
				action,
			});
		} else if (type === "midi-cc") {
			addTriggerBinding({
				type,
				cc: Math.max(0, Math.min(127, Math.floor(cc))),
				channel: Math.max(0, Math.min(16, Math.floor(channel))),
				threshold: Math.max(0, Math.min(127, Math.floor(threshold))),
				action,
			});
		} else {
			const address = oscAddress.trim();
			if (!address.startsWith("/")) return;
			addTriggerBinding({ type: "osc", address, action });
		}
	};

	return (
		<Panel area="trig" aria-label="Automation Triggers">
			<SectionTitle
				title="Playback Triggers"
				badge={
					<StatusPill state={state.audioTransientAutomation ? "live" : "info"}>
						{state.audioTransientAutomation ? "Audio armed" : `${triggerBindings.length} trigger${triggerBindings.length !== 1 ? "s" : ""}`}
					</StatusPill>
				}
			/>
			<Flex gap={2} wrap="wrap" mb={3}>
				<Button
					size="lg"
					variant={state.audioTransientAutomation ? "solid" : "surface"}
					colorPalette="orange"
					aria-pressed={state.audioTransientAutomation}
					onClick={() =>
						updateState({
							audioTransientAutomation: !state.audioTransientAutomation,
						})
					}
				>
					Audio Trigger
				</Button>
			</Flex>
			<Box aria-label="Trigger bindings list" mb={3}>
				{!triggerBindings.length ? (
					<Text color="whiteAlpha.700">
						No triggers — use Add Trigger to create one.
					</Text>
				) : (
					triggerBindings.map((b, i) => {
						let label = "";
						if (b.type === "midi-note") {
							const chStr = b.channel === 0 ? "any" : `ch${b.channel}`;
							label = `Note ${b.note} (${chStr}) → ${b.action}`;
						} else if (b.type === "midi-cc") {
							const chStr = b.channel === 0 ? "any" : `ch${b.channel}`;
							label = `CC${b.cc} (${chStr}) ≥ ${b.threshold} → ${b.action}`;
						} else {
							label = `OSC ${b.address} → ${b.action}`;
						}
						return (
							<Flex
								key={`${b.type}-${i}`}
								align="center"
								justify="space-between"
								gap={2}
								py={1}
								borderBottomWidth="1px"
								borderColor="whiteAlpha.100"
							>
								<Text fontSize="sm">{label}</Text>
								<Button
									size="sm"
									variant="ghost"
									aria-label={`Remove trigger ${i + 1}`}
									onClick={() => removeTriggerBinding(i)}
								>
									×
								</Button>
							</Flex>
						);
					})
				)}
			</Box>
			<Box as="details">
				<Box as="summary" cursor="pointer" fontSize="sm" color="whiteAlpha.700">
					Add Trigger
				</Box>
				<Grid templateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap={3} mt={3}>
					<Field.Root>
						<Field.Label>Type</Field.Label>
						<NativeSelect.Root>
							<NativeSelect.Field
								value={type}
								onChange={(e) =>
									setType(e.target.value as TriggerBinding["type"])
								}
							>
								<option value="midi-note">MIDI Note</option>
								<option value="midi-cc">MIDI CC</option>
								<option value="osc">OSC</option>
							</NativeSelect.Field>
						</NativeSelect.Root>
					</Field.Root>
					{type === "midi-note" ? (
						<Field.Root>
							<Field.Label>Note (0–127)</Field.Label>
							<Input
								type="number"
								min={0}
								max={127}
								value={note}
								onChange={(e) => setNote(Number(e.target.value))}
							/>
						</Field.Root>
					) : null}
					{type === "midi-cc" ? (
						<>
							<Field.Root>
								<Field.Label>CC# (0–127)</Field.Label>
								<Input
									type="number"
									min={0}
									max={127}
									value={cc}
									onChange={(e) => setCc(Number(e.target.value))}
								/>
							</Field.Root>
							<Field.Root>
								<Field.Label>Threshold ≥</Field.Label>
								<Input
									type="number"
									min={0}
									max={127}
									value={threshold}
									onChange={(e) => setThreshold(Number(e.target.value))}
								/>
							</Field.Root>
						</>
					) : null}
					{type !== "osc" ? (
						<Field.Root>
							<Field.Label>Channel (0=any)</Field.Label>
							<Input
								type="number"
								min={0}
								max={16}
								value={channel}
								onChange={(e) => setChannel(Number(e.target.value))}
							/>
						</Field.Root>
					) : null}
					{type === "osc" ? (
						<Field.Root gridColumn="1 / -1">
							<Field.Label>OSC Address</Field.Label>
							<Input
								value={oscAddress}
								onChange={(e) => setOscAddress(e.target.value)}
							/>
						</Field.Root>
					) : null}
					<Field.Root>
						<Field.Label>Action</Field.Label>
						<NativeSelect.Root>
							<NativeSelect.Field
								value={action}
								onChange={(e) => setAction(e.target.value)}
							>
								<option value="toggle">Toggle play/stop</option>
								<option value="toggle-loop">Toggle loop/stop</option>
								<option value="play">Play once</option>
								<option value="play-loop">Play loop</option>
								<option value="stop">Stop</option>
							</NativeSelect.Field>
						</NativeSelect.Root>
					</Field.Root>
				</Grid>
				<Button mt={3} onClick={submit}>
					Add
				</Button>
			</Box>
		</Panel>
	);
}

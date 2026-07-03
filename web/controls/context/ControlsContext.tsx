import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { nextReconnectDelay } from "../../../src/reconnect.ts";
import { AUTOMATION_LAYOUT_PRESERVED_FIELDS } from "../../../bridge/automation-player.ts";
import { cuePresets } from "../lib/cues.ts";
import {
	defaultDiagnostics,
	defaultOscMeters,
	defaultState,
} from "../lib/default-state.ts";
import {
	clearSessionState,
	loadSessionState,
	saveSessionState,
} from "../lib/session-state.ts";
import {
	applyBrowserAudio,
	applyDemo,
	applyTrackData,
} from "../lib/osc-track-data.ts";
import {
	cloneState,
	defaultPendingCurves,
	finalizeInterpolatedState,
	interpolatePresetState,
	loadPresets,
	normalizePreset,
	normalizePresetCurves,
	PRESET_BUNDLE_SCHEMA_VERSION,
	preparePresetTarget,
	savePresetsToStorage,
	type InterpolatedKey,
} from "../lib/presets.ts";
import { syncPaletteFromHue, syncPaletteFromRgb, hexToRgb } from "../lib/palette.ts";
import { clamp, clamp01, clampInt } from "../lib/math.ts";
import {
	dismissBanner,
	pushBanner,
	removeBannersByType,
	type ErrorBanner,
} from "../lib/banners.ts";
import {
	loadMidiBindings,
	saveMidiBindings,
	scaleCcToParam,
	type MidiCcBinding,
} from "../lib/midi.ts";
import {
	findMidiCcTrigger,
	findMidiNoteTrigger,
	findOscTrigger,
	loadTriggerBindings,
	resolveTriggerAction,
	saveTriggerBindings,
} from "../lib/triggers.ts";
import {
	extractMicFeatures,
	MIC_FFT_SIZE,
	MIC_MAX_DB,
	MIC_MIN_DB,
	MIC_SEND_INTERVAL_MS,
	micSecureContextError,
} from "../lib/mic.ts";
import {
	MAX_GPU_SHADER_INDEX,
	MIDI_CC_INTEGER_PARAMS,
} from "../lib/constants.ts";
import type {
	BridgeStatus,
	ControlState,
	CurveMode,
	Diagnostics,
	OscMeters,
	RecordingFrame,
	TriggerBinding,
} from "../lib/types.ts";

type ControlsContextValue = {
	state: ControlState;
	osc: OscMeters;
	diagnostics: Diagnostics;
	bridgeStatus: BridgeStatus;
	banners: ErrorBanner[];
	pendingCue: { name: string } | null;
	transitionDurationMs: number;
	pendingCurves: Record<InterpolatedKey, CurveMode>;
	activePresetIndex: number | null;
	presetRevision: number;
	midiBindings: MidiCcBinding[];
	midiEnabled: boolean;
	midiInputCount: number;
	triggerBindings: TriggerBinding[];
	micActive: boolean;
	isRecording: boolean;
	recording: RecordingFrame[];
	isReplayLooping: boolean;
	latencyP95: number | null;
	setTransitionDurationMs: (ms: number) => void;
	setPendingCurve: (key: InterpolatedKey, mode: CurveMode) => void;
	updateState: (
		patch: Partial<ControlState> | ((prev: ControlState) => Partial<ControlState>),
		options?: { record?: boolean; bumpCue?: boolean },
	) => void;
	publish: (options?: { record?: boolean }) => void;
	queueCue: (name: string) => void;
	recallPreset: (slot: number) => void;
	savePresetToSlot: (slot: number, name?: string) => void;
	savePreset: () => void;
	renamePreset: (slot: number) => void;
	startRecording: () => void;
	playReplay: (opts?: { loop?: boolean }) => void;
	stopReplay: () => void;
	resetState: () => void;
	enableMidi: () => void;
	addMidiBinding: (binding: MidiCcBinding) => void;
	removeMidiBinding: (index: number) => void;
	addTriggerBinding: (binding: TriggerBinding) => void;
	removeTriggerBinding: (index: number) => void;
	toggleMicCapture: () => void;
	dismissErrorBanner: (id: number) => void;
	refreshPresetGrid: () => void;
	getPresetSlot: (slot: number) => ReturnType<typeof normalizePreset>;
};

const ControlsContext = createContext<ControlsContextValue | null>(null);

export function useControls() {
	const ctx = useContext(ControlsContext);
	if (!ctx) throw new Error("useControls must be used within ControlsProvider");
	return ctx;
}

export function ControlsProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<ControlState>(() => loadSessionState());
	const [osc, setOsc] = useState<OscMeters>(() => defaultOscMeters());
	const [diagnostics, setDiagnostics] = useState<Diagnostics>(() =>
		defaultDiagnostics(),
	);
	const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("connecting");
	const [banners, setBanners] = useState<ErrorBanner[]>([]);
	const [pendingCue, setPendingCue] = useState<{ name: string } | null>(null);
	const [transitionDurationMs, setTransitionDurationMs] = useState(500);
	const [pendingCurves, setPendingCurves] = useState(() =>
		defaultPendingCurves(),
	);
	const [activePresetIndex, setActivePresetIndex] = useState<number | null>(
		null,
	);
	const [presetRevision, setPresetRevision] = useState(0);
	const [midiBindings, setMidiBindings] = useState<MidiCcBinding[]>(() =>
		loadMidiBindings(),
	);
	const [midiEnabled, setMidiEnabled] = useState(false);
	const [midiInputCount, setMidiInputCount] = useState(0);
	const [triggerBindings, setTriggerBindings] = useState<TriggerBinding[]>(
		() => loadTriggerBindings(),
	);
	const [micActive, setMicActive] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [recording, setRecording] = useState<RecordingFrame[]>([]);
	const [isReplayLooping, setIsReplayLooping] = useState(false);
	const [latencyP95, setLatencyP95] = useState<number | null>(null);

	const stateRef = useRef(state);
	const oscRef = useRef(osc);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const reconnectDelayRef = useRef(1000);
	const pendingCueRef = useRef(pendingCue);
	const isRecordingRef = useRef(isRecording);
	const recordingRef = useRef(recording);
	const recordStartRef = useRef(0);
	const replayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
	const isReplayLoopingRef = useRef(false);
	const pendingPingsRef = useRef<Record<number, number>>({});
	const latencyWindowRef = useRef<number[]>([]);
	const pingIdRef = useRef(0);
	const activeTransitionRafRef = useRef<number | null>(null);
	const micStreamRef = useRef<MediaStream | null>(null);
	const micContextRef = useRef<AudioContext | null>(null);
	const micTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const micFreqDataRef = useRef<{
		analyser: AnalyserNode;
		bins: Float32Array<ArrayBuffer>;
	} | null>(null);
	const micStartingRef = useRef(false);
	const midiAccessRef = useRef<MIDIAccess | null>(null);

	stateRef.current = state;
	oscRef.current = osc;
	pendingCueRef.current = pendingCue;
	isRecordingRef.current = isRecording;
	recordingRef.current = recording;

	const addBanner = useCallback((description: string, type?: ErrorBanner["type"]) => {
		setBanners((prev) => pushBanner(prev, description, type ?? "error"));
	}, []);

	const publish = useCallback((options: { record?: boolean } = {}) => {
		const ws = wsRef.current;
		const current = stateRef.current;
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(
				JSON.stringify({ address: "/aurora/control/state", args: [current] }),
			);
		}
		if (isRecordingRef.current && options.record !== false) {
			const now = performance.now();
			const last = recordingRef.current[recordingRef.current.length - 1];
			if (!last || now - last.t > 100) {
				setRecording((prev) => [
					...prev,
					{ t: now - recordStartRef.current, state: cloneState(current) },
				]);
			}
		}
	}, []);

	const updateState = useCallback(
		(
			patch:
				| Partial<ControlState>
				| ((prev: ControlState) => Partial<ControlState>),
			options?: { record?: boolean; bumpCue?: boolean },
		) => {
			setState((prev) => {
				const delta = typeof patch === "function" ? patch(prev) : patch;
				const next = { ...prev, ...delta };
				if (delta.trackMapping) {
					next.trackMapping = { ...prev.trackMapping, ...delta.trackMapping };
				}
				if (options?.bumpCue) next.cueVersion += 1;
				stateRef.current = next;
				return next;
			});
			queueMicrotask(() => publish(options));
		},
		[publish],
	);

	const syncFromRemote = useCallback((next: Partial<ControlState>) => {
		setState((prev) => {
			if (next.replaying && !prev.replaying) return prev;
			const merged = {
				...prev,
				...next,
				trackMapping: {
					...prev.trackMapping,
					...(next.trackMapping || {}),
				},
			};
			stateRef.current = merged;
			return merged;
		});
	}, []);

	const applyCue = useCallback(
		(name: string, cue: (typeof cuePresets)[string]) => {
			setState((prev) => {
				const next = { ...prev, ...cue };
				if (cue.palette !== undefined) syncPaletteFromHue(next);
				next.cueVersion += 1;
				next.cueIntensity = clamp01(cue.intensity ?? prev.intensity);
				next.cuePalette = clamp01(cue.palette ?? prev.palette);
				next.cueCrossfade = clamp01(cue.crossfade ?? prev.crossfade);
				next.cueDeckAMode = clampInt(
					cue.deckAMode ?? prev.deckAMode,
					0,
					23,
					prev.deckAMode,
				);
				next.cueDeckBMode = clampInt(
					cue.deckBMode ?? prev.deckBMode,
					0,
					23,
					prev.deckBMode,
				);
				next.cueDeckAGpuShader = clampInt(
					cue.deckAGpuShader ?? prev.deckAGpuShader ?? 0,
					0,
					MAX_GPU_SHADER_INDEX,
					prev.deckAGpuShader ?? 0,
				);
				next.cueDeckBGpuShader = clampInt(
					cue.deckBGpuShader ?? prev.deckBGpuShader ?? 5,
					0,
					MAX_GPU_SHADER_INDEX,
					prev.deckBGpuShader ?? 5,
				);
				next.flashVersion += name === "panic" ? 0 : 1;
				stateRef.current = next;
				return next;
			});
			setPendingCue(null);
			queueMicrotask(() => publish());
		},
		[publish],
	);

	const flushPendingCue = useCallback(
		(beat: number) => {
			const pending = pendingCueRef.current;
			if (!pending) return;
			const current = stateRef.current;
			if (current.barSync && Math.floor(beat) % 4 !== 0) return;
			const cue = cuePresets[pending.name];
			if (cue) applyCue(pending.name, cue);
		},
		[applyCue],
	);

	const queueCue = useCallback(
		(name: string) => {
			const cue = cuePresets[name];
			if (!cue) return;
			if (!stateRef.current.beatSync) {
				applyCue(name, cue);
				return;
			}
			setPendingCue({ name });
		},
		[applyCue],
	);

	const refreshPresetGrid = useCallback(() => {
		setPresetRevision((n) => n + 1);
	}, []);

	const recallPreset = useCallback(
		(n: number) => {
			const presets = loadPresets();
			const preset = normalizePreset(presets[`slot-${n}`]);
			if (!preset) return;
			const from = cloneState(stateRef.current);
			const to = preparePresetTarget(preset.state);
			const curves = normalizePresetCurves(preset.curves);
			setPendingCurves(curves);
			setActivePresetIndex(n);
			setState((prev) => {
				const next = { ...prev, cueVersion: prev.cueVersion + 1 };
				stateRef.current = next;
				return next;
			});

			if (activeTransitionRafRef.current !== null) {
				cancelAnimationFrame(activeTransitionRafRef.current);
				activeTransitionRafRef.current = null;
			}

			const start = performance.now();
			const tick = () => {
				const elapsed = performance.now() - start;
				const t = Math.min(
					1,
					elapsed / Math.max(1, transitionDurationMs),
				);
				const lerped = interpolatePresetState(
					from,
					to,
					curves,
					t,
					transitionDurationMs,
				);
				setState((prev) => {
					const next = { ...prev };
					finalizeInterpolatedState(next, lerped);
					stateRef.current = next;
					return next;
				});
				publish({ record: false });
				if (t < 1) {
					activeTransitionRafRef.current = requestAnimationFrame(tick);
				} else {
					activeTransitionRafRef.current = null;
					refreshPresetGrid();
				}
			};
			if (transitionDurationMs <= 0) {
				const lerped = interpolatePresetState(
					from,
					to,
					curves,
					1,
					transitionDurationMs,
				);
				setState((prev) => {
					const next = { ...prev };
					finalizeInterpolatedState(next, lerped);
					stateRef.current = next;
					return next;
				});
				publish({ record: false });
				refreshPresetGrid();
			} else {
				tick();
			}
		},
		[publish, refreshPresetGrid, transitionDurationMs],
	);

	const savePresetToSlot = useCallback(
		(n: number, name?: string) => {
			const presets = loadPresets();
			const existing = normalizePreset(presets[`slot-${n}`]);
			const defaultName = existing?.name || `Preset ${n}`;
			const finalName = name?.trim() || defaultName;
			presets[`slot-${n}`] = {
				schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION,
				name: finalName,
				state: cloneState(stateRef.current),
				curves: { ...pendingCurves },
			};
			savePresetsToStorage(presets);
			setActivePresetIndex(n);
			refreshPresetGrid();
		},
		[pendingCurves, refreshPresetGrid],
	);

	const savePreset = useCallback(() => {
		const presets = loadPresets();
		let defaultSlot = 1;
		for (let i = 1; i <= 6; i++) {
			if (!presets[`slot-${i}`]) {
				defaultSlot = i;
				break;
			}
		}
		const slotStr = prompt("Save to slot (1–6):", String(defaultSlot));
		if (!slotStr) return;
		const n = Math.max(1, Math.min(6, Number(slotStr) || defaultSlot));
		const existing = normalizePreset(presets[`slot-${n}`]);
		const defaultName = existing?.name || `Preset ${n}`;
		const name = prompt(`Name for slot ${n}:`, defaultName);
		if (name === null) return;
		savePresetToSlot(n, name);
	}, [savePresetToSlot]);

	const renamePreset = useCallback(
		(n: number) => {
			const presets = loadPresets();
			const existing = normalizePreset(presets[`slot-${n}`]);
			if (!existing) return;
			const name = prompt("Rename preset:", existing.name || `Preset ${n}`);
			if (name === null) return;
			presets[`slot-${n}`] = {
				...existing,
				name: name.trim() || `Preset ${n}`,
			};
			savePresetsToStorage(presets);
			refreshPresetGrid();
		},
		[refreshPresetGrid],
	);

	const getPresetSlot = useCallback((slot: number) => {
		const presets = loadPresets();
		return normalizePreset(presets[`slot-${slot}`]);
	}, [presetRevision]);

	const stopReplay = useCallback(() => {
		replayTimersRef.current.forEach(clearTimeout);
		replayTimersRef.current = [];
		isReplayLoopingRef.current = false;
		setIsReplayLooping(false);
		updateState({ replaying: false }, { record: false });
	}, [updateState]);

	const runReplayIteration = useCallback(() => {
		const frames = recordingRef.current;
		if (!frames.length) return;
		const durationMs = frames[frames.length - 1]!.t;
		for (const item of frames) {
			const timer = setTimeout(() => {
				setState((prev) => {
					const next = { ...prev, ...item.state, replaying: true };
					for (const key of AUTOMATION_LAYOUT_PRESERVED_FIELDS) {
						(next as Record<string, unknown>)[key] = (
							prev as Record<string, unknown>
						)[key];
					}
					stateRef.current = next;
					return next;
				});
				publish({ record: false });
			}, item.t);
			replayTimersRef.current.push(timer);
		}
		const endTimer = setTimeout(() => {
			if (isReplayLoopingRef.current && stateRef.current.replaying) {
				replayTimersRef.current.forEach(clearTimeout);
				replayTimersRef.current = [];
				runReplayIteration();
			} else {
				stopReplay();
			}
		}, durationMs + 100);
		replayTimersRef.current.push(endTimer);
	}, [publish, stopReplay]);

	const playReplay = useCallback(
		(opts?: { loop?: boolean }) => {
			if (!recordingRef.current.length) return;
			stopReplay();
			isReplayLoopingRef.current = Boolean(opts?.loop);
			setIsReplayLooping(isReplayLoopingRef.current);
			updateState({ replaying: true }, { record: false });
			queueMicrotask(runReplayIteration);
		},
		[runReplayIteration, stopReplay, updateState],
	);

	const executeTriggerAction = useCallback(
		(action: string) => {
			const resolved = resolveTriggerAction(action, stateRef.current.replaying);
			if (resolved === "stop") stopReplay();
			else if (resolved === "play") playReplay({ loop: false });
			else if (resolved === "play-loop") playReplay({ loop: true });
		},
		[playReplay, stopReplay],
	);

	const applyMidiCc = useCallback(
		(ccNumber: number, ccChannel: number, ccValue: number) => {
			const bindings = loadMidiBindings();
			const patch: Partial<ControlState> = {};
			let changed = false;
			let bumpCue = false;
			for (const binding of bindings) {
				if (binding.cc !== ccNumber) continue;
				if (binding.channel !== 0 && binding.channel !== ccChannel) continue;
				const raw = scaleCcToParam(ccValue, binding);
				(patch as Record<string, number>)[binding.param] =
					MIDI_CC_INTEGER_PARAMS.has(binding.param)
						? Math.round(raw)
						: raw;
				changed = true;
				if (
					binding.param === "deckAMode" ||
					binding.param === "deckBMode" ||
					binding.param === "deckAGpuShader" ||
					binding.param === "deckBGpuShader"
				) {
					bumpCue = true;
				}
			}
			if (changed) {
				updateState((prev) => ({
					...patch,
					cueVersion: bumpCue ? prev.cueVersion + 1 : prev.cueVersion,
				}));
			}
		},
		[updateState],
	);

	const onMidiMessage = useCallback(
		(event: MIDIMessageEvent) => {
			const data = event.data;
			if (!data) return;
			const status = data[0] ?? 0;
			const data1 = data[1] ?? 0;
			const data2 = data[2] ?? 0;
			const msgType = status & 0xf0;
			const channel = (status & 0x0f) + 1;
			if (msgType === 0xb0) {
				applyMidiCc(data1, channel, data2);
				const trigger = findMidiCcTrigger(
					triggerBindings,
					data1,
					channel,
					data2,
				);
				if (trigger) executeTriggerAction(trigger.action);
			} else if (msgType === 0x90 && data2 > 0) {
				const trigger = findMidiNoteTrigger(triggerBindings, data1, channel);
				if (trigger) executeTriggerAction(trigger.action);
			}
		},
		[applyMidiCc, executeTriggerAction, triggerBindings],
	);

	const countMidiInputs = (access: MIDIAccess | null) => {
		if (!access) return 0;
		let count = 0;
		access.inputs.forEach(() => {
			count += 1;
		});
		return count;
	};

	const renderMidiStatus = useCallback((access: MIDIAccess | null) => {
		setMidiInputCount(countMidiInputs(access));
	}, []);

	const enableMidi = useCallback(() => {
		if (!navigator.requestMIDIAccess) {
			addBanner("Web MIDI API not supported in this browser.", "warn");
			return;
		}
		navigator.requestMIDIAccess().then(
			(access) => {
				midiAccessRef.current = access;
				setMidiEnabled(true);
				for (const input of access.inputs as unknown as Iterable<MIDIInput>) {
					input.onmidimessage = onMidiMessage;
				}
				access.onstatechange = () => {
					for (const input of access.inputs as unknown as Iterable<MIDIInput>) {
						input.onmidimessage = onMidiMessage;
					}
					renderMidiStatus(access);
				};
				renderMidiStatus(access);
			},
			(err) => {
				addBanner(`MIDI access denied: ${err.message}`, "warn");
			},
		);
	}, [addBanner, onMidiMessage, renderMidiStatus]);

	const addMidiBinding = useCallback((binding: MidiCcBinding) => {
		const bindings = [...loadMidiBindings(), binding];
		saveMidiBindings(bindings);
		setMidiBindings(bindings);
	}, []);

	const removeMidiBinding = useCallback((index: number) => {
		const bindings = loadMidiBindings();
		bindings.splice(index, 1);
		saveMidiBindings(bindings);
		setMidiBindings([...bindings]);
	}, []);

	const addTriggerBinding = useCallback((binding: TriggerBinding) => {
		const bindings = [...loadTriggerBindings(), binding];
		saveTriggerBindings(bindings);
		setTriggerBindings(bindings);
	}, []);

	const removeTriggerBinding = useCallback((index: number) => {
		const bindings = loadTriggerBindings();
		bindings.splice(index, 1);
		saveTriggerBindings(bindings);
		setTriggerBindings(bindings);
	}, []);

	const micTick = useCallback(() => {
		const mic = micFreqDataRef.current;
		const ctx = micContextRef.current;
		if (!mic || !ctx) return;
		mic.analyser.getFloatFrequencyData(mic.bins);
		const ws = wsRef.current;
		if (ws?.readyState !== WebSocket.OPEN) return;
		const features = extractMicFeatures(mic.bins, {
			sampleRate: ctx.sampleRate,
			fftSize: MIC_FFT_SIZE,
			minDecibels: MIC_MIN_DB,
			maxDecibels: MIC_MAX_DB,
		});
		ws.send(
			JSON.stringify({ address: "/aurora/audio/features", args: [features] }),
		);
	}, []);

	const stopMicCapture = useCallback(() => {
		if (micTimerRef.current) {
			clearInterval(micTimerRef.current);
			micTimerRef.current = null;
		}
		if (micStreamRef.current) {
			micStreamRef.current.getTracks().forEach((t) => t.stop());
			micStreamRef.current = null;
		}
		if (micContextRef.current) {
			micContextRef.current.close().catch(() => {});
			micContextRef.current = null;
		}
		micFreqDataRef.current = null;
		setMicActive(false);
	}, []);

	const startMicCapture = useCallback(async () => {
		if (micActive || micStartingRef.current) return;
		micStartingRef.current = true;
		try {
			const secureError = micSecureContextError({
				isSecureContext: window.isSecureContext,
				hostname: location.hostname,
			});
			if (secureError) {
				addBanner(secureError, "error");
				return;
			}
			if (!navigator.mediaDevices?.getUserMedia) {
				addBanner(
					"Live mic capture unavailable: getUserMedia is not supported in this browser.",
					"error",
				);
				return;
			}
			let stream: MediaStream;
			try {
				// Disable the browser's voice-DSP: echo cancellation actively SUBTRACTS
				// system/speaker audio from the mic (killing the music we want to
				// capture, highs worst), and AGC/noise-suppression squash + gate the
				// signal. We want the raw spectrum, not a cleaned-up voice channel.
				stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: false,
						noiseSuppression: false,
						autoGainControl: false,
					},
				});
			} catch (err) {
				const e = err as Error;
				addBanner(
					`Live mic capture failed: ${e?.name || "Error"} — ${e?.message || err}`,
					"error",
				);
				return;
			}
			const AudioCtx =
				window.AudioContext ||
				(window as typeof window & { webkitAudioContext?: typeof AudioContext })
					.webkitAudioContext;
			if (!AudioCtx) {
				addBanner("AudioContext is not supported in this browser.", "error");
				stream.getTracks().forEach((t) => t.stop());
				return;
			}
			const context = new AudioCtx();
			await context.resume().catch(() => {});
			const source = context.createMediaStreamSource(stream);
			const analyser = context.createAnalyser();
			analyser.fftSize = MIC_FFT_SIZE;
			analyser.minDecibels = MIC_MIN_DB;
			analyser.maxDecibels = MIC_MAX_DB;
			source.connect(analyser);
			micStreamRef.current = stream;
			micContextRef.current = context;
			micFreqDataRef.current = {
				analyser,
				bins: new Float32Array(analyser.frequencyBinCount),
			};
			micTimerRef.current = setInterval(micTick, MIC_SEND_INTERVAL_MS);
			setMicActive(true);
		} finally {
			micStartingRef.current = false;
		}
	}, [addBanner, micActive, micTick]);

	const toggleMicCapture = useCallback(() => {
		if (micActive) stopMicCapture();
		else void startMicCapture();
	}, [micActive, startMicCapture, stopMicCapture]);

	const startRecording = useCallback(() => {
		setIsRecording((prev) => {
			if (!prev) {
				setRecording([]);
				recordStartRef.current = performance.now();
			}
			return !prev;
		});
	}, []);

	const resetState = useCallback(() => {
		clearSessionState();
		setState((prev) => {
			const next = {
				...defaultState(),
				flashVersion: prev.flashVersion,
				resetVersion: prev.resetVersion + 1,
			};
			stateRef.current = next;
			return next;
		});
		setPendingCue(null);
		queueMicrotask(() => publish());
	}, [publish]);

	const dismissErrorBanner = useCallback((id: number) => {
		setBanners((prev) => dismissBanner(prev, id));
	}, []);

	const setPendingCurve = useCallback((key: InterpolatedKey, mode: CurveMode) => {
		setPendingCurves((prev) => ({ ...prev, [key]: mode }));
	}, []);

	const sendPing = useCallback(() => {
		const ws = wsRef.current;
		if (ws?.readyState !== WebSocket.OPEN) return;
		pingIdRef.current += 1;
		const id = pingIdRef.current;
		pendingPingsRef.current[id] = performance.now();
		ws.send(JSON.stringify({ address: "/aurora/ping", id }));
	}, []);

	const applyFrame = useCallback(
		(frame: {
			address?: string;
			args?: unknown[];
			error?: unknown;
			id?: number;
		}) => {
			if (frame?.address === "/aurora/error" && frame.error) {
				addBanner(String(frame.error));
			}
			const args = Array.isArray(frame?.args) ? frame.args : [];
			if (
				frame?.address === "/aurora/control/state" &&
				args[0] &&
				typeof args[0] === "object"
			) {
				syncFromRemote(args[0] as Partial<ControlState>);
			}
			if (
				frame?.address === "/aurora/server/diagnostics" &&
				args[0] &&
				typeof args[0] === "object"
			) {
				setDiagnostics(args[0] as Diagnostics);
			}
			if (
				frame?.address === "/aurora/demo/audio" &&
				stateRef.current.demoMode &&
				args[0] &&
				typeof args[0] === "object"
			) {
				setOsc((prev) => {
					const next = { ...prev };
					applyDemo(args[0] as Record<string, unknown>, next);
					oscRef.current = next;
					return next;
				});
			}
			if (
				frame?.address === "/aurora/audio/features" &&
				args[0] &&
				typeof args[0] === "object"
			) {
				setOsc((prev) => {
					const next = { ...prev };
					applyBrowserAudio(args[0] as Record<string, unknown>, next);
					oscRef.current = next;
					return next;
				});
			}
			if (
				frame?.address === "/live/song/get/tempo" &&
				Number.isFinite(Number(args[0]))
			) {
				let bpm = Number(args[0]);
				bpm = Math.round(bpm * 10) / 10;
				// Ignore micro-jitter from live clock sources (Link, MIDI clock, Ableton)
				// so the BPM slider (and renderer) do not twitch while audio is playing.
				if (Math.abs(bpm - (stateRef.current.bpm ?? 0)) >= 0.05) {
					updateState({ bpm });
				}
			}
			if (frame?.address === "/live/song/get/beat") {
				const nextBeat = Number(args[0]) || 0;
				setOsc((prev) => {
					const next = { ...prev };
					if (Math.floor(nextBeat) !== next.beatIndex) {
						next.beatIndex = Math.floor(nextBeat);
						flushPendingCue(nextBeat);
					}
					next.beat = nextBeat;
					next.lastFrameAt = performance.now();
					oscRef.current = next;
					return next;
				});
			}
			if (frame?.address === "/live/song/get/track_data") {
				setOsc((prev) => {
					const next = { ...prev };
					applyTrackData(args, stateRef.current, next);
					oscRef.current = next;
					return next;
				});
			}
			if (frame?.address?.startsWith("/aurora/preset/recall/")) {
				const n = Number(frame.address.split("/").pop());
				if (Number.isInteger(n) && n >= 1 && n <= 6) recallPreset(n);
			}
			if (frame?.address?.startsWith("/aurora/preset/save/")) {
				const n = Number(frame.address.split("/").pop());
				if (Number.isInteger(n) && n >= 1 && n <= 6) {
					const presets = loadPresets();
					const existing = normalizePreset(presets[`slot-${n}`]);
					presets[`slot-${n}`] = {
						schemaVersion: PRESET_BUNDLE_SCHEMA_VERSION,
						name: existing?.name || `Preset ${n}`,
						state: cloneState(stateRef.current),
						curves: { ...pendingCurves },
					};
					savePresetsToStorage(presets);
					setActivePresetIndex(n);
					refreshPresetGrid();
				}
			}
			if (frame?.address === "/aurora/pong" && typeof frame.id === "number") {
				const sentAt = pendingPingsRef.current[frame.id];
				if (sentAt !== undefined) {
					delete pendingPingsRef.current[frame.id];
					latencyWindowRef.current.push(performance.now() - sentAt);
					if (latencyWindowRef.current.length > 20) {
						latencyWindowRef.current.shift();
					}
					const sorted = [...latencyWindowRef.current].sort((a, b) => a - b);
					const idx = Math.min(
						Math.ceil(sorted.length * 0.95) - 1,
						sorted.length - 1,
					);
					setLatencyP95(sorted[idx] ?? null);
				}
			}
			if (frame?.address) {
				const trigger = findOscTrigger(triggerBindings, frame.address);
				if (trigger) executeTriggerAction(trigger.action);
			}
		},
		[
			addBanner,
			executeTriggerAction,
			flushPendingCue,
			pendingCurves,
			recallPreset,
			refreshPresetGrid,
			syncFromRemote,
			triggerBindings,
			updateState,
		],
	);

	const connect = useCallback(() => {
		if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
		const scheme = location.protocol === "https:" ? "wss" : "ws";
		const ws = new WebSocket(
			`${scheme}://${location.hostname || "localhost"}:3000/ws`,
		);
		wsRef.current = ws;

		ws.onopen = () => {
			setBridgeStatus("live");
			setBanners((prev) => removeBannersByType(prev, "disconnect"));
			reconnectDelayRef.current = 1000;
			publish({ record: false });
		};
		ws.onclose = () => {
			setBridgeStatus("connecting");
			addBanner("Bridge WebSocket disconnected — reconnecting…", "disconnect");
			pendingPingsRef.current = {};
			reconnectTimerRef.current = setTimeout(() => {
				connect();
			}, reconnectDelayRef.current);
			reconnectDelayRef.current = nextReconnectDelay(reconnectDelayRef.current);
		};
		ws.onerror = () => {
			setBridgeStatus("error");
		};
		ws.onmessage = (event) => {
			try {
				applyFrame(JSON.parse(event.data) as Parameters<typeof applyFrame>[0]);
			} catch {
				// Ignore malformed frames on a live controls surface.
			}
		};
	}, [addBanner, applyFrame, publish]);

	useEffect(() => {
		const timer = setTimeout(() => saveSessionState(stateRef.current), 300);
		return () => clearTimeout(timer);
	}, [state]);

	useEffect(() => {
		connect();
		const publishTimer = setInterval(() => publish(), 500);
		const pingTimer = setInterval(sendPing, 1000);
		return () => {
			if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
			clearInterval(publishTimer);
			clearInterval(pingTimer);
			replayTimersRef.current.forEach(clearTimeout);
			if (activeTransitionRafRef.current !== null) {
				cancelAnimationFrame(activeTransitionRafRef.current);
			}
			stopMicCapture();
			wsRef.current?.close();
		};
	}, [connect, publish, sendPing, stopMicCapture]);

	const value = useMemo<ControlsContextValue>(
		() => ({
			state,
			osc,
			diagnostics,
			bridgeStatus,
			banners,
			pendingCue,
			transitionDurationMs,
			pendingCurves,
			activePresetIndex,
			presetRevision,
			midiBindings,
			midiEnabled,
			midiInputCount,
			triggerBindings,
			micActive,
			isRecording,
			recording,
			isReplayLooping,
			latencyP95,
			setTransitionDurationMs,
			setPendingCurve,
			updateState,
			publish,
			queueCue,
			recallPreset,
			savePresetToSlot,
			savePreset,
			renamePreset,
			startRecording,
			playReplay,
			stopReplay,
			resetState,
			enableMidi,
			addMidiBinding,
			removeMidiBinding,
			addTriggerBinding,
			removeTriggerBinding,
			toggleMicCapture,
			dismissErrorBanner,
			refreshPresetGrid,
			getPresetSlot,
		}),
		[
			state,
			osc,
			diagnostics,
			bridgeStatus,
			banners,
			pendingCue,
			transitionDurationMs,
			pendingCurves,
			activePresetIndex,
			presetRevision,
			midiBindings,
			midiEnabled,
			midiInputCount,
			triggerBindings,
			micActive,
			isRecording,
			recording,
			isReplayLooping,
			latencyP95,
			setPendingCurve,
			updateState,
			publish,
			queueCue,
			recallPreset,
			savePresetToSlot,
			savePreset,
			renamePreset,
			startRecording,
			playReplay,
			stopReplay,
			resetState,
			enableMidi,
			addMidiBinding,
			removeMidiBinding,
			addTriggerBinding,
			removeTriggerBinding,
			toggleMicCapture,
			dismissErrorBanner,
			refreshPresetGrid,
			getPresetSlot,
		],
	);

	return (
		<ControlsContext.Provider value={value}>{children}</ControlsContext.Provider>
	);
}

export function updatePaletteFromHex(
	state: ControlState,
	hex: string,
): Partial<ControlState> | null {
	const rgb = hexToRgb(hex);
	if (!rgb) return null;
	const patch = {
		paletteR: rgb.r,
		paletteG: rgb.g,
		paletteB: rgb.b,
	};
	const next = { ...state, ...patch };
	syncPaletteFromRgb(next);
	return { ...patch, palette: next.palette };
}

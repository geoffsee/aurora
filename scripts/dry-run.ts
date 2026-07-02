#!/usr/bin/env bun
// ──────────────────────────────────────────────────────────────────────────
// Performer-Less Set Dry Run (issues #193, #213)
//
// Boots the real bridge (bridge/index.ts) on isolated ports and drives the full
// autonomy stack end-to-end with NO human at the controls: demo audio →
// audio-control router (continuous + threshold mappings), the audio transient
// detector → automation playback, OSC-controlled preset morph, and clock-source
// arbitration. The harness connects as a headless WebSocket client (standing in
// for the projector page) and only watches the broadcast `/aurora/control/state`
// stream — proving the visuals would be driven without anyone touching a knob.
//
// This is the forcing function the subsystems have never had: each one is unit
// tested in isolation, and the WS fan-out tests run against a stub server
// (tests/global-setup.ts), so nothing exercises them wired together through the
// real bridge. Integration gaps the run surfaces are reported as `gaps` and
// (in one-shot mode) should be filed as issues (see docs/dry-run.md).
//
// Two modes:
//   Run (one-shot):  bun run dry-run
//     A short forcing-function window. Only the acceptance-criteria "required"
//     checks fail the run; soft per-subsystem gaps are reported (GAP) but do not.
//
//   Standing gate (#213):  DRY_RUN_SUSTAINED=1 bun run dry-run
//     A sustained 60-minute run with horizon stall-detection. EVERY check is
//     gated: the run passes only with ZERO GAP lines. This is the reproducible
//     graduation bar that keeps the performer-less autonomy stack honest
//     cycle-over-cycle. Override the window with DRY_RUN_DURATION_MS for a
//     faster same-logic smoke of the gate.
//
// Exit code: 0 if the run passed its gate, 1 otherwise (bridge never came up,
// the control stream never moved, a required check failed, or — under
// DRY_RUN_SUSTAINED — any gap at all was detected). The pass/fail is asserted
// from the accumulated checks, not merely printed.
// ──────────────────────────────────────────────────────────────────────────

import { CONTROL_STATE_SCHEMA_VERSION } from "../shared/osc-validation.ts";
import { type Check, evaluateRun } from "./dry-run-gate.ts";

type Json = Record<string, unknown>;
type OscMsg = { address: string; args?: unknown[] };

const numEnv = (name: string, fallback: number): number => {
	const v = Number(Bun.env[name]);
	return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

const boolEnv = (name: string): boolean => {
	const v = (Bun.env[name] ?? "").trim().toLowerCase();
	return v === "1" || v === "true" || v === "yes" || v === "on";
};

// Isolated from the dev defaults (3000/3001/11000/11001/12000) so a dry run can
// sit alongside a running dev server without a port clash.
const PORT = numEnv("DRY_RUN_PORT", 3900);
const CONTROLS_PORT = numEnv("DRY_RUN_CONTROLS_PORT", 3901);
const LIVE_SEND_PORT = numEnv("DRY_RUN_LIVE_SEND_PORT", 11900);
const LIVE_RECV_PORT = numEnv("DRY_RUN_LIVE_RECV_PORT", 11901);
const VST_CONTROL_RECV_PORT = numEnv("DRY_RUN_VST_CONTROL_RECV_PORT", 12900);

// The standing gate (#213): a sustained 60-minute run whose pass condition is
// zero GAP lines. DRY_RUN_DURATION_MS still overrides the window (for a faster
// same-logic smoke), but the default stretches to the full hour under sustain.
const SUSTAINED = boolEnv("DRY_RUN_SUSTAINED");
const SUSTAINED_DURATION_MS = 60 * 60 * 1000;
const DURATION_MS = numEnv(
	"DRY_RUN_DURATION_MS",
	SUSTAINED ? SUSTAINED_DURATION_MS : 30000,
);

// Horizon stall-detection. A one-shot window can't catch a freeze at minute 45,
// so the sustained gate watches for stalls in the two liveness signals: the
// control-state broadcast cadence, and how long fields go without moving. A
// stall longer than these thresholds is a GAP.
const STALL_MS = numEnv("DRY_RUN_STALL_MS", 3000);
const MOVEMENT_STALL_MS = numEnv("DRY_RUN_MOVEMENT_STALL_MS", 5000);
const HEARTBEAT_MS = 5 * 60 * 1000;

const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Cue names the bridge knows (see cuePresets in bridge/index.ts). The morph driver
// sweeps between adjacent pairs so a fader-less performer-less blend is proven.
const CUES = ["warmup", "drop", "tunnel", "burst", "wash", "panic"] as const;

async function connect(timeoutMs: number): Promise<WebSocket> {
	const deadline = Date.now() + timeoutMs;
	let lastErr = "";
	while (Date.now() < deadline) {
		try {
			const ws = await new Promise<WebSocket>((resolve, reject) => {
				const sock = new WebSocket(WS_URL);
				sock.addEventListener("open", () => resolve(sock), { once: true });
				sock.addEventListener(
					"error",
					() => {
						sock.close();
						reject(new Error(`connect failed: ${WS_URL}`));
					},
					{ once: true },
				);
			});
			return ws;
		} catch (e) {
			lastErr = e instanceof Error ? e.message : String(e);
			await sleep(200);
		}
	}
	throw new Error(`bridge WS never accepted a connection (${lastErr})`);
}

// Top-level control-state fields that, when they move over the window, prove the
// renderer would see changing visuals. Nested objects are compared by JSON. The
// first state establishes a silent baseline (returns []) so a field is only
// counted when it genuinely moves, not on the initial broadcast.
function changedKeys(prev: Json | null, next: Json): string[] {
	if (!prev) return [];
	const out: string[] = [];
	for (const k of Object.keys(next)) {
		if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out.push(k);
	}
	return out;
}

async function main(): Promise<number> {
	const runStart = Date.now();
	console.log(
		`[dry-run] booting bridge on :${PORT} (controls :${CONTROLS_PORT}); ` +
			`${SUSTAINED ? "SUSTAINED gate" : "one-shot"} window ${DURATION_MS}ms` +
			(SUSTAINED ? " (pass = zero GAP lines)" : ""),
	);

	const bridge = Bun.spawn(["bun", "run", "bridge/index.ts"], {
		cwd: new URL("..", import.meta.url).pathname,
		env: {
			...process.env,
			PORT: String(PORT),
			CONTROLS_PORT: String(CONTROLS_PORT),
			LIVE_SEND_PORT: String(LIVE_SEND_PORT),
			LIVE_RECV_PORT: String(LIVE_RECV_PORT),
			VST_CONTROL_RECV_PORT: String(VST_CONTROL_RECV_PORT),
			// Keep hot-reload watchers off — this is a headless run.
			HOT_RELOAD: "",
		},
		stdout: "ignore",
		// AbletonOSC is absent, so the bridge logs ECONNREFUSED noise — swallow it.
		stderr: "ignore",
	});

	// Observation accumulators.
	let controlBroadcasts = 0;
	let demoAudioCount = 0;
	let diagnosticsCount = 0;
	const fieldChanges = new Map<string, number>();
	const clockSources = new Set<string>();
	let everReplaying = false;
	let maxFlashVersion = -1;
	let firstFlashVersion = -1;
	let prevState: Json | null = null;

	// Horizon stall-detection accumulators. Both track the longest gap between
	// consecutive *observed* events, so the connect/warm-up delay before the
	// first event is never counted as a stall.
	let lastBroadcastAt = 0;
	let maxBroadcastGapMs = 0;
	let lastMovementAt = 0;
	let maxMovementGapMs = 0;

	let ws: WebSocket;
	try {
		ws = await connect(15000);
	} catch (e) {
		bridge.kill();
		console.error(`[dry-run] FAIL: ${e instanceof Error ? e.message : e}`);
		return 1;
	}

	ws.addEventListener("message", (ev: MessageEvent) => {
		let msg: OscMsg;
		try {
			msg = JSON.parse(String(ev.data)) as OscMsg;
		} catch {
			return;
		}
		switch (msg.address) {
			case "/aurora/control/state": {
				const state = (msg.args?.[0] ?? {}) as Json;
				controlBroadcasts++;
				const now = Date.now();
				if (lastBroadcastAt > 0) {
					maxBroadcastGapMs = Math.max(
						maxBroadcastGapMs,
						now - lastBroadcastAt,
					);
				}
				lastBroadcastAt = now;
				const moved = changedKeys(prevState, state);
				if (moved.length > 0) {
					if (lastMovementAt > 0) {
						maxMovementGapMs = Math.max(maxMovementGapMs, now - lastMovementAt);
					}
					lastMovementAt = now;
				}
				for (const k of moved) {
					fieldChanges.set(k, (fieldChanges.get(k) ?? 0) + 1);
				}
				prevState = state;
				if (state.replaying === true) everReplaying = true;
				if (typeof state.flashVersion === "number") {
					if (firstFlashVersion < 0) firstFlashVersion = state.flashVersion;
					maxFlashVersion = Math.max(maxFlashVersion, state.flashVersion);
				}
				break;
			}
			case "/aurora/demo/audio":
				demoAudioCount++;
				break;
			case "/aurora/server/diagnostics": {
				diagnosticsCount++;
				const d = (msg.args?.[0] ?? {}) as Json;
				// Read the arbiter's actual selection, not a reconstruction of it.
				if (typeof d.clockSource === "string") clockSources.add(d.clockSource);
				break;
			}
		}
	});

	const send = (m: OscMsg) => ws.send(JSON.stringify(m));

	// 1. Hand the set to the machine: enable demo audio (the single performer-less
	//    audio source that drives the audio-control router when armed) and turn
	//    the router on. coerceControlState fills every other field with its default.
	send({
		address: "/aurora/control/state",
		args: [
			{
				schemaVersion: CONTROL_STATE_SCHEMA_VERSION,
				demoMode: true,
				audioControlMode: true,
			},
		],
	});

	// 2. Router-only window: demo audio + the router are live, but automation
	//    playback and the morph sweep have NOT started yet. The morph path and
	//    automation playback both also write intensity/depth, so intensity/depth
	//    movement during the rest of the run can't isolate the router. Snapshot
	//    their movement here, where the router is the only thing that can move
	//    them — a dead router shows zero in this window.
	await sleep(2000);
	const routerOnlyIntensity = fieldChanges.get("intensity") ?? 0;
	const routerOnlyDepth = fieldChanges.get("depth") ?? 0;

	// 3. Start automation playback so the recorder/player path is live; the demo
	//    audio also auto-fires it through the transient detector.
	send({ address: "/aurora/automation/play-loop", args: [] });

	// 4. Sweep the preset morph continuously, as an absent performer's fader would.
	let morphPhase = 0;
	const morphTimer = setInterval(() => {
		morphPhase += 0.04;
		const cyclePos = morphPhase % 1;
		const pairIndex = Math.floor(morphPhase) % CUES.length;
		const from = CUES[pairIndex]!;
		const to = CUES[(pairIndex + 1) % CUES.length]!;
		send({
			address: "/aurora/preset/morph",
			args: [from, to, cyclePos, "ease"],
		});
	}, 200);

	// Sustained runs are otherwise silent for an hour; emit a heartbeat so an
	// operator (or CI log) can see the gate is alive and watch the stalls stay
	// flat. No-op in one-shot mode (the window is shorter than one interval).
	const heartbeat = setInterval(() => {
		const mins = ((Date.now() - runStart) / 60000).toFixed(1);
		console.log(
			`[dry-run] +${mins}min alive — ${controlBroadcasts} broadcasts, ` +
				`max stall ${maxBroadcastGapMs}ms, max no-move ${maxMovementGapMs}ms`,
		);
	}, HEARTBEAT_MS);

	await sleep(Math.max(0, DURATION_MS - 2000));
	clearInterval(morphTimer);
	clearInterval(heartbeat);

	ws.close();
	bridge.kill();
	const elapsedMs = Date.now() - runStart;

	// ── Evaluate ──────────────────────────────────────────────────────────
	const fc = (k: string) => fieldChanges.get(k) ?? 0;
	const distinctFieldsMoved = fieldChanges.size;
	const continuousMoved = routerOnlyIntensity > 0 || routerOnlyDepth > 0;
	const thresholdMoved = maxFlashVersion > firstFlashVersion;
	const morphMoved = fc("morph") > 0;

	const checks: Check[] = [
		{
			name: "bridge_boot",
			ok: controlBroadcasts > 0,
			required: true,
			detail: `${controlBroadcasts} control-state broadcasts received`,
		},
		{
			name: "visuals_driven",
			ok: controlBroadcasts > 5 && distinctFieldsMoved >= 3,
			required: true,
			detail: `${distinctFieldsMoved} distinct fields moved over the window`,
		},
		{
			name: "demo_audio",
			ok: demoAudioCount > 0,
			required: true,
			detail: `${demoAudioCount} /aurora/demo/audio frames`,
		},
		{
			name: "audio_router_continuous",
			ok: continuousMoved,
			required: true,
			detail: `router-only window: intensity:${routerOnlyIntensity} depth:${routerOnlyDepth} moves`,
		},
		{
			name: "preset_morph",
			ok: morphMoved,
			required: true,
			detail: `morph field moved ${fc("morph")}x`,
		},
		{
			name: "audio_router_threshold",
			ok: thresholdMoved,
			required: false,
			detail: thresholdMoved
				? `flashVersion ${firstFlashVersion}→${maxFlashVersion}`
				: "flashVersion never incremented (pulse→flash threshold not crossed)",
		},
		{
			name: "transient_automation",
			ok: everReplaying,
			required: false,
			detail: everReplaying
				? "automation playback engaged (replaying=true observed)"
				: "replaying never went true — automation path produced no playback",
		},
		{
			name: "clock_arbiter",
			ok: clockSources.size > 0,
			required: false,
			detail: `clock sources observed: ${[...clockSources].join(",") || "none"}`,
		},
		{
			name: "no_broadcast_stall",
			ok: maxBroadcastGapMs <= STALL_MS,
			required: false,
			detail: `longest control-stream stall ${maxBroadcastGapMs}ms (threshold ${STALL_MS}ms)`,
		},
		{
			name: "no_movement_stall",
			ok: maxMovementGapMs <= MOVEMENT_STALL_MS,
			required: false,
			detail: `longest gap with no field movement ${maxMovementGapMs}ms (threshold ${MOVEMENT_STALL_MS}ms)`,
		},
	];

	const { failures, gaps: gapChecks, pass } = evaluateRun(checks, SUSTAINED);

	const report = {
		issue: 213,
		mode: SUSTAINED ? "sustained" : "one-shot",
		sustained: SUSTAINED,
		durationMs: elapsedMs,
		controlBroadcasts,
		demoAudioCount,
		diagnosticsCount,
		distinctFieldsMoved,
		maxBroadcastGapMs,
		maxMovementGapMs,
		fieldChanges: Object.fromEntries(fieldChanges),
		checks,
		pass,
		gaps: gapChecks.map((c) => `${c.name}: ${c.detail}`),
	};

	console.log("\n──────── Performer-Less Dry Run Report ────────");
	for (const c of checks) {
		// Under the sustained gate every failing check is a hard FAIL (the pass
		// condition is zero GAP lines); in one-shot mode only required checks do.
		const gated = c.required || SUSTAINED;
		const tag = c.ok ? "PASS" : gated ? "FAIL" : "GAP ";
		console.log(`  [${tag}] ${c.name} — ${c.detail}`);
	}
	console.log(
		`\n  control broadcasts: ${controlBroadcasts}  | demo audio frames: ${demoAudioCount}  | fields moved: ${distinctFieldsMoved}`,
	);
	if (report.gaps.length > 0) {
		console.log(
			SUSTAINED
				? "\n  Gaps (each fails the sustained gate):"
				: "\n  Integration gaps to file as issues (see docs/dry-run.md):",
		);
		for (const g of report.gaps) console.log(`    - ${g}`);
	}

	if (Bun.env.DRY_RUN_REPORT) {
		await Bun.write(Bun.env.DRY_RUN_REPORT, JSON.stringify(report, null, 2));
		console.log(`\n  JSON report written to ${Bun.env.DRY_RUN_REPORT}`);
	}

	if (!pass) {
		console.log(
			SUSTAINED
				? `\n[dry-run] FAIL: sustained gate saw ${failures.length} gap(s) — a clean run needs zero.`
				: `\n[dry-run] FAIL: ${failures.length} required check(s) failed.`,
		);
		return 1;
	}
	console.log(
		SUSTAINED
			? "\n[dry-run] PASS: sustained performer-less run stayed clean (zero GAP lines) for the full window."
			: "\n[dry-run] PASS: visuals were driven performer-less for the full window.",
	);
	return 0;
}

// Only boot the bridge when executed directly (bun run dry-run). Importing this
// module for unit tests (evaluateRun) must not spawn a 60-minute run.
if (import.meta.main) {
	main().then(
		(code) => process.exit(code),
		(err) => {
			console.error("[dry-run] crashed:", err);
			process.exit(1);
		},
	);
}

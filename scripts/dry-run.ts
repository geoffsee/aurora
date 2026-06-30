#!/usr/bin/env bun
// ──────────────────────────────────────────────────────────────────────────
// Performer-Less Set Dry Run (issue #193)
//
// Boots the real bridge (bridge/index.ts) on isolated ports and drives the full
// autonomy stack end-to-end with NO human at the controls: demo audio →
// audio-control router (continuous + threshold mappings), the audio transient
// detector → automation playback, OSC-controlled preset morph, and clock-source
// arbitration. The harness connects as a headless WebSocket client (standing in
// for the projector page) and only watches the broadcast `/bevyosc/control/state`
// stream — proving the visuals would be driven without anyone touching a knob.
//
// This is the forcing function the subsystems have never had: each one is unit
// tested in isolation, and the WS fan-out tests run against a stub server
// (tests/global-setup.ts), so nothing exercises them wired together through the
// real bridge. Integration gaps the run surfaces are reported as `gaps` and
// should be filed as issues (see docs/dry-run.md).
//
// Run:  bun run dry-run
//       DRY_RUN_DURATION_MS=600000 bun run dry-run   # sustain across an afternoon
//
// Exit code: 0 if visuals were driven performer-less for the whole window
// (the acceptance-criteria core); 1 if the bridge never came up or the control
// stream never moved. Soft per-subsystem gaps are reported but do not fail the
// run — the first run is expected to surface known gaps.
// ──────────────────────────────────────────────────────────────────────────

import { CONTROL_STATE_SCHEMA_VERSION } from "../shared/osc-validation.ts";

type Json = Record<string, unknown>;
type OscMsg = { address: string; args?: unknown[] };

const numEnv = (name: string, fallback: number): number => {
	const v = Number(Bun.env[name]);
	return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

// Isolated from the dev defaults (3000/3001/11000/11001/12000) so a dry run can
// sit alongside a running dev server without a port clash.
const PORT = numEnv("DRY_RUN_PORT", 3900);
const CONTROLS_PORT = numEnv("DRY_RUN_CONTROLS_PORT", 3901);
const LIVE_SEND_PORT = numEnv("DRY_RUN_LIVE_SEND_PORT", 11900);
const LIVE_RECV_PORT = numEnv("DRY_RUN_LIVE_RECV_PORT", 11901);
const VST_CONTROL_RECV_PORT = numEnv("DRY_RUN_VST_CONTROL_RECV_PORT", 12900);
const DURATION_MS = numEnv("DRY_RUN_DURATION_MS", 30000);
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
		`[dry-run] booting bridge on :${PORT} (controls :${CONTROLS_PORT}); window ${DURATION_MS}ms`,
	);

	const bridge = Bun.spawn(["bun", "run", "bridge/bridge/index.ts"], {
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
			case "/bevyosc/control/state": {
				const state = (msg.args?.[0] ?? {}) as Json;
				controlBroadcasts++;
				for (const k of changedKeys(prevState, state)) {
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
			case "/bevyosc/demo/audio":
				demoAudioCount++;
				break;
			case "/bevyosc/server/diagnostics": {
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
		address: "/bevyosc/control/state",
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

	// 3. Start automation playback so the recorder/player path is live.
	send({ address: "/bevyosc/automation/play-loop", args: [] });

	// 4. Sweep the preset morph continuously, as an absent performer's fader would.
	let morphPhase = 0;
	const morphTimer = setInterval(() => {
		morphPhase += 0.04;
		const cyclePos = morphPhase % 1;
		const pairIndex = Math.floor(morphPhase) % CUES.length;
		const from = CUES[pairIndex]!;
		const to = CUES[(pairIndex + 1) % CUES.length]!;
		send({
			address: "/bevyosc/preset/morph",
			args: [from, to, cyclePos, "ease"],
		});
	}, 200);

	await sleep(Math.max(0, DURATION_MS - 2000));
	clearInterval(morphTimer);

	ws.close();
	bridge.kill();
	const elapsedMs = Date.now() - runStart;

	// ── Evaluate ──────────────────────────────────────────────────────────
	const fc = (k: string) => fieldChanges.get(k) ?? 0;
	const distinctFieldsMoved = fieldChanges.size;
	const continuousMoved = routerOnlyIntensity > 0 || routerOnlyDepth > 0;
	const thresholdMoved = maxFlashVersion > firstFlashVersion;
	const morphMoved = fc("morph") > 0;

	type Check = { name: string; ok: boolean; required: boolean; detail: string };
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
			detail: `${demoAudioCount} /bevyosc/demo/audio frames`,
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
	];

	const report = {
		issue: 193,
		durationMs: elapsedMs,
		controlBroadcasts,
		demoAudioCount,
		diagnosticsCount,
		distinctFieldsMoved,
		fieldChanges: Object.fromEntries(fieldChanges),
		checks,
		gaps: checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`),
	};

	console.log("\n──────── Performer-Less Dry Run Report ────────");
	for (const c of checks) {
		const tag = c.ok ? "PASS" : c.required ? "FAIL" : "GAP ";
		console.log(`  [${tag}] ${c.name} — ${c.detail}`);
	}
	console.log(
		`\n  control broadcasts: ${controlBroadcasts}  | demo audio frames: ${demoAudioCount}  | fields moved: ${distinctFieldsMoved}`,
	);
	if (report.gaps.length > 0) {
		console.log(
			"\n  Integration gaps to file as issues (see docs/dry-run.md):",
		);
		for (const g of report.gaps) console.log(`    - ${g}`);
	}

	if (Bun.env.DRY_RUN_REPORT) {
		await Bun.write(Bun.env.DRY_RUN_REPORT, JSON.stringify(report, null, 2));
		console.log(`\n  JSON report written to ${Bun.env.DRY_RUN_REPORT}`);
	}

	const requiredFailures = checks.filter((c) => c.required && !c.ok);
	if (requiredFailures.length > 0) {
		console.log(
			`\n[dry-run] FAIL: ${requiredFailures.length} required check(s) failed.`,
		);
		return 1;
	}
	console.log(
		"\n[dry-run] PASS: visuals were driven performer-less for the full window.",
	);
	return 0;
}

main().then(
	(code) => process.exit(code),
	(err) => {
		console.error("[dry-run] crashed:", err);
		process.exit(1);
	},
);

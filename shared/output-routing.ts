// Multi-output routing for multi-projector installation venues.
//
// The projector page (index.html) is a single render target. To drive more than
// one projector, each browser window opens the projector page with an `?output=`
// query param naming which output it is. The controls surface configures a list
// of named outputs in ControlState; the bridge broadcasts that list to every
// window, and each window resolves the route matching its own id.
//
// A route can override a small set of per-output parameters so each projector can
// show a distinct view of the same show without any GPU shader work:
//   - crossfade   — route deck A / mix / deck B onto separate projectors.
//   - palette     — give each projector its own colour.
//   - activeShader — run a different visual on each projector.
// A `null` override means "inherit the shared control-state value". Disabling an
// output blacks it out while keeping its config around.
//
// The default output id is "main": a window with no `?output=` param, or one that
// has no matching route, renders the shared state unchanged. This keeps the
// single-projector path a pure no-op (empty `outputs` list, zero overhead).

// Cap the configurable list so an untrusted control-state payload can't grow it
// without bound. Eight is comfortably more projectors than any single bridge
// process is expected to drive.
export const MAX_OUTPUTS = 8;

// Output ids are used as URL query values and DOM-facing identifiers: keep them
// to a conservative, injection-safe character set.
const OUTPUT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export const MAX_SHADER_INDEX = 35;

export type OutputOverride = number | null;

export type OutputRoute = {
	id: string;
	label: string;
	enabled: boolean;
	// null = inherit the shared control-state value for this field.
	crossfade: OutputOverride;
	palette: OutputOverride;
	activeShader: OutputOverride;
};

export type OutputBaseView = {
	crossfade: number;
	palette: number;
	activeShader: number;
	blackout: boolean;
};

const clampUnit = (value: unknown): number => {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(1, n));
};

const clampShader = (value: unknown): number => {
	const n = Number(value);
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(MAX_SHADER_INDEX, Math.floor(n)));
};

// A unit override is inherited (null) when absent/non-finite, otherwise clamped.
const normalizeUnitOverride = (value: unknown): OutputOverride =>
	value === null || value === undefined || !Number.isFinite(Number(value))
		? null
		: clampUnit(value);

const normalizeShaderOverride = (value: unknown): OutputOverride =>
	value === null || value === undefined || !Number.isFinite(Number(value))
		? null
		: clampShader(value);

export const isValidOutputId = (raw: unknown): raw is string =>
	typeof raw === "string" && OUTPUT_ID_RE.test(raw);

// Normalize one untrusted route entry. Returns null when the id is unusable so
// the caller can drop it — every output must have a valid, addressable id.
export const normalizeOutputRoute = (raw: unknown): OutputRoute | null => {
	if (!raw || typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	if (!isValidOutputId(r.id)) return null;
	const label =
		typeof r.label === "string" && r.label.trim().length > 0
			? r.label.trim().slice(0, 48)
			: r.id;
	return {
		id: r.id,
		label,
		enabled: r.enabled !== false,
		crossfade: normalizeUnitOverride(r.crossfade),
		palette: normalizeUnitOverride(r.palette),
		activeShader: normalizeShaderOverride(r.activeShader),
	};
};

// Normalize an untrusted outputs list: drop invalid entries, de-duplicate by id
// (first wins), and cap the length at MAX_OUTPUTS.
export const normalizeOutputRoutes = (raw: unknown): OutputRoute[] => {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: OutputRoute[] = [];
	for (const entry of raw) {
		const route = normalizeOutputRoute(entry);
		if (!route || seen.has(route.id)) continue;
		seen.add(route.id);
		out.push(route);
		if (out.length >= MAX_OUTPUTS) break;
	}
	return out;
};

// Resolve the effective view for one output. With no route (the implicit "main"
// output, or an unconfigured id) the shared base view passes through unchanged.
// A disabled output is blacked out; otherwise each non-null override replaces its
// base field. The projector (web/index.html applyOutputRoute) mirrors this inline;
// tests/shared/output-routing.test.ts pins the mirror against this function.
export const resolveOutputView = (
	base: OutputBaseView,
	route?: OutputRoute,
): OutputBaseView => {
	if (!route) return { ...base };
	if (!route.enabled) return { ...base, blackout: true };
	return {
		crossfade: route.crossfade ?? base.crossfade,
		palette: route.palette ?? base.palette,
		activeShader: route.activeShader ?? base.activeShader,
		blackout: base.blackout,
	};
};

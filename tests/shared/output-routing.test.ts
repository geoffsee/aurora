import { describe, expect, test } from "vitest";
import {
	MAX_SHADER_INDEX,
	MAX_OUTPUTS,
	isValidOutputId,
	normalizeOutputRoute,
	normalizeOutputRoutes,
	resolveOutputView,
	type OutputBaseView,
	type OutputRoute,
} from "../../shared/output-routing.ts";

const base = (): OutputBaseView => ({
	crossfade: 0.5,
	palette: 0.2,
	activeShader: 1,
	blackout: false,
});

describe("isValidOutputId", () => {
	test("accepts conservative identifiers", () => {
		expect(isValidOutputId("main")).toBe(true);
		expect(isValidOutputId("left-1")).toBe(true);
		expect(isValidOutputId("Proj_2")).toBe(true);
	});

	test("rejects empty, malformed, and oversized ids", () => {
		expect(isValidOutputId("")).toBe(false);
		expect(isValidOutputId("-leading")).toBe(false);
		expect(isValidOutputId("has space")).toBe(false);
		expect(isValidOutputId("a/b")).toBe(false);
		expect(isValidOutputId("x".repeat(40))).toBe(false);
		expect(isValidOutputId(42)).toBe(false);
	});
});

describe("normalizeOutputRoute", () => {
	test("fills defaults and inherits overrides when absent", () => {
		expect(normalizeOutputRoute({ id: "left" })).toEqual({
			id: "left",
			label: "left",
			enabled: true,
			crossfade: null,
			palette: null,
			activeShader: null,
		});
	});

	test("clamps overrides and trims label", () => {
		expect(
			normalizeOutputRoute({
				id: "right",
				label: "  Right Wall  ",
				enabled: false,
				crossfade: 2,
				palette: -1,
				activeShader: 99,
			}),
		).toEqual({
			id: "right",
			label: "Right Wall",
			enabled: false,
			crossfade: 1,
			palette: 0,
			activeShader: MAX_SHADER_INDEX,
		});
	});

	test("non-finite overrides become inherit (null)", () => {
		const route = normalizeOutputRoute({
			id: "mid",
			crossfade: "nope",
			palette: null,
			activeShader: undefined,
		});
		expect(route?.crossfade).toBeNull();
		expect(route?.palette).toBeNull();
		expect(route?.activeShader).toBeNull();
	});

	test("returns null for an invalid id", () => {
		expect(normalizeOutputRoute({ id: "bad id" })).toBeNull();
		expect(normalizeOutputRoute({})).toBeNull();
		expect(normalizeOutputRoute(null)).toBeNull();
	});
});

describe("normalizeOutputRoutes", () => {
	test("non-array input yields an empty list", () => {
		expect(normalizeOutputRoutes(undefined)).toEqual([]);
		expect(normalizeOutputRoutes({})).toEqual([]);
	});

	test("drops invalid entries and de-duplicates by id (first wins)", () => {
		const routes = normalizeOutputRoutes([
			{ id: "main", label: "Main" },
			{ id: "bad id" },
			{ id: "main", label: "Dupe" },
			"garbage",
		]);
		expect(routes.map((r) => r.id)).toEqual(["main"]);
		expect(routes[0]?.label).toBe("Main");
	});

	test("caps the list at MAX_OUTPUTS", () => {
		const many = Array.from({ length: MAX_OUTPUTS + 5 }, (_, i) => ({
			id: `out${i}`,
		}));
		expect(normalizeOutputRoutes(many)).toHaveLength(MAX_OUTPUTS);
	});
});

describe("resolveOutputView", () => {
	test("no route passes the base view through unchanged", () => {
		expect(resolveOutputView(base(), undefined)).toEqual(base());
	});

	test("a disabled route blacks the output out", () => {
		const route = normalizeOutputRoute({ id: "left", enabled: false });
		expect(resolveOutputView(base(), route!).blackout).toBe(true);
	});

	test("non-null overrides replace base fields, null inherits", () => {
		const route = normalizeOutputRoute({
			id: "left",
			crossfade: 0,
			activeShader: 4,
		});
		expect(resolveOutputView(base(), route!)).toEqual({
			crossfade: 0,
			palette: 0.2,
			activeShader: 4,
			blackout: false,
		});
	});

	test("base blackout is preserved through an enabled route", () => {
		const route = normalizeOutputRoute({ id: "left", crossfade: 1 });
		const view = resolveOutputView({ ...base(), blackout: true }, route!);
		expect(view.blackout).toBe(true);
		expect(view.crossfade).toBe(1);
	});
});

// The projector (web/index.html) resolves output routes inline in
// applyOutputRoute rather than importing resolveOutputView, per the documented
// mirror pattern (AGENTS.md). This replica is a line-for-line copy of that inline
// logic; keep it in sync when editing web/index.html. The parity test below pins
// the replica against resolveOutputView so the two can't drift.
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const clampInt = (
	value: number,
	lo: number,
	hi: number,
	fallback: number,
): number => {
	const v = Math.floor(Number(value));
	if (!Number.isFinite(v)) return fallback;
	return Math.max(lo, Math.min(hi, v));
};

function applyOutputRouteReplica(
	base: OutputBaseView,
	route: OutputRoute | undefined,
): OutputBaseView {
	const controlState = { ...base };
	if (!route) return controlState;
	if (route.enabled === false) {
		controlState.blackout = true;
		return controlState;
	}
	if (typeof route.crossfade === "number")
		controlState.crossfade = clamp01(route.crossfade);
	if (typeof route.palette === "number")
		controlState.palette = clamp01(route.palette);
	if (typeof route.activeShader === "number") {
		controlState.activeShader = clampInt(
			route.activeShader,
			0,
			MAX_SHADER_INDEX,
			controlState.activeShader,
		);
	}
	return controlState;
}

describe("projector inline mirror parity", () => {
	const cases: Array<{ name: string; route: unknown }> = [
		{ name: "no override", route: { id: "left" } },
		{ name: "disabled", route: { id: "left", enabled: false } },
		{ name: "crossfade override", route: { id: "left", crossfade: 0 } },
		{ name: "palette override", route: { id: "left", palette: 1 } },
		{
			name: "max shader override",
			route: { id: "left", activeShader: MAX_SHADER_INDEX },
		},
		{
			name: "all overrides",
			route: { id: "left", crossfade: 0.3, palette: 0.7, activeShader: 12 },
		},
	];

	for (const { name, route: raw } of cases) {
		test(`applyOutputRoute matches resolveOutputView: ${name}`, () => {
			const route = normalizeOutputRoute(raw)!;
			for (const b of [base(), { ...base(), blackout: true }]) {
				expect(applyOutputRouteReplica(b, route)).toEqual(
					resolveOutputView(b, route),
				);
			}
		});
	}

	test("no route: both pass the base through unchanged", () => {
		expect(applyOutputRouteReplica(base(), undefined)).toEqual(
			resolveOutputView(base(), undefined),
		);
	});
});

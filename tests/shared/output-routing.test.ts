import { describe, expect, test } from "vitest";
import {
	DEFAULT_OUTPUT_ID,
	MAX_OUTPUTS,
	findOutputRoute,
	isValidOutputId,
	normalizeOutputRoute,
	normalizeOutputRoutes,
	resolveOutputView,
	type OutputRoute,
} from "../../shared/output-routing.ts";

const base = () => ({
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
			activeShader: 9,
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

describe("findOutputRoute", () => {
	test("finds by id and returns undefined when absent", () => {
		const routes = normalizeOutputRoutes([
			{ id: "main" },
			{ id: "left" },
		]) as OutputRoute[];
		expect(findOutputRoute(routes, "left")?.id).toBe("left");
		expect(findOutputRoute(routes, DEFAULT_OUTPUT_ID)?.id).toBe("main");
		expect(findOutputRoute(routes, "missing")).toBeUndefined();
	});
});

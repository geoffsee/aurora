import { describe, expect, test } from "vitest";
import {
	mountGeoffseePagesNav,
	shouldSubscribeBroadcastChannel,
	shouldUseBroadcastChannel,
} from "../../web/projector-bridge.ts";

describe("shouldUseBroadcastChannel", () => {
	test("requires embed=1 and a same-origin parent frame", () => {
		const parent = { location: { origin: "http://127.0.0.1:3001" } };
		const frame = { parent: parent as Window };
		expect(
			shouldUseBroadcastChannel(
				{ search: "?embed=1", origin: "http://127.0.0.1:3001" },
				frame,
			),
		).toBe(true);
	});

	test("rejects missing embed flag", () => {
		expect(
			shouldUseBroadcastChannel({ search: "", origin: "http://127.0.0.1:3001" }, { parent: window }),
		).toBe(false);
	});
});

describe("shouldSubscribeBroadcastChannel", () => {
	test("is true for static hosting standalone projector tabs", () => {
		expect(
			shouldSubscribeBroadcastChannel(
				{
					search: "",
					hostname: "geoffsee.github.io",
					protocol: "https:",
					origin: "https://geoffsee.github.io",
				},
				{ parent: window },
			),
		).toBe(true);
	});

	test("is true for embedded previews on local dev", () => {
		const parent = { location: { origin: "http://127.0.0.1:3001" } };
		expect(
			shouldSubscribeBroadcastChannel(
				{
					search: "?embed=1",
					hostname: "127.0.0.1",
					protocol: "http:",
					origin: "http://127.0.0.1:3001",
				},
				{ parent: parent as Window },
			),
		).toBe(true);
	});

	test("is false for local standalone projector", () => {
		expect(
			shouldSubscribeBroadcastChannel(
				{
					search: "",
					hostname: "127.0.0.1",
					protocol: "http:",
					origin: "http://127.0.0.1:3000",
				},
				{ parent: window },
			),
		).toBe(false);
	});
});

describe("mountGeoffseePagesNav", () => {
	test("returns cleanup on Geoff See Pages", () => {
		let appended = false;
		const nav = {
			className: "",
			attributes: {} as Record<string, string>,
			children: [] as unknown[],
			setAttribute(name: string, value: string) {
				this.attributes[name] = name;
			},
			append(...nodes: unknown[]) {
				this.children.push(...nodes);
			},
			remove() {},
			addEventListener() {},
			removeEventListener() {},
		};
		const doc = {
			createElement: (tag: string) => {
				if (tag === "nav") return nav;
				return {
					className: "",
					href: "",
					title: "",
					type: "button",
					innerHTML: "",
					attributes: {} as Record<string, string>,
					setAttribute(name: string, value: string) {
						this.attributes[name] = value;
					},
					addEventListener() {},
					removeEventListener() {},
				};
			},
			body: {
				append() {
					appended = true;
				},
			},
			documentElement: {},
			fullscreenElement: null,
			addEventListener() {},
			removeEventListener() {},
			querySelector: () => null,
		} as unknown as Document;

		const cleanup = mountGeoffseePagesNav(doc, {
			href: "https://geoffsee.github.io/aurora/",
			search: "",
		});
		expect(appended).toBe(true);
		expect(nav.children).toHaveLength(2);
		expect(typeof cleanup).toBe("function");
	});

	test("no-ops for embedded previews and local dev", () => {
		const doc = {
			createElement: () => {
				throw new Error("should not mount");
			},
		} as unknown as Document;
		expect(
			mountGeoffseePagesNav(doc, {
				href: "https://geoffsee.github.io/aurora/?embed=1",
				search: "?embed=1",
			}),
		).toEqual(expect.any(Function));
		expect(
			mountGeoffseePagesNav(doc, {
				href: "http://127.0.0.1:3000/",
				search: "",
			}),
		).toEqual(expect.any(Function));
	});
});

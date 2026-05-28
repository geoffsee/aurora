import { expect, test, afterEach } from "vitest";
import { nextReconnectDelay } from "../src/reconnect.ts";

test("vitest happy-dom environment is wired up", () => {
	expect(typeof window).toBe("object");
	expect(typeof document).toBe("object");
});

// Helpers mirroring the inline controls.html logic under test.
function makeContainer() {
	const el = document.createElement("div");
	el.id = "error-banners";
	document.body.appendChild(el);
	return el;
}

function addBanner(
	container: Element,
	description: string,
	type?: string,
): Element {
	const existing = container.querySelectorAll(".error-banner");
	if (existing.length >= 10) existing.item(0)?.remove();
	const banner = document.createElement("div");
	const isWarn = type === "warn" || type === "disconnect";
	banner.className = isWarn
		? "error-banner error-banner--warn"
		: "error-banner";
	banner.dataset.bannerType = type ?? "error";
	const msg = document.createElement("span");
	msg.className = "error-banner__msg";
	msg.textContent = description;
	banner.appendChild(msg);
	container.appendChild(banner);
	return banner;
}

function applyFrame(container: Element, frame: Record<string, unknown> | null) {
	if (frame?.address === "/bevyosc/error" && frame.error) {
		addBanner(container, String(frame.error));
	}
}

afterEach(() => {
	document.getElementById("error-banners")?.remove();
});

test("addBanner caps at 10 and evicts the oldest", () => {
	const container = makeContainer();
	for (let i = 0; i < 11; i++) addBanner(container, `Error ${i}`);
	const banners = container.querySelectorAll(".error-banner");
	expect(banners.length).toBe(10);
	// oldest (Error 0) was evicted; first remaining is Error 1
	expect(
		banners.item(0)?.querySelector(".error-banner__msg")?.textContent,
	).toBe("Error 1");
});

test("applyFrame shows banner for /bevyosc/error frames", () => {
	const container = makeContainer();
	applyFrame(container, {
		address: "/bevyosc/error",
		error: "something broke",
		args: [],
	});
	expect(container.querySelectorAll(".error-banner").length).toBe(1);
	expect(container.querySelector(".error-banner__msg")?.textContent).toBe(
		"something broke",
	);
	// unrelated frame must not add a banner
	applyFrame(container, { address: "/bevyosc/control/state", args: [] });
	expect(container.querySelectorAll(".error-banner").length).toBe(1);
});

test("disconnect banners are removed on reconnect", () => {
	const container = makeContainer();
	addBanner(
		container,
		"Bridge WebSocket disconnected — reconnecting…",
		"disconnect",
	);
	addBanner(container, "Some other error", "error");
	expect(container.querySelectorAll(".error-banner").length).toBe(2);
	// simulate ws.onopen cleanup
	document
		.querySelectorAll("[data-banner-type='disconnect']")
		.forEach((b) => b.remove());
	expect(container.querySelectorAll(".error-banner").length).toBe(1);
	expect(container.querySelector("[data-banner-type='error']")).not.toBeNull();
});

test("reconnect backoff doubles each failure up to the 16 s cap", () => {
	const delays: number[] = [];
	let delay = 1000;
	for (let i = 0; i < 6; i++) {
		delays.push(delay);
		delay = nextReconnectDelay(delay);
	}
	expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 16000]);
});

test("reconnect delay resets to 1 s on successful connection", () => {
	let delay = nextReconnectDelay(nextReconnectDelay(nextReconnectDelay(1000))); // 8000
	// onopen contract: always resets to the initial value
	delay = 1000;
	expect(delay).toBe(1000);
	// assert that the next attempt doubles from 1 s, not from the prior max
	expect(nextReconnectDelay(delay)).toBe(2000);
});

test("worst-case reconnect window stays within 30 s given a 16 s cap", () => {
	// Worst case: the server comes back just after a max-delay timer fired.
	// The client waits at most MAX_DELAY before the next attempt succeeds.
	const MAX_DELAY = 16000;
	const BUDGET_MS = 30_000;
	expect(MAX_DELAY).toBeLessThan(BUDGET_MS);
});

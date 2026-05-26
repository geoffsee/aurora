import { expect, test, afterEach } from "vitest";

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

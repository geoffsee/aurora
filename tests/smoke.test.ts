import { expect, test } from "vitest";

test("vitest happy-dom environment is wired up", () => {
	expect(typeof window).toBe("object");
	expect(typeof document).toBe("object");
});

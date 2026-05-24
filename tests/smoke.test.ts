import { expect, test } from "vitest";

test("vitest browser mode is wired up", () => {
	expect(typeof window).toBe("object");
	expect(typeof document).toBe("object");
});

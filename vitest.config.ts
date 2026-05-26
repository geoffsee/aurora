import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		globalSetup: ["tests/global-setup.ts"],
		browser: {
			provider: playwright(),
			enabled: true,
			headless: true,
			instances: [{ browser: "chromium" }],
		},
	},
});

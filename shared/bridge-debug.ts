import { isStaticHosting } from "./static-hosting.ts";

/** Verbose bridge/BroadcastChannel logging for cross-window sync debugging. */
export function isBridgeDebugEnabled(
	loc: Pick<Location, "hostname" | "protocol" | "search"> = typeof location ===
	"undefined"
		? { hostname: "", protocol: "https:", search: "" }
		: location,
): boolean {
	if (isStaticHosting(loc)) return true;
	if (new URLSearchParams(loc.search).get("debug") === "1") return true;
	try {
		return localStorage.getItem("auroraDebug") === "1";
	} catch {
		return false;
	}
}

export function bridgeDebug(
	label: string,
	detail?: Record<string, unknown> | string | number | boolean | null,
	loc?: Pick<Location, "hostname" | "protocol" | "search">,
): void {
	if (!isBridgeDebugEnabled(loc)) return;
	if (detail === undefined) {
		console.log(`[aurora-bridge] ${label}`);
		return;
	}
	console.log(`[aurora-bridge] ${label}`, detail);
}

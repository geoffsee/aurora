/** True when the UI is served as static files with no local bridge (e.g. GitHub Pages). */
export function isStaticHosting(
	loc: Pick<Location, "hostname" | "protocol" | "search"> = location,
): boolean {
	if (new URLSearchParams(loc.search).get("static") === "1") return true;
	if (loc.protocol === "file:") return true;
	if (loc.hostname.endsWith(".github.io")) return true;
	return false;
}

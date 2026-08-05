/** True when the UI is served as static files with no local bridge (e.g. GitHub Pages). */
export function isStaticHosting(
	loc: Pick<Location, "hostname" | "protocol" | "search"> = location,
): boolean {
	if (new URLSearchParams(loc.search).get("static") === "1") return true;
	if (loc.protocol === "file:") return true;
	if (loc.hostname.endsWith(".github.io")) return true;
	return false;
}

/** True on the published Geoff See GitHub Pages site. */
export function isGeoffseeGithubPages(
	loc: Pick<Location, "href"> = location,
): boolean {
	return loc.href.includes("geoffsee.github.io");
}

export function geoffseePagesControlsUrl(
	loc: Pick<Location, "href"> = location,
): string {
	return new URL("./controls/", loc.href).href;
}

export function geoffseePagesProjectorUrl(
	loc: Pick<Location, "href"> = location,
): string {
	return new URL("../", loc.href).href;
}

/**
 * Path prefix for the static site root (no trailing slash).
 * Examples: "" at http://localhost:3000/, "/aurora" on project Pages.
 * Strips a trailing `/controls` segment so controls and projector share one root.
 */
export function staticSitePathPrefix(
	loc: Pick<Location, "pathname"> = location,
): string {
	let path = loc.pathname || "/";
	if (path.endsWith("/index.html")) {
		path = path.slice(0, -"/index.html".length);
	}
	const controlsIdx = path.indexOf("/controls");
	if (controlsIdx >= 0) {
		path = path.slice(0, controlsIdx);
	}
	if (path.endsWith("/")) {
		path = path.slice(0, -1);
	}
	if (path === "/" || path === "") return "";
	return path;
}

/**
 * Origin + path prefix for static mode catalog files under `/api/modes/…`.
 * On bridged local stacks this is unused (live HTTP API is preferred).
 */
export function staticModesApiBase(
	loc: Pick<Location, "protocol" | "hostname" | "port" | "pathname"> = location,
): string {
	const protocol = loc.protocol || "https:";
	const host = loc.hostname || "localhost";
	const port = loc.port ? `:${loc.port}` : "";
	const prefix = staticSitePathPrefix(loc);
	return `${protocol}//${host}${port}${prefix}`;
}

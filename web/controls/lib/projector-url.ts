export const PROJECTOR_PORT = 3000;
export const CONTROLS_PORT = 3001;

function withEmbedParam(url: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("embed", "1");
	return parsed.href;
}

/** URL for the clean projector page (embedded preview or opened in a new tab). */
export function projectorPreviewUrl(
	loc: Pick<Location, "port" | "protocol" | "hostname" | "href"> = location,
): string {
	if (loc.port === String(CONTROLS_PORT)) {
		return withEmbedParam(
			`${loc.protocol}//${loc.hostname || "localhost"}:${PROJECTOR_PORT}/`,
		);
	}
	return withEmbedParam(new URL("../", loc.href).href);
}

/** Full projector page without the embed flag (for opening in a new window). */
export function projectorWindowUrl(
	loc: Pick<Location, "port" | "protocol" | "hostname" | "href"> = location,
): string {
	if (loc.port === String(CONTROLS_PORT)) {
		return `${loc.protocol}//${loc.hostname || "localhost"}:${PROJECTOR_PORT}/`;
	}
	return new URL("../", loc.href).href;
}

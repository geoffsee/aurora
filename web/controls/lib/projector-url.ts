export const PROJECTOR_PORT = 3000;
export const CONTROLS_PORT = 3001;

/** URL for the clean projector page (embedded preview or opened in a new tab). */
export function projectorPreviewUrl(
	loc: Pick<Location, "port" | "protocol" | "hostname" | "href"> = location,
): string {
	if (loc.port === String(CONTROLS_PORT)) {
		return `${loc.protocol}//${loc.hostname || "localhost"}:${PROJECTOR_PORT}/`;
	}
	return new URL("../", loc.href).href;
}

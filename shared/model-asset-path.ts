export const MAX_MODEL_ASSET_PATH_LENGTH = 2048;

/**
 * Accept a browser-fetchable glTF URL for the Figure layer.
 *
 * An empty string disables the override and restores the selected catalog model.
 * Invalid values fall back to the last known-good value so malformed clients
 * cannot replace a working model path.
 */
export function normalizeRemoteModelAssetPath(
	value: unknown,
	fallback = "",
): string {
	if (typeof value !== "string") return fallback;
	const path = value.trim();
	if (path === "") return "";
	if (path.length > MAX_MODEL_ASSET_PATH_LENGTH) return fallback;

	try {
		const url = new URL(path);
		if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
		if (url.username || url.password || url.hash) return fallback;
		const pathname = url.pathname.toLowerCase();
		if (!pathname.endsWith(".glb") && !pathname.endsWith(".gltf")) {
			return fallback;
		}
		return path;
	} catch {
		return fallback;
	}
}

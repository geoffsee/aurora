export const MAX_MODEL_ASSET_PATH_LENGTH = 2048;

function isGltfPathname(pathname: string): boolean {
	const lower = pathname.toLowerCase();
	return lower.endsWith(".glb") || lower.endsWith(".gltf");
}

/**
 * Accept a browser-fetchable glTF URL for the Figure / mesh layer.
 *
 * Allowed:
 * - Empty string → clears the override (catalog model restores)
 * - Absolute `http:` / `https:` URLs ending in `.glb` / `.gltf`
 * - Same-origin root-relative epoch pack paths (`/api/data/e/.../*.glb`)
 *
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

	// Epoch-scoped pack assets (PR3/PR11): root-relative, no scheme.
	// Reject `//host` protocol-relative and path escapes.
	if (path.startsWith("/") && !path.startsWith("//")) {
		if (path.includes("..") || path.includes("\\")) return fallback;
		if (!isGltfPathname(path.split("?")[0] ?? path)) return fallback;
		return path;
	}

	try {
		const url = new URL(path);
		if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
		if (url.username || url.password || url.hash) return fallback;
		if (!isGltfPathname(url.pathname)) {
			return fallback;
		}
		return path;
	} catch {
		return fallback;
	}
}

/**
 * Generate a Caddyfile that terminates TLS (`tls internal`) and proxies to the
 * local Bun bridge — shared by the Docker entrypoint logic and the native stack.
 */

export const BRIDGE_PROJECTOR_PORT = 13000;
export const BRIDGE_CONTROLS_PORT = 13001;
export const PUBLIC_PROJECTOR_PORT = 8443;
export const PUBLIC_CONTROLS_PORT = 8444;

export function normalizeTlsHosts(hosts: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ['localhost', '127.0.0.1', ...hosts]) {
    const h = raw.trim();
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

/**
 * Visual-server paths that must also answer on the *controls* origin.
 *
 * The Console is served from :8444 but its mode catalog, compiled wires, and
 * package import all live on the visual server (:13000). Reaching across to
 * :8443 for them fails in the browser — the bridge sends no CORS headers, so a
 * cross-origin GET is blocked and the catalog silently comes up empty
 * ("Mode catalog unavailable: Failed to fetch"). Proxying here keeps every
 * Console request same-origin.
 *
 * Safe to route wholesale: the controls server owns no `/api/modes/*` or
 * `/api/packages/*` route of its own (its API surface is `/api/shadertoy/*`).
 *
 * Kept in sync with `deploy/entrypoint.sh`, which renders the Docker Caddyfile
 * at container start — see tests/cli/caddyfile-routes.test.ts.
 */
export const CONTROLS_SITE_PROXIED_PATHS = [
  '/api/modes/*',
  '/api/packages/import',
  // Phone pairing (#281). The mobile client is served from :8444, so its
  // redeem POST has to land on the visual server without going cross-origin.
  '/api/auth/*',
] as const;

function controlsSiteApiRoutes(upstream: number): string {
  return CONTROLS_SITE_PROXIED_PATHS.map(
    (path) => `\thandle ${path} {\n\t\treverse_proxy 127.0.0.1:${upstream}\n\t}`,
  ).join('\n');
}

/** Build a Caddyfile body for projector (:8443) + controls (:8444). */
export function renderCaddyfile(
  hosts: readonly string[],
  opts?: {
    projectorUpstream?: number;
    controlsUpstream?: number;
    publicProjector?: number;
    publicControls?: number;
  },
): string {
  const tlsHosts = normalizeTlsHosts(hosts);
  const pubProj = opts?.publicProjector ?? PUBLIC_PROJECTOR_PORT;
  const pubCtrl = opts?.publicControls ?? PUBLIC_CONTROLS_PORT;
  const upProj = opts?.projectorUpstream ?? BRIDGE_PROJECTOR_PORT;
  const upCtrl = opts?.controlsUpstream ?? BRIDGE_CONTROLS_PORT;

  const proj = tlsHosts.map((h) => `https://${h}:${pubProj}`).join(', ');
  const ctrl = tlsHosts.map((h) => `https://${h}:${pubCtrl}`).join(', ');

  return `{
	auto_https disable_redirects
	default_sni localhost
}

${proj} {
	tls internal
	reverse_proxy 127.0.0.1:${upProj}
}

${ctrl} {
	tls internal
${controlsSiteApiRoutes(upProj)}
	handle {
		reverse_proxy 127.0.0.1:${upCtrl}
	}
}
`;
}

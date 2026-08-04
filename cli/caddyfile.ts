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
	reverse_proxy 127.0.0.1:${upCtrl}
}
`;
}

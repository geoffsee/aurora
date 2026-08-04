/**
 * Public HTTPS ports for the Docker + Caddy show stack.
 * (Bun listens on 13000/13001 inside the container only.)
 */
export const PROJECTOR_PORT = 8443;
export const CONTROLS_PORT = 8444;
/** Muxox web UI (service logs) — published beside the show ports. */
export const MUXOX_UI_PORT = 8450;

/** Map a controls-page port to its sibling projector port, or null if unknown. */
export function projectorPortForControlsPort(controlsPort: string): number | null {
  if (controlsPort === String(CONTROLS_PORT)) return PROJECTOR_PORT;
  return null;
}

function withEmbedParam(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set('embed', '1');
  return parsed.href;
}

/** URL for the clean projector page (embedded preview or opened in a new tab). */
export function projectorPreviewUrl(
  loc: Pick<Location, 'port' | 'protocol' | 'hostname' | 'href'> = location,
): string {
  const projectorPort = projectorPortForControlsPort(loc.port);
  if (projectorPort !== null) {
    return withEmbedParam(`${loc.protocol}//${loc.hostname || 'localhost'}:${projectorPort}/`);
  }
  return withEmbedParam(new URL('../', loc.href).href);
}

/** Full projector page without the embed flag (for opening in a new window). */
export function projectorWindowUrl(
  loc: Pick<Location, 'port' | 'protocol' | 'hostname' | 'href'> = location,
): string {
  const projectorPort = projectorPortForControlsPort(loc.port);
  if (projectorPort !== null) {
    return `${loc.protocol}//${loc.hostname || 'localhost'}:${projectorPort}/`;
  }
  return new URL('../', loc.href).href;
}

/** WebSocket URL for the shared bridge bus (projector origin). */
export function bridgeWebSocketUrl(
  loc: Pick<Location, 'protocol' | 'hostname' | 'port'> = location,
): string {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  const host = loc.hostname || 'localhost';
  const projectorPort = projectorPortForControlsPort(loc.port ?? '');
  if (projectorPort !== null) {
    return `${scheme}://${host}:${projectorPort}/ws`;
  }
  // Same-origin /ws (e.g. embedded projector page).
  const port = loc.port ? `:${loc.port}` : '';
  return `${scheme}://${host}${port}/ws`;
}

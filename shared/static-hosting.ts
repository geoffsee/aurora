/** True when the UI is served as static files with no local bridge (e.g. GitHub Pages). */
export function isStaticHosting(
  loc: Pick<Location, 'hostname' | 'protocol' | 'search'> = location,
): boolean {
  if (new URLSearchParams(loc.search).get('static') === '1') return true;
  if (loc.protocol === 'file:') return true;
  if (loc.hostname.endsWith('.github.io')) return true;
  return false;
}

/** True on the published Geoff See GitHub Pages site. */
export function isGeoffseeGithubPages(loc: Pick<Location, 'href'> = location): boolean {
  return loc.href.includes('geoffsee.github.io');
}

export function geoffseePagesControlsUrl(loc: Pick<Location, 'href'> = location): string {
  return new URL('./controls/', loc.href).href;
}

export function geoffseePagesProjectorUrl(loc: Pick<Location, 'href'> = location): string {
  return new URL('../', loc.href).href;
}

/** Static Pages (and same-origin dist) Preset Studio URL. */
export function geoffseePagesStudioUrl(loc: Pick<Location, 'href'> = location): string {
  return new URL('../studio/', loc.href).href;
}

/** Controls port used by docker Caddy / projector-url; avoid circular import. */
const CONTROLS_PORT_FALLBACK = 8444;

/**
 * URL to open Preset Studio.
 * - Static / GitHub Pages → `{siteBase}/studio/`
 * - Docker controls (:8444) → bundled Studio at same-origin `/studio/`
 * - Native controls (:3001) → Studio dev server on :3010
 * - Same origin otherwise → `./studio/`
 */
export function studioAppUrl(
  loc: Pick<Location, 'protocol' | 'hostname' | 'port' | 'href' | 'pathname' | 'search'> = location,
): string {
  if (isStaticHosting(loc) || isGeoffseeGithubPages(loc)) {
    const base = staticModesApiBase(loc);
    return `${base}/studio/`;
  }
  const host = loc.hostname || '127.0.0.1';
  const port = loc.port;
  if (port === '8444' || port === String(CONTROLS_PORT_FALLBACK)) {
    return new URL('/studio/', loc.href).href;
  }
  if (port === '3001') {
    return `${loc.protocol}//${host}:3010/`;
  }
  if (port === '3010') {
    return `${loc.protocol}//${host}:3010/`;
  }
  return new URL('studio/', loc.href).href;
}

/**
 * Path prefix for the static site root (no trailing slash).
 * Examples: "" at http://localhost:3000/, "/aurora" on project Pages.
 * Strips a trailing `/controls` segment so controls and projector share one root.
 */
export function staticSitePathPrefix(loc: Pick<Location, 'pathname'> = location): string {
  let path = loc.pathname || '/';
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'/index.html'.length);
  }
  // Strip app sub-routes so projector / controls / studio share one site root.
  for (const segment of ['/controls', '/studio'] as const) {
    const idx = path.indexOf(segment);
    if (idx >= 0) {
      path = path.slice(0, idx);
      break;
    }
  }
  if (path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  if (path === '/' || path === '') return '';
  return path;
}

/**
 * Origin + path prefix for static mode catalog files under `/api/modes/…`.
 * On bridged local stacks this is unused (live HTTP API is preferred).
 */
export function staticModesApiBase(
  loc: Pick<Location, 'protocol' | 'hostname' | 'port' | 'pathname'> = location,
): string {
  const protocol = loc.protocol || 'https:';
  const host = loc.hostname || 'localhost';
  const port = loc.port ? `:${loc.port}` : '';
  const prefix = staticSitePathPrefix(loc);
  return `${protocol}//${host}${port}${prefix}`;
}

/**
 * Browser "secure context" helpers.
 *
 * WebGPU, getUserMedia, and several other APIs are only available on HTTPS or
 * loopback (`localhost` / `127.0.0.1` / `[::1]`). Serving aurora over a bare
 * LAN IP on plain HTTP is not a secure context — run `aurora` (or `bun run
 * aurora`) so Caddy terminates TLS on :8443 / :8444.
 */

export type SecureContextInput = {
  isSecureContext: boolean;
  hostname: string;
};

/** True when the browser should expose secure-context-only APIs. */
export function isBrowserSecureContext(ctx: SecureContextInput): boolean {
  if (ctx.isSecureContext) return true;
  const host = ctx.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * Returns null when WebGPU may be requested, or a human-readable reason when
 * the origin will block `navigator.gpu` (so callers can skip WASM boot and
 * surface a clear banner instead of a cryptic `Runtime error: unreachable`).
 */
export function webgpuSecureContextError(ctx: SecureContextInput): string | null {
  if (isBrowserSecureContext(ctx)) return null;
  const host = ctx.hostname || 'an insecure origin';
  return (
    `WebGPU needs a secure context: this page is served from "${host}" over ` +
    `plain HTTP. Run \`aurora\` (or \`bun run aurora\`) and open ` +
    `https://${host}:8443 (projector) / https://${host}:8444 (controls) — ` +
    `Caddy terminates TLS inside the aurora Docker image.`
  );
}

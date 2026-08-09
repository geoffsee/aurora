/**
 * Browser client for the bridge package-import endpoint.
 *
 * Unlike the same-origin authored store (see package-install.ts), this puts the
 * package on the bridge's disk, so every client of that bridge — projector,
 * console, a second machine — picks it up from the next catalog scan. It is the
 * live-show path and the only one that works when projector and console sit on
 * different origins.
 *
 * Requires the bridge to run with AURORA_DATA_DIR set; without it the endpoint
 * answers 503.
 */

export type BridgeImportResult =
  | {
      ok: true;
      slug: string;
      label?: string;
      overwritten?: boolean;
      catalog?: { epoch: number; contentHash: string };
    }
  | { ok: false; errors: { path: string; message: string }[]; status: number };

/**
 * POST archive bytes to the Aurora bridge package-import endpoint.
 * Requires bridge running with AURORA_DATA_DIR set.
 */
export async function importPackageToBridge(
  bytes: Uint8Array,
  opts?: { bridgeOrigin?: string; signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<BridgeImportResult> {
  const origin = (opts?.bridgeOrigin ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
  const url = `${origin}/api/packages/import`;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const requestBody = new Blob([copy], { type: 'application/zip' });
  const fetchImpl = opts?.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: requestBody,
      signal: opts?.signal,
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      errors: [
        {
          path: 'bridge',
          message: e instanceof Error ? e.message : 'failed to reach bridge',
        },
      ],
    };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return {
      ok: false,
      status: res.status,
      errors: [{ path: 'bridge', message: `non-JSON response (${res.status})` }],
    };
  }

  if (!res.ok || !payload || typeof payload !== 'object') {
    const errors =
      payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { errors?: unknown }).errors)
        ? (payload as { errors: { path: string; message: string }[] }).errors
        : [
            {
              path: 'bridge',
              message: `import failed (${res.status})`,
            },
          ];
    return { ok: false, status: res.status, errors };
  }

  const o = payload as Record<string, unknown>;
  if (o.ok !== true) {
    const errors = Array.isArray(o.errors)
      ? (o.errors as { path: string; message: string }[])
      : [{ path: 'bridge', message: 'import rejected' }];
    return { ok: false, status: res.status, errors };
  }

  return {
    ok: true,
    slug: typeof o.slug === 'string' ? o.slug : 'unknown',
    label: typeof o.label === 'string' ? o.label : undefined,
    overwritten: Boolean(o.overwritten),
    catalog:
      o.catalog && typeof o.catalog === 'object'
        ? {
            epoch: Number((o.catalog as { epoch?: number }).epoch) || 0,
            contentHash: String((o.catalog as { contentHash?: string }).contentHash ?? ''),
          }
        : undefined,
  };
}

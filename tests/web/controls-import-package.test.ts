import { beforeEach, describe, expect, test, vi } from 'vitest';
import { AURORA_PACKAGE_MAX_ARCHIVE_BYTES } from '../../shared/aurora-package.ts';
import { clearAuthoredPackagesForTests, getAuthoredPackage } from '../../shared/package-channel.ts';
import { importAuroraPackageArchive } from '../../web/controls/lib/import-package.ts';
import { exportSketchToPackage } from '../../web/studio/lib/export-package.ts';
import { createSketch } from '../../web/studio/lib/sketch-store.ts';

const BRIDGED = {
  hostname: 'localhost',
  protocol: 'https:',
  search: '',
  origin: 'https://localhost:8444',
};

const STATIC_PAGES = {
  hostname: 'geoffsee.github.io',
  protocol: 'https:',
  search: '',
  origin: 'https://geoffsee.github.io',
};

function wgslArchive(): Uint8Array {
  const built = exportSketchToPackage(createSketch({ label: 'Imported Pack' }));
  if (!built.ok) throw new Error('fixture export failed');
  return built.bytes;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  clearAuthoredPackagesForTests();
});

describe('console .aurora-package import', () => {
  test('bridged consoles POST to the bridge on their own origin', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ ok: true, slug: 'imported-pack', label: 'Imported Pack' }),
    );
    const result = await importAuroraPackageArchive(wgslArchive(), {
      loc: BRIDGED,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.via).toBe('bridge');
    expect(result.slug).toBe('imported-pack');
    // Same-origin keeps Caddy's /api/packages/import route in play and avoids a preflight.
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://localhost:8444/api/packages/import');
    // A bridge import must not also land in this origin's store, or the console
    // would show a package the projector origin cannot resolve.
    expect(getAuthoredPackage('imported-pack')).toBeNull();
  });

  test('reports overwrite so the operator knows a slug was replaced', async () => {
    const result = await importAuroraPackageArchive(wgslArchive(), {
      loc: BRIDGED,
      fetchImpl: (async () =>
        jsonResponse({
          ok: true,
          slug: 'imported-pack',
          label: 'Imported Pack',
          overwritten: true,
        })) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.overwritten).toBe(true);
    expect(result.message).toContain('Replaced');
  });

  test('turns a 503 into the actionable data-dir fix', async () => {
    const result = await importAuroraPackageArchive(wgslArchive(), {
      loc: BRIDGED,
      fetchImpl: (async () =>
        jsonResponse(
          { ok: false, errors: [{ path: 'AURORA_DATA_DIR', message: 'not configured' }] },
          503,
        )) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.via).toBe('bridge');
    expect(result.message).toContain('--data-dir');
  });

  test('surfaces bridge validation errors verbatim', async () => {
    const result = await importAuroraPackageArchive(wgslArchive(), {
      loc: BRIDGED,
      fetchImpl: (async () =>
        jsonResponse(
          { ok: false, errors: [{ path: 'manifest.slug', message: 'reserved' }] },
          400,
        )) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toBe('manifest.slug: reserved');
  });

  test('static hosting installs into the same-origin authored store', async () => {
    const fetchImpl = vi.fn();
    const result = await importAuroraPackageArchive(wgslArchive(), {
      loc: STATIC_PAGES,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.via).toBe('local');
    expect(fetchImpl).not.toHaveBeenCalled();
    const stored = getAuthoredPackage(result.slug);
    expect(stored?.label).toBe('Imported Pack');
    // Stored show-form, ready for the runtime.
    expect(stored?.wgsl).toContain('@fragment');
  });

  test('rejects a non-package file without calling the bridge', async () => {
    const fetchImpl = vi.fn();
    const result = await importAuroraPackageArchive(new TextEncoder().encode('not a zip'), {
      loc: STATIC_PAGES,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects empty and oversized files before any parse or upload', async () => {
    const fetchImpl = vi.fn();
    const empty = await importAuroraPackageArchive(new Uint8Array(0), {
      loc: BRIDGED,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.message).toContain('empty');

    const huge = await importAuroraPackageArchive(
      new Uint8Array(AURORA_PACKAGE_MAX_ARCHIVE_BYTES + 1),
      { loc: BRIDGED, fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(huge.ok).toBe(false);
    if (!huge.ok) expect(huge.message).toContain('MB package limit');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('an unreachable bridge fails loudly instead of storing locally', async () => {
    const result = await importAuroraPackageArchive(wgslArchive(), {
      loc: BRIDGED,
      fetchImpl: (async () => {
        throw new Error('connection refused');
      }) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.via).toBe('bridge');
    // Falling back to this origin's store would look like success while the
    // projector origin still has nothing to render.
    expect(getAuthoredPackage('imported-pack')).toBeNull();
  });
});

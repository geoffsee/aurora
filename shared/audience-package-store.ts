/** Ephemeral, show-scoped package store for the isolated audience renderer. */

import {
  type AuroraPackageBundle,
  isThreePackageBundle,
  parseAuroraPackageArchive,
} from './aurora-package.ts';
import { loadViewerSession } from './live-show-client.ts';
import { type AuthoredPackage, compiledWireFromAuthoredPackage } from './package-channel.ts';

const packages = new Map<string, AuroraPackageBundle>();

function metadata(bundle: AuroraPackageBundle): AuthoredPackage {
  if (isThreePackageBundle(bundle)) {
    const manifest = bundle.manifest;
    return {
      slug: manifest.slug,
      label: manifest.label,
      character: manifest.character,
      uiGroup: manifest.uiGroup,
      target: 'threejs',
      renderer: manifest.renderer,
      requiresNativeWebGPU: manifest.requiresNativeWebGPU,
      assets: manifest.assets,
      defaults: bundle.defaults,
      updatedAt: manifest.createdAt ?? new Date().toISOString(),
    };
  }
  const manifest = bundle.manifest;
  return {
    slug: manifest.slug,
    label: manifest.label,
    character: manifest.character,
    uiGroup: manifest.uiGroup,
    target: 'wgsl',
    wgsl: bundle.wgsl,
    defaults: bundle.defaults,
    updatedAt: manifest.createdAt ?? new Date().toISOString(),
  };
}

export function getAudienceCompiledWire(
  deck: 'deck-a' | 'deck-b',
  slug: string,
  epoch = 0,
): ReturnType<typeof compiledWireFromAuthoredPackage> | null {
  const bundle = packages.get(slug);
  return bundle ? compiledWireFromAuthoredPackage(deck, metadata(bundle), epoch) : null;
}

export async function loadAudienceCompiledWire(
  deck: 'deck-a' | 'deck-b',
  slug: string,
  epoch = 0,
  fetchImpl: typeof fetch = fetch,
): Promise<ReturnType<typeof compiledWireFromAuthoredPackage> | null> {
  const existing = packages.get(slug);
  let bundle = existing;
  if (!bundle) {
    const session = loadViewerSession();
    if (!session) return null;
    const response = await fetchImpl(
      `${session.liveApiUrl}/api/shows/${encodeURIComponent(session.showId)}/packages/${encodeURIComponent(slug)}`,
      {
        headers: { authorization: `Bearer ${session.viewerToken}` },
        cache: 'no-store',
      },
    );
    if (!response.ok) return null;
    const parsed = parseAuroraPackageArchive(new Uint8Array(await response.arrayBuffer()), {
      remapAuthoring: true,
    });
    if (!parsed.ok || parsed.bundle.manifest.slug !== slug) return null;
    bundle = parsed.bundle;
    packages.set(slug, bundle);
  }
  const wire = compiledWireFromAuthoredPackage(deck, metadata(bundle), epoch);
  if (isThreePackageBundle(bundle)) {
    const layer = wire.layers.find((candidate) => candidate.kind === 'threejs');
    if (layer?.kind === 'threejs') {
      layer.moduleSource = bundle.javascript;
      layer.sourceMap = bundle.sourceMap;
      layer.assetUrls = Object.fromEntries(
        bundle.manifest.assets.map((asset) => [
          asset.path,
          URL.createObjectURL(
            new Blob([new Uint8Array(bundle.assets[asset.path] ?? [])], {
              type: asset.mediaType,
            }),
          ),
        ]),
      );
    }
  }
  return wire;
}

export function clearAudiencePackages(): void {
  packages.clear();
}

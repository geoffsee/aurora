/**
 * Install a parsed `.aurora-package` into the browser-side authored store:
 * metadata in localStorage (announced on BroadcastChannel) and, for Three.js,
 * the executable bundle in IndexedDB.
 *
 * All of those stores are keyed by origin, so a package installed here is
 * visible only to pages on the same origin. That is the whole story on GitHub
 * Pages, where projector / console / studio share one origin. Split-origin
 * stacks (the Docker Caddy layout puts the projector on :8443 and the console
 * on :8444) must import through the bridge instead — `POST
 * /api/packages/import` writes to disk, where every client can reach it.
 */

import {
  type AuroraPackageBundle,
  type AuroraWgslPackageBundle,
  isThreePackageBundle,
  remapAuthoringWgslToShow,
} from './aurora-package.ts';
import { type AuthoredPackage, upsertAuthoredPackage } from './package-channel.ts';
import { putThreePackageBundle } from './three-package-store.ts';

/**
 * Store a WGSL package for same-origin consumers. Synchronous: localStorage is
 * the only backing store. Throws when the bundle carries no shader source.
 */
export function installWgslAuthoredPackage(bundle: AuroraWgslPackageBundle): AuthoredPackage {
  const { manifest, wgsl } = bundle;
  if (!wgsl) throw new Error('WGSL package has no shader source');
  return upsertAuthoredPackage({
    slug: manifest.slug,
    label: manifest.label,
    character: manifest.character,
    uiGroup: manifest.uiGroup,
    target: 'wgsl',
    // The runtime consumes show form; an archive still carries authoring form
    // when the caller parsed it without `remapAuthoring`.
    wgsl: manifest.wgslForm === 'authoring' ? remapAuthoringWgslToShow(wgsl) : wgsl,
    defaults: bundle.defaults,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Store any package for same-origin consumers. Throws when the bundle shape is
 * unusable or IndexedDB is unavailable; callers own the error surface.
 */
export async function installAuthoredPackageBundle(
  bundle: AuroraPackageBundle,
): Promise<AuthoredPackage> {
  if (!isThreePackageBundle(bundle)) return installWgslAuthoredPackage(bundle);
  const { manifest } = bundle;
  // Executable first: the localStorage record is what makes the slug
  // selectable, so publishing it ahead of the bundle would offer a dead entry.
  await putThreePackageBundle(bundle);
  return upsertAuthoredPackage({
    slug: manifest.slug,
    label: manifest.label,
    character: manifest.character,
    uiGroup: manifest.uiGroup,
    target: 'threejs',
    renderer: manifest.renderer,
    requiresNativeWebGPU: manifest.requiresNativeWebGPU,
    assets: manifest.assets,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Resolve a CompiledModeWire mesh layer `ref` against an epoch `assetBase`.
 *
 * PR11 (#245): pack-local glTF via epoch asset URLs and/or global model catalog
 * ids. Failure is soft — callers keep the previous mesh or hide the stage.
 *
 * Backend flag mapping:
 * - Catalog `figure` path (ModeBackends.figure / VisualMode::Figure) uses the
 *   global MODEL_CATALOG via `figureModel` when the layer ref is a catalog id.
 * - DSL `mesh` layers (disposition mesh-primary) may also point at pack-local
 *   paths under `assetBase` (`/api/data/e/<epoch>/decks/<deck>/<slug>/…`).
 */

import { modelById, MODEL_CATALOG } from './model-catalog.ts';

export type ResolvedMeshLayer =
  | {
      kind: 'catalog';
      id: string;
      /** Index into MODEL_CATALOG / ControlState.figureModel. */
      index: number;
      /** Bevy asset path relative to assets root. */
      assetPath: string;
    }
  | {
      kind: 'pack';
      /** Root-relative or absolute URL path for AssetServer / fetch. */
      urlPath: string;
    }
  | {
      kind: 'remote';
      url: string;
    }
  | { kind: 'unresolved'; reason: string };

function isGltfPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('.glb') || lower.endsWith('.gltf');
}

function joinAssetBase(assetBase: string, ref: string): string {
  const base = assetBase.trim();
  const rel = ref.replace(/^\.\//, '');
  if (!base) return rel;
  if (base.endsWith('/')) return `${base}${rel}`;
  return `${base}/${rel}`;
}

/**
 * Resolve a mesh layer ref.
 *
 * Priority:
 * 1. Global model catalog id (e.g. `human-female`) → catalog index + assetPath
 * 2. Absolute http(s) glTF URL
 * 3. Root-relative path (`/api/data/e/.../mesh.glb`)
 * 4. Relative path joined to `assetBase` (epoch pack folder)
 *
 * Anything else → `unresolved` (soft fail; no throw).
 */
export function resolveMeshLayerRef(ref: unknown, assetBase: unknown): ResolvedMeshLayer {
  if (typeof ref !== 'string') {
    return { kind: 'unresolved', reason: 'ref is not a string' };
  }
  const r = ref.trim();
  if (!r) {
    return { kind: 'unresolved', reason: 'ref is empty' };
  }
  if (r.length > 2048) {
    return { kind: 'unresolved', reason: 'ref exceeds max length' };
  }
  if (r.includes('..') || r.includes('\\')) {
    return { kind: 'unresolved', reason: 'ref contains path escape' };
  }

  const base = typeof assetBase === 'string' ? assetBase : '';

  // 1. Catalog id (figure pack default: human-female).
  const entry = modelById(r);
  if (entry) {
    const index = MODEL_CATALOG.findIndex((m) => m.id === r);
    if (index >= 0) {
      return {
        kind: 'catalog',
        id: entry.id,
        index,
        assetPath: entry.assetPath,
      };
    }
  }

  // 2. Absolute remote URL.
  if (r.startsWith('http://') || r.startsWith('https://')) {
    try {
      const url = new URL(r);
      if (url.username || url.password || url.hash) {
        return { kind: 'unresolved', reason: 'remote URL has credentials or hash' };
      }
      if (!isGltfPath(url.pathname)) {
        return { kind: 'unresolved', reason: 'remote URL is not glTF/GLB' };
      }
      return { kind: 'remote', url: r };
    } catch {
      return { kind: 'unresolved', reason: 'remote URL parse failed' };
    }
  }

  // 3. Root-relative (epoch asset serve path).
  if (r.startsWith('/')) {
    if (!isGltfPath(r)) {
      return { kind: 'unresolved', reason: 'root-relative path is not glTF/GLB' };
    }
    return { kind: 'pack', urlPath: r };
  }

  // 4. Pack-relative under assetBase.
  if (isGltfPath(r) || r.includes('/')) {
    if (!isGltfPath(r)) {
      return { kind: 'unresolved', reason: 'relative path is not glTF/GLB' };
    }
    return { kind: 'pack', urlPath: joinAssetBase(base, r) };
  }

  return {
    kind: 'unresolved',
    reason: `unknown mesh ref "${r}" (not a catalog id or glTF path)`,
  };
}

/** True when disposition + layers indicate mesh-primary ownership. */
export function wireIsMeshPrimary(wire: {
  disposition?: string;
  layers?: ReadonlyArray<{ kind?: string }>;
  suppressLegacyField?: boolean;
}): boolean {
  if (wire.disposition === 'mesh-primary') return true;
  if (Array.isArray(wire.layers) && wire.layers.some((l) => l?.kind === 'mesh')) {
    return true;
  }
  return false;
}

/**
 * Authored package channel — Studio → Console/Projector on the same origin.
 *
 * GitHub Pages has no bridge import API. Packages are:
 * 1. Written to localStorage (shared by projector, controls, studio)
 * 2. Announced on BroadcastChannel so open tabs refresh without reload
 *
 * Bridge import (`POST /api/packages/import`) remains the live-show path.
 */

import { type AuroraPackageDefaults, remapAuthoringWgslToShow } from './aurora-package.ts';
import {
  COMPILED_MODE_WIRE_VERSION,
  type CompiledModeDeck,
  type CompiledModeWire,
} from './compiled-mode-wire.ts';

export const AURORA_PACKAGE_CHANNEL = 'aurora-packages-v1';
export const AURORA_PACKAGES_STORAGE_KEY = 'aurora-authored-packages-v1';

/** In-memory fallback when `localStorage` is missing (tests / SSR). */
let memoryStore: AuthoredPackage[] = [];

/** One operator-authored package (show-form WGSL ready for the runtime). */
export type AuthoredPackage = {
  slug: string;
  label: string;
  character?: string;
  uiGroup?: string;
  /** Show-form pack-v1 WGSL (@group(2) + VertexOutput when remapped). */
  target?: 'wgsl' | 'threejs';
  wgsl?: string;
  renderer?: 'webgl2' | 'webgpu';
  requiresNativeWebGPU?: boolean;
  assets?: { path: string; mediaType: string; bytes: number }[];
  defaults?: AuroraPackageDefaults;
  updatedAt: string;
};

export type PackageChannelMessage =
  | { type: 'package-upsert'; package: AuthoredPackage }
  | { type: 'package-remove'; slug: string }
  | { type: 'package-sync'; packages: AuthoredPackage[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parsePackage(raw: unknown): AuthoredPackage | null {
  if (!isRecord(raw)) return null;
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  const label = typeof raw.label === 'string' ? raw.label.trim() : '';
  const target = raw.target === 'threejs' ? 'threejs' : 'wgsl';
  const wgsl = typeof raw.wgsl === 'string' ? raw.wgsl : undefined;
  if (!slug || !label || (target === 'wgsl' && !wgsl?.includes('@fragment'))) return null;
  return {
    slug,
    label,
    character: typeof raw.character === 'string' ? raw.character : undefined,
    uiGroup: typeof raw.uiGroup === 'string' ? raw.uiGroup : 'field-motion',
    wgsl,
    target,
    renderer: raw.renderer === 'webgpu' ? 'webgpu' : target === 'threejs' ? 'webgl2' : undefined,
    requiresNativeWebGPU: target === 'threejs' ? Boolean(raw.requiresNativeWebGPU) : undefined,
    assets: Array.isArray(raw.assets) ? (raw.assets as AuthoredPackage['assets']) : undefined,
    defaults: isRecord(raw.defaults) ? (raw.defaults as AuroraPackageDefaults) : undefined,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

function canUseLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

/** Read all authored packages from localStorage (same-origin tabs share this). */
export function loadAuthoredPackages(): AuthoredPackage[] {
  if (!canUseLocalStorage()) return [...memoryStore];
  try {
    const raw = localStorage.getItem(AURORA_PACKAGES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: AuthoredPackage[] = [];
    for (const item of parsed) {
      const p = parsePackage(item);
      if (p) out.push(p);
    }
    return out;
  } catch {
    return [...memoryStore];
  }
}

function saveAll(packages: AuthoredPackage[]): void {
  memoryStore = [...packages];
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(AURORA_PACKAGES_STORAGE_KEY, JSON.stringify(packages));
  } catch {
    /* quota / private mode — memoryStore still holds the data for this tab */
  }
}

/** Test helper: clear memory + storage. */
export function clearAuthoredPackagesForTests(): void {
  memoryStore = [];
  if (canUseLocalStorage()) {
    try {
      localStorage.removeItem(AURORA_PACKAGES_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

export function getAuthoredPackage(slug: string): AuthoredPackage | null {
  const clean = slug.trim();
  if (!clean) return null;
  return loadAuthoredPackages().find((p) => p.slug === clean) ?? null;
}

/**
 * Upsert one package into localStorage and notify other tabs via BroadcastChannel.
 * WGSL should already be show-form (caller remaps authoring if needed).
 */
export function upsertAuthoredPackage(pkg: AuthoredPackage): AuthoredPackage {
  const list = loadAuthoredPackages().filter((p) => p.slug !== pkg.slug);
  const next: AuthoredPackage = {
    ...pkg,
    updatedAt: pkg.updatedAt || new Date().toISOString(),
  };
  list.push(next);
  list.sort((a, b) => a.slug.localeCompare(b.slug));
  saveAll(list);
  postPackageMessage({ type: 'package-upsert', package: next });
  return next;
}

export function removeAuthoredPackage(slug: string): void {
  const clean = slug.trim();
  if (!clean) return;
  saveAll(loadAuthoredPackages().filter((p) => p.slug !== clean));
  postPackageMessage({ type: 'package-remove', slug: clean });
}

/** Build a CompiledModeWire so projector/controls can apply the package without HTTP. */
export function compiledWireFromAuthoredPackage(
  deck: CompiledModeDeck,
  pkg: AuthoredPackage,
  epoch = 0,
): CompiledModeWire {
  if (pkg.target === 'threejs') {
    return {
      wireVersion: COMPILED_MODE_WIRE_VERSION,
      epoch,
      deck,
      slug: pkg.slug,
      label: pkg.label,
      legacyIndex: null,
      disposition: 'fullscreen-primary',
      assetBase: '',
      suppressLegacyField: true,
      engineMinCapabilities: ['threejs-runtime-v1'],
      layers: [
        {
          kind: 'threejs',
          ref: 'visualization.js',
          sourceRef: 'visualization.ts',
          renderer: pkg.renderer ?? 'webgl2',
          requiresNativeWebGPU: pkg.requiresNativeWebGPU ?? false,
          assets: pkg.assets ?? [],
        },
      ],
    };
  }
  return {
    wireVersion: COMPILED_MODE_WIRE_VERSION,
    epoch,
    deck,
    slug: pkg.slug,
    label: pkg.label,
    legacyIndex: null,
    disposition: 'fullscreen-primary',
    assetBase: '',
    suppressLegacyField: true,
    engineMinCapabilities: ['dual-fullscreen'],
    layers: [
      {
        kind: 'fullscreen',
        ref: 'package.wgsl',
        wgsl: pkg.wgsl as string,
      },
    ],
  };
}

/** Ensure WGSL is show-form before storing (authoring → Bevy remap). */
export function ensureShowFormWgsl(wgsl: string, form: 'show' | 'authoring'): string {
  if (form === 'show') return wgsl;
  return remapAuthoringWgslToShow(wgsl);
}

function postPackageMessage(msg: PackageChannelMessage): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(AURORA_PACKAGE_CHANNEL);
    ch.postMessage(msg);
    ch.close();
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to package channel updates (and optional storage events from other tabs).
 * Returns unsubscribe.
 */
export function subscribeAuthoredPackages(
  onChange: (packages: AuthoredPackage[]) => void,
): () => void {
  const emit = () => onChange(loadAuthoredPackages());
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(AURORA_PACKAGE_CHANNEL);
      channel.onmessage = () => emit();
    } catch {
      channel = null;
    }
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === AURORA_PACKAGES_STORAGE_KEY || e.key === null) emit();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    channel?.close();
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

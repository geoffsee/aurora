/**
 * In-browser sketch list for Preset Studio.
 * Sketches live in React state + optional localStorage; not on the show catalog.
 */

import {
  type AuroraPackageDefaults,
  PACK_V1_AUTHORING_TEMPLATE,
  slugifyPackageLabel,
} from '../../../shared/aurora-package.ts';

export const STUDIO_STORAGE_KEY = 'aurora-studio-sketches-v1';
export const STUDIO_VERSION = 1 as const;

export type StudioBackend = 'wgsl' | 'threejs';
export const THREE_WEBGL2_TEMPLATE = `import * as THREE from 'three';

export default async function create(ctx) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, ctx.viewport.width / ctx.viewport.height, 0.1, 100);
  camera.position.z = 4;
  const geometry = ctx.resources.track(new THREE.TorusKnotGeometry(1, 0.3, 128, 24));
  const material = ctx.resources.track(new THREE.MeshStandardMaterial({ color: 0x66ccff }));
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh, new THREE.HemisphereLight(0xffffff, 0x202040, 3));
  return {
    scene,
    camera,
    update(frame) {
      mesh.rotation.x += frame.delta * (0.2 + frame.speed);
      mesh.rotation.y += frame.delta * (0.4 + frame.energy);
      material.emissive.setRGB(frame.palette.rgb[0], frame.palette.rgb[1], frame.palette.rgb[2]);
      material.emissiveIntensity = frame.pulse * frame.intensity;
    },
    resize(width, height) { camera.aspect = width / height; camera.updateProjectionMatrix(); },
  };
}
`;

/** pack-v1 performance + palette knobs driven in the preview. */
export type StudioKnobs = {
  intensity: number;
  depth: number;
  feedback: number;
  speed: number;
  hue: number;
  sat: number;
  bright: number;
  pulse: number;
  alpha: number;
  /** −1 = idle (show-like); 0..1 = live energy. */
  energy: number;
  bass: number;
  mid: number;
  high: number;
  /** Animate bass/mid/high/energy for a living preview. */
  demoAudio: boolean;
};

export type StudioSketch = {
  id: string;
  slug: string;
  label: string;
  character: string;
  uiGroup: string;
  /** Authoring WGSL (preferred) or show-form; export/preview adapt. */
  wgsl: string;
  backend: StudioBackend;
  renderer?: 'webgl2' | 'webgpu';
  requiresNativeWebGPU?: boolean;
  /** Canonical editable TypeScript for Three.js sketches. */
  source?: string;
  knobs: StudioKnobs;
  updatedAt: string;
};

export type StudioDocument = {
  version: typeof STUDIO_VERSION;
  activeId: string | null;
  sketches: StudioSketch[];
};

export function defaultKnobs(): StudioKnobs {
  return {
    intensity: 0.65,
    depth: 0.4,
    feedback: 0.35,
    speed: 0.45,
    hue: 0.55,
    sat: 0.75,
    bright: 1.0,
    pulse: 0.2,
    alpha: 1.0,
    energy: -1,
    bass: 0.2,
    mid: 0.15,
    high: 0.1,
    demoAudio: true,
  };
}

export function knobsToLookDefaults(knobs: StudioKnobs): AuroraPackageDefaults {
  return {
    intensity: knobs.intensity,
    depth: knobs.depth,
    feedback: knobs.feedback,
    speed: knobs.speed,
    hue: knobs.hue,
    sat: knobs.sat,
    bright: knobs.bright,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sketch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Ensure slug is unique among sketches (append -2, -3, …). */
export function uniqueSlug(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const slug = slugifyPackageLabel(base);
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

export type StudioSketchPatch = Partial<Omit<StudioSketch, 'id' | 'knobs'>> & {
  knobs?: Partial<StudioKnobs>;
};

export function createSketch(
  partial?: Partial<
    Pick<
      StudioSketch,
      | 'label'
      | 'character'
      | 'uiGroup'
      | 'wgsl'
      | 'backend'
      | 'renderer'
      | 'requiresNativeWebGPU'
      | 'source'
    >
  > & {
    knobs?: Partial<StudioKnobs>;
  },
  existingSlugs: string[] = [],
): StudioSketch {
  const label = partial?.label?.trim() || 'Untitled Package';
  const slug = uniqueSlug(label, existingSlugs);
  return {
    id: newId(),
    slug,
    label,
    character: partial?.character ?? '',
    uiGroup: partial?.uiGroup ?? 'field-motion',
    wgsl: partial?.wgsl ?? PACK_V1_AUTHORING_TEMPLATE,
    backend: partial?.backend ?? 'wgsl',
    renderer: partial?.backend === 'threejs' ? (partial.renderer ?? 'webgl2') : undefined,
    requiresNativeWebGPU: partial?.requiresNativeWebGPU ?? false,
    source: partial?.backend === 'threejs' ? (partial.source ?? THREE_WEBGL2_TEMPLATE) : undefined,
    knobs: partial?.knobs ? { ...defaultKnobs(), ...partial.knobs } : defaultKnobs(),
    updatedAt: nowIso(),
  };
}

export function emptyDocument(): StudioDocument {
  const first = createSketch({ label: 'Point Cloud Waves' });
  return {
    version: STUDIO_VERSION,
    activeId: first.id,
    sketches: [first],
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clamp01(n: unknown, fallback: number): number {
  const x = Number(n);
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : fallback;
}

function parseKnobs(raw: unknown): StudioKnobs {
  const d = defaultKnobs();
  if (!isRecord(raw)) return d;
  const energyRaw = Number(raw.energy);
  return {
    intensity: clamp01(raw.intensity, d.intensity),
    depth: clamp01(raw.depth, d.depth),
    feedback: clamp01(raw.feedback, d.feedback),
    speed: clamp01(raw.speed, d.speed),
    hue: clamp01(raw.hue, d.hue),
    sat: clamp01(raw.sat, d.sat),
    bright: clamp01(raw.bright, d.bright),
    pulse: clamp01(raw.pulse, d.pulse),
    alpha: clamp01(raw.alpha, d.alpha),
    energy: Number.isFinite(energyRaw) ? Math.min(1, Math.max(-1, energyRaw)) : d.energy,
    bass: clamp01(raw.bass, d.bass),
    mid: clamp01(raw.mid, d.mid),
    high: clamp01(raw.high, d.high),
    demoAudio: raw.demoAudio === undefined ? d.demoAudio : Boolean(raw.demoAudio),
  };
}

function parseSketch(raw: unknown): StudioSketch | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : null;
  const wgsl =
    typeof raw.wgsl === 'string'
      ? raw.wgsl
      : raw.backend === 'threejs'
        ? PACK_V1_AUTHORING_TEMPLATE
        : null;
  if (!id || !label || wgsl === null) return null;
  const slug =
    typeof raw.slug === 'string' && raw.slug.trim()
      ? slugifyPackageLabel(raw.slug)
      : slugifyPackageLabel(label);
  const cleanWgsl = wgsl.replace(
    /max\(\s*palette_rgb\.xyz\s*,\s*vec3<\s*f32\s*>\(\s*0\.94\s*,\s*0\.96\s*,\s*0\.98\s*\)\s*\)/g,
    'max(palette_rgb.xyz, vec3<f32>(0.05))',
  );
  return {
    id,
    slug,
    label,
    character: typeof raw.character === 'string' ? raw.character : '',
    uiGroup: typeof raw.uiGroup === 'string' && raw.uiGroup.trim() ? raw.uiGroup : 'field-motion',
    wgsl: cleanWgsl,
    backend: raw.backend === 'threejs' ? 'threejs' : 'wgsl',
    renderer:
      raw.renderer === 'webgpu' ? 'webgpu' : raw.backend === 'threejs' ? 'webgl2' : undefined,
    requiresNativeWebGPU: raw.backend === 'threejs' ? Boolean(raw.requiresNativeWebGPU) : false,
    source:
      raw.backend === 'threejs' && typeof raw.source === 'string'
        ? raw.source
        : raw.backend === 'threejs'
          ? THREE_WEBGL2_TEMPLATE
          : undefined,
    knobs: parseKnobs(raw.knobs),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
  };
}

/** Parse a document from JSON (localStorage or import). */
export function parseStudioDocument(raw: unknown): StudioDocument {
  if (!isRecord(raw) || !Array.isArray(raw.sketches)) {
    return emptyDocument();
  }
  const sketches: StudioSketch[] = [];
  for (const item of raw.sketches) {
    const s = parseSketch(item);
    if (s) sketches.push(s);
  }
  if (sketches.length === 0) return emptyDocument();
  const activeId =
    typeof raw.activeId === 'string' && sketches.some((s) => s.id === raw.activeId)
      ? raw.activeId
      : (sketches[0]?.id ?? null);
  return {
    version: STUDIO_VERSION,
    activeId,
    sketches,
  };
}

export function loadStudioDocument(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): StudioDocument {
  if (!storage) return emptyDocument();
  try {
    const text = storage.getItem(STUDIO_STORAGE_KEY);
    if (!text) return emptyDocument();
    return parseStudioDocument(JSON.parse(text) as unknown);
  } catch {
    return emptyDocument();
  }
}

export function saveStudioDocument(
  doc: StudioDocument,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage !== 'undefined'
    ? localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(STUDIO_STORAGE_KEY, JSON.stringify(doc));
  } catch {
    /* quota / private mode */
  }
}

export function getActiveSketch(doc: StudioDocument): StudioSketch | null {
  if (!doc.activeId) return doc.sketches[0] ?? null;
  return doc.sketches.find((s) => s.id === doc.activeId) ?? doc.sketches[0] ?? null;
}

export function updateSketch(
  doc: StudioDocument,
  id: string,
  patch: StudioSketchPatch,
): StudioDocument {
  const sketches = doc.sketches.map((s) => {
    if (s.id !== id) return s;
    const next: StudioSketch = {
      ...s,
      ...patch,
      id: s.id,
      knobs: patch.knobs ? { ...s.knobs, ...patch.knobs } : s.knobs,
      updatedAt: nowIso(),
    };
    if (patch.label !== undefined && patch.slug === undefined) {
      const others = doc.sketches.filter((x) => x.id !== id).map((x) => x.slug);
      next.slug = uniqueSlug(patch.label, others);
    }
    if (patch.slug !== undefined) {
      const others = doc.sketches.filter((x) => x.id !== id).map((x) => x.slug);
      next.slug = uniqueSlug(patch.slug, others);
    }
    return next;
  });
  return { ...doc, sketches };
}

export function addSketch(doc: StudioDocument, sketch?: StudioSketch): StudioDocument {
  const existing = doc.sketches.map((s) => s.slug);
  const s = sketch ?? createSketch(undefined, existing);
  // Re-unique if provided sketch collides.
  const final =
    existing.includes(s.slug) && !sketch
      ? s
      : existing.includes(s.slug)
        ? { ...s, slug: uniqueSlug(s.slug, existing) }
        : s;
  return {
    ...doc,
    sketches: [...doc.sketches, final],
    activeId: final.id,
  };
}

export function removeSketch(doc: StudioDocument, id: string): StudioDocument {
  const sketches = doc.sketches.filter((s) => s.id !== id);
  if (sketches.length === 0) {
    return emptyDocument();
  }
  const activeId = doc.activeId === id ? (sketches[0]?.id ?? null) : doc.activeId;
  return { ...doc, sketches, activeId };
}

export function duplicateSketch(doc: StudioDocument, id: string): StudioDocument {
  const src = doc.sketches.find((s) => s.id === id);
  if (!src) return doc;
  const existing = doc.sketches.map((s) => s.slug);
  const copy = createSketch(
    {
      label: `${src.label} Copy`,
      character: src.character,
      uiGroup: src.uiGroup,
      wgsl: src.wgsl,
      knobs: { ...src.knobs },
    },
    existing,
  );
  return addSketch(doc, copy);
}

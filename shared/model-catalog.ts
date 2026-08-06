/**
 * Catalog of glTF models under models/* that visualizations can bind to.
 * Keep in sync with models/manifest.json and src/model_layer.rs.
 *
 * Web / GitHub Pages only ships entries with `ship: true` (small free samples).
 * Local-only packs (large human-female, heavy PBR props) stay on disk for
 * show machines — see models/SOURCES.md and models/README.md.
 */

export type ModelCatalogEntry = {
  id: string;
  label: string;
  /** Path relative to Bevy assets/ root. */
  assetPath: string;
  scene: number;
  defaultScale: number;
  /** World-space translation applied before audio motion. */
  offset: readonly [number, number, number];
  yawSpeed: number;
  /**
   * CPU deck visual-mode index that activates this model.
   * See VISUAL_MODES / VisualMode in the controls + renderer.
   */
  visualMode: number;
  /**
   * When true, the GLB is committed and included in the GH Pages deploy.
   * Local-only entries work when the files exist under models/, but are
   * omitted from the static site so visitors do not 404 multi‑MB assets.
   */
  ship: boolean;
};

/**
 * Order matters: index 0 is the default `figureModel`.
 * Ship pack first so a fresh Pages visit always has a loadable default.
 */
export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  // --- Web pack (committed + deploy) ---
  {
    id: 'cesium-man',
    label: 'Cesium Man',
    assetPath: 'models/cesium-man/source/CesiumMan.glb',
    scene: 0,
    defaultScale: 1.1,
    offset: [0.0, -1.0, 0.0],
    yawSpeed: 0.35,
    visualMode: 24,
    ship: true,
  },
  {
    id: 'fox',
    label: 'Fox',
    assetPath: 'models/fox/source/Fox.glb',
    scene: 0,
    defaultScale: 0.02,
    offset: [0.0, -1.0, 0.0],
    yawSpeed: 0.45,
    visualMode: 24,
    ship: true,
  },
  {
    id: 'duck',
    label: 'Duck',
    assetPath: 'models/duck/source/Duck.glb',
    scene: 0,
    defaultScale: 1.4,
    offset: [0.0, -0.6, 0.0],
    yawSpeed: 0.5,
    visualMode: 24,
    ship: true,
  },
  {
    id: 'rigged-figure',
    label: 'Rigged Figure',
    assetPath: 'models/rigged-figure/source/RiggedFigure.glb',
    scene: 0,
    defaultScale: 1.2,
    offset: [0.0, -1.0, 0.0],
    yawSpeed: 0.4,
    visualMode: 24,
    ship: true,
  },
  {
    id: 'damaged-helmet',
    label: 'Damaged Helmet',
    assetPath: 'models/damaged-helmet/source/DamagedHelmet.glb',
    scene: 0,
    defaultScale: 1.15,
    offset: [0.0, -0.2, 0.0],
    yawSpeed: 0.4,
    visualMode: 24,
    ship: true,
  },
  {
    id: 'cesium-milk-truck',
    label: 'Milk Truck',
    assetPath: 'models/cesium-milk-truck/source/CesiumMilkTruck.glb',
    scene: 0,
    defaultScale: 0.55,
    offset: [0.0, -0.9, 0.0],
    yawSpeed: 0.25,
    visualMode: 24,
    ship: true,
  },
  // --- Local-only (large / private; not on Pages) ---
  {
    id: 'human-female',
    label: 'Human Female (local)',
    assetPath: 'models/human-female/source/74f42c5a92bbb95403c45ff3929560ae.glb',
    scene: 0,
    defaultScale: 1.0,
    offset: [0.0, -1.0, 0.0],
    yawSpeed: 0.35,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'brain-stem',
    label: 'Brain Stem (local)',
    assetPath: 'models/brain-stem/source/BrainStem.glb',
    scene: 0,
    defaultScale: 1.0,
    offset: [0.0, -1.0, 0.0],
    yawSpeed: 0.3,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'boom-box',
    label: 'Boom Box (local)',
    assetPath: 'models/boom-box/source/BoomBox.glb',
    scene: 0,
    defaultScale: 80.0,
    offset: [0.0, -0.5, 0.0],
    yawSpeed: 0.35,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'lantern',
    label: 'Lantern (local)',
    assetPath: 'models/lantern/source/Lantern.glb',
    scene: 0,
    defaultScale: 0.08,
    offset: [0.0, -1.0, 0.0],
    yawSpeed: 0.25,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'water-bottle',
    label: 'Water Bottle (local)',
    assetPath: 'models/water-bottle/source/WaterBottle.glb',
    scene: 0,
    defaultScale: 8.0,
    offset: [0.0, -0.4, 0.0],
    yawSpeed: 0.4,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'avocado',
    label: 'Avocado (local)',
    assetPath: 'models/avocado/source/Avocado.glb',
    scene: 0,
    defaultScale: 40.0,
    offset: [0.0, -0.3, 0.0],
    yawSpeed: 0.5,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'antique-camera',
    label: 'Antique Camera (local)',
    assetPath: 'models/antique-camera/source/AntiqueCamera.glb',
    scene: 0,
    defaultScale: 0.35,
    offset: [0.0, -0.8, 0.0],
    yawSpeed: 0.3,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'corset',
    label: 'Corset (local)',
    assetPath: 'models/corset/source/Corset.glb',
    scene: 0,
    defaultScale: 25.0,
    offset: [0.0, -0.5, 0.0],
    yawSpeed: 0.35,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'sheen-chair',
    label: 'Sheen Chair (local)',
    assetPath: 'models/sheen-chair/source/SheenChair.glb',
    scene: 0,
    defaultScale: 1.3,
    offset: [0.0, -0.9, 0.0],
    yawSpeed: 0.3,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'toy-car',
    label: 'Toy Car (local)',
    assetPath: 'models/toy-car/source/ToyCar.glb',
    scene: 0,
    defaultScale: 1.5,
    offset: [0.0, -0.7, 0.0],
    yawSpeed: 0.4,
    visualMode: 24,
    ship: false,
  },
  {
    id: 'iridescent-dish',
    label: 'Iridescent Dish (local)',
    assetPath: 'models/iridescent-dish/source/IridescentDishWithOlives.glb',
    scene: 0,
    defaultScale: 4.0,
    offset: [0.0, -0.4, 0.0],
    yawSpeed: 0.35,
    visualMode: 24,
    ship: false,
  },
] as const;

export const MODEL_IDS = MODEL_CATALOG.map((m) => m.id);

/** Entries included in the GitHub Pages / CI static bundle. */
export const SHIPPED_MODEL_CATALOG = MODEL_CATALOG.filter((m) => m.ship);

/** Deck visual-mode index for mesh models (VISUAL_MODES[24] === "Figure"). */
export const FIGURE_VISUAL_MODE = 24;

/** Inclusive max for ControlState.figureModel (catalog index). */
export const MAX_FIGURE_MODEL_INDEX = Math.max(0, MODEL_CATALOG.length - 1);

export function modelById(id: string): ModelCatalogEntry | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function modelByVisualMode(mode: number): ModelCatalogEntry | undefined {
  const rounded = Math.round(mode);
  return MODEL_CATALOG.find((m) => m.visualMode === rounded);
}

export function modelByIndex(index: number): ModelCatalogEntry | undefined {
  const i = Math.round(index);
  if (i < 0 || i >= MODEL_CATALOG.length) return undefined;
  return MODEL_CATALOG[i];
}

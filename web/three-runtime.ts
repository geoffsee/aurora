import {
  type Camera,
  LoadingManager,
  type Material,
  type Object3D,
  type Scene,
  type Texture,
  WebGLRenderer as ThreeWebGLRenderer,
  type WebGLRenderer,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import type {
  CompiledModeDeck,
  CompiledModeLayer,
  CompiledModeWire,
} from '../shared/compiled-mode-wire.ts';

export type AuroraThreeFrame = {
  time: number;
  delta: number;
  deck: CompiledModeDeck;
  mix: number;
  width: number;
  height: number;
  dpr: number;
  intensity: number;
  depth: number;
  feedback: number;
  speed: number;
  palette: { hue: number; saturation: number; brightness: number; rgb: [number, number, number] };
  blackout: boolean;
  freeze: boolean;
  flashVersion: number;
  resetVersion: number;
  cueVersion: number;
  energy: number;
  bass: number;
  mid: number;
  high: number;
  pulse: number;
  tempo: number;
  beat: number;
};

type AnyRenderer = WebGLRenderer | WebGPURenderer;

export type AuroraThreeFactoryContext = {
  renderer: AnyRenderer;
  canvas: HTMLCanvasElement;
  signal: AbortSignal;
  assets: {
    url(path: string): string;
    fetch(path: string, init?: RequestInit): Promise<Response>;
    loadingManager: LoadingManager;
  };
  resources: ThreeResourceTracker;
  viewport: { width: number; height: number; dpr: number };
};

export type AuroraThreeInstance = {
  scene?: Scene;
  camera?: Camera;
  render?: (frame: AuroraThreeFrame) => void | Promise<void>;
  update?: (frame: AuroraThreeFrame) => void;
  resize?: (width: number, height: number, dpr: number) => void;
  dispose?: () => void;
};

export class ThreeResourceTracker {
  private resources = new Set<{ dispose?: () => void }>();
  track<T extends { dispose?: () => void }>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }
  untrack(resource: { dispose?: () => void }): void {
    this.resources.delete(resource);
  }
  dispose(): void {
    for (const resource of this.resources) resource.dispose?.();
    this.resources.clear();
  }
  get size(): number {
    return this.resources.size;
  }
}

export class AdaptiveDprGovernor {
  scale = 1;
  adaptations = 0;
  private samples: number[] = [];
  private stableMs = 0;

  sample(frameMs: number, renderMs: number, gpuMs: number | null, stalled: boolean): number {
    this.samples.push(frameMs);
    if (this.samples.length < 120) return this.scale;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? frameMs;
    const stalls = this.samples.filter((value) => value > 33.34).length / this.samples.length;
    this.samples = [];
    if (p95 > 20 || (gpuMs !== null && gpuMs > 12) || stalls > 0.05 || stalled) {
      const next = Math.max(0.5, Math.round((this.scale - 0.1) * 100) / 100);
      if (next !== this.scale) this.adaptations += 1;
      this.scale = next;
      this.stableMs = 0;
    } else if (p95 < 18 && renderMs < 8) {
      this.stableMs += 120 * p95;
      if (this.stableMs >= 10_000) {
        const next = Math.min(1, Math.round((this.scale + 0.05) * 100) / 100);
        if (next !== this.scale) this.adaptations += 1;
        this.scale = next;
        this.stableMs = 0;
      }
    } else this.stableMs = 0;
    return this.scale;
  }
}

function disposeMaterial(material: Material): void {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value) (value as Texture).dispose();
  }
  material.dispose();
}

function disposeScene(scene: Object3D | undefined): void {
  scene?.traverse((object) => {
    const mesh = object as Object3D & {
      geometry?: { dispose(): void };
      material?: Material | Material[];
    };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
    else if (mesh.material) disposeMaterial(mesh.material);
  });
}

type Active = {
  layer: CompiledModeLayer;
  canvas: HTMLCanvasElement;
  renderer: AnyRenderer;
  instance: AuroraThreeInstance;
  resources: ThreeResourceTracker;
  abort: AbortController;
  moduleUrl: string;
  sourceMapUrl?: string;
  lastAt: number;
  dpr: AdaptiveDprGovernor;
  assetUrls: string[];
};

const STATIC_MODULE_SPECIFIER = /(\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?)(['"])([^'"]+)\2/g;

function resolveDocumentModule(specifier: string): string {
  try {
    return import.meta.resolve(specifier);
  } catch {
    // The document import map remains the compatibility fallback on browsers
    // that support import maps but not import.meta.resolve().
    return specifier;
  }
}

/**
 * Blob modules have produced inconsistent bare-specifier resolution across
 * browsers even when the owning document has an import map. Resolve authored
 * Three.js imports from this (document-backed) module before creating the Blob
 * so its first dependency fetch always uses a concrete URL.
 */
export function resolveThreeModuleImports(
  source: string,
  resolve: (specifier: string) => string = resolveDocumentModule,
): string {
  return source.replace(
    STATIC_MODULE_SPECIFIER,
    (statement, prefix: string, quote: string, specifier: string) => {
      if (specifier !== 'three' && !specifier.startsWith('three/')) return statement;
      return `${prefix}${quote}${resolve(specifier)}${quote}`;
    },
  );
}

export class AuroraThreeDeckHost {
  private active: Active | null = null;
  private generation = 0;
  private raf = 0;

  constructor(
    readonly deck: CompiledModeDeck,
    private readonly stage: HTMLElement,
    private readonly frameProvider: () => Omit<
      AuroraThreeFrame,
      'time' | 'delta' | 'deck' | 'width' | 'height' | 'dpr'
    >,
    private readonly report: (message: string) => void = console.warn,
  ) {
    if (typeof CSS !== 'undefined' && !CSS.supports('mix-blend-mode', 'plus-lighter')) {
      this.report('[three] plus-lighter blending is unsupported; using normal blending');
    }
    this.raf = requestAnimationFrame(this.tick);
  }

  async applyWire(wire: CompiledModeWire): Promise<boolean> {
    const layer = wire.layers.find((candidate) => candidate.kind === 'threejs');
    if (!layer?.moduleSource) {
      this.swap(null);
      return true;
    }
    const generation = ++this.generation;
    const abort = new AbortController();
    const canvas = document.createElement('canvas');
    canvas.className = `three-deck three-deck--${this.deck}`;
    const resources = new ThreeResourceTracker();
    const sourceMapUrl = layer.sourceMap
      ? URL.createObjectURL(new Blob([layer.sourceMap], { type: 'application/json' }))
      : undefined;
    const resolvedModuleSource = resolveThreeModuleImports(layer.moduleSource);
    const executable = sourceMapUrl
      ? /\/\/# sourceMappingURL=.*$/m.test(layer.moduleSource)
        ? resolvedModuleSource.replace(
            /\/\/# sourceMappingURL=.*$/m,
            `//# sourceMappingURL=${sourceMapUrl}`,
          )
        : `${resolvedModuleSource}\n//# sourceMappingURL=${sourceMapUrl}`
      : resolvedModuleSource;
    const moduleUrl = URL.createObjectURL(new Blob([executable], { type: 'text/javascript' }));
    try {
      if (layer.renderer === 'webgpu' && layer.requiresNativeWebGPU && !('gpu' in navigator)) {
        throw new Error('native WebGPU is required but unavailable');
      }
      const renderer: AnyRenderer =
        layer.renderer === 'webgpu'
          ? new WebGPURenderer({ canvas, alpha: true, antialias: true })
          : new ThreeWebGLRenderer({
              canvas,
              alpha: true,
              antialias: true,
              premultipliedAlpha: true,
            });
      if ('init' in renderer && typeof renderer.init === 'function') await renderer.init();
      const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
      const actualBackend =
        layer.renderer === 'webgpu' && backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
      if (layer.requiresNativeWebGPU && actualBackend !== 'webgpu') {
        throw new Error('native WebGPU was required, but Three.js selected its WebGL2 fallback');
      }
      canvas.dataset.backend = actualBackend;
      canvas.title = `${this.deck}: Three.js ${actualBackend}${layer.renderer === 'webgpu' && actualBackend !== 'webgpu' ? ' fallback' : ''}`;
      console.info(`[three:${this.deck}] backend=${actualBackend}`);
      if (generation !== this.generation) throw new DOMException('superseded', 'AbortError');
      const width = Math.max(1, this.stage.clientWidth);
      const height = Math.max(1, this.stage.clientHeight);
      const dpr = Math.min(devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      const base = wire.assetBase;
      const resolveAsset = (path: string) => {
        const clean = path.replace(/^\.\//, '');
        if (!layer.assets?.some((asset) => asset.path === clean))
          throw new Error(`undeclared asset: ${path}`);
        const authored = layer.assetUrls?.[clean];
        if (authored) return authored;
        return new URL(clean, new URL(base, location.href)).href;
      };
      const loadingManager = new LoadingManager();
      loadingManager.setURLModifier((url) =>
        layer.assets?.some((asset) => asset.path === url || asset.path.endsWith(`/${url}`))
          ? resolveAsset(
              layer.assets.find((asset) => asset.path === url || asset.path.endsWith(`/${url}`))
                ?.path ?? url,
            )
          : url,
      );
      const imported = (await import(/* @vite-ignore */ moduleUrl)) as {
        default?: (
          ctx: AuroraThreeFactoryContext,
        ) => Promise<AuroraThreeInstance> | AuroraThreeInstance;
      };
      if (typeof imported.default !== 'function')
        throw new Error('module default export is not a factory');
      const instance = await imported.default({
        renderer,
        canvas,
        signal: abort.signal,
        assets: {
          url: resolveAsset,
          fetch: (path, init) => fetch(resolveAsset(path), { ...init, signal: abort.signal }),
          loadingManager,
        },
        resources,
        viewport: { width, height, dpr },
      });
      if (!instance.render && !(instance.scene && instance.camera))
        throw new Error('factory must return render(), or scene and camera');
      const now = performance.now();
      const frame = this.makeFrame(now, 0, width, height, dpr);
      instance.update?.(frame);
      if (instance.render) await instance.render(frame);
      else renderer.render(instance.scene as Scene, instance.camera as Camera);
      if (generation !== this.generation) throw new DOMException('superseded', 'AbortError');
      this.stage.append(canvas);
      this.swap({
        layer,
        canvas,
        renderer,
        instance,
        resources,
        abort,
        moduleUrl,
        sourceMapUrl,
        lastAt: now,
        dpr: new AdaptiveDprGovernor(),
        assetUrls: Object.values(layer.assetUrls ?? {}),
      });
      return true;
    } catch (error) {
      abort.abort();
      resources.dispose();
      URL.revokeObjectURL(moduleUrl);
      if (sourceMapUrl) URL.revokeObjectURL(sourceMapUrl);
      for (const url of Object.values(layer.assetUrls ?? {})) URL.revokeObjectURL(url);
      canvas.remove();
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        this.report(
          `[three:${this.deck}] ${error instanceof Error ? error.message : String(error)}`,
        );
      return false;
    }
  }

  private makeFrame(
    now: number,
    delta: number,
    width: number,
    height: number,
    dpr: number,
  ): AuroraThreeFrame {
    return {
      ...this.frameProvider(),
      time: now / 1000,
      delta: delta / 1000,
      deck: this.deck,
      width,
      height,
      dpr,
    };
  }

  private tick = (now: number) => {
    this.raf = requestAnimationFrame(this.tick);
    const active = this.active;
    if (!active) return;
    const base = this.frameProvider();
    active.canvas.style.opacity = base.blackout ? '0' : String(Math.max(0, Math.min(1, base.mix)));
    if (base.freeze) return;
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    const delta = Math.min(100, now - active.lastAt);
    active.lastAt = now;
    const started = performance.now();
    const nativeDpr = Math.min(devicePixelRatio || 1, 2);
    const dpr = nativeDpr * active.dpr.scale;
    if (
      active.canvas.width !== Math.round(width * dpr) ||
      active.canvas.height !== Math.round(height * dpr)
    ) {
      active.renderer.setPixelRatio(dpr);
      active.renderer.setSize(width, height, false);
      active.instance.resize?.(width, height, dpr);
    }
    const frame = this.makeFrame(now, delta, width, height, dpr);
    try {
      active.instance.update?.(frame);
      if (active.instance.render) void active.instance.render(frame);
      else active.renderer.render(active.instance.scene as Scene, active.instance.camera as Camera);
      active.dpr.sample(delta, performance.now() - started, null, delta > 50);
    } catch (error) {
      this.report(
        `[three:${this.deck}] render failed; retaining last scene: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  private swap(next: Active | null): void {
    const previous = this.active;
    this.active = next;
    if (!previous || previous === next) return;
    previous.abort.abort();
    previous.instance.dispose?.();
    disposeScene(previous.instance.scene);
    previous.resources.dispose();
    previous.renderer.dispose();
    previous.canvas.remove();
    URL.revokeObjectURL(previous.moduleUrl);
    if (previous.sourceMapUrl) URL.revokeObjectURL(previous.sourceMapUrl);
    for (const url of previous.assetUrls) URL.revokeObjectURL(url);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.generation += 1;
    this.swap(null);
  }
}

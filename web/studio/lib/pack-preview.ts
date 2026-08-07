/**
 * WebGPU fullscreen preview for pack-v1 authoring WGSL.
 * Honest about limits: browser WebGPU ≠ Bevy Material2d; export remaps groups for the show.
 */

import { hueToRgb } from '../../../shared/palette-color.ts';
import { preparePreviewWgsl } from './prepare-preview-wgsl.ts';
import type { StudioKnobs } from './sketch-store.ts';
import type { WgslDiagnostic } from './wgsl-diagnostics.ts';

export type PackPreviewStatus =
  | { state: 'idle' }
  | { state: 'no-webgpu'; message: string }
  | { state: 'compiling' }
  | { state: 'error'; message: string; diagnostics: readonly WgslDiagnostic[] }
  | { state: 'ready' };

export type PackPreviewListener = (status: PackPreviewStatus) => void;

export type PackPreviewMetrics = {
  status: PackPreviewStatus['state'];
  fps: number;
  frameMs: number;
  avgFrameMs: number;
  minFrameMs: number;
  maxFrameMs: number;
  totalFrames: number;
  jankFrameCount: number;
  lastCompileMs: number | null;
  lastPrepareMs: number | null;
  lastPipelineMs: number | null;
  compileCount: number;
  lastCompileErrorCount: number;
  canvasWidth: number;
  canvasHeight: number;
  memoryUsedMb: number | null;
  memoryLimitMb: number | null;
};

export type PackPreviewMetricsListener = (metrics: PackPreviewMetrics) => void;

const UNIFORM_SIZE = 16; // one vec4
const BINDING_COUNT = 5;
const FRAME_WINDOW_SIZE = 60;
const JANK_FRAME_MS = 33.333; // > 33ms means <30fps

function readMemoryMetrics(): { usedMb: number | null; limitMb: number | null } {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } })
    .memory;
  if (!memory) return { usedMb: null, limitMb: null };
  return {
    usedMb: Math.round(memory.usedJSHeapSize / 1024 / 1024),
    limitMb: Math.round(memory.jsHeapSizeLimit / 1024 / 1024),
  };
}

function initialMetrics(): PackPreviewMetrics {
  return {
    status: 'idle',
    fps: 0,
    frameMs: 0,
    avgFrameMs: 0,
    minFrameMs: 0,
    maxFrameMs: 0,
    totalFrames: 0,
    jankFrameCount: 0,
    lastCompileMs: null,
    lastPrepareMs: null,
    lastPipelineMs: null,
    compileCount: 0,
    lastCompileErrorCount: 0,
    canvasWidth: 0,
    canvasHeight: 0,
    memoryUsedMb: null,
    memoryLimitMb: null,
  };
}

export class PackPreview {
  private canvas: HTMLCanvasElement;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private format: GPUTextureFormat = 'bgra8unorm';
  private pipeline: GPURenderPipeline | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private buffers: GPUBuffer[] = [];
  private layout: GPUBindGroupLayout | null = null;
  private pipelineLayout: GPUPipelineLayout | null = null;
  private raf = 0;
  private startMs = performance.now();
  private knobs: StudioKnobs | null = null;
  private listener: PackPreviewListener | null = null;
  private metricsListener: PackPreviewMetricsListener | null = null;
  private destroyed = false;
  private lastSource = '';
  private frameSamples: number[] = [];
  private frameSamplesSumMs = 0;
  private totalFrames = 0;
  private jankFrameCount = 0;
  private compileCount = 0;
  private lastCompileMs: number | null = null;
  private lastPrepareMs: number | null = null;
  private lastPipelineMs: number | null = null;
  private lastCompileErrorCount = 0;
  private lastFrameAtMs: number | null = null;
  private metrics: PackPreviewMetrics = initialMetrics();
  private renderState: PackPreviewStatus['state'] = 'idle';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  onStatus(listener: PackPreviewListener): void {
    this.listener = listener;
  }

  onMetrics(listener: PackPreviewMetricsListener): void {
    this.metricsListener = listener;
    listener(this.metrics);
  }

  private emit(status: PackPreviewStatus): void {
    this.renderState = status.state;
    this.listener?.(status);
    this.emitMetrics({ status: status.state });
  }

  private emitError(
    message: string,
    rawMessages: readonly GPUCompilationMessage[],
    compileMs: number | null = null,
    prepareMs: number | null = null,
    pipelineMs: number | null = null,
  ): void {
    const diagnostics: WgslDiagnostic[] = rawMessages.map((error) => ({
      lineNumber: Math.max(1, error.lineNum || 1),
      startColumn: Math.max(1, error.linePos || 1),
      endLineNumber: Math.max(1, error.lineNum || 1),
      endColumn: error.linePos ? error.linePos + 1 : 2,
      message: error.message,
      severity: error.type === 'warning' ? 'warning' : error.type === 'error' ? 'error' : 'info',
    }));

    this.lastCompileMs = compileMs;
    this.lastPrepareMs = prepareMs;
    this.lastPipelineMs = pipelineMs;
    this.lastCompileErrorCount = rawMessages.length;
    this.emit({
      state: 'error',
      message,
      diagnostics,
    });
    this.emitMetrics({
      status: 'error',
      lastCompileMs: compileMs,
      lastPrepareMs: prepareMs,
      lastPipelineMs: pipelineMs,
      lastCompileErrorCount: this.lastCompileErrorCount,
    });
  }

  private emitReady(): void {
    this.emit({ state: 'ready' });
  }

  private emitMetrics(partial: Partial<PackPreviewMetrics>): void {
    this.metrics = {
      ...this.metrics,
      ...partial,
      status: partial.status ?? this.renderState,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
    };
    const memory = readMemoryMetrics();
    if (memory.usedMb !== null) {
      this.metrics.memoryUsedMb = memory.usedMb;
    }
    if (memory.limitMb !== null) {
      this.metrics.memoryLimitMb = memory.limitMb;
    }
    this.metricsListener?.(this.metrics);
  }

  private recordFrame(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;

    this.totalFrames += 1;
    this.frameSamples.push(deltaMs);
    this.frameSamplesSumMs += deltaMs;
    if (this.frameSamples.length > FRAME_WINDOW_SIZE) {
      const dropped = this.frameSamples.shift();
      if (dropped !== undefined) {
        this.frameSamplesSumMs -= dropped;
      }
    }

    if (deltaMs > JANK_FRAME_MS) this.jankFrameCount += 1;

    let minFrameMs = Number.POSITIVE_INFINITY;
    let maxFrameMs = 0;
    for (const sample of this.frameSamples) {
      if (sample < minFrameMs) minFrameMs = sample;
      if (sample > maxFrameMs) maxFrameMs = sample;
    }

    const avgFrameMs =
      this.frameSamples.length > 0 ? this.frameSamplesSumMs / this.frameSamples.length : deltaMs;
    const fps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;

    this.emitMetrics({
      fps,
      frameMs: deltaMs,
      avgFrameMs,
      minFrameMs: minFrameMs === Number.POSITIVE_INFINITY ? 0 : minFrameMs,
      maxFrameMs,
      totalFrames: this.totalFrames,
      jankFrameCount: this.jankFrameCount,
      lastCompileMs: this.lastCompileMs,
      lastPrepareMs: this.lastPrepareMs,
      lastPipelineMs: this.lastPipelineMs,
      compileCount: this.compileCount,
      lastCompileErrorCount: this.lastCompileErrorCount,
    });
  }

  private resetFrameMetrics(): void {
    this.frameSamples = [];
    this.frameSamplesSumMs = 0;
    this.totalFrames = 0;
    this.jankFrameCount = 0;
    this.lastFrameAtMs = null;
    this.emitMetrics({
      frameMs: 0,
      avgFrameMs: 0,
      minFrameMs: 0,
      maxFrameMs: 0,
      totalFrames: 0,
      jankFrameCount: 0,
      fps: 0,
    });
  }

  async init(): Promise<boolean> {
    if (!navigator.gpu) {
      this.emit({
        state: 'no-webgpu',
        message:
          'WebGPU is not available in this browser. Export still works; preview needs Chrome/Edge/Safari with WebGPU.',
      });
      return false;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      this.emit({ state: 'no-webgpu', message: 'No WebGPU adapter (GPU blocked or unavailable).' });
      return false;
    }
    this.device = await adapter.requestDevice();
    this.device.lost.then((info) => {
      if (!this.destroyed) {
        this.emitError(`GPU device lost: ${info.message}`, []);
      }
    });

    const ctx = this.canvas.getContext('webgpu');
    if (!ctx) {
      this.emit({ state: 'no-webgpu', message: 'canvas.getContext("webgpu") failed.' });
      return false;
    }
    this.context = ctx;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });

    this.layout = this.device.createBindGroupLayout({
      entries: Array.from({ length: BINDING_COUNT }, (_, i) => ({
        binding: i,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' as const },
      })),
    });
    this.pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.layout],
    });

    const device = this.device;
    this.buffers = Array.from({ length: BINDING_COUNT }, () =>
      device.createBuffer({
        size: UNIFORM_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    );

    this.bindGroup = this.device.createBindGroup({
      layout: this.layout,
      entries: this.buffers.map((buffer, binding) => ({ binding, resource: { buffer } })),
    });

    this.startLoop();
    return true;
  }

  setKnobs(knobs: StudioKnobs): void {
    this.knobs = knobs;
  }

  async setSource(wgsl: string): Promise<void> {
    if (!this.device || !this.pipelineLayout || !this.layout) return;
    if (wgsl === this.lastSource && this.pipeline) return;
    this.lastSource = wgsl;
    this.emit({ state: 'compiling' });
    this.compileCount += 1;
    this.lastCompileErrorCount = 0;

    const compileStart = performance.now();
    const prepareStart = performance.now();
    const prepared = preparePreviewWgsl(wgsl);
    const prepareMs = performance.now() - prepareStart;
    this.lastPrepareMs = prepareMs;

    if (!prepared.ok) {
      this.pipeline = null;
      const compileMs = performance.now() - compileStart;
      this.lastCompileMs = compileMs;
      this.emitError(prepared.error, [], compileMs, prepareMs, null);
      this.resetFrameMetrics();
      return;
    }

    const module = this.device.createShaderModule({ code: prepared.wgsl });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length > 0) {
      this.pipeline = null;
      const compileMs = performance.now() - compileStart;
      this.lastCompileMs = compileMs;
      const msg = errors
        .map((e) => {
          const loc = e.lineNum > 0 ? `L${e.lineNum}:${e.linePos} ` : '';
          return `${loc}${e.message}`;
        })
        .join('\n');
      this.emitError(msg || 'WGSL compile error', errors, compileMs, prepareMs, null);
      this.resetFrameMetrics();
      return;
    }

    const pipelineStart = performance.now();
    try {
      this.pipeline = this.device.createRenderPipeline({
        layout: this.pipelineLayout,
        vertex: { module, entryPoint: 'vs_main' },
        fragment: {
          module,
          entryPoint: 'fragment',
          targets: [{ format: this.format }],
        },
        primitive: { topology: 'triangle-list' },
      });
      const pipelineMs = performance.now() - pipelineStart;
      const compileMs = performance.now() - compileStart;
      this.lastCompileMs = compileMs;
      this.lastPipelineMs = pipelineMs;
      this.emitMetrics({
        lastCompileMs: compileMs,
        lastPrepareMs: prepareMs,
        lastPipelineMs: pipelineMs,
        compileCount: this.compileCount,
        lastCompileErrorCount: this.lastCompileErrorCount,
      });
      this.emitReady();
    } catch (e) {
      this.pipeline = null;
      const message = e instanceof Error ? e.message : String(e);
      const compileMs = performance.now() - compileStart;
      const pipelineMs = performance.now() - pipelineStart;
      this.lastCompileMs = compileMs;
      this.lastPipelineMs = pipelineMs;
      this.emitError(message, [], compileMs, prepareMs, pipelineMs);
      this.resetFrameMetrics();
    }
  }

  private writeUniforms(timeSec: number): void {
    if (!this.device || !this.knobs) return;
    const k = this.knobs;
    const w = Math.max(this.canvas.width, 1);
    const h = Math.max(this.canvas.height, 1);
    const aspect = w / h;

    let energy = k.energy;
    let bass = k.bass;
    let mid = k.mid;
    let high = k.high;
    let pulse = k.pulse;
    if (k.demoAudio) {
      const t = timeSec;
      energy = 0.35 + 0.35 * Math.sin(t * 1.7);
      bass = 0.25 + 0.4 * Math.max(0, Math.sin(t * 2.2));
      mid = 0.2 + 0.35 * Math.max(0, Math.sin(t * 3.1 + 1.0));
      high = 0.15 + 0.4 * Math.max(0, Math.sin(t * 5.0 + 2.0));
      pulse = 0.15 + 0.45 * Math.max(0, Math.sin(t * 2.2));
    }

    const speedScale = 0.25 + k.speed * 1.75;
    const animTime = timeSec * speedScale;
    const rgb = hueToRgb(k.hue, 0.72, 0.52);

    const packs: [number, number, number, number][] = [
      [k.hue, animTime, 0, aspect], // params
      [k.sat, k.bright, pulse, k.alpha], // palette_extra
      [energy, bass, mid, high], // audio_uniforms
      [rgb.r, rgb.g, rgb.b, 1], // palette_rgb
      [k.intensity, k.depth, k.feedback, k.speed], // pack_drive
    ];

    for (let i = 0; i < BINDING_COUNT; i++) {
      const buf = this.buffers[i];
      const v = packs[i];
      if (!buf || !v) continue;
      this.device.queue.writeBuffer(buf, 0, new Float32Array(v));
    }
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private frame = (): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (!this.device || !this.context || !this.pipeline || !this.bindGroup) {
      this.lastFrameAtMs = null;
      this.emitMetrics({
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
      });
      return;
    }
    const nowMs = performance.now();
    if (this.lastFrameAtMs !== null) {
      this.recordFrame(nowMs - this.lastFrameAtMs);
    } else {
      this.emitMetrics({ status: 'ready' });
    }
    this.lastFrameAtMs = nowMs;
    this.resize();
    const timeSec = (nowMs - this.startMs) / 1000;
    this.writeUniforms(timeSec);

    const encoder = this.device.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.02, g: 0.02, b: 0.03, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  };

  private startLoop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const b of this.buffers) {
      try {
        b.destroy();
      } catch {
        /* ignore */
      }
    }
    this.buffers = [];
    this.pipeline = null;
    this.bindGroup = null;
    this.device = null;
    this.context = null;
    this.emitMetrics({ status: 'idle' });
  }
}

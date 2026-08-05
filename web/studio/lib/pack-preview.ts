/**
 * WebGPU fullscreen preview for pack-v1 authoring WGSL.
 * Honest about limits: browser WebGPU ≠ Bevy Material2d; export remaps groups for the show.
 */

import { hueToRgb } from '../../../shared/palette-color.ts';
import { preparePreviewWgsl } from './prepare-preview-wgsl.ts';
import type { StudioKnobs } from './sketch-store.ts';

export type PackPreviewStatus =
  | { state: 'idle' }
  | { state: 'no-webgpu'; message: string }
  | { state: 'compiling' }
  | { state: 'error'; message: string }
  | { state: 'ready' };

export type PackPreviewListener = (status: PackPreviewStatus) => void;

const UNIFORM_SIZE = 16; // one vec4
const BINDING_COUNT = 5;

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
  private destroyed = false;
  private lastSource = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  onStatus(listener: PackPreviewListener): void {
    this.listener = listener;
  }

  private emit(status: PackPreviewStatus): void {
    this.listener?.(status);
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
        this.emit({ state: 'error', message: `GPU device lost: ${info.message}` });
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

    const prepared = preparePreviewWgsl(wgsl);
    if (!prepared.ok) {
      this.pipeline = null;
      this.emit({ state: 'error', message: prepared.error });
      return;
    }

    const module = this.device.createShaderModule({ code: prepared.wgsl });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === 'error');
    if (errors.length > 0) {
      this.pipeline = null;
      const msg = errors
        .map((e) => {
          const loc = e.lineNum > 0 ? `L${e.lineNum}:${e.linePos} ` : '';
          return `${loc}${e.message}`;
        })
        .join('\n');
      this.emit({ state: 'error', message: msg || 'WGSL compile error' });
      return;
    }

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
      this.emit({ state: 'ready' });
    } catch (e) {
      this.pipeline = null;
      this.emit({
        state: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
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
    if (!this.device || !this.context || !this.pipeline || !this.bindGroup) return;
    this.resize();
    const timeSec = (performance.now() - this.startMs) / 1000;
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
  }
}

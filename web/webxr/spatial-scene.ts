import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
} from 'three';
import type { SpatialVisualizerFrame } from './data-bridge.ts';

const PARTICLE_MAX = 2_048;
const PARTICLE_TIERS = [1_536, 1_024, 768] as const;
const SPECTRUM_COUNT = 64;
const RING_COUNT = 24;
const SHELL_COUNT = 12;
const COMFORT_RADIUS = 0.55;
const FLASH_COOLDOWN_MS = 250;
const FLASH_DECAY_SECONDS = 0.18;

function material(color: number, opacity: number, wireframe = false): MeshBasicMaterial {
  const value = new MeshBasicMaterial({ color, transparent: true, opacity, wireframe });
  value.blending = AdditiveBlending;
  value.depthTest = true;
  value.depthWrite = false;
  value.toneMapped = false;
  return value;
}

function seeded(seed: number): () => number {
  let state = Math.max(1, Math.floor(seed * 0xffffffff)) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export class SpatialSceneController {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(70, 1, 0.05, 50);

  private readonly root = new Object3D();
  private readonly dummy = new Object3D();
  private readonly particles: InstancedMesh;
  private readonly spectrum: InstancedMesh;
  private readonly rings: InstancedMesh;
  private readonly shells: InstancedMesh;
  private readonly particleMaterial = material(0xffffff, 0.65);
  private readonly spectrumMaterial = material(0xffffff, 0.78);
  private readonly ringMaterial = material(0xffffff, 0.45);
  private readonly shellMaterial = material(0xffffff, 0.24, true);
  private readonly particleX = new Float32Array(PARTICLE_MAX);
  private readonly particleY = new Float32Array(PARTICLE_MAX);
  private readonly particleZ = new Float32Array(PARTICLE_MAX);
  private readonly particleSpeed = new Float32Array(PARTICLE_MAX);
  private readonly particlePhase = new Float32Array(PARTICLE_MAX);
  private readonly levels = new Float32Array(SPECTRUM_COUNT);
  private frame: SpatialVisualizerFrame;
  private elapsed = 0;
  private previousTimeMs = 0;
  private currentSeed = 0.5;
  private lastBeatVersion = 0;
  private lastFlashVersion = 0;
  private lastResetVersion = 0;
  private lastFlashAt = Number.NEGATIVE_INFINITY;
  private flashEnvelope = 0;
  private tierIndex = 0;
  private frameSamples: number[] = [];
  private stableSeconds = 0;

  constructor(initialFrame: SpatialVisualizerFrame) {
    this.frame = initialFrame;
    this.scene.background = new Color(0x000000);
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.root);

    this.particles = new InstancedMesh(
      new IcosahedronGeometry(0.035, 0),
      this.particleMaterial,
      PARTICLE_MAX,
    );
    this.spectrum = new InstancedMesh(
      new BoxGeometry(0.06, 1, 0.06),
      this.spectrumMaterial,
      SPECTRUM_COUNT,
    );
    this.rings = new InstancedMesh(
      new TorusGeometry(1, 0.018, 4, 48),
      this.ringMaterial,
      RING_COUNT,
    );
    this.shells = new InstancedMesh(new IcosahedronGeometry(1, 1), this.shellMaterial, SHELL_COUNT);
    for (const mesh of [this.particles, this.spectrum, this.rings, this.shells]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.root.add(mesh);
    }
    this.particles.count = PARTICLE_TIERS[0];
    this.resetParticles(initialFrame.formSeed);
    this.commit(initialFrame);
  }

  commit(next: SpatialVisualizerFrame): void {
    this.frame = next;
    for (let index = 0; index < SPECTRUM_COUNT; index++) {
      const target = next.levels64[index] ?? 0;
      const alpha = target >= this.levels[index]! ? 0.65 : 0.15;
      this.levels[index] = mix(this.levels[index]!, target, alpha);
    }
    this.applyInstanceColors();

    if (next.resetVersion !== this.lastResetVersion) {
      this.lastResetVersion = next.resetVersion;
      this.resetParticles(next.formSeed);
    }
    const beatTriggered = next.beatVersion !== this.lastBeatVersion;
    this.lastBeatVersion = next.beatVersion;
    const flashTriggered = next.flashVersion !== this.lastFlashVersion;
    this.lastFlashVersion = next.flashVersion;
    if (
      (flashTriggered || (beatTriggered && next.strobe && !next.strobeLockout)) &&
      next.nowMs - this.lastFlashAt >= FLASH_COOLDOWN_MS
    ) {
      this.lastFlashAt = next.nowMs;
      this.flashEnvelope = 1;
      this.kickParticles();
    }
  }

  step(timeMs: number): void {
    if (this.previousTimeMs === 0) this.previousTimeMs = timeMs;
    const dt = Math.min(0.05, Math.max(0, (timeMs - this.previousTimeMs) / 1_000));
    this.previousTimeMs = timeMs;
    this.observeFrameTime(dt);
    if (!this.frame.freeze) this.elapsed += dt;
    this.currentSeed = MathUtils.damp(this.currentSeed, this.frame.formSeed, 7.7, dt);
    this.flashEnvelope *= Math.exp(-dt / FLASH_DECAY_SECONDS);
    const flashGain = 1 + Math.min(0.35, this.flashEnvelope * 0.35);
    this.particleMaterial.opacity = Math.min(
      1,
      Math.min(0.88, 0.5 + this.frame.energy * 0.28) * flashGain,
    );
    this.spectrumMaterial.opacity = Math.min(
      1,
      Math.min(0.9, 0.55 + this.frame.high * 0.28) * flashGain,
    );
    this.ringMaterial.opacity = this.frame.rings
      ? Math.min(
          1,
          Math.min(0.78, this.frame.ringOpacity * (0.65 + this.frame.bass * 0.65)) * flashGain,
        )
      : 0;
    this.shellMaterial.opacity = Math.min(
      1,
      Math.min(0.5, 0.16 + this.frame.mid * 0.2) * flashGain,
    );
    this.root.visible = !this.frame.blackout;
    if (!this.frame.freeze) this.updateParticles(dt);
    this.updateSpectrum();
    this.updateRings();
    this.updateShells();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    for (const mesh of [this.particles, this.spectrum, this.rings, this.shells]) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const value of materials) value.dispose();
      mesh.removeFromParent();
    }
  }

  private resetParticles(seed: number): void {
    const random = seeded(seed);
    for (let index = 0; index < PARTICLE_MAX; index++) {
      const angle = random() * Math.PI * 2;
      const radius = COMFORT_RADIUS + 0.15 + random() * 4.8;
      this.particleX[index] = Math.cos(angle) * radius;
      this.particleY[index] = Math.sin(angle) * radius * 0.72;
      this.particleZ[index] = -12 + random() * 16;
      this.particleSpeed[index] = 0.55 + random() * 1.7;
      this.particlePhase[index] = random() * Math.PI * 2;
    }
  }

  private kickParticles(): void {
    const count = Math.min(this.particles.count, 160);
    for (let index = 0; index < count; index++) {
      this.particleSpeed[index] = Math.min(4, this.particleSpeed[index]! * 1.65);
    }
  }

  private applyInstanceColors(): void {
    const a = new Color(...this.frame.deckA.color);
    const b = new Color(...this.frame.deckB.color);
    const total = Math.max(0.0001, this.frame.deckA.weight + this.frame.deckB.weight);
    const cross = this.frame.deckB.weight / total;
    const shared = a.clone().lerp(b, cross);
    for (let index = 0; index < this.particles.count; index++) {
      const local = ((index * 0.61803398875 + this.frame.formSeed) % 1) * 0.45;
      this.particles.setColorAt(index, shared.clone().lerp(index % 2 === 0 ? a : b, local));
    }
    for (let index = 0; index < SPECTRUM_COUNT; index++) {
      this.spectrum.setColorAt(index, a.clone().lerp(b, index / (SPECTRUM_COUNT - 1)));
    }
    for (let index = 0; index < RING_COUNT; index++) {
      this.rings.setColorAt(index, index % 2 === 0 ? a : b);
    }
    for (let index = 0; index < SHELL_COUNT; index++) {
      this.shells.setColorAt(index, shared);
    }
    for (const mesh of [this.particles, this.spectrum, this.rings, this.shells]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private updateParticles(dt: number): void {
    const weight = this.frame.deckA.weight + this.frame.deckB.weight;
    const speed =
      (this.frame.deckA.speed * this.frame.deckA.weight +
        this.frame.deckB.speed * this.frame.deckB.weight) /
      Math.max(0.001, weight);
    const intensity = this.deckValue('intensity');
    const feedback = this.deckValue('feedback');
    const drive = (0.7 + this.frame.energy * 7.5) * speed * (0.65 + intensity * 0.45);
    const swirl = (this.currentSeed - 0.5) * 1.6 + this.frame.mid * 0.45 + (feedback - 0.5) * 0.35;
    for (let index = 0; index < this.particles.count; index++) {
      let x = this.particleX[index]!;
      let y = this.particleY[index]!;
      let z = this.particleZ[index]! + dt * drive * this.particleSpeed[index]!;
      const angle = swirl * dt * (0.45 + (index % 17) / 24);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const nextX = x * cos - y * sin;
      y = x * sin + y * cos;
      x = nextX;
      if (z > 4) {
        z = -12 - ((index * 0.37 + this.elapsed) % 3);
        this.particleSpeed[index] = Math.max(0.5, this.particleSpeed[index]! * 0.72);
      }
      this.particleX[index] = x;
      this.particleY[index] = y;
      this.particleZ[index] = z;
      const level = this.levels[index % SPECTRUM_COUNT] ?? 0;
      const scale = 0.55 + level * 2.2 + this.flashEnvelope * 0.8;
      this.dummy.position.set(x, y, z);
      this.dummy.rotation.set(
        this.particlePhase[index]! + this.elapsed * 0.35,
        this.elapsed * (0.2 + this.currentSeed),
        0,
      );
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.particles.setMatrixAt(index, this.dummy.matrix);
    }
    this.particles.instanceMatrix.needsUpdate = true;
  }

  private updateSpectrum(): void {
    const spin = this.elapsed * (0.08 + this.frame.mid * 0.18);
    const depth = this.deckValue('depth');
    const intensity = this.deckValue('intensity');
    for (let index = 0; index < SPECTRUM_COUNT; index++) {
      const normalized = index / (SPECTRUM_COUNT - 1);
      const helix = index % 2 === 0 ? 0 : Math.PI;
      const angle = normalized * Math.PI * 4 + helix + spin;
      const level = this.levels[index] ?? 0;
      const radius = 2.05 + depth * 0.8 + level * (0.6 + depth * 0.4);
      const y = (normalized - 0.5) * (3.6 + depth * 1.4);
      this.dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      this.dummy.rotation.set(0, -angle, Math.sin(angle * 0.5) * 0.2);
      this.dummy.scale.set(1, 0.12 + level * 1.25 * intensity + this.frame.pulse * 0.16, 1);
      this.dummy.updateMatrix();
      this.spectrum.setMatrixAt(index, this.dummy.matrix);
    }
    this.spectrum.instanceMatrix.needsUpdate = true;
  }

  private updateRings(): void {
    const feedback = this.deckValue('feedback');
    for (let index = 0; index < RING_COUNT; index++) {
      const phase =
        (index / RING_COUNT + this.elapsed * (0.025 + feedback * 0.035 + this.frame.bass * 0.1)) %
        1;
      const radius = 1.25 + phase * 3.8 + this.frame.pulse * (1 - phase) * 0.7;
      this.dummy.position.set(0, 0, -8 + phase * 10);
      this.dummy.rotation.set(
        (this.currentSeed - 0.5) * 0.9 + index * 0.025,
        this.elapsed * 0.04 + index * 0.07,
        index * 0.11,
      );
      this.dummy.scale.setScalar(radius);
      this.dummy.updateMatrix();
      this.rings.setMatrixAt(index, this.dummy.matrix);
    }
    this.rings.instanceMatrix.needsUpdate = true;
  }

  private updateShells(): void {
    const depth = this.deckValue('depth');
    const feedback = this.deckValue('feedback');
    for (let index = 0; index < SHELL_COUNT; index++) {
      const radius = 1.65 + index * (0.34 + depth * 0.16) + this.frame.mid * 0.18;
      const direction = index % 2 === 0 ? 1 : -1;
      this.dummy.position.set(0, 0, 0);
      this.dummy.rotation.set(
        this.elapsed * (0.025 + this.frame.high * 0.15) * direction + index,
        this.elapsed * (0.025 + feedback * 0.04 + this.currentSeed * 0.08) - index * 0.4,
        index * 0.23,
      );
      this.dummy.scale.setScalar(radius * (1 + this.frame.pulse * 0.025));
      this.dummy.updateMatrix();
      this.shells.setMatrixAt(index, this.dummy.matrix);
    }
    this.shells.instanceMatrix.needsUpdate = true;
  }

  private deckValue(key: 'intensity' | 'depth' | 'feedback'): number {
    const weight = this.frame.deckA.weight + this.frame.deckB.weight;
    return (
      (this.frame.deckA[key] * this.frame.deckA.weight +
        this.frame.deckB[key] * this.frame.deckB.weight) /
      Math.max(0.001, weight)
    );
  }

  private observeFrameTime(dt: number): void {
    if (!(dt > 0) || dt > 0.25) return;
    this.frameSamples.push(dt);
    if (this.frameSamples.length < 120) return;
    const sorted = [...this.frameSamples].sort((a, b) => a - b);
    const baseline = sorted[Math.max(0, Math.floor(sorted.length * 0.1))] ?? dt;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? dt;
    this.frameSamples = [];
    if (p95 > baseline * 1.35 && this.tierIndex < PARTICLE_TIERS.length - 1) {
      this.tierIndex++;
      this.particles.count = PARTICLE_TIERS[this.tierIndex]!;
      this.stableSeconds = 0;
    } else if (p95 < baseline * 1.15) {
      this.stableSeconds += p95 * 120;
      if (this.stableSeconds >= 10 && this.tierIndex > 0) {
        this.tierIndex--;
        this.particles.count = PARTICLE_TIERS[this.tierIndex]!;
        this.stableSeconds = 0;
      }
    } else {
      this.stableSeconds = 0;
    }
  }
}

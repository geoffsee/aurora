import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  TetrahedronGeometry,
  TorusGeometry,
  TorusKnotGeometry,
} from 'three';
import type { SpatialDeckFrame, SpatialVisualizerFrame } from './data-bridge.ts';
import {
  SPATIAL_COMFORT_RADIUS,
  SPATIAL_FORMATION_PROFILES,
  SPATIAL_FORMATIONS,
  type SpatialFormationContext,
  type SpatialFormationId,
  type SpatialParticleBudget,
  type SpatialPose,
  smoothSpatialWeight,
  splitSpatialParticleBudget,
  writeParticlePose,
  writeRingPose,
  writeShellPose,
  writeSpectrumPose,
} from './spatial-formations.ts';

const PARTICLE_MAX = 2_048;
const PARTICLE_TIERS = [1_536, 1_024, 768] as const;
const SPECTRUM_COUNT = 64;
const RING_COUNT = 24;
const SHELL_COUNT = 12;
const FLASH_COOLDOWN_MS = 250;
const FLASH_DECAY_SECONDS = 0.18;
const HIDDEN_WEIGHT = 0.001;
const FORMATION_HUE_SHIFT = Object.fromEntries(
  SPATIAL_FORMATIONS.map((formation, index) => [formation, ((index * 0.0618) % 0.42) - 0.12]),
) as Record<SpatialFormationId, number>;

type DeckSide = 'a' | 'b';

type SpatialGeometries = {
  particles: Record<SpatialFormationId, BufferGeometry>;
  spectrum: BoxGeometry;
  ring: TorusGeometry;
  shells: Record<SpatialFormationId, BufferGeometry>;
};

function particleGeometry(formation: SpatialFormationId): BufferGeometry {
  if (formation === 'beams' || formation === 'tunnel' || formation === 'comet') {
    return new ConeGeometry(0.045, 0.18, 5);
  }
  if (formation === 'rain' || formation === 'flow-field') {
    return new ConeGeometry(0.036, 0.22, 4);
  }
  if (formation === 'atmosphere' || formation === 'pulse' || formation === 'point-cloud') {
    return new SphereGeometry(0.055, 7, 5);
  }
  if (formation === 'swarm' || formation === 'flora') {
    return new IcosahedronGeometry(0.052, 0);
  }
  if (formation === 'mirror' || formation === 'polytope' || formation === 'hierarchy') {
    return new OctahedronGeometry(0.052, 0);
  }
  if (formation === 'sculpture') return new DodecahedronGeometry(0.055, 0);
  if (formation === 'manifold') return new TorusGeometry(0.048, 0.016, 4, 8);
  if (formation === 'tiling') return new CylinderGeometry(0.06, 0.06, 0.022, 3);
  if (
    formation === 'strobe' ||
    formation === 'flux' ||
    formation === 'lattice' ||
    formation === 'scanner' ||
    formation === 'clock'
  ) {
    return new BoxGeometry(0.052, 0.12, 0.035);
  }
  return new TetrahedronGeometry(0.055, 0);
}

function shellGeometry(formation: SpatialFormationId): BufferGeometry {
  if (formation === 'atmosphere') return new SphereGeometry(1, 10, 7);
  if (formation === 'manifold' || formation === 'linked-rings') {
    return new TorusKnotGeometry(0.74, 0.14, 40, 6);
  }
  if (formation === 'polytope') return new IcosahedronGeometry(1, 0);
  if (formation === 'fractal') return new TetrahedronGeometry(1, 0);
  if (formation === 'tiling') return new CylinderGeometry(1, 1, 0.15, 5);
  if (formation === 'hierarchy') return new OctahedronGeometry(1, 0);
  if (formation === 'flora') return new IcosahedronGeometry(1, 1);
  return new DodecahedronGeometry(1, 0);
}

function geometryRecord(
  factory: (formation: SpatialFormationId) => BufferGeometry,
): Record<SpatialFormationId, BufferGeometry> {
  return Object.fromEntries(
    SPATIAL_FORMATIONS.map((formation) => [formation, factory(formation)]),
  ) as Record<SpatialFormationId, BufferGeometry>;
}

function material(opacity: number, wireframe = false): MeshBasicMaterial {
  const value = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, wireframe });
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

function applyPose(
  dummy: Object3D,
  mesh: InstancedMesh,
  index: number,
  pose: SpatialPose,
  spatialExtent: number,
): void {
  const distance = Math.hypot(pose.x, pose.y, pose.z);
  const safeBoundary = SPATIAL_COMFORT_RADIUS + 0.22;
  const extentDistance =
    distance > safeBoundary ? safeBoundary + (distance - safeBoundary) * spatialExtent : distance;
  const positionScale = distance > Number.EPSILON ? extentDistance / distance : 1;
  dummy.position.set(pose.x * positionScale, pose.y * positionScale, pose.z * positionScale);
  dummy.rotation.set(pose.rotationX, pose.rotationY, pose.rotationZ);
  dummy.scale.set(pose.scaleX, pose.scaleY, pose.scaleZ);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

class SpatialDeckLayer {
  readonly root = new Object3D();

  private readonly dummy = new Object3D();
  private readonly particles: InstancedMesh;
  private readonly spectrum: InstancedMesh;
  private readonly rings: InstancedMesh;
  private readonly shells: InstancedMesh;
  private readonly particleMaterial = material(0.65);
  private readonly spectrumMaterial = material(0.78);
  private readonly ringMaterial = material(0.45);
  private readonly shellMaterial = material(0.24);
  private readonly randomRadius = new Float32Array(PARTICLE_MAX);
  private readonly randomAngle = new Float32Array(PARTICLE_MAX);
  private readonly randomSpeed = new Float32Array(PARTICLE_MAX);
  private readonly randomPhase = new Float32Array(PARTICLE_MAX);
  private readonly baseColor = new Color();
  private readonly accentColor = new Color();
  private readonly workingColor = new Color();
  private readonly pose: SpatialPose = {
    x: 0,
    y: 0,
    z: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
  };
  private readonly context: SpatialFormationContext = {
    index: 0,
    count: 1,
    elapsed: 0,
    seed: 0.5,
    randomRadius: 0,
    randomAngle: 0,
    randomSpeed: 1,
    randomPhase: 0,
    level: 0,
    energy: 0,
    bass: 0,
    mid: 0,
    high: 0,
    pulse: 0,
    flash: 0,
    intensity: 1,
    depth: 0,
    feedback: 0,
    speed: 1,
  };

  private frame: SpatialDeckFrame;
  private formation: SpatialFormationId;
  private targetWeight: number;
  private weight: number;
  private particleCount = 0;
  private particlesDirty = true;
  private spatialExtent = 1;
  private audioReactivity = 1;

  constructor(
    private readonly side: DeckSide,
    private readonly geometries: SpatialGeometries,
    initialFrame: SpatialDeckFrame,
  ) {
    this.frame = initialFrame;
    this.formation = initialFrame.formation;
    this.targetWeight = initialFrame.enabled ? initialFrame.weight : 0;
    this.weight = this.targetWeight;
    this.root.name = `aurora-spatial-deck-${side}`;

    this.particles = new InstancedMesh(
      geometries.particles[this.formation],
      this.particleMaterial,
      PARTICLE_MAX,
    );
    this.spectrum = new InstancedMesh(geometries.spectrum, this.spectrumMaterial, SPECTRUM_COUNT);
    this.rings = new InstancedMesh(geometries.ring, this.ringMaterial, RING_COUNT);
    this.shells = new InstancedMesh(
      geometries.shells[this.formation],
      this.shellMaterial,
      SHELL_COUNT,
    );
    this.particles.name = `${this.root.name}-particles`;
    this.spectrum.name = `${this.root.name}-spectrum`;
    this.rings.name = `${this.root.name}-rings`;
    this.shells.name = `${this.root.name}-shells`;

    for (const mesh of [this.particles, this.spectrum, this.rings, this.shells]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      this.root.add(mesh);
    }
    this.particles.count = 0;
    this.resetParticles(initialFrame.modeSeed);
    this.applyFormationStyle();
    this.applyInstanceColors();
  }

  currentWeight(): number {
    return this.weight;
  }

  commit(next: SpatialDeckFrame, reset: boolean): void {
    const layoutChanged =
      next.formation !== this.formation || Math.abs(next.modeSeed - this.frame.modeSeed) > 1e-9;
    const colorChanged =
      next.color[0] !== this.frame.color[0] ||
      next.color[1] !== this.frame.color[1] ||
      next.color[2] !== this.frame.color[2];
    this.frame = next;
    this.targetWeight = next.enabled ? next.weight : 0;
    if (layoutChanged) {
      this.formation = next.formation;
      this.particles.geometry = this.geometries.particles[this.formation];
      this.shells.geometry = this.geometries.shells[this.formation];
      this.applyFormationStyle();
    }
    if (layoutChanged || reset) this.resetParticles(next.modeSeed);
    if (layoutChanged || colorChanged) this.applyInstanceColors();
  }

  advanceWeight(dt: number): void {
    this.weight = smoothSpatialWeight(this.weight, this.targetWeight, dt);
  }

  setParticleCount(count: number): void {
    const density = SPATIAL_FORMATION_PROFILES[this.formation].particles;
    const next = Math.max(
      0,
      Math.min(PARTICLE_MAX, Math.floor(count * density * this.frame.xrDensity)),
    );
    if (next !== this.particleCount) this.particlesDirty = true;
    this.particleCount = next;
    this.particles.count = next;
  }

  step(
    frame: SpatialVisualizerFrame,
    elapsed: number,
    flashEnvelope: number,
    particleOpacityWeight: number,
  ): void {
    const visible = this.weight > HIDDEN_WEIGHT;
    this.root.visible = visible;
    if (!visible) return;

    const profile = SPATIAL_FORMATION_PROFILES[this.formation];
    const structure = this.frame.xrStructure;
    const reactiveEnergy = frame.energy * frame.xrAudioReactivity;
    const reactiveBass = frame.bass * frame.xrAudioReactivity;
    const reactiveMid = frame.mid * frame.xrAudioReactivity;
    const reactiveHigh = frame.high * frame.xrAudioReactivity;
    const reactiveFlash = flashEnvelope * frame.xrAudioReactivity;
    const flashGain = 1 + Math.min(0.35, reactiveFlash * 0.35);
    this.particleMaterial.opacity = MathUtils.clamp(
      Math.min(0.88, 0.5 + reactiveEnergy * 0.28) * flashGain * particleOpacityWeight,
      0,
      1,
    );
    this.spectrumMaterial.opacity = MathUtils.clamp(
      Math.min(0.9, 0.55 + reactiveHigh * 0.28) *
        flashGain *
        this.weight *
        profile.spectrum *
        structure,
      0,
      1,
    );
    this.ringMaterial.opacity = frame.rings
      ? MathUtils.clamp(
          Math.min(0.78, frame.ringOpacity * (0.65 + reactiveBass * 0.65)) *
            flashGain *
            this.weight *
            profile.rings *
            structure,
          0,
          1,
        )
      : 0;
    this.shellMaterial.opacity = MathUtils.clamp(
      Math.min(0.5, 0.16 + reactiveMid * 0.2) *
        flashGain *
        this.weight *
        profile.shells *
        structure,
      0,
      1,
    );

    this.rings.count =
      frame.rings && profile.rings * structure > HIDDEN_WEIGHT
        ? Math.max(1, Math.ceil(RING_COUNT * profile.rings * structure))
        : 0;
    this.shells.count =
      profile.shells * structure > HIDDEN_WEIGHT
        ? Math.max(1, Math.ceil(SHELL_COUNT * profile.shells * structure))
        : 0;
    this.particles.visible = this.particleCount > 0;
    this.spectrum.visible = profile.spectrum * structure > HIDDEN_WEIGHT;
    this.rings.visible = this.rings.count > 0;
    this.shells.visible = this.shells.count > 0;

    this.prepareContext(frame, elapsed, flashEnvelope);
    if (this.particles.visible && (!frame.freeze || this.particlesDirty)) this.updateParticles();
    if (this.spectrum.visible) this.updateSpectrum();
    if (this.rings.visible) this.updateRings();
    if (this.shells.visible) this.updateShells();
    this.particlesDirty = false;
  }

  dispose(): void {
    for (const mesh of [this.particles, this.spectrum, this.rings, this.shells]) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const value of materials) value.dispose();
      mesh.removeFromParent();
    }
    this.root.removeFromParent();
  }

  private prepareContext(
    frame: SpatialVisualizerFrame,
    elapsed: number,
    flashEnvelope: number,
  ): void {
    this.context.elapsed = elapsed;
    this.context.seed = this.frame.modeSeed;
    this.audioReactivity = frame.xrAudioReactivity;
    this.spatialExtent = frame.xrSpatialExtent;
    this.context.energy = frame.energy * this.audioReactivity;
    this.context.bass = frame.bass * this.audioReactivity;
    this.context.mid = frame.mid * this.audioReactivity;
    this.context.high = frame.high * this.audioReactivity;
    this.context.pulse = frame.pulse * this.audioReactivity;
    this.context.flash = flashEnvelope * this.audioReactivity;
    this.context.intensity = this.frame.intensity;
    this.context.depth = this.frame.depth;
    this.context.feedback = this.frame.feedback;
    this.context.speed = this.frame.speed;
  }

  private resetParticles(seed: number): void {
    const sideOffset = this.side === 'a' ? 0.117 : 0.731;
    const random = seeded((seed + sideOffset) % 1);
    for (let index = 0; index < PARTICLE_MAX; index++) {
      this.randomRadius[index] = random();
      this.randomAngle[index] = random() * Math.PI * 2;
      this.randomSpeed[index] = 0.55 + random() * 1.7;
      this.randomPhase[index] = random();
    }
    this.particlesDirty = true;
  }

  private applyFormationStyle(): void {
    const wireframe = SPATIAL_FORMATION_PROFILES[this.formation].shellWireframe;
    if (this.shellMaterial.wireframe === wireframe) return;
    this.shellMaterial.wireframe = wireframe;
    this.shellMaterial.needsUpdate = true;
  }

  private applyInstanceColors(): void {
    this.baseColor.setRGB(...this.frame.color);
    const hueShift = FORMATION_HUE_SHIFT[this.formation];
    this.accentColor
      .copy(this.baseColor)
      .offsetHSL(hueShift + this.frame.modeSeed * 0.035, 0, 0.08);

    for (let index = 0; index < PARTICLE_MAX; index++) {
      const amount = ((index * 0.61803398875 + this.frame.modeSeed) % 1) * 0.62;
      this.workingColor.copy(this.baseColor).lerp(this.accentColor, amount);
      this.particles.setColorAt(index, this.workingColor);
    }
    for (let index = 0; index < SPECTRUM_COUNT; index++) {
      this.workingColor
        .copy(this.baseColor)
        .lerp(this.accentColor, index / Math.max(1, SPECTRUM_COUNT - 1));
      this.spectrum.setColorAt(index, this.workingColor);
    }
    for (let index = 0; index < RING_COUNT; index++) {
      this.rings.setColorAt(index, index % 2 === 0 ? this.baseColor : this.accentColor);
    }
    for (let index = 0; index < SHELL_COUNT; index++) {
      this.workingColor
        .copy(this.baseColor)
        .lerp(this.accentColor, index / Math.max(1, SHELL_COUNT - 1));
      this.shells.setColorAt(index, this.workingColor);
    }
    for (const mesh of [this.particles, this.spectrum, this.rings, this.shells]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private updateParticles(): void {
    this.context.count = Math.max(1, this.particleCount);
    for (let index = 0; index < this.particleCount; index++) {
      this.context.index = index;
      this.context.randomRadius = this.randomRadius[index] ?? 0;
      this.context.randomAngle = this.randomAngle[index] ?? 0;
      this.context.randomSpeed = this.randomSpeed[index] ?? 1;
      this.context.randomPhase = this.randomPhase[index] ?? 0;
      this.context.level = this.levelAt(index % SPECTRUM_COUNT);
      writeParticlePose(this.formation, this.context, this.pose);
      applyPose(this.dummy, this.particles, index, this.pose, this.spatialExtent);
    }
    this.particles.instanceMatrix.needsUpdate = true;
  }

  private updateSpectrum(): void {
    this.context.count = SPECTRUM_COUNT;
    for (let index = 0; index < SPECTRUM_COUNT; index++) {
      this.context.index = index;
      this.context.level = this.levelAt(index);
      writeSpectrumPose(this.formation, this.context, this.pose);
      applyPose(this.dummy, this.spectrum, index, this.pose, this.spatialExtent);
    }
    this.spectrum.instanceMatrix.needsUpdate = true;
  }

  private updateRings(): void {
    this.context.count = this.rings.count;
    this.context.level = 0;
    for (let index = 0; index < this.rings.count; index++) {
      this.context.index = index;
      writeRingPose(this.formation, this.context, this.pose);
      applyPose(this.dummy, this.rings, index, this.pose, this.spatialExtent);
    }
    this.rings.instanceMatrix.needsUpdate = true;
  }

  private updateShells(): void {
    this.context.count = this.shells.count;
    this.context.level = 0;
    for (let index = 0; index < this.shells.count; index++) {
      this.context.index = index;
      writeShellPose(this.formation, this.context, this.pose);
      applyPose(this.dummy, this.shells, index, this.pose, this.spatialExtent);
    }
    this.shells.instanceMatrix.needsUpdate = true;
  }

  private levelAt(index: number): number {
    return (this.levels?.[index] ?? 0) * this.audioReactivity;
  }

  private levels: Float32Array<ArrayBuffer> | null = null;

  setLevels(levels: Float32Array<ArrayBuffer>): void {
    this.levels = levels;
  }
}

export class SpatialSceneController {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(70, 1, 0.05, 50);

  private readonly root = new Object3D();
  private readonly geometries: SpatialGeometries = {
    particles: geometryRecord(particleGeometry),
    spectrum: new BoxGeometry(0.045, 1, 0.045),
    ring: new TorusGeometry(1, 0.012, 6, 64),
    shells: geometryRecord(shellGeometry),
  };
  private readonly deckA: SpatialDeckLayer;
  private readonly deckB: SpatialDeckLayer;
  private readonly levels = new Float32Array(SPECTRUM_COUNT);
  private readonly particleBudget: SpatialParticleBudget = { deckA: 0, deckB: 0 };
  private frame: SpatialVisualizerFrame;
  private elapsed = 0;
  private previousTimeMs = 0;
  private lastBeatVersion: number;
  private lastFlashVersion: number;
  private lastResetVersion: number;
  private lastFlashAt = Number.NEGATIVE_INFINITY;
  private flashEnvelope = 0;
  private tierIndex = 0;
  private frameSamples: number[] = [];
  private stableSeconds = 0;

  constructor(initialFrame: SpatialVisualizerFrame) {
    this.frame = initialFrame;
    this.lastBeatVersion = initialFrame.beatVersion;
    this.lastFlashVersion = initialFrame.flashVersion;
    this.lastResetVersion = initialFrame.resetVersion;
    this.scene.background = new Color(0x000000);
    this.camera.position.set(0, 0, 0);
    this.scene.add(this.root);

    this.deckA = new SpatialDeckLayer('a', this.geometries, initialFrame.deckA);
    this.deckB = new SpatialDeckLayer('b', this.geometries, initialFrame.deckB);
    this.root.add(this.deckA.root, this.deckB.root);
    this.commit(initialFrame);
  }

  commit(next: SpatialVisualizerFrame): void {
    this.frame = next;
    for (let index = 0; index < SPECTRUM_COUNT; index++) {
      const target = next.levels64[index] ?? 0;
      const alpha = target >= this.levels[index]! ? 0.65 : 0.15;
      this.levels[index] = mix(this.levels[index]!, target, alpha);
    }
    this.deckA.setLevels(this.levels);
    this.deckB.setLevels(this.levels);

    const resetTriggered = next.resetVersion !== this.lastResetVersion;
    this.lastResetVersion = next.resetVersion;
    this.deckA.commit(next.deckA, resetTriggered);
    this.deckB.commit(next.deckB, resetTriggered);

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
    }
  }

  step(timeMs: number): void {
    if (this.previousTimeMs === 0) this.previousTimeMs = timeMs;
    const dt = Math.min(0.05, Math.max(0, (timeMs - this.previousTimeMs) / 1_000));
    this.previousTimeMs = timeMs;
    this.observeFrameTime(dt);
    if (!this.frame.freeze) this.elapsed += dt;
    this.flashEnvelope *= Math.exp(-dt / FLASH_DECAY_SECONDS);

    this.deckA.advanceWeight(dt);
    this.deckB.advanceWeight(dt);
    const weightA = this.deckA.currentWeight();
    const weightB = this.deckB.currentWeight();
    const totalWeight = Math.min(1, weightA + weightB);
    splitSpatialParticleBudget(
      PARTICLE_TIERS[this.tierIndex]!,
      weightA,
      weightB,
      this.particleBudget,
    );
    this.deckA.setParticleCount(this.particleBudget.deckA);
    this.deckB.setParticleCount(this.particleBudget.deckB);

    this.root.visible = !this.frame.blackout;
    if (!this.root.visible) return;
    this.deckA.step(this.frame, this.elapsed, this.flashEnvelope, totalWeight);
    this.deckB.step(this.frame, this.elapsed, this.flashEnvelope, totalWeight);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.deckA.dispose();
    this.deckB.dispose();
    for (const geometry of Object.values(this.geometries.particles)) geometry.dispose();
    this.geometries.spectrum.dispose();
    this.geometries.ring.dispose();
    for (const geometry of Object.values(this.geometries.shells)) geometry.dispose();
    this.root.removeFromParent();
  }

  private observeFrameTime(dt: number): void {
    if (!(dt > 0) || dt > 0.25) return;
    this.frameSamples.push(dt);
    if (this.frameSamples.length < 120) return;
    this.frameSamples.sort((a, b) => a - b);
    const baseline =
      this.frameSamples[Math.max(0, Math.floor(this.frameSamples.length * 0.1))] ?? dt;
    const p95 = this.frameSamples[Math.floor(this.frameSamples.length * 0.95)] ?? dt;
    this.frameSamples.length = 0;
    if (p95 > baseline * 1.35 && this.tierIndex < PARTICLE_TIERS.length - 1) {
      this.tierIndex++;
      this.stableSeconds = 0;
    } else if (p95 < baseline * 1.15) {
      this.stableSeconds += p95 * 120;
      if (this.stableSeconds >= 10 && this.tierIndex > 0) {
        this.tierIndex--;
        this.stableSeconds = 0;
      }
    } else {
      this.stableSeconds = 0;
    }
  }
}

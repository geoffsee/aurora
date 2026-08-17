import { InstancedMesh, Matrix4, MeshBasicMaterial } from 'three';
import { describe, expect, test } from 'vitest';
import { VISUAL_MODE_CATALOG } from '../../shared/visual-mode-catalog.ts';
import { VisualizerDataBridge } from '../../web/webxr/data-bridge.ts';
import {
  LEGACY_SPATIAL_FORMATIONS,
  resolveSpatialFormation,
  SPATIAL_COMFORT_RADIUS,
  SPATIAL_FORMATION_PROFILES,
  SPATIAL_FORMATIONS,
  type SpatialFormationContext,
  type SpatialPose,
  smoothSpatialWeight,
  spatialModeSeed,
  splitSpatialParticleBudget,
  writeParticlePose,
  writeRingPose,
  writeShellPose,
  writeSpectrumPose,
} from '../../web/webxr/spatial-formations.ts';
import { SpatialSceneController } from '../../web/webxr/spatial-scene.ts';

function context(index = 0): SpatialFormationContext {
  return {
    index,
    count: 64,
    elapsed: 12.5,
    seed: 0.37,
    randomRadius: ((index * 37) % 101) / 100,
    randomAngle: ((index * 17) % 97) / 97,
    randomSpeed: 0.65 + ((index * 11) % 73) / 50,
    randomPhase: ((index * 29) % 89) / 89,
    level: ((index * 13) % 64) / 63,
    energy: 0.64,
    bass: 0.72,
    mid: 0.48,
    high: 0.57,
    pulse: 0.8,
    flash: 0.25,
    intensity: 0.9,
    depth: 0.42,
    feedback: 0.36,
    speed: 1.15,
  };
}

function pose(): SpatialPose {
  return {
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
}

describe('WebXR spatial formations', () => {
  test('maps existing deck identities onto semantic formations', () => {
    expect(resolveSpatialFormation(0, 'beams')).toBe('beams');
    expect(resolveSpatialFormation(1, 'tunnel')).toBe('tunnel');
    expect(resolveSpatialFormation(7, 'orbit')).toBe('orbit');
    expect(resolveSpatialFormation(25, 'hypercube')).toBe('polytope');
    expect(resolveSpatialFormation(19, 'nebula')).toBe('atmosphere');
    expect(resolveSpatialFormation(8, 'pulse')).toBe('pulse');
    expect(resolveSpatialFormation(41, 'lorenz-attractor')).toBe('flow-field');
    expect(resolveSpatialFormation(-1, 'midnight-vortex')).toBe('vortex');

    const custom = resolveSpatialFormation(-1, 'custom-pack-with-no-hint');
    expect(SPATIAL_FORMATIONS).toContain(custom);
    expect(resolveSpatialFormation(-1, 'custom-pack-with-no-hint')).toBe(custom);
    expect(spatialModeSeed(-1, 'custom-pack-with-no-hint')).toBe(
      spatialModeSeed(-1, 'custom-pack-with-no-hint'),
    );
  });

  test('explicitly covers the complete control-panel catalog', () => {
    expect(LEGACY_SPATIAL_FORMATIONS).toHaveLength(VISUAL_MODE_CATALOG.length);
    for (const entry of VISUAL_MODE_CATALOG) {
      expect(resolveSpatialFormation(entry.id, '')).toBe(LEGACY_SPATIAL_FORMATIONS[entry.id]);
      expect(SPATIAL_FORMATIONS).toContain(LEGACY_SPATIAL_FORMATIONS[entry.id]);
    }
    expect(new Set(LEGACY_SPATIAL_FORMATIONS.slice(0, 25)).size).toBeGreaterThanOrEqual(20);
    expect(new Set(LEGACY_SPATIAL_FORMATIONS).size).toBeGreaterThanOrEqual(25);
  });

  test('routes named packages from the launchpad by visual character', () => {
    const expected = new Map<string, (typeof SPATIAL_FORMATIONS)[number]>([
      ['crystal-bloom-engine', 'bloom'],
      ['event-horizon-choir', 'vortex'],
      ['idk', 'flow-field'],
      ['infinity', 'linked-rings'],
      ['morphing-mura', 'manifold'],
      ['muramasa', 'manifold'],
      ['point-cloud-warp-tunnel', 'tunnel'],
      ['point-cloud-canyon', 'ripple'],
      ['point-cloud-waves', 'ripple'],
      ['point-cloud-orbital-globe', 'orbit'],
      ['point-cloud-quantum-mycelium', 'flora'],
      ['point-cloud-mobius-weather', 'atmosphere'],
      ['point-cloud-negative-fauna', 'swarm'],
      ['point-cloud-neutrino-cathedral', 'lattice'],
      ['point-cloud-chrono-fossil', 'hierarchy'],
      ['point-cloud-supernova', 'burst'],
      ['neon-signal-rain', 'rain'],
      ['liquid-mirror-covenant', 'mirror'],
      ['solar-flare-choir', 'comet'],
      ['inkbloom', 'bloom'],
      ['scanlab-holo', 'scanner'],
      ['lumen-coral', 'flora'],
      ['recursive-maw', 'vortex'],
      ['bass-monolith', 'sculpture'],
      ['data-rain', 'rain'],
      ['topo-lines', 'tiling'],
      ['glass-ribbons', 'flow-field'],
      ['aurora-curtains', 'rain'],
      ['untitled-three-webgpu', 'manifold'],
      ['velvet-lightning', 'comet'],
      ['gummy-wire-bear', 'sculpture'],
      ['fierce-walking-wolf', 'sculpture'],
      ['spectral-ghost', 'sculpture'],
      ['aurora-crown', 'bloom'],
    ]);
    for (const [slug, formation] of expected) {
      expect(resolveSpatialFormation(-1, slug)).toBe(formation);
    }
  });

  test('keeps the adaptive particle budget bounded across the crossfade', () => {
    const budget = { deckA: 0, deckB: 0 };
    splitSpatialParticleBudget(1_536, 1, 0, budget);
    expect(budget).toEqual({ deckA: 1_536, deckB: 0 });
    splitSpatialParticleBudget(1_536, 0.5, 0.5, budget);
    expect(budget).toEqual({ deckA: 768, deckB: 768 });
    splitSpatialParticleBudget(1_536, 0, 1, budget);
    expect(budget).toEqual({ deckA: 0, deckB: 1_536 });
    splitSpatialParticleBudget(1_536, 0, 0, budget);
    expect(budget).toEqual({ deckA: 0, deckB: 0 });

    const next = smoothSpatialWeight(0, 1, 0.05);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
    expect(smoothSpatialWeight(0.9995, 1, 0.05)).toBe(1);
  });

  test('uses restrained layer profiles without wireframe clutter', () => {
    for (const formation of SPATIAL_FORMATIONS) {
      const profile = SPATIAL_FORMATION_PROFILES[formation];
      for (const value of [profile.particles, profile.spectrum, profile.rings, profile.shells]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    expect(SPATIAL_FORMATION_PROFILES.atmosphere.rings).toBe(0);
    expect(SPATIAL_FORMATION_PROFILES.vortex.shells).toBe(0);
    expect(
      SPATIAL_FORMATIONS.some((formation) => SPATIAL_FORMATION_PROFILES[formation].shellWireframe),
    ).toBe(false);
    expect(
      SPATIAL_FORMATIONS.filter((formation) => SPATIAL_FORMATION_PROFILES[formation].rings > 0),
    ).toHaveLength(11);
  });

  test('produces deterministic, distinct, comfort-safe particle layouts', () => {
    const signatures = new Set<string>();
    for (const formation of SPATIAL_FORMATIONS) {
      const first = pose();
      const repeated = pose();
      writeParticlePose(formation, context(37), first);
      writeParticlePose(formation, context(37), repeated);
      expect(repeated).toEqual(first);
      signatures.add([first.x, first.y, first.z].map((value) => value.toFixed(4)).join(':'));

      for (let index = 0; index < 256; index++) {
        const output = pose();
        writeParticlePose(formation, context(index), output);
        expect(Object.values(output).every(Number.isFinite)).toBe(true);
        expect(Math.hypot(output.x, output.y, output.z)).toBeGreaterThanOrEqual(
          SPATIAL_COMFORT_RADIUS + 0.219,
        );
      }
    }
    expect(signatures.size).toBe(SPATIAL_FORMATIONS.length);
  });

  test('keeps every structural transform finite for all formations', () => {
    const writers = [writeSpectrumPose, writeRingPose, writeShellPose] as const;
    for (const formation of SPATIAL_FORMATIONS) {
      for (const writer of writers) {
        for (let index = 0; index < 64; index++) {
          const output = pose();
          writer(formation, context(index), output);
          expect(Object.values(output).every(Number.isFinite)).toBe(true);
          expect(output.scaleX).toBeGreaterThan(0);
          expect(output.scaleY).toBeGreaterThan(0);
          expect(output.scaleZ).toBeGreaterThan(0);
        }
      }
    }
  });

  test('keeps surrounding rings and shells outside the comfort radius', () => {
    for (const formation of SPATIAL_FORMATIONS) {
      for (let index = 0; index < 64; index++) {
        const ring = pose();
        writeRingPose(formation, context(index), ring);
        if (Math.hypot(ring.x, ring.y, ring.z) < SPATIAL_COMFORT_RADIUS) {
          expect(Math.min(ring.scaleX, ring.scaleY) - 0.03).toBeGreaterThan(SPATIAL_COMFORT_RADIUS);
        }

        const shell = pose();
        writeShellPose(formation, context(index), shell);
        if (Math.hypot(shell.x, shell.y, shell.z) < SPATIAL_COMFORT_RADIUS) {
          expect(Math.min(shell.scaleX, shell.scaleY, shell.scaleZ)).toBeGreaterThan(
            SPATIAL_COMFORT_RADIUS,
          );
        }
      }
    }
  });

  test('renders both deck layers while keeping one global particle budget', () => {
    const bridge = new VisualizerDataBridge('main');
    const controller = new SpatialSceneController(bridge.snapshot());
    controller.step(1_000);

    const particlesA = controller.scene.getObjectByName('aurora-spatial-deck-a-particles');
    const particlesB = controller.scene.getObjectByName('aurora-spatial-deck-b-particles');
    const ringsA = controller.scene.getObjectByName('aurora-spatial-deck-a-rings');
    const ringsB = controller.scene.getObjectByName('aurora-spatial-deck-b-rings');
    expect(particlesA).toBeInstanceOf(InstancedMesh);
    expect(particlesB).toBeInstanceOf(InstancedMesh);
    expect(ringsA).toBeInstanceOf(InstancedMesh);
    expect(ringsB).toBeInstanceOf(InstancedMesh);
    if (
      !(particlesA instanceof InstancedMesh) ||
      !(particlesB instanceof InstancedMesh) ||
      !(ringsA instanceof InstancedMesh) ||
      !(ringsB instanceof InstancedMesh)
    ) {
      return;
    }
    expect(particlesA.count).toBeGreaterThan(0);
    expect(particlesB.count).toBeGreaterThan(0);
    expect(particlesA.count + particlesB.count).toBeLessThanOrEqual(1_536);
    expect(particlesA.geometry.type).toBe('ConeGeometry');
    expect(particlesB.geometry.type).toBe('ConeGeometry');
    expect(ringsA.count).toBeLessThanOrEqual(2);
    expect(ringsB.count).toBeLessThanOrEqual(4);

    bridge.ingest({
      address: '/aurora/control/state',
      args: [{ deckAMode: 19, deckAPresetSlug: 'nebula', deckBMode: 8, deckBPresetSlug: 'pulse' }],
    });
    controller.commit(bridge.snapshot());
    controller.step(1_050);
    expect(particlesA.geometry.type).toBe('SphereGeometry');
    expect(particlesB.geometry.type).toBe('SphereGeometry');

    bridge.ingest({ address: '/aurora/control/state', args: [{ crossfade: 0 }] });
    controller.commit(bridge.snapshot());
    for (let index = 2; index <= 17; index++) controller.step(1_000 + index * 50);
    expect(particlesA.count).toBe(1_536);
    expect(particlesB.count).toBe(0);
    controller.dispose();
  });

  test('applies automatable density, structure, extent, and audio reactivity', () => {
    const bridge = new VisualizerDataBridge('main', () => 100);
    bridge.ingest({
      address: '/aurora/control/state',
      args: [
        {
          xrFollowDeckModes: false,
          xrFormationA: 4,
          xrFormationB: 21,
          xrDensityA: 0.25,
          xrDensityB: 0.5,
          xrStructureA: 0,
          xrStructureB: 1,
          xrSpatialExtent: 1.75,
          xrAudioReactivity: 1,
          demoMode: true,
        },
      ],
    });
    bridge.ingest({
      address: '/aurora/demo/audio',
      args: [{ energy: 1, bass: 1, mid: 1, high: 1, pulse: 1, deckA: 1, deckB: 1 }],
    });

    const controller = new SpatialSceneController(bridge.snapshot());
    controller.step(1_000);
    const particlesA = controller.scene.getObjectByName('aurora-spatial-deck-a-particles');
    const particlesB = controller.scene.getObjectByName('aurora-spatial-deck-b-particles');
    const spectrumA = controller.scene.getObjectByName('aurora-spatial-deck-a-spectrum');
    const ringsA = controller.scene.getObjectByName('aurora-spatial-deck-a-rings');
    const shellsA = controller.scene.getObjectByName('aurora-spatial-deck-a-shells');
    if (
      !(particlesA instanceof InstancedMesh) ||
      !(particlesB instanceof InstancedMesh) ||
      !(spectrumA instanceof InstancedMesh) ||
      !(ringsA instanceof InstancedMesh) ||
      !(shellsA instanceof InstancedMesh) ||
      !(particlesA.material instanceof MeshBasicMaterial)
    ) {
      throw new Error('expected WebXR instanced mesh layers');
    }

    expect(particlesA.geometry.type).toBe('SphereGeometry');
    expect(particlesB.geometry.type).toBe('DodecahedronGeometry');
    expect(particlesA.count).toBe(192);
    expect(particlesB.count).toBe(76);
    expect(spectrumA.visible).toBe(false);
    expect(ringsA.count).toBe(0);
    expect(shellsA.count).toBe(0);

    const matrix = new Matrix4();
    particlesA.getMatrixAt(0, matrix);
    const wideDistance = Math.hypot(
      matrix.elements[12] ?? 0,
      matrix.elements[13] ?? 0,
      matrix.elements[14] ?? 0,
    );
    const reactiveOpacity = particlesA.material.opacity;

    bridge.ingest({
      address: '/aurora/control/state',
      args: [{ xrSpatialExtent: 0.65, xrAudioReactivity: 0 }],
    });
    controller.commit(bridge.snapshot());
    controller.step(1_000);
    particlesA.getMatrixAt(0, matrix);
    const narrowDistance = Math.hypot(
      matrix.elements[12] ?? 0,
      matrix.elements[13] ?? 0,
      matrix.elements[14] ?? 0,
    );
    expect(narrowDistance).toBeLessThan(wideDistance);
    expect(narrowDistance).toBeGreaterThanOrEqual(SPATIAL_COMFORT_RADIUS + 0.219);
    expect(particlesA.material.opacity).toBeLessThan(reactiveOpacity);
    controller.dispose();
  });
});

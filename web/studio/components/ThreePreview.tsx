import { Box, Text } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import {
  COMPILED_MODE_WIRE_VERSION,
  type CompiledModeWire,
} from '../../../shared/compiled-mode-wire.ts';
import { AuroraThreeDeckHost } from '../../three-runtime.ts';
import { compileThreeSource } from '../lib/compile-three.ts';
import type { StudioKnobs } from '../lib/sketch-store.ts';

export function ThreePreview({
  source,
  renderer,
  requiresNativeWebGPU,
  knobs,
}: {
  source: string;
  renderer: 'webgl2' | 'webgpu';
  requiresNativeWebGPU: boolean;
  knobs: StudioKnobs;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hostRef = useRef<AuroraThreeDeckHost | null>(null);
  const knobsRef = useRef(knobs);
  const [status, setStatus] = useState('Compiling…');
  knobsRef.current = knobs;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const host = new AuroraThreeDeckHost(
      'deck-a',
      stage,
      () => {
        const current = knobsRef.current;
        return {
          mix: current.alpha,
          intensity: current.intensity,
          depth: current.depth,
          feedback: current.feedback,
          speed: current.speed,
          palette: {
            hue: current.hue,
            saturation: current.sat,
            brightness: current.bright,
            rgb: [0.12, 0.72, 0.42],
          },
          blackout: false,
          freeze: false,
          // The studio preview has no deck switch — the sketch under edit is
          // always the thing you want to see.
          enabled: true,
          flashVersion: 0,
          resetVersion: 0,
          cueVersion: 0,
          energy: current.energy,
          bass: current.bass,
          mid: current.mid,
          high: current.high,
          pulse: current.pulse,
          tempo: 124,
          beat: 0,
        };
      },
      (message) => setStatus(message),
    );
    hostRef.current = host;
    return () => {
      host.dispose();
      hostRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      const compiled = compileThreeSource(source);
      if (!compiled.ok) {
        setStatus(compiled.errors.map((error) => error.message).join('; '));
        return;
      }
      const wire: CompiledModeWire = {
        wireVersion: COMPILED_MODE_WIRE_VERSION,
        epoch: 0,
        deck: 'deck-a',
        slug: 'studio-preview',
        label: 'Studio Preview',
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
            renderer,
            requiresNativeWebGPU,
            assets: [],
            moduleSource: compiled.javascript,
            sourceMap: compiled.sourceMap,
          },
        ],
      };
      setStatus(`Initializing ${renderer === 'webgpu' ? 'WebGPU' : 'WebGL2'}…`);
      void hostRef.current?.applyWire(wire).then((ok) => {
        if (ok) setStatus(`Live · ${renderer}`);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [renderer, requiresNativeWebGPU, source]);

  return (
    <Box
      ref={stageRef}
      className="studio-three-preview"
      h="100%"
      position="relative"
      overflow="hidden"
    >
      <Text
        position="absolute"
        zIndex={3}
        left={2}
        bottom={2}
        fontSize="10px"
        color="whiteAlpha.700"
      >
        {status}
      </Text>
    </Box>
  );
}

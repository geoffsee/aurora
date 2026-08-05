import { Box, Text } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import { PackPreview, type PackPreviewStatus } from '../lib/pack-preview.ts';
import type { StudioKnobs } from '../lib/sketch-store.ts';

export function PreviewPanel({ wgsl, knobs }: { wgsl: string; knobs: StudioKnobs }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<PackPreview | null>(null);
  const knobsRef = useRef(knobs);
  const wgslRef = useRef(wgsl);
  const [status, setStatus] = useState<PackPreviewStatus>({ state: 'idle' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  knobsRef.current = knobs;
  wgslRef.current = wgsl;

  // Mount-only: construct GPU preview once; knobs/wgsl flow through refs + later effects.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preview = new PackPreview(canvas);
    previewRef.current = preview;
    preview.onStatus(setStatus);
    let cancelled = false;
    void preview.init().then((ok) => {
      if (cancelled || !ok) return;
      preview.setKnobs(knobsRef.current);
      void preview.setSource(wgslRef.current);
    });
    return () => {
      cancelled = true;
      preview.destroy();
      previewRef.current = null;
    };
  }, []);

  useEffect(() => {
    previewRef.current?.setKnobs(knobs);
  }, [knobs]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void previewRef.current?.setSource(wgsl);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [wgsl]);

  return (
    <Box h="100%" display="flex" flexDirection="column" gap={2}>
      <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" color="whiteAlpha.700">
        PREVIEW · WebGPU
      </Text>
      <Box flex="1" minH="240px" position="relative">
        <canvas ref={canvasRef} className="studio-canvas" />
      </Box>
      <StatusLine status={status} />
    </Box>
  );
}

function StatusLine({ status }: { status: PackPreviewStatus }) {
  if (status.state === 'ready') {
    return <Text className="studio-status-ok">Pipeline ready · pack-v1 bus live</Text>;
  }
  if (status.state === 'compiling') {
    return <Text className="studio-status-warn">Compiling WGSL…</Text>;
  }
  if (status.state === 'no-webgpu') {
    return <Text className="studio-status-warn">{status.message}</Text>;
  }
  if (status.state === 'error') {
    return <Text className="studio-status-error">{status.message}</Text>;
  }
  return <Text className="studio-status-warn">Starting preview…</Text>;
}

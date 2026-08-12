import { Box, Text, VStack } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
import type { AudioMappingSet } from '../../../shared/audio-mapping-v1.ts';
import {
  PackPreview,
  type PackPreviewMetrics,
  type PackPreviewStatus,
} from '../lib/pack-preview.ts';
import type { StudioKnobs } from '../lib/sketch-store.ts';
import type { WgslDiagnostic } from '../lib/wgsl-diagnostics.ts';

const FPS_WARN_MS = 50;
const FPS_ERROR_MS = 40;
const AVG_FRAME_MS_WARN = 22.5; // 44.4fps
const AVG_FRAME_MS_ERROR = 33.4; // 30fps
const STALL_PERCENT_WARN = 10;
const STALL_PERCENT_ERROR = 20;
const COMPILE_MS_WARN = 16;
const COMPILE_MS_ERROR = 40;
const HEAP_WARN_RATIO = 75;
const HEAP_ERROR_RATIO = 90;

export function PreviewPanel({
  wgsl,
  knobs,
  audioMappings,
  onDiagnostics,
  onMetrics,
}: {
  wgsl: string;
  knobs: StudioKnobs;
  audioMappings: AudioMappingSet;
  onDiagnostics?: (diagnostics: readonly WgslDiagnostic[]) => void;
  onMetrics?: (metrics: PackPreviewMetrics) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<PackPreview | null>(null);
  const knobsRef = useRef(knobs);
  const wgslRef = useRef(wgsl);
  const mappingsRef = useRef(audioMappings);
  const [status, setStatus] = useState<PackPreviewStatus>({ state: 'idle' });
  const [metrics, setMetrics] = useState<PackPreviewMetrics | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  knobsRef.current = knobs;
  wgslRef.current = wgsl;
  mappingsRef.current = audioMappings;

  // Mount-only: construct GPU preview once; knobs/wgsl flow through refs + later effects.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const preview = new PackPreview(canvas);
    previewRef.current = preview;
    preview.onStatus((nextStatus) => {
      setStatus(nextStatus);
      if (nextStatus.state === 'error') {
        onDiagnostics?.(nextStatus.diagnostics);
      } else {
        onDiagnostics?.([]);
      }
    });
    preview.onMetrics((nextMetrics) => {
      setMetrics(nextMetrics);
      onMetrics?.(nextMetrics);
    });
    let cancelled = false;
    void preview.init().then((ok) => {
      if (cancelled || !ok) return;
      preview.setKnobs(knobsRef.current);
      preview.setAudioMappings(mappingsRef.current);
      void preview.setSource(wgslRef.current);
    });
    return () => {
      cancelled = true;
      preview.destroy();
      previewRef.current = null;
    };
  }, [onDiagnostics, onMetrics]);

  useEffect(() => {
    previewRef.current?.setKnobs(knobs);
  }, [knobs]);

  useEffect(() => {
    previewRef.current?.setAudioMappings(audioMappings);
  }, [audioMappings]);

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
      <PreviewMetrics metrics={metrics} />
    </Box>
  );
}

function PreviewMetrics({ metrics }: { metrics: PackPreviewMetrics | null }) {
  if (!metrics) return null;

  const fpsText = `${metrics.fps.toFixed(1)} fps`;
  const frameText = `${metrics.frameMs.toFixed(1)} ms/frame`;
  const avgText = `${metrics.avgFrameMs.toFixed(1)} ms avg (min ${metrics.minFrameMs.toFixed(
    1,
  )} / max ${metrics.maxFrameMs.toFixed(1)})`;
  const stallText = `${metrics.jankFrameCount} stalls`;
  const compileText =
    metrics.lastCompileMs === null ? 'n/a' : `${metrics.lastCompileMs.toFixed(1)} ms last compile`;
  const sourceText =
    `preprocess ${metrics.lastPrepareMs === null ? 'n/a' : `${metrics.lastPrepareMs.toFixed(1)}ms`}` +
    ` | pipeline ${metrics.lastPipelineMs === null ? 'n/a' : `${metrics.lastPipelineMs.toFixed(1)}ms`}`;
  const memoryText =
    metrics.memoryUsedMb === null
      ? 'memory n/a'
      : `JS heap ${metrics.memoryUsedMb} MB` +
        (metrics.memoryLimitMb === null ? '' : ` / ${metrics.memoryLimitMb} MB`);
  const sizeText = `${metrics.canvasWidth}×${metrics.canvasHeight}`;
  const health = getHealth(metrics);
  const alerts = getAlerts(metrics);

  return (
    <VStack align="start" gap={1}>
      <Text
        fontSize="11px"
        color="whiteAlpha.600"
        className={health.className}
        letterSpacing="0.03em"
      >
        {fpsText} · {frameText} · {avgText}
      </Text>
      <Text
        fontSize="11px"
        color="whiteAlpha.600"
        className={health.className}
        letterSpacing="0.03em"
      >
        {health.label} · {health.value}
      </Text>
      {alerts.length > 0 ? (
        <Text
          fontSize="11px"
          color="whiteAlpha.600"
          className="studio-status-error"
          letterSpacing="0.03em"
        >
          Alerts: {alerts.join(' · ')}
        </Text>
      ) : null}
      <Text
        fontSize="11px"
        color="whiteAlpha.600"
        className={health.className}
        letterSpacing="0.03em"
      >
        Stalls: {stallText} · Frames: {metrics.totalFrames} · Compile: {compileText}
      </Text>
      <Text
        fontSize="11px"
        color="whiteAlpha.600"
        className={health.className}
        letterSpacing="0.03em"
      >
        Compile steps: {sourceText}
      </Text>
      <Text fontSize="11px" color="whiteAlpha.500" letterSpacing="0.03em">
        Canvas: {sizeText} · {memoryText} · Compiles: {metrics.compileCount} · Last errors:{' '}
        {metrics.lastCompileErrorCount}
      </Text>
    </VStack>
  );
}

type Health = {
  label: string;
  value: string;
  className: 'studio-status-ok' | 'studio-status-warn' | 'studio-status-error';
};

function getHealth(metrics: PackPreviewMetrics): Health {
  if (metrics.status !== 'ready' && metrics.status !== 'compiling' && metrics.status !== 'idle') {
    return { label: 'pipeline', value: metrics.status, className: 'studio-status-error' };
  }

  const fpsSev = severityFromThresholds(
    metrics.fps,
    FPS_ERROR_MS,
    FPS_WARN_MS,
    true, // higher is better
  );
  const frameSev = severityFromThresholds(
    metrics.avgFrameMs,
    AVG_FRAME_MS_ERROR,
    AVG_FRAME_MS_WARN,
    false, // lower is better
  );
  const stallPercent =
    metrics.totalFrames > 0 ? (metrics.jankFrameCount / metrics.totalFrames) * 100 : 0;
  const stallSev = severityFromThresholds(
    stallPercent,
    STALL_PERCENT_ERROR,
    STALL_PERCENT_WARN,
    false,
  );

  let compileSev: ReturnType<typeof severityFromThresholds>;
  if (metrics.lastCompileMs === null) {
    compileSev = 'ok';
  } else {
    compileSev = severityFromThresholds(
      metrics.lastCompileMs,
      COMPILE_MS_ERROR,
      COMPILE_MS_WARN,
      false,
    );
  }

  let memSev: ReturnType<typeof severityFromThresholds> = 'ok';
  if (metrics.memoryUsedMb !== null && metrics.memoryLimitMb) {
    memSev = severityFromThresholds(
      (metrics.memoryUsedMb / metrics.memoryLimitMb) * 100,
      HEAP_ERROR_RATIO,
      HEAP_WARN_RATIO,
      false,
    );
  }

  const max = maxSeverity([fpsSev, frameSev, stallSev, compileSev, memSev]);
  const score = Math.max(
    0,
    100 -
      (fpsSev === 'error' ? 40 : fpsSev === 'warn' ? 20 : 0) -
      (frameSev === 'error' ? 25 : frameSev === 'warn' ? 15 : 0) -
      (stallSev === 'error' ? 20 : stallSev === 'warn' ? 10 : 0) -
      (compileSev === 'error' ? 10 : compileSev === 'warn' ? 5 : 0) -
      (memSev === 'error' ? 5 : memSev === 'warn' ? 3 : 0),
  );

  const className =
    max === 'error'
      ? 'studio-status-error'
      : max === 'warn'
        ? 'studio-status-warn'
        : 'studio-status-ok';
  return {
    label: `health ${Math.max(score, 0).toFixed(0)}/100`,
    value: `${Math.round(stallPercent)}% stalled`,
    className,
  };
}

function getAlerts(metrics: PackPreviewMetrics): string[] {
  const alerts: string[] = [];
  if (metrics.status === 'ready' || metrics.status === 'compiling' || metrics.status === 'idle') {
    if (metrics.fps < FPS_ERROR_MS) {
      alerts.push(`low fps: ${metrics.fps.toFixed(1)} (critical)`);
    } else if (metrics.fps < FPS_WARN_MS) {
      alerts.push(`low fps: ${metrics.fps.toFixed(1)} (<${FPS_WARN_MS})`);
    }

    if (metrics.avgFrameMs > AVG_FRAME_MS_ERROR) {
      alerts.push(`high frame cost: ${metrics.avgFrameMs.toFixed(1)}ms (critical)`);
    } else if (metrics.avgFrameMs > AVG_FRAME_MS_WARN) {
      alerts.push(`high frame cost: ${metrics.avgFrameMs.toFixed(1)}ms`);
    }

    const stallPercent =
      metrics.totalFrames > 0 ? (metrics.jankFrameCount / metrics.totalFrames) * 100 : 0;
    if (stallPercent > STALL_PERCENT_ERROR) {
      alerts.push(`stalls: ${stallPercent.toFixed(0)}% (critical)`);
    } else if (stallPercent > STALL_PERCENT_WARN) {
      alerts.push(`stalls: ${stallPercent.toFixed(0)}%`);
    }

    if (metrics.lastCompileMs !== null) {
      if (metrics.lastCompileMs > COMPILE_MS_ERROR) {
        alerts.push(`compile: ${metrics.lastCompileMs.toFixed(1)}ms (critical)`);
      } else if (metrics.lastCompileMs > COMPILE_MS_WARN) {
        alerts.push(`compile: ${metrics.lastCompileMs.toFixed(1)}ms`);
      }
    }
  }

  if (metrics.status === 'error' && metrics.lastCompileErrorCount > 0) {
    alerts.push(`shader errors: ${metrics.lastCompileErrorCount}`);
  }

  if (metrics.memoryUsedMb !== null && metrics.memoryLimitMb !== null) {
    const memUsage = (metrics.memoryUsedMb / metrics.memoryLimitMb) * 100;
    if (memUsage > HEAP_ERROR_RATIO) {
      alerts.push(`heap: ${metrics.memoryUsedMb}MB (${memUsage.toFixed(0)}% limit)`);
    } else if (memUsage > HEAP_WARN_RATIO) {
      alerts.push(`heap: ${metrics.memoryUsedMb}MB (${memUsage.toFixed(0)}% limit)`);
    }
  }

  return alerts;
}

function severityFromThresholds(
  value: number,
  errorThreshold: number,
  warnThreshold: number,
  higherIsBetter: boolean,
): 'ok' | 'warn' | 'error' {
  if (higherIsBetter) {
    if (value < errorThreshold) return 'error';
    if (value < warnThreshold) return 'warn';
    return 'ok';
  }
  if (value > errorThreshold) return 'error';
  if (value > warnThreshold) return 'warn';
  return 'ok';
}

function maxSeverity(levels: Array<'ok' | 'warn' | 'error'>): 'ok' | 'warn' | 'error' {
  if (levels.includes('error')) return 'error';
  if (levels.includes('warn')) return 'warn';
  return 'ok';
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

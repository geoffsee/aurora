import { Box, Button, Field, Grid, Input, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import { GPU_SHADER_IMPORTED_UI_INDEX } from '../../../shared/gpu-shader-routing.ts';
import { useControls } from '../context/ControlsContext.tsx';
import { deckGpuShaderPatch } from '../lib/deck-gpu-shader.ts';
import { DeckModeLaunchpad } from './DeckModeLaunchpad.tsx';
import { ParamSlider } from './ParamSlider.tsx';
import { ShaderLaunchpad } from './ShaderLaunchpad.tsx';
import { Panel } from './ui.tsx';

export function SlidersPanel() {
  const { state, updateState } = useControls();

  // Stable callbacks + formatters so ParamSlider (memoized) can skip renders
  // when only unrelated context (e.g. osc meters) changes while audio plays.
  const setBpm = useCallback((bpm: number) => updateState({ bpm }), [updateState]);
  const setSpeed = useCallback((speed: number) => updateState({ speed }), [updateState]);
  const setIntensity = useCallback(
    (intensity: number) => updateState({ intensity }),
    [updateState],
  );
  const setFeedback = useCallback((feedback: number) => updateState({ feedback }), [updateState]);
  const setDepth = useCallback((depth: number) => updateState({ depth }), [updateState]);
  const setRingOpacity = useCallback(
    (ringOpacity: number) => updateState({ ringOpacity }),
    [updateState],
  );

  const fmt1 = useCallback((v: number) => v.toFixed(1), []);
  const fmt2 = useCallback((v: number) => v.toFixed(2), []);
  const fmtPct = useCallback((v: number) => `${Math.round(v * 100)}%`, []);

  const [keyStatus, setKeyStatus] = useState('checking…');
  const [importStatus, setImportStatus] = useState('idle');
  const [importUrl, setImportUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [revealKey, setRevealKey] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/shadertoy/key');
        const body = (await res.json()) as {
          configured?: boolean;
          source?: string | null;
        };
        if (!body || typeof body !== 'object') setKeyStatus('unknown');
        else if (body.configured) setKeyStatus(body.source === 'env' ? 'set (env)' : 'set');
        else setKeyStatus('not set');
      } catch {
        setKeyStatus('offline');
      }
    })();
  }, []);

  const saveKey = async () => {
    const key = apiKey.trim();
    if (!key) {
      setKeyStatus('enter key');
      return;
    }
    setKeyStatus('saving…');
    try {
      const res = await fetch('/api/shadertoy/key', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        configured?: boolean;
        source?: string | null;
      };
      if (!res.ok || body.ok === false) {
        setKeyStatus(`err: ${String(body.error ?? res.statusText).slice(0, 60)}`);
        return;
      }
      setApiKey('');
      setKeyStatus(body.source === 'env' ? 'set (env)' : body.configured ? 'set' : 'not set');
    } catch (err) {
      setKeyStatus(`net err: ${(err as Error)?.message || String(err)}`);
    }
  };

  const clearKey = async () => {
    setKeyStatus('clearing…');
    try {
      const res = await fetch('/api/shadertoy/key', { method: 'DELETE' });
      const body = (await res.json()) as { configured?: boolean };
      setKeyStatus(body.configured ? 'set' : 'not set');
    } catch (err) {
      setKeyStatus(`net err: ${(err as Error)?.message || String(err)}`);
    }
  };

  const importShader = async () => {
    const value = importUrl.trim();
    if (!value) {
      setImportStatus('enter URL');
      return;
    }
    setImportStatus('importing…');
    try {
      const res = await fetch('/api/shadertoy/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: value }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        meta?: { name?: string; id?: string };
        usedIChannel?: boolean;
      };
      if (!res.ok || body.ok === false) {
        setImportStatus(`err: ${String(body.error ?? res.statusText).slice(0, 60)}`);
        return;
      }
      const meta = body.meta ?? {};
      const warn = body.usedIChannel ? ' (iChannel: lossy)' : '';
      setImportStatus(`loaded: ${meta.name ?? meta.id}${warn}`);
      // Imported slot is UI index 0; stamp both decks so dual-GPU mode shows it.
      updateState({
        activeShader: GPU_SHADER_IMPORTED_UI_INDEX,
        deckAGpuShader: GPU_SHADER_IMPORTED_UI_INDEX,
        deckBGpuShader: GPU_SHADER_IMPORTED_UI_INDEX,
      });
    } catch (err) {
      setImportStatus(`net err: ${(err as Error)?.message || String(err)}`);
    }
  };

  return (
    <>
      <Box gridArea="pads">
        <Grid
          templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
          gap={3}
          alignItems="stretch"
        >
          <Panel>
            <DeckModeLaunchpad
              value={state.deckAMode}
              label="Deck A Mode"
              colorPalette="cyan"
              onChange={(value) => updateState({ deckAMode: value }, { bumpCue: true })}
            />
          </Panel>
          <Panel>
            <DeckModeLaunchpad
              value={state.deckBMode}
              label="Deck B Mode"
              colorPalette="pink"
              onChange={(value) => updateState({ deckBMode: value }, { bumpCue: true })}
            />
          </Panel>
          <Panel>
            <ShaderLaunchpad
              value={state.deckAGpuShader}
              label="Deck A GPU"
              colorPalette="cyan"
              onChange={(v) => updateState(deckGpuShaderPatch('A', v), { bumpCue: true })}
            />
          </Panel>
          <Panel>
            <ShaderLaunchpad
              value={state.deckBGpuShader}
              label="Deck B GPU"
              colorPalette="pink"
              onChange={(v) => updateState(deckGpuShaderPatch('B', v), { bumpCue: true })}
            />
          </Panel>
        </Grid>
      </Box>
      <Grid gridArea="slid" templateColumns="repeat(auto-fit, minmax(260px, 1fr))" gap={3}>
        <Panel>
          <Field.Root>
            <Field.Label display="flex" justifyContent="space-between">
              <span>Shadertoy API Key</span>
              <Text fontSize="sm" color="whiteAlpha.700">
                {keyStatus}
              </Text>
            </Field.Label>
            <Input
              size="lg"
              type={revealKey ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste your Shadertoy API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Box display="flex" gap={2} mt={2}>
              <Button size="md" onClick={saveKey}>
                Save
              </Button>
              <Button size="md" variant="surface" onClick={clearKey}>
                Clear
              </Button>
              <Button
                size="md"
                variant="surface"
                aria-pressed={revealKey}
                onClick={() => setRevealKey((v) => !v)}
              >
                {revealKey ? 'Hide' : 'Show'}
              </Button>
            </Box>
            <Text fontSize="xs" color="whiteAlpha.600" mt={2}>
              Stored in bridge memory only. Get a key at shadertoy.com → Account → Apps.
            </Text>
          </Field.Root>
        </Panel>
        <Panel>
          <Field.Root>
            <Field.Label display="flex" justifyContent="space-between">
              <span>Shadertoy Import</span>
              <Text fontSize="sm" color="whiteAlpha.700">
                {importStatus}
              </Text>
            </Field.Label>
            <Input
              size="lg"
              placeholder="https://www.shadertoy.com/view/XXXXX"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
            />
            <Button size="lg" mt={2} onClick={importShader}>
              Import
            </Button>
          </Field.Root>
        </Panel>
        <Panel>
          <ParamSlider
            label="BPM"
            value={state.bpm}
            min={60}
            max={190}
            step={0.1}
            onChange={setBpm}
            format={fmt1}
          />
        </Panel>
        <Panel>
          <ParamSlider
            label="Speed"
            value={state.speed}
            min={0.1}
            max={3}
            step={0.01}
            onChange={setSpeed}
            format={fmt2}
          />
        </Panel>
        <Panel>
          <ParamSlider
            label="Intensity"
            value={state.intensity}
            min={0.05}
            max={1.5}
            step={0.01}
            onChange={setIntensity}
            format={fmt2}
          />
        </Panel>
        <Panel>
          <ParamSlider
            label="Trails"
            value={state.feedback}
            min={0}
            max={1}
            step={0.01}
            onChange={setFeedback}
            format={fmt2}
          />
        </Panel>
        <Panel>
          <ParamSlider
            label="3D Lines"
            value={state.depth}
            min={0}
            max={1}
            step={0.01}
            onChange={setDepth}
            format={fmt2}
          />
        </Panel>
        <Panel>
          <ParamSlider
            label="Ring Opacity"
            value={state.ringOpacity}
            min={0}
            max={1}
            step={0.01}
            onChange={setRingOpacity}
            format={fmtPct}
          />
        </Panel>
      </Grid>
    </>
  );
}

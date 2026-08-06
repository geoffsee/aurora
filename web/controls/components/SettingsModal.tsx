import {
  Box,
  Button,
  Dialog,
  Field,
  Grid,
  Input,
  NativeSelect,
  Portal,
  Text,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { GPU_SHADER_IMPORTED_UI_INDEX } from '../../../shared/gpu-shader-routing.ts';
import { normalizeRemoteModelAssetPath } from '../../../shared/model-asset-path.ts';
import {
  FIGURE_VISUAL_MODE,
  MAX_FIGURE_MODEL_INDEX,
  MODEL_CATALOG,
} from '../../../shared/model-catalog.ts';
import { useControls } from '../context/ControlsContext.tsx';
import { VISUAL_MODES } from '../lib/constants.ts';
import { deckGpuShaderModePatch } from '../lib/deck-mode.ts';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, updateState } = useControls();

  // --- Shadertoy API key ---
  const [keyStatus, setKeyStatus] = useState('checking…');
  const [apiKey, setApiKey] = useState('');
  const [revealKey, setRevealKey] = useState(false);

  // --- Shadertoy import ---
  const [importStatus, setImportStatus] = useState('idle');
  const [importUrl, setImportUrl] = useState('');

  // --- Figure / Models ---
  const [assetPath, setAssetPath] = useState(state.figureAssetPath);

  useEffect(() => setAssetPath(state.figureAssetPath), [state.figureAssetPath]);

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
      updateState({
        activeShader: GPU_SHADER_IMPORTED_UI_INDEX,
        deckAGpuShader: GPU_SHADER_IMPORTED_UI_INDEX,
        deckBGpuShader: GPU_SHADER_IMPORTED_UI_INDEX,
        gpuDeckAEnabled: true,
        gpuDeckBEnabled: true,
        ...deckGpuShaderModePatch(),
      });
    } catch (err) {
      setImportStatus(`net err: ${(err as Error)?.message || String(err)}`);
    }
  };

  // --- Figure / Models helpers ---
  const selected = MODEL_CATALOG[state.figureModel] ?? MODEL_CATALOG[0];
  const figureOnA = state.deckAMode === FIGURE_VISUAL_MODE;
  const figureOnB = state.deckBMode === FIGURE_VISUAL_MODE;
  const activeHint =
    figureOnA || figureOnB
      ? `Live on ${[figureOnA ? 'Deck A' : null, figureOnB ? 'Deck B' : null].filter(Boolean).join(' + ')}`
      : 'Not on a deck — assign below or pick Figure in Deck Mode';

  const applyRemoteAsset = () => {
    const normalized = normalizeRemoteModelAssetPath(assetPath, state.figureAssetPath);
    setAssetPath(normalized);
    updateState({ figureAssetPath: normalized });
  };
  const clearRemoteAsset = () => {
    setAssetPath('');
    updateState({ figureAssetPath: '' });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content
            maxW="3xl"
            maxH="85vh"
            overflowY="auto"
            bg="#0c0e1a"
            color="gray.50"
            borderWidth="1px"
            borderColor="whiteAlpha.200"
            borderRadius="xl"
          >
            <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
              <Dialog.Title fontSize="lg" fontWeight="bold">
                Settings
              </Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <Button variant="ghost" size="sm" onClick={onClose}>
                  &#x2715;
                </Button>
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body display="flex" flexDirection="column" gap={5} pb={6}>
              {/* ---- Shadertoy ---- */}
              <Box>
                <Text fontSize="sm" fontWeight="semibold" letterSpacing="0.04em" mb={3}>
                  Shadertoy
                </Text>
                <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={3}>
                  <Field.Root>
                    <Field.Label display="flex" justifyContent="space-between">
                      <span>API Key</span>
                      <Text fontSize="sm" color="whiteAlpha.700">
                        {keyStatus}
                      </Text>
                    </Field.Label>
                    <Input
                      type={revealKey ? 'text' : 'password'}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Paste your Shadertoy API key"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                    <Box display="flex" gap={2} mt={2}>
                      <Button size="sm" onClick={saveKey}>
                        Save
                      </Button>
                      <Button size="sm" variant="surface" onClick={clearKey}>
                        Clear
                      </Button>
                      <Button
                        size="sm"
                        variant="surface"
                        aria-pressed={revealKey}
                        onClick={() => setRevealKey((v) => !v)}
                      >
                        {revealKey ? 'Hide' : 'Show'}
                      </Button>
                    </Box>
                    <Text fontSize="xs" color="whiteAlpha.500" mt={1}>
                      Stored in bridge memory only. Get a key at shadertoy.com → Account → Apps.
                    </Text>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label display="flex" justifyContent="space-between">
                      <span>Import</span>
                      <Text fontSize="sm" color="whiteAlpha.700">
                        {importStatus}
                      </Text>
                    </Field.Label>
                    <Input
                      placeholder="https://www.shadertoy.com/view/XXXXX"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                    />
                    <Button size="sm" mt={2} onClick={importShader}>
                      Import
                    </Button>
                  </Field.Root>
                </Grid>
              </Box>

              {/* ---- Figure / Models ---- */}
              <Box>
                <Text fontSize="sm" fontWeight="semibold" letterSpacing="0.04em" mb={1}>
                  Figure / Models
                </Text>
                <Text fontSize="xs" color="whiteAlpha.600" mb={3}>
                  {activeHint}
                  {selected ? ` · ${selected.label}` : ''}
                </Text>
                <Grid
                  templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }}
                  gap={3}
                  alignItems="start"
                >
                  <Field.Root>
                    <Field.Label display="flex" justifyContent="space-between">
                      <span>Model</span>
                      <Text color="cyan.300" fontSize="sm">
                        {selected?.label ?? '—'}
                      </Text>
                    </Field.Label>
                    <NativeSelect.Root size="sm">
                      <NativeSelect.Field
                        value={String(Math.min(state.figureModel, MAX_FIGURE_MODEL_INDEX))}
                        onChange={(e) =>
                          updateState({
                            figureModel: Math.max(
                              0,
                              Math.min(MAX_FIGURE_MODEL_INDEX, Number(e.target.value)),
                            ),
                          })
                        }
                      >
                        {MODEL_CATALOG.map((entry, i) => (
                          <option key={entry.id} value={i}>
                            {entry.label}
                          </option>
                        ))}
                      </NativeSelect.Field>
                    </NativeSelect.Root>
                    <Text fontSize="xs" color="whiteAlpha.500" mt={1}>
                      Web pack ships small free samples; "(local)" needs files under models/ (not on
                      GitHub Pages). Lazy-loaded when Figure is live.
                    </Text>
                  </Field.Root>

                  <Field.Root>
                    <Field.Label display="flex" justifyContent="space-between">
                      <span>Remote 3D asset</span>
                      <Text
                        color={state.figureAssetPath ? 'cyan.300' : 'whiteAlpha.500'}
                        fontSize="sm"
                      >
                        {state.figureAssetPath ? 'Override active' : 'Using catalog'}
                      </Text>
                    </Field.Label>
                    <Input
                      type="url"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="https://cdn.example.com/model.glb"
                      value={assetPath}
                      onChange={(e) => setAssetPath(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyRemoteAsset();
                      }}
                    />
                    <Box display="flex" gap={2} mt={2}>
                      <Button size="sm" onClick={applyRemoteAsset}>
                        Load remote
                      </Button>
                      <Button size="sm" variant="surface" onClick={clearRemoteAsset}>
                        Use catalog
                      </Button>
                    </Box>
                    <Text fontSize="xs" color="whiteAlpha.500" mt={1}>
                      Absolute HTTP(S) .glb or .gltf URL. The host must allow browser CORS requests.
                    </Text>
                  </Field.Root>

                  <Box display="flex" flexDirection="column" gap={2} justifyContent="flex-end">
                    <Button
                      size="sm"
                      variant={figureOnA ? 'solid' : 'surface'}
                      colorPalette="yellow"
                      onClick={() =>
                        updateState({ deckAMode: FIGURE_VISUAL_MODE }, { bumpCue: true })
                      }
                    >
                      {figureOnA
                        ? 'Deck A · Figure'
                        : `Figure → Deck A (${VISUAL_MODES[FIGURE_VISUAL_MODE]})`}
                    </Button>
                    <Button
                      size="sm"
                      variant={figureOnB ? 'solid' : 'surface'}
                      colorPalette="teal"
                      onClick={() =>
                        updateState({ deckBMode: FIGURE_VISUAL_MODE }, { bumpCue: true })
                      }
                    >
                      {figureOnB
                        ? 'Deck B · Figure'
                        : `Figure → Deck B (${VISUAL_MODES[FIGURE_VISUAL_MODE]})`}
                    </Button>
                  </Box>
                </Grid>
              </Box>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

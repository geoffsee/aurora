import { Box, Grid, GridItem } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CopilotPanel } from './components/CopilotPanel.tsx';
import { KnobPanel } from './components/KnobPanel.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { SketchSidebar } from './components/SketchSidebar.tsx';
import { StudioToolbar } from './components/StudioToolbar.tsx';
import { ThreePreview } from './components/ThreePreview.tsx';
import { WgslEditor } from './components/WgslEditor.tsx';
import {
  downloadPackageArchive,
  exportSketchToPackage,
  importPackageToBridge,
  publishSketchToChannelAsync,
} from './lib/export-package.ts';
import {
  addSketch,
  createSketch,
  duplicateSketch,
  getActiveSketch,
  loadStudioDocument,
  removeSketch,
  type StudioDocument,
  type StudioSketch,
  saveStudioDocument,
  updateSketch,
} from './lib/sketch-store.ts';
import type { WgslDiagnostic } from './lib/wgsl-diagnostics.ts';

const BRIDGE_KEY = 'aurora-studio-bridge-origin';

function defaultBridgeOrigin(): string {
  if (location.port === '3010') {
    return `${location.protocol}//${location.hostname || '127.0.0.1'}:3000`;
  }
  return location.origin;
}

function loadBridgeOrigin(): string {
  try {
    const saved = localStorage.getItem(BRIDGE_KEY);
    // Migrate the old native default when Studio moves into the HTTPS Docker origin.
    if (
      location.port === '8444' &&
      (saved === 'http://127.0.0.1:3000' || saved === 'http://localhost:3000')
    ) {
      return defaultBridgeOrigin();
    }
    return saved ?? defaultBridgeOrigin();
  } catch {
    return defaultBridgeOrigin();
  }
}

export function App() {
  const [doc, setDoc] = useState<StudioDocument>(() => loadStudioDocument());
  const [bridgeOrigin, setBridgeOrigin] = useState(loadBridgeOrigin);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<readonly WgslDiagnostic[]>([]);
  const clearDiagnostics = useCallback(() => setDiagnostics([]), []);
  // Pull-based: the copilot reads the selection once at submit, so this never
  // re-renders on cursor movement.
  const readSelection = useRef<(() => string) | null>(null);
  const onDiagnostics = useCallback((next: readonly WgslDiagnostic[]) => {
    setDiagnostics(next);
  }, []);

  const active = useMemo(() => getActiveSketch(doc), [doc]);
  const activeId = active?.id;

  useEffect(() => {
    if (activeId === undefined) return;
    clearDiagnostics();
  }, [activeId, clearDiagnostics]);

  // Persist sketches.
  useEffect(() => {
    const t = setTimeout(() => saveStudioDocument(doc), 200);
    return () => clearTimeout(t);
  }, [doc]);

  useEffect(() => {
    try {
      localStorage.setItem(BRIDGE_KEY, bridgeOrigin);
    } catch {
      /* ignore */
    }
  }, [bridgeOrigin]);

  const patchActive = useCallback(
    (patch: Partial<Omit<StudioSketch, 'id'>>) => {
      if (!active) return;
      setDoc((d) => updateSketch(d, active.id, patch));
    },
    [active],
  );

  const onPublish = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await publishSketchToChannelAsync(active);
      if (!result.ok) {
        setMessage(`Publish failed: ${result.errors.map((e) => e.message).join('; ')}`);
        return;
      }
      setMessage(
        `Published “${result.label}” (${result.slug}) · open Console and select it on the launchpad`,
      );
    } finally {
      setBusy(false);
    }
  }, [active]);

  const onExport = useCallback(() => {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = exportSketchToPackage(active);
      if (!result.ok) {
        setMessage(`Export failed: ${result.errors.map((e) => e.message).join('; ')}`);
        return;
      }
      downloadPackageArchive(result.bytes, result.fileName);
      setMessage(`Downloaded ${result.fileName} (${result.bytes.byteLength} bytes)`);
    } finally {
      setBusy(false);
    }
  }, [active]);

  const onImportBridge = useCallback(async () => {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    try {
      const built = exportSketchToPackage(active);
      if (!built.ok) {
        setMessage(`Export failed: ${built.errors.map((e) => e.message).join('; ')}`);
        return;
      }
      const result = await importPackageToBridge(built.bytes, { bridgeOrigin });
      if (!result.ok) {
        setMessage(
          `Import failed (${result.status}): ${result.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
        );
        return;
      }
      const epoch = result.catalog?.epoch;
      setMessage(
        `Imported “${result.slug}”${result.overwritten ? ' (overwritten)' : ''}` +
          (epoch !== undefined ? ` · catalog epoch ${epoch}` : '') +
          ` · select on launchpad`,
      );
    } finally {
      setBusy(false);
    }
  }, [active, bridgeOrigin]);

  if (!active) {
    return (
      <Box p={6} color="gray.200">
        No sketch — click New.
      </Box>
    );
  }

  return (
    <Box
      h="100vh"
      maxH="100vh"
      overflow={{ base: 'auto', lg: 'hidden' }}
      display="flex"
      flexDirection="column"
      bgGradient="to-b"
      gradientFrom="#090804"
      gradientTo="#0e0b0b"
      color="gray.50"
    >
      <Box
        flex="1 1 auto"
        minH={0}
        overflow={{ base: 'visible', lg: 'hidden' }}
        px={{ base: 2, md: 3 }}
        pt={3}
        pb={2}
      >
        <Grid
          // Wider than the old 260px: the sidebar now carries the copilot dock as
          // well as the sketch list, and a 260px column makes a prompt box unusable.
          templateColumns={{ base: '1fr', lg: '340px minmax(0, 1fr) minmax(0, 1fr)' }}
          templateRows={{ base: 'auto auto auto auto', lg: 'auto 1fr' }}
          gap={3}
          h={{ base: 'auto', lg: '100%' }}
          w="100%"
        >
          <GridItem colSpan={{ base: 1, lg: 3 }} flexShrink={0}>
            <StudioToolbar
              sketch={active}
              bridgeOrigin={bridgeOrigin}
              busy={busy}
              message={message}
              onMeta={(patch) => patchActive(patch)}
              onBridgeOrigin={setBridgeOrigin}
              onPublish={() => void onPublish()}
              onExport={onExport}
              onImportBridge={() => void onImportBridge()}
            />
          </GridItem>

          <GridItem minH={{ base: '240px', lg: 0 }} overflow="hidden">
            <Box
              h="100%"
              p={3}
              borderRadius="lg"
              border="1px solid"
              borderColor="#252a31"
              bg="rgba(0,0,0,0.25)"
              display="flex"
              flexDirection="column"
              gap={3}
              overflowY="auto"
            >
              <SketchSidebar
                sketches={doc.sketches}
                activeId={doc.activeId}
                onSelect={(id) => setDoc((d) => ({ ...d, activeId: id }))}
                onAdd={(backend, renderer) =>
                  setDoc((d) =>
                    addSketch(
                      d,
                      createSketch(
                        {
                          label:
                            backend === 'threejs'
                              ? `Untitled Three ${renderer === 'webgpu' ? 'WebGPU' : 'WebGL2'}`
                              : 'Untitled Package',
                          backend,
                          renderer,
                        },
                        d.sketches.map((s) => s.slug),
                      ),
                    ),
                  )
                }
                onDuplicate={(id) => setDoc((d) => duplicateSketch(d, id))}
                onRemove={(id) => {
                  if (doc.sketches.length <= 1) {
                    setMessage('Keep at least one sketch.');
                    return;
                  }
                  setDoc((d) => removeSketch(d, id));
                }}
              />
              {active.backend === 'threejs' ? null : (
                <Box borderTopWidth="1px" borderColor="#252a31" pt={3}>
                  <CopilotPanel
                    wgsl={active.wgsl}
                    knobs={active.knobs}
                    diagnostics={diagnostics}
                    getSelection={() => readSelection.current?.() ?? ''}
                    onApply={(next) => patchActive({ wgsl: next })}
                  />
                </Box>
              )}
            </Box>
          </GridItem>

          <GridItem minH={{ base: '200px', lg: 0 }} overflow="hidden">
            <Box
              h="100%"
              p={3}
              borderRadius="lg"
              border="1px solid"
              borderColor="#252a31"
              bg="rgba(0,0,0,0.25)"
            >
              <WgslEditor
                value={active.backend === 'threejs' ? (active.source ?? '') : active.wgsl}
                onChange={(source) =>
                  patchActive(active.backend === 'threejs' ? { source } : { wgsl: source })
                }
                diagnostics={diagnostics}
                backend={active.backend}
                registerSelectionReader={(read) => {
                  readSelection.current = read;
                }}
              />
            </Box>
          </GridItem>

          <GridItem minH={{ base: '200px', lg: 0 }} overflow="hidden">
            <Box
              h="100%"
              p={3}
              borderRadius="lg"
              border="1px solid"
              borderColor="#252a31"
              bg="rgba(0,0,0,0.25)"
            >
              {active.backend === 'threejs' ? (
                <ThreePreview
                  source={active.source ?? ''}
                  renderer={active.renderer ?? 'webgl2'}
                  requiresNativeWebGPU={active.requiresNativeWebGPU ?? false}
                  knobs={active.knobs}
                />
              ) : (
                <PreviewPanel
                  wgsl={active.wgsl}
                  knobs={active.knobs}
                  onDiagnostics={onDiagnostics}
                />
              )}
            </Box>
          </GridItem>
        </Grid>
      </Box>

      {/* Fixed bottom knob strip — single non-wrapping row */}
      <Box
        flex="0 0 auto"
        borderTop="1px solid"
        borderColor="#252a31"
        bg="rgba(8, 8, 6, 0.96)"
        backdropFilter="blur(8px)"
        px={{ base: 2, md: 3 }}
        py={2}
        zIndex={20}
      >
        <Box w="100%">
          <KnobPanel
            knobs={active.knobs}
            onChange={(patch) => patchActive({ knobs: { ...active.knobs, ...patch } })}
          />
        </Box>
      </Box>
    </Box>
  );
}

import { Box, Grid, GridItem } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KnobPanel } from './components/KnobPanel.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { SketchSidebar } from './components/SketchSidebar.tsx';
import { StudioToolbar } from './components/StudioToolbar.tsx';
import { WgslEditor } from './components/WgslEditor.tsx';
import { downloadPackageArchive, exportSketchToPackage, importPackageToBridge } from './lib/export-package.ts';
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

const BRIDGE_KEY = 'aurora-studio-bridge-origin';

function loadBridgeOrigin(): string {
  try {
    return localStorage.getItem(BRIDGE_KEY) ?? 'http://127.0.0.1:3000';
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

export function App() {
  const [doc, setDoc] = useState<StudioDocument>(() => loadStudioDocument());
  const [bridgeOrigin, setBridgeOrigin] = useState(loadBridgeOrigin);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const active = useMemo(() => getActiveSketch(doc), [doc]);

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
      minH="100vh"
      h="100%"
      bgGradient="to-b"
      gradientFrom="#090804"
      gradientTo="#0e0b0b"
      color="gray.50"
      px={{ base: 2, md: 3 }}
      py={3}
    >
      <Grid
        templateColumns={{ base: '1fr', lg: '200px 1fr 1fr' }}
        templateRows={{ base: 'auto auto auto auto', lg: 'auto 1fr auto' }}
        gap={3}
        h={{ base: 'auto', lg: 'calc(100vh - 24px)' }}
        maxW="1600px"
        mx="auto"
      >
        <GridItem colSpan={{ base: 1, lg: 3 }}>
          <StudioToolbar
            sketch={active}
            bridgeOrigin={bridgeOrigin}
            busy={busy}
            message={message}
            onMeta={(patch) => patchActive(patch)}
            onBridgeOrigin={setBridgeOrigin}
            onExport={onExport}
            onImportBridge={() => void onImportBridge()}
          />
        </GridItem>

        <GridItem minH={{ base: '160px', lg: 0 }} overflow="hidden">
          <Box
            h="100%"
            p={3}
            borderRadius="lg"
            border="1px solid"
            borderColor="#252a31"
            bg="rgba(0,0,0,0.25)"
          >
            <SketchSidebar
              sketches={doc.sketches}
              activeId={doc.activeId}
              onSelect={(id) => setDoc((d) => ({ ...d, activeId: id }))}
              onAdd={() =>
                setDoc((d) =>
                  addSketch(
                    d,
                    createSketch(
                      { label: 'Untitled Package' },
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
          </Box>
        </GridItem>

        <GridItem minH={{ base: '300px', lg: 0 }} overflow="hidden">
          <Box
            h="100%"
            p={3}
            borderRadius="lg"
            border="1px solid"
            borderColor="#252a31"
            bg="rgba(0,0,0,0.25)"
          >
            <WgslEditor value={active.wgsl} onChange={(wgsl) => patchActive({ wgsl })} />
          </Box>
        </GridItem>

        <GridItem minH={{ base: '300px', lg: 0 }} overflow="hidden">
          <Box
            h="100%"
            p={3}
            borderRadius="lg"
            border="1px solid"
            borderColor="#252a31"
            bg="rgba(0,0,0,0.25)"
          >
            <PreviewPanel wgsl={active.wgsl} knobs={active.knobs} />
          </Box>
        </GridItem>

        <GridItem colSpan={{ base: 1, lg: 3 }}>
          <Box
            p={3}
            borderRadius="lg"
            border="1px solid"
            borderColor="#252a31"
            bg="rgba(0,0,0,0.25)"
          >
            <KnobPanel
              knobs={active.knobs}
              onChange={(patch) => patchActive({ knobs: { ...active.knobs, ...patch } })}
            />
          </Box>
        </GridItem>
      </Grid>
    </Box>
  );
}

import { Box, Button, HStack, Input, Text, VStack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { StudioSketch } from '../lib/sketch-store.ts';

export function StudioToolbar({
  sketch,
  bridgeOrigin,
  busy,
  message,
  onMeta,
  onBridgeOrigin,
  onPublish,
  onExport,
  onImportBridge,
}: {
  sketch: StudioSketch;
  bridgeOrigin: string;
  busy: boolean;
  message: string | null;
  onMeta: (patch: Partial<Pick<StudioSketch, 'label' | 'slug' | 'character' | 'uiGroup'>>) => void;
  onBridgeOrigin: (origin: string) => void;
  onPublish: () => void;
  onExport: () => void;
  onImportBridge: () => void;
}) {
  return (
    <VStack align="stretch" gap={2}>
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <Box>
          <Text fontSize="lg" fontWeight="700" letterSpacing="0.02em">
            Preset Studio
          </Text>
          <Text fontSize="xs" color="whiteAlpha.600">
            Author packages · Publish to Console (BroadcastChannel) · export .aurora-package
          </Text>
        </Box>
        <HStack gap={2}>
          <Button size="sm" colorPalette="green" onClick={onPublish} disabled={busy}>
            Publish to Console
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onExport}
            disabled={busy}
            borderColor="#3a4038"
          >
            Export .aurora-package
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onImportBridge}
            disabled={busy}
            borderColor="#3a4038"
          >
            Import to Aurora
          </Button>
        </HStack>
      </HStack>

      <HStack gap={2} flexWrap="wrap" align="flex-end">
        <Field label="Label">
          <Input
            size="sm"
            value={sketch.label}
            onChange={(e) => onMeta({ label: e.target.value })}
            bg="#0c0e12"
            borderColor="#252a31"
            maxW="180px"
          />
        </Field>
        <Field label="Slug">
          <Input
            size="sm"
            value={sketch.slug}
            onChange={(e) => onMeta({ slug: e.target.value })}
            bg="#0c0e12"
            borderColor="#252a31"
            maxW="160px"
            fontFamily="mono"
          />
        </Field>
        <Field label="Character">
          <Input
            size="sm"
            value={sketch.character}
            onChange={(e) => onMeta({ character: e.target.value })}
            bg="#0c0e12"
            borderColor="#252a31"
            maxW="220px"
            placeholder="short brief"
          />
        </Field>
        <Field label="UI group">
          <Input
            size="sm"
            value={sketch.uiGroup}
            onChange={(e) => onMeta({ uiGroup: e.target.value })}
            bg="#0c0e12"
            borderColor="#252a31"
            maxW="140px"
          />
        </Field>
        <Field label="Bridge">
          <Input
            size="sm"
            value={bridgeOrigin}
            onChange={(e) => onBridgeOrigin(e.target.value)}
            bg="#0c0e12"
            borderColor="#252a31"
            maxW="200px"
            fontFamily="mono"
            placeholder="http://127.0.0.1:3000"
          />
        </Field>
      </HStack>

      {message ? (
        <Text fontSize="xs" color="whiteAlpha.700" whiteSpace="pre-wrap">
          {message}
        </Text>
      ) : null}
    </VStack>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <Text fontSize="10px" color="whiteAlpha.500" mb={1} letterSpacing="0.06em">
        {label.toUpperCase()}
      </Text>
      {children}
    </Box>
  );
}

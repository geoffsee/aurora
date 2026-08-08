import { Box, Button, HStack, Text, VStack } from '@chakra-ui/react';
import type { StudioSketch } from '../lib/sketch-store.ts';

export function SketchSidebar({
  sketches,
  activeId,
  onSelect,
  onAdd,
  onDuplicate,
  onRemove,
}: {
  sketches: StudioSketch[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (backend: 'wgsl' | 'threejs', renderer?: 'webgl2' | 'webgpu') => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <VStack align="stretch" gap={2} h="100%">
      <HStack justify="space-between">
        <Text fontSize="xs" fontWeight="700" letterSpacing="0.08em" color="whiteAlpha.700">
          SKETCHES
        </Text>
        <HStack gap={1}>
          <Button size="xs" variant="outline" onClick={() => onAdd('wgsl')} borderColor="#3a4038">
            WGSL
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onAdd('threejs', 'webgl2')}
            borderColor="#3a4038"
          >
            Three GL
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => onAdd('threejs', 'webgpu')}
            borderColor="#3a4038"
          >
            Three GPU
          </Button>
        </HStack>
      </HStack>
      <VStack align="stretch" gap={1} flex="1" overflowY="auto">
        {sketches.map((s) => {
          const active = s.id === activeId;
          return (
            <Box
              key={s.id}
              as="button"
              textAlign="left"
              px={3}
              py={2}
              borderRadius="md"
              border="1px solid"
              borderColor={active ? '#6b8f71' : '#252a31'}
              bg={active ? 'rgba(107,143,113,0.15)' : '#0c0e12'}
              cursor="pointer"
              onClick={() => onSelect(s.id)}
              _hover={{ borderColor: active ? '#6b8f71' : '#3a424c' }}
            >
              <Text fontSize="sm" fontWeight="600" color="gray.100" truncate>
                {s.label}
              </Text>
              <Text fontSize="xs" color="whiteAlpha.600" truncate>
                {s.slug} ·{' '}
                {s.backend === 'threejs'
                  ? `Three ${s.renderer === 'webgpu' ? 'WebGPU' : 'WebGL2'}`
                  : 'WGSL'}
              </Text>
            </Box>
          );
        })}
      </VStack>
      {activeId ? (
        <HStack>
          <Button size="xs" flex="1" variant="ghost" onClick={() => onDuplicate(activeId)}>
            Duplicate
          </Button>
          <Button
            size="xs"
            flex="1"
            variant="ghost"
            colorPalette="red"
            onClick={() => onRemove(activeId)}
          >
            Delete
          </Button>
        </HStack>
      ) : null}
    </VStack>
  );
}

import { Box, Button, Flex, Grid, Text } from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { SHADER_OPTIONS } from '../lib/constants.ts';

type ShaderAccent = 'yellow' | 'teal' | 'purple';

type ShaderLaunchpadProps = {
  value: number;
  label?: string;
  colorPalette?: ShaderAccent;
  onChange: (value: number) => void;
};

type ShaderGroup = 'import' | 'classic' | 'reactive' | 'atmosphere' | 'spectacle';

const GROUP_ORDER: readonly ShaderGroup[] = [
  'import',
  'classic',
  'reactive',
  'atmosphere',
  'spectacle',
] as const;

const GROUP_LABELS: Record<ShaderGroup, string> = {
  import: 'Import',
  classic: 'Classic',
  reactive: 'Reactive',
  atmosphere: 'Atmosphere',
  spectacle: 'Spectacle',
};

const GROUP_RANGES: Record<ShaderGroup, [number, number]> = {
  import: [0, 1],
  classic: [1, 10],
  reactive: [10, 18],
  atmosphere: [18, 27],
  spectacle: [27, SHADER_OPTIONS.length],
};

function groupForIndex(index: number): ShaderGroup {
  for (const group of GROUP_ORDER) {
    const [lo, hi] = GROUP_RANGES[group];
    if (index >= lo && index < hi) return group;
  }
  return 'spectacle';
}

export function ShaderLaunchpad({
  value,
  label = 'GPU Shader',
  colorPalette = 'purple',
  onChange,
}: ShaderLaunchpadProps) {
  const [activeGroup, setActiveGroup] = useState<ShaderGroup>(() => groupForIndex(value));

  // Keep the group tab aligned when MIDI / cue / WS updates the value from outside.
  useEffect(() => {
    setActiveGroup(groupForIndex(value));
  }, [value]);

  const shaders = useMemo(() => {
    const [lo, hi] = GROUP_RANGES[activeGroup];
    return SHADER_OPTIONS.slice(lo, hi).map((name, i) => ({
      name,
      index: lo + i,
    }));
  }, [activeGroup]);

  const currentName = SHADER_OPTIONS[value] ?? 'Unknown';

  return (
    <Box h="100%" display="flex" flexDirection="column" gap={3}>
      <Flex align="baseline" justify="space-between" gap={3} wrap="wrap">
        <Box>
          <Text
            fontSize="xs"
            textTransform="uppercase"
            letterSpacing="wider"
            color="whiteAlpha.600"
          >
            {label}
          </Text>
          <Text fontSize="xl" fontWeight="bold" color={`${colorPalette}.300`} lineHeight="short">
            {currentName}
          </Text>
        </Box>
        <Text fontFamily="mono" fontSize="sm" color="whiteAlpha.500">
          #{value}
        </Text>
      </Flex>

      <Flex gap={1.5} wrap="wrap">
        {GROUP_ORDER.map((group) => {
          const isActive = group === activeGroup;
          const hasSelection = groupForIndex(value) === group;
          return (
            <Button
              key={group}
              size="sm"
              h="2.25rem"
              px={3}
              fontSize="sm"
              fontWeight="semibold"
              variant={isActive ? 'solid' : 'subtle'}
              colorPalette={isActive ? colorPalette : 'gray'}
              borderWidth={hasSelection && !isActive ? '1px' : '0'}
              borderColor={`${colorPalette}.400`}
              onClick={() => setActiveGroup(group)}
              aria-pressed={isActive}
            >
              {GROUP_LABELS[group]}
            </Button>
          );
        })}
      </Flex>

      <Grid templateColumns="repeat(auto-fill, minmax(7.5rem, 1fr))" gap={2} flex="1" minH="12rem">
        {shaders.map(({ name, index }) => {
          const isSelected = index === value;
          return (
            <Button
              key={index}
              h="4.25rem"
              px={3}
              py={2}
              whiteSpace="normal"
              lineHeight="short"
              fontSize="md"
              fontWeight="semibold"
              borderRadius="lg"
              bg={isSelected ? `${colorPalette}.400` : 'whiteAlpha.100'}
              color={isSelected ? 'black' : 'whiteAlpha.900'}
              borderWidth="2px"
              borderColor={isSelected ? `${colorPalette}.200` : 'whiteAlpha.200'}
              _hover={{
                bg: isSelected ? `${colorPalette}.300` : 'whiteAlpha.200',
                borderColor: isSelected ? `${colorPalette}.100` : 'whiteAlpha.400',
              }}
              transition="background 0.12s ease, border-color 0.12s ease"
              onClick={() => {
                setActiveGroup(groupForIndex(index));
                onChange(index);
              }}
              aria-pressed={isSelected}
              aria-label={`${name} (${index})`}
            >
              {name}
            </Button>
          );
        })}
      </Grid>
    </Box>
  );
}

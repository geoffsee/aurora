import { Box, Button, Flex, Grid, Text } from '@chakra-ui/react';
import { useMemo, useState } from 'react';
import { VISUAL_MODES } from '../lib/constants.ts';

type DeckAccent = 'yellow' | 'teal' | 'purple';

type DeckModeLaunchpadProps = {
  value: number;
  label: string;
  colorPalette: DeckAccent;
  onChange: (value: number) => void;
  figureControls?: React.ReactNode;
};

type Category =
  | 'original'
  | 'figure'
  | 'geometry'
  | 'fractals'
  | 'algebra'
  | 'combinatorics'
  | 'dynamics'
  | 'logic';

const CATEGORY_ORDER: readonly Category[] = [
  'original',
  'figure',
  'geometry',
  'fractals',
  'algebra',
  'combinatorics',
  'dynamics',
  'logic',
] as const;

const CATEGORY_LABELS: Record<Category, string> = {
  original: 'Core',
  figure: '3D',
  geometry: 'Geometry',
  fractals: 'Fractals',
  algebra: 'Algebra',
  combinatorics: 'Combinatorics',
  dynamics: 'Dynamics',
  logic: 'Logic',
};

const CATEGORY_RANGES: Record<Category, [number, number]> = {
  original: [0, 24],
  figure: [24, 25],
  geometry: [25, 28],
  fractals: [28, 36],
  algebra: [36, 40],
  combinatorics: [40, 44],
  dynamics: [44, 48],
  logic: [48, VISUAL_MODES.length],
};

function categoryForIndex(index: number): Category {
  for (const cat of CATEGORY_ORDER) {
    const [lo, hi] = CATEGORY_RANGES[cat];
    if (index >= lo && index < hi) return cat;
  }
  return 'logic';
}

export function DeckModeLaunchpad({
  value,
  label,
  colorPalette,
  onChange,
  figureControls,
}: DeckModeLaunchpadProps) {
  const [activeCategory, setActiveCategory] = useState<Category>(() => categoryForIndex(value));

  const modes = useMemo(() => {
    const [lo, hi] = CATEGORY_RANGES[activeCategory];
    return VISUAL_MODES.slice(lo, hi).map((name, i) => ({
      name,
      index: lo + i,
    }));
  }, [activeCategory]);

  const currentName = VISUAL_MODES[value] ?? 'Unknown';

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
        {CATEGORY_ORDER.map((cat) => {
          const isActive = cat === activeCategory;
          const hasSelection = categoryForIndex(value) === cat;
          return (
            <Button
              key={cat}
              size="sm"
              h="2.25rem"
              px={3}
              fontSize="sm"
              fontWeight="semibold"
              variant={isActive ? 'solid' : 'subtle'}
              colorPalette={isActive ? colorPalette : 'gray'}
              borderWidth={hasSelection && !isActive ? '1px' : '0'}
              borderColor={`${colorPalette}.400`}
              onClick={() => setActiveCategory(cat)}
              aria-pressed={isActive}
            >
              {CATEGORY_LABELS[cat]}
            </Button>
          );
        })}
      </Flex>

      <Grid templateColumns="repeat(auto-fill, minmax(7.5rem, 1fr))" gap={2} flex="1" minH="12rem">
        {modes.map(({ name, index }) => {
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
                setActiveCategory(categoryForIndex(index));
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
      {figureControls && activeCategory === 'figure' && (
        <Box mt={2} pt={3} borderTop="1px solid" borderColor="whiteAlpha.200">
          {figureControls}
        </Box>
      )}
    </Box>
  );
}

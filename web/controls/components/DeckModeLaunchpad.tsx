import { Box, Button, Flex, Grid, Text } from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';
import { groupCatalogByUiGroup, type MenuCatalogEntry } from '../lib/mode-catalog-menu.ts';

type DeckAccent = 'yellow' | 'teal' | 'purple';

export type DeckModeLaunchpadProps = {
  /** Deck label shown above the pad (e.g. "Deck A Mode"). */
  label: string;
  colorPalette: DeckAccent;
  /** Catalog entries for this deck only (strict per-deck). */
  entries: readonly MenuCatalogEntry[];
  /** Currently selected pack slug (from ControlState). */
  selectedSlug: string;
  /** True when menu came from live catalog (false = legacy VISUAL_MODES fallback). */
  catalogLive: boolean;
  /** True when selected slug is absent from the current menu (holding last compiled). */
  holdingMissing: boolean;
  /** Catalog menu epoch (display only). */
  menuEpoch: number | null;
  onSelectSlug: (slug: string) => void;
  /** Explicit Reload active — re-fetch compiled for the current selection. */
  onReloadActive: () => void;
  reloadBusy?: boolean;
  figureControls?: React.ReactNode;
};

export function DeckModeLaunchpad({
  label,
  colorPalette,
  entries,
  selectedSlug,
  catalogLive,
  holdingMissing,
  menuEpoch,
  onSelectSlug,
  onReloadActive,
  reloadBusy = false,
  figureControls,
}: DeckModeLaunchpadProps) {
  const groups = useMemo(() => groupCatalogByUiGroup(entries), [entries]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.slug === selectedSlug) ?? null,
    [entries, selectedSlug],
  );

  const selectedGroupKey = useMemo(() => {
    if (selectedEntry?.uiGroup) return selectedEntry.uiGroup.trim() || 'other';
    if (selectedEntry) return 'other';
    // Prefer first group that has the selection via legacy index match, else first group.
    for (const g of groups) {
      if (g.entries.some((e) => e.slug === selectedSlug)) return g.key;
    }
    return groups[0]?.key ?? 'other';
  }, [groups, selectedEntry, selectedSlug]);

  const [activeGroup, setActiveGroup] = useState(selectedGroupKey);

  useEffect(() => {
    // Keep tab focused on the selection's group when selection or catalog changes.
    setActiveGroup(selectedGroupKey);
  }, [selectedGroupKey]);

  const activeModes = useMemo(() => {
    const group = groups.find((g) => g.key === activeGroup) ?? groups[0];
    return group?.entries ?? [];
  }, [groups, activeGroup]);

  const displayName = selectedEntry
    ? (selectedEntry.label ?? selectedEntry.slug)
    : selectedSlug
      ? `${selectedSlug}${holdingMissing ? ' (held)' : ''}`
      : '—';

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
            {displayName}
          </Text>
          {holdingMissing && (
            <Text fontSize="xs" color="orange.300" mt={0.5}>
              Holding last compiled — not in current catalog
            </Text>
          )}
          {!catalogLive && (
            <Text fontSize="xs" color="whiteAlpha.500" mt={0.5}>
              Catalog unavailable — legacy mode list
            </Text>
          )}
        </Box>
        <Flex direction="column" align="flex-end" gap={1}>
          <Text fontFamily="mono" fontSize="sm" color="whiteAlpha.500">
            {selectedEntry?.legacyIndex !== undefined
              ? `#${selectedEntry.legacyIndex}`
              : selectedSlug
                ? selectedSlug
                : '—'}
          </Text>
          {menuEpoch !== null && catalogLive && (
            <Text fontFamily="mono" fontSize="xs" color="whiteAlpha.400">
              epoch {menuEpoch}
            </Text>
          )}
          <Button
            size="sm"
            variant="subtle"
            colorPalette={colorPalette}
            onClick={onReloadActive}
            disabled={!selectedSlug || reloadBusy}
            loading={reloadBusy}
            aria-label="Reload active preset"
          >
            Reload active
          </Button>
        </Flex>
      </Flex>

      <Flex gap={1.5} wrap="wrap">
        {groups.map((group) => {
          const isActive = group.key === activeGroup;
          const hasSelection = group.entries.some((e) => e.slug === selectedSlug);
          return (
            <Button
              key={group.key}
              size="sm"
              h="2.25rem"
              px={3}
              fontSize="sm"
              fontWeight="semibold"
              variant={isActive ? 'solid' : 'subtle'}
              colorPalette={isActive ? colorPalette : 'gray'}
              borderWidth={hasSelection && !isActive ? '1px' : '0'}
              borderColor={`${colorPalette}.400`}
              onClick={() => setActiveGroup(group.key)}
              aria-pressed={isActive}
            >
              {group.label}
            </Button>
          );
        })}
      </Flex>

      <Grid templateColumns="repeat(auto-fill, minmax(7.5rem, 1fr))" gap={2} flex="1" minH="12rem">
        {activeModes.map((entry) => {
          const isSelected = entry.slug === selectedSlug;
          const name = entry.label ?? entry.slug;
          return (
            <Button
              key={entry.slug}
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
                setActiveGroup(
                  entry.uiGroup && entry.uiGroup.trim() !== '' ? entry.uiGroup.trim() : 'other',
                );
                onSelectSlug(entry.slug);
              }}
              aria-pressed={isSelected}
              aria-label={entry.legacyIndex !== undefined ? `${name} (${entry.legacyIndex})` : name}
            >
              {name}
            </Button>
          );
        })}
      </Grid>
      {figureControls &&
        (activeGroup === 'figure' ||
          activeModes.some((e) => e.uiGroup === 'figure' || e.legacyIndex === 24)) && (
          <Box mt={2} pt={3} borderTop="1px solid" borderColor="whiteAlpha.200">
            {figureControls}
          </Box>
        )}
    </Box>
  );
}

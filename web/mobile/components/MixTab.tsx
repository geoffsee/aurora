import { Box, Button, Flex, Grid, NativeSelect, Text } from '@chakra-ui/react';
import { useControls } from '../../controls/context/ControlsContext.tsx';
import type { DeckSide } from '../../controls/lib/deck-mode.ts';
import type { MenuCatalogEntry } from '../../controls/lib/mode-catalog-menu.ts';
import { HAPTIC_TICK_MS, haptic } from '../lib/haptics.ts';
import { TouchSlider } from './TouchSlider.tsx';

/** Deck accents, shared with the crossfade fill so A/B reads as one system. */
const DECK_ACCENT = { A: '#c8b184', B: '#7fd1e0' } as const;

function DeckPicker({
  side,
  entries,
  activeSlug,
  live,
}: {
  side: DeckSide;
  entries: MenuCatalogEntry[];
  activeSlug: string;
  /** True when the crossfade actually favours this deck. */
  live: boolean;
}) {
  const { selectDeckPreset } = useControls();
  const label = `Deck ${side}`;
  const accent = DECK_ACCENT[side];

  return (
    <Box
      // A left rule in the deck's accent, lit only for the deck you are
      // actually watching. Which pack is loaded and which pack is *on screen*
      // are different questions, and only the second one matters mid-set.
      borderLeftWidth="3px"
      borderColor={live ? accent : 'whiteAlpha.200'}
      pl={2}
      minW={0}
    >
      <Text
        fontSize="sm"
        color={live ? accent : 'whiteAlpha.600'}
        textTransform="uppercase"
        letterSpacing="wider"
        fontWeight={live ? 'bold' : 'normal'}
      >
        {label}
        {live ? ' · live' : ''}
      </Text>
      {/* A native select gets the platform picker wheel — far better one-handed
          than a scrolling grid of 50+ packs. */}
      <NativeSelect.Root size="lg" mt={1}>
        <NativeSelect.Field
          aria-label={`${label} pack`}
          value={activeSlug}
          onChange={(e) => selectDeckPreset(side, e.target.value)}
          h="3.25rem"
          fontSize="md"
        >
          {entries.length === 0 ? <option value={activeSlug}>Catalog unavailable</option> : null}
          {entries.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.label ?? entry.slug}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Box>
  );
}

export function MixTab() {
  const { state, updateState, modeMenu } = useControls();

  return (
    <Flex direction="column" gap={5}>
      <Box>
        <Flex align="center" justify="space-between" mb={1}>
          <Text fontSize="md" fontWeight="bold" color={DECK_ACCENT.A}>
            A
          </Text>
          <Text fontSize="3xl" fontWeight="bold" fontFamily="mono" lineHeight="1">
            {Math.round(state.crossfade * 100)}%
          </Text>
          <Text fontSize="md" fontWeight="bold" color={DECK_ACCENT.B}>
            B
          </Text>
        </Flex>
        <input
          type="range"
          aria-label="Crossfade"
          value={state.crossfade}
          min={0}
          max={1}
          step={0.001}
          onChange={(e) => updateState({ crossfade: Number(e.target.value) })}
          style={{
            width: '100%',
            height: '3.5rem',
            borderRadius: '999px',
            // Chromium paints its own track over any background, so the fill
            // colour — not a gradient — is what carries the A/B bias.
            accentColor: state.crossfade < 0.5 ? DECK_ACCENT.A : DECK_ACCENT.B,
            outline: 'none',
            margin: 0,
            cursor: 'pointer',
          }}
        />
        <Grid templateColumns="repeat(3, 1fr)" gap={2} mt={2}>
          <Button
            h="3rem"
            colorPalette="yellow"
            variant={state.crossfade < 0.05 ? 'solid' : 'subtle'}
            onClick={() => {
              haptic(HAPTIC_TICK_MS);
              updateState({ crossfade: 0 });
            }}
          >
            A Full
          </Button>
          <Button
            h="3rem"
            variant={state.crossfade > 0.45 && state.crossfade < 0.55 ? 'solid' : 'subtle'}
            onClick={() => {
              haptic(HAPTIC_TICK_MS);
              updateState({ crossfade: 0.5 });
            }}
          >
            Center
          </Button>
          <Button
            h="3rem"
            colorPalette="teal"
            variant={state.crossfade > 0.95 ? 'solid' : 'subtle'}
            onClick={() => {
              haptic(HAPTIC_TICK_MS);
              updateState({ crossfade: 1 });
            }}
          >
            B Full
          </Button>
        </Grid>
      </Box>

      {/* Side by side rather than stacked: two full-width pickers pushed
          intensity below the fold on a small phone, and the deck pair reads
          better as a pair. */}
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
        <DeckPicker
          side="A"
          entries={modeMenu.deckAEntries}
          activeSlug={state.deckAPresetSlug}
          live={state.crossfade < 0.5}
        />
        <DeckPicker
          side="B"
          entries={modeMenu.deckBEntries}
          activeSlug={state.deckBPresetSlug}
          live={state.crossfade > 0.5}
        />
      </Grid>

      <TouchSlider
        label="Intensity"
        value={state.intensity}
        min={0.05}
        max={1.5}
        step={0.01}
        display={state.intensity.toFixed(2)}
        onChange={(intensity) => updateState({ intensity })}
      />

      <Grid templateColumns="repeat(2, 1fr)" gap={2}>
        <Button
          h="3rem"
          variant={state.beatSync ? 'solid' : 'surface'}
          colorPalette="yellow"
          aria-pressed={state.beatSync}
          onClick={() => {
            haptic(HAPTIC_TICK_MS);
            updateState({ beatSync: !state.beatSync });
          }}
        >
          Beat Sync
        </Button>
        <Button
          h="3rem"
          variant={state.barSync ? 'solid' : 'surface'}
          colorPalette="yellow"
          aria-pressed={state.barSync}
          onClick={() => {
            haptic(HAPTIC_TICK_MS);
            const barSync = !state.barSync;
            // Bar sync implies beat sync — mirrors the console so the two
            // surfaces cannot disagree about what "queued" means.
            updateState({ barSync, beatSync: state.beatSync || barSync });
          }}
        >
          Bar Sync
        </Button>
      </Grid>
    </Flex>
  );
}

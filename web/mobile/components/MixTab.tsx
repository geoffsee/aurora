import { Box, Button, Flex, Grid, NativeSelect, Text } from '@chakra-ui/react';
import { useControls } from '../../controls/context/ControlsContext.tsx';
import type { DeckSide } from '../../controls/lib/deck-mode.ts';
import type { MenuCatalogEntry } from '../../controls/lib/mode-catalog-menu.ts';
import { TouchSlider } from './TouchSlider.tsx';

function DeckPicker({
  side,
  entries,
  activeSlug,
}: {
  side: DeckSide;
  entries: MenuCatalogEntry[];
  activeSlug: string;
}) {
  const { selectDeckPreset } = useControls();
  const label = `Deck ${side}`;

  return (
    <Box>
      <Text fontSize="sm" color="whiteAlpha.700" textTransform="uppercase" letterSpacing="wider">
        {label}
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
          <Text fontSize="md" fontWeight="bold" color="#c8b184">
            A
          </Text>
          <Text fontSize="3xl" fontWeight="bold" fontFamily="mono" lineHeight="1">
            {Math.round(state.crossfade * 100)}%
          </Text>
          <Text fontSize="md" fontWeight="bold" color="#7fd1e0">
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
            accentColor: state.crossfade < 0.5 ? '#c8b184' : '#7fd1e0',
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
            onClick={() => updateState({ crossfade: 0 })}
          >
            A Full
          </Button>
          <Button
            h="3rem"
            variant={state.crossfade > 0.45 && state.crossfade < 0.55 ? 'solid' : 'subtle'}
            onClick={() => updateState({ crossfade: 0.5 })}
          >
            Center
          </Button>
          <Button
            h="3rem"
            colorPalette="teal"
            variant={state.crossfade > 0.95 ? 'solid' : 'subtle'}
            onClick={() => updateState({ crossfade: 1 })}
          >
            B Full
          </Button>
        </Grid>
      </Box>

      <DeckPicker side="A" entries={modeMenu.deckAEntries} activeSlug={state.deckAPresetSlug} />
      <DeckPicker side="B" entries={modeMenu.deckBEntries} activeSlug={state.deckBPresetSlug} />

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
          onClick={() => updateState({ beatSync: !state.beatSync })}
        >
          Beat Sync
        </Button>
        <Button
          h="3rem"
          variant={state.barSync ? 'solid' : 'surface'}
          colorPalette="yellow"
          aria-pressed={state.barSync}
          onClick={() => {
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

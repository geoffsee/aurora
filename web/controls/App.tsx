import { Box, Grid } from '@chakra-ui/react';
import { CrossfadePanel } from './components/CrossfadePanel.tsx';
import { CuesPanel } from './components/CuesPanel.tsx';
import { ErrorBanners } from './components/ErrorBanners.tsx';
import { GeoffseePagesNav } from './components/GeoffseePagesNav.tsx';
import { AudioCurvesPanel, MappingPanel } from './components/MappingPanel.tsx';
import { MasterPanel } from './components/MasterPanel.tsx';
import { MetersPanel } from './components/MetersPanel.tsx';
import { MidiCcPanel, TriggersPanel } from './components/MidiTriggersPanel.tsx';
import { ModelsPanel } from './components/ModelsPanel.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { AudioControlPanel, RehearsalPanel } from './components/RehearsalPanel.tsx';
import { SlidersPanel } from './components/SlidersPanel.tsx';
import { StatusHeader } from './components/StatusHeader.tsx';
import { ControlsProvider } from './context/ControlsContext.tsx';

// Stage row: large preview + crossfade fill the old dead zone.
// Pads row: three launchpads only. Params/cues sit below for balance.
const gridAreas = `
  "head head head head head head head head head head head head"
  "prev prev prev prev prev prev prev prev hero hero hero hero"
  "pads pads pads pads pads pads pads pads pads pads pads pads"
  "cues cues cues cues cues cues cues cues cues cues cues cues"
  "slid slid slid slid slid slid slid slid slid slid slid slid"
  "modl modl modl modl modl modl modl modl modl modl modl modl"
  "mast mast mast mast mast map map map map reh reh reh"
  "audc audc audc audc audc audc audc audc audc audc audc audc"
  "midi midi midi midi midi midi midi midi midi midi midi midi"
  "trig trig trig trig trig trig trig trig trig trig trig trig"
  "curv curv curv curv curv curv curv curv curv curv curv curv"
  "mete mete mete mete mete mete mete mete mete mete mete mete"
`;

export function App() {
  return (
    <ControlsProvider>
      <Box
        minH="100vh"
        bgGradient="to-b"
        gradientFrom="#07080f"
        gradientTo="#0c0e1a"
        color="gray.50"
        px={{ base: 2, md: 4 }}
        py={3}
      >
        <Grid
          as="main"
          w="100%"
          templateColumns="repeat(12, minmax(0, 1fr))"
          templateAreas={gridAreas}
          gap={3}
          alignItems="stretch"
        >
          <StatusHeader />
          <PreviewPanel />
          <CrossfadePanel />
          <SlidersPanel />
          <CuesPanel />
          <ModelsPanel />
          <MasterPanel />
          <MappingPanel />
          <RehearsalPanel />
          <AudioControlPanel />
          <MidiCcPanel />
          <TriggersPanel />
          <AudioCurvesPanel />
          <MetersPanel />
        </Grid>
        <ErrorBanners />
        <GeoffseePagesNav />
      </Box>
    </ControlsProvider>
  );
}

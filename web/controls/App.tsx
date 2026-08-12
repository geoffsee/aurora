import { Box, Grid } from '@chakra-ui/react';
import { useState } from 'react';
import { AudioShapingPanel } from './components/AudioShapingPanel.tsx';
import { CrossfadePanel } from './components/CrossfadePanel.tsx';
import { CuesPanel } from './components/CuesPanel.tsx';
import { ErrorBanners } from './components/ErrorBanners.tsx';
import { GeoffseePagesNav } from './components/GeoffseePagesNav.tsx';
import { AudioCurvesPanel, MappingPanel } from './components/MappingPanel.tsx';
import { MetersPanel } from './components/MetersPanel.tsx';
import { MidiCcPanel, TriggersPanel } from './components/MidiTriggersPanel.tsx';
import { PreviewPanel } from './components/PreviewPanel.tsx';
import { AudioControlPanel, RehearsalPanel } from './components/RehearsalPanel.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { SlidersPanel } from './components/SlidersPanel.tsx';
import { SoundCloudPanel } from './components/SoundCloudPanel.tsx';
import { StatusHeader } from './components/StatusHeader.tsx';
import { ControlsProvider } from './context/ControlsContext.tsx';

const gridAreas = `
  "head head head head head head head head head head head head"
  "prev prev prev prev prev prev prev prev hero hero hero hero"
  "pads pads pads pads pads pads pads pads pads pads pads pads"
  "map  map  map  map  reh  reh  reh  reh  reh  reh  reh  reh"
  "cues cues cues cues cues cues cues cues cues cues cues cues"
  "audc audc audc audc audc audc audc audc audc audc audc audc"
  "snd  snd  snd  snd  snd  snd  snd  snd  snd  snd  snd  snd"
  "midi midi midi midi midi midi midi midi midi midi midi midi"
  "trig trig trig trig trig trig trig trig trig trig trig trig"
  "shap shap shap shap shap shap shap shap shap shap shap shap"
  "curv curv curv curv curv curv curv curv curv curv curv curv"
  "mete mete mete mete mete mete mete mete mete mete mete mete"
`;

export function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <ControlsProvider>
      <Box
        minH="100vh"
        bgGradient="to-b"
        gradientFrom="#090804"
        gradientTo="#0e0b0b"
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
          <StatusHeader onSettings={() => setSettingsOpen(true)} />
          <PreviewPanel />
          <CrossfadePanel />
          <SlidersPanel />
          <CuesPanel />
          <MappingPanel />
          <RehearsalPanel />
          <AudioControlPanel />
          <SoundCloudPanel />
          <MidiCcPanel />
          <TriggersPanel />
          <AudioShapingPanel />
          <AudioCurvesPanel />
          <MetersPanel />
        </Grid>
        <ErrorBanners />
        <GeoffseePagesNav />
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </Box>
    </ControlsProvider>
  );
}

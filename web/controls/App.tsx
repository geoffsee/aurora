import { Box, Grid } from "@chakra-ui/react";
import { StatusHeader } from "./components/StatusHeader.tsx";
import { CrossfadePanel } from "./components/CrossfadePanel.tsx";
import { CuesPanel } from "./components/CuesPanel.tsx";
import { SlidersPanel } from "./components/SlidersPanel.tsx";
import { MasterPanel } from "./components/MasterPanel.tsx";
import { MappingPanel, AudioCurvesPanel } from "./components/MappingPanel.tsx";
import { RehearsalPanel, AudioControlPanel } from "./components/RehearsalPanel.tsx";
import { MidiCcPanel, TriggersPanel } from "./components/MidiTriggersPanel.tsx";
import { MetersPanel } from "./components/MetersPanel.tsx";
import { ErrorBanners } from "./components/ErrorBanners.tsx";
import { PreviewPanel } from "./components/PreviewPanel.tsx";
import { ControlsProvider } from "./context/ControlsContext.tsx";

const gridAreas = `
  "head head head head head head head head head head head head"
  "prev prev prev prev prev prev prev prev prev prev prev prev"
  "hero hero hero hero cues cues cues cues cues cues cues cues"
  "slid slid slid slid slid slid slid slid slid slid slid slid"
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
				px={2}
				py={3}
			>
				<Grid
					as="main"
					maxW="1400px"
					mx="auto"
					templateColumns="repeat(12, minmax(0, 1fr))"
					templateAreas={gridAreas}
					gap={3}
				>
					<StatusHeader />
					<PreviewPanel />
					<CrossfadePanel />
					<CuesPanel />
					<SlidersPanel />
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
			</Box>
		</ControlsProvider>
	);
}

import { Box, Flex } from '@chakra-ui/react';
import { useCallback, useState } from 'react';
import { isRemoteInstance, loadInstanceTarget } from '../../shared/instance-target.ts';
import { loadGuestSession } from '../../shared/relay-session.ts';
import { isStaticHosting } from '../../shared/static-hosting.ts';
import { ErrorBanners } from '../controls/components/ErrorBanners.tsx';
import { ControlsProvider } from '../controls/context/ControlsContext.tsx';
import { ConnectionAlert } from './components/ConnectionAlert.tsx';
import { CuesTab } from './components/CuesTab.tsx';
import { InstanceSheet } from './components/InstanceSheet.tsx';
import { MixTab } from './components/MixTab.tsx';
import { PairScreen } from './components/PairScreen.tsx';
import { PanicBar } from './components/PanicBar.tsx';
import { ParamsTab } from './components/ParamsTab.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { TabBar } from './components/TabBar.tsx';
import { loadMobileTab, type MobileTabId, saveMobileTab } from './lib/tabs.ts';

/**
 * Touch-first show control.
 *
 * Deliberately a *view* over ControlsProvider rather than its own client: the
 * console already owns transport, reconnect, clamping, cue quantization, and
 * preset interpolation, and a second implementation of any of those would drift
 * from the bridge's ControlState. Everything here reads and writes through the
 * same context the console uses.
 */
export function App() {
  const [tab, setTab] = useState<MobileTabId>(() => loadMobileTab());
  const [setupOpen, setSetupOpen] = useState(false);
  // Static build with nothing to talk to: pair with a projector through the
  // relay before showing controls that would go nowhere.
  const [needsPairing] = useState(
    () =>
      isStaticHosting() && loadGuestSession() === null && !isRemoteInstance(loadInstanceTarget()),
  );

  const selectTab = useCallback((next: MobileTabId) => {
    setTab(next);
    saveMobileTab(next);
  }, []);

  // After every hook: an early return above would change hook order between
  // renders. Pairing state is fixed for the life of the app (pairing reloads),
  // but the ordering rule does not care.
  if (needsPairing) return <PairScreen />;

  return (
    <ControlsProvider>
      <Flex
        direction="column"
        minH="100dvh"
        bgGradient="to-b"
        gradientFrom="#090804"
        gradientTo="#0e0b0b"
        color="gray.50"
      >
        <StatusBar onSettings={() => setSetupOpen(true)} />
        <ConnectionAlert />

        <Box as="main" flex="1" overflowY="auto" px={3} py={4}>
          {tab === 'mix' ? <MixTab /> : null}
          {tab === 'cues' ? <CuesTab /> : null}
          {tab === 'params' ? <ParamsTab /> : null}
        </Box>

        {/* Panic first, then navigation — both pinned, both thumb-reachable. */}
        <Box
          position="sticky"
          bottom={0}
          bg="rgba(9, 8, 4, 0.94)"
          backdropFilter="blur(12px)"
          borderTopWidth="1px"
          borderColor="whiteAlpha.200"
          pt={2}
        >
          <PanicBar />
          <TabBar active={tab} onSelect={selectTab} />
        </Box>

        <ErrorBanners />
        <InstanceSheet open={setupOpen} onClose={() => setSetupOpen(false)} />
      </Flex>
    </ControlsProvider>
  );
}

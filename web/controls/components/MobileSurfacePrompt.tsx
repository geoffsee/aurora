import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import {
  decideMobileSurface,
  isHandsetClient,
  loadSurfacePreference,
  saveSurfacePreference,
} from '../../../shared/mobile-routing.ts';

/**
 * Routes handsets that land on Console to the mobile show client.
 *
 * A forced or remembered choice redirects with no chrome; an unrecognised
 * phone gets a one-time interstitial instead of a hard bounce. Load-in is the
 * wrong moment to discover that a device you needed on Console decided it was
 * a phone, so the first visit always leaves the operator a door — and either
 * answer is remembered, so it only ever asks once per device.
 *
 * `location.replace` (not `assign`) keeps Back on the phone pointing at
 * wherever the operator came from rather than bouncing through Console again.
 */
export function MobileSurfacePrompt() {
  const [offerUrl, setOfferUrl] = useState<string | null>(null);

  useEffect(() => {
    const decision = decideMobileSurface({
      loc: window.location,
      handset: isHandsetClient(),
      preference: loadSurfacePreference(),
    });
    if (decision.kind === 'redirect') {
      window.location.replace(decision.url);
      return;
    }
    if (decision.kind === 'offer') setOfferUrl(decision.url);
  }, []);

  if (!offerUrl) return null;

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={2000}
      bg="blackAlpha.800"
      backdropFilter="blur(6px)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
      role="dialog"
      aria-modal="true"
      aria-label="Open the phone show client"
    >
      <Box
        borderWidth="1px"
        borderColor="whiteAlpha.300"
        borderRadius="lg"
        bg="#0e0b0b"
        p={5}
        maxW="380px"
        w="100%"
      >
        <Text as="h2" fontSize="xl" fontWeight="bold" m={0} mb={2}>
          Phone detected
        </Text>
        <Text fontSize="sm" color="whiteAlpha.800" mb={4}>
          Aurora has a touch-first show client built for handsets. Console is dense and hard to run
          one-handed on a stage.
        </Text>
        <Flex direction="column" gap={2}>
          <Button
            colorPalette="green"
            onClick={() => {
              saveSurfacePreference('mobile');
              window.location.replace(offerUrl);
            }}
          >
            Continue to phone UI
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              saveSurfacePreference('console');
              setOfferUrl(null);
            }}
          >
            Stay on Console
          </Button>
        </Flex>
        <Text fontSize="xs" color="whiteAlpha.600" mt={3}>
          Remembered on this device. Add <code>?console=1</code> or <code>?mobile=1</code> to any
          Console link to override.
        </Text>
      </Box>
    </Box>
  );
}

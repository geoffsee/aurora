import { Box, Button, Field, Flex, Input, Text } from '@chakra-ui/react';
import { useState } from 'react';
import {
  formatPairingCode,
  normalizePairingCode,
  PAIRING_CODE_LENGTH,
} from '../../../shared/pairing-code.ts';
import { pairAsGuest, resolveRelayBaseUrl } from '../../../shared/relay-session.ts';

/**
 * Code entry for the static (Pages) build, where there is no bridge to reach.
 *
 * The projector displays a code; this exchanges it — once — for a guest token.
 * A reload is the simplest way to bring the whole provider up on the relay
 * transport rather than rewiring a live session.
 */
export function PairScreen() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizePairingCode(code);
  const complete = normalized.length === PAIRING_CODE_LENGTH;

  const submit = async () => {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    const result = await pairAsGuest(normalized, resolveRelayBaseUrl());
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    location.reload();
  };

  return (
    <Flex
      direction="column"
      minH="100dvh"
      bgGradient="to-b"
      gradientFrom="#090804"
      gradientTo="#0e0b0b"
      color="gray.50"
      align="center"
      justify="center"
      px={5}
      gap={6}
    >
      <Box textAlign="center">
        <Text fontSize="sm" textTransform="uppercase" letterSpacing="wider" color="whiteAlpha.600">
          aurora
        </Text>
        <Text fontSize="2xl" fontWeight="bold" m={0}>
          Pair with a projector
        </Text>
        <Text fontSize="sm" color="whiteAlpha.600" mt={2}>
          On the show machine, open Console and press <strong>Pair phone</strong> in the top row,
          then type the code it shows.
        </Text>
      </Box>

      <Field.Root invalid={error !== null} w="100%" maxW="20rem">
        <Input
          value={formatPairingCode(normalized) || code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          placeholder="ABCD-EFGH"
          // Codes are uppercase and unambiguous by construction; stop the OS
          // from "helpfully" autocapitalizing, autocorrecting, or spellchecking.
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          textAlign="center"
          fontFamily="mono"
          fontSize="2xl"
          letterSpacing="0.15em"
          h="4rem"
        />
        {error ? (
          <Text fontSize="sm" color="red.300" mt={2} textAlign="center" w="100%">
            {error}
          </Text>
        ) : null}
      </Field.Root>

      <Button
        w="100%"
        maxW="20rem"
        h="3.5rem"
        colorPalette="cyan"
        disabled={!complete}
        loading={busy}
        onClick={() => void submit()}
      >
        Pair
      </Button>

      <Text fontSize="xs" color="whiteAlpha.500" textAlign="center" maxW="20rem">
        Codes expire after a few minutes. If yours is stale, press “New code” in Console.
      </Text>
    </Flex>
  );
}

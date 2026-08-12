import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';
import { accessTokenHeaders } from '../../../shared/access-token.ts';
import { instanceLocationFor, loadInstanceTarget } from '../../../shared/instance-target.ts';
import { mintOtp, revokeOtpSessions } from '../../../shared/otp-auth.ts';
import { formatPairingCode } from '../../../shared/pairing-code.ts';
import { isStaticHosting } from '../../../shared/static-hosting.ts';
import { bridgeHttpOrigin } from '../lib/modes-api-client.ts';

function remainingLabel(expiresAt: number, now: number): string {
  const ms = expiresAt - now;
  if (ms <= 0) return 'Expired';
  const seconds = Math.ceil(ms / 1000);
  return `Expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Issue a short pairing code so a phone never has to type the access token.
 *
 * `AURORA_ACCESS_TOKEN` is a 32-character hex string — the right shape for a
 * config file, the wrong shape for a handset in a dark room. In practice it
 * ends up shared as a tokenised URL, which puts the *long-lived* credential
 * through a chat app. A code redeemed once for a session token is the same
 * trade the relay already makes, and the operator learns one flow either way.
 *
 * LAN only: the static Pages build has no bridge to mint against and uses the
 * relay's own pairing instead.
 */
export function PhonePairingSection() {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const staticHosted = isStaticHosting();

  useEffect(() => {
    if (code === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [code]);

  const bridge = useCallback(() => {
    const target = loadInstanceTarget();
    return {
      origin: bridgeHttpOrigin(instanceLocationFor(target)),
      headers: accessTokenHeaders(target.token),
    };
  }, []);

  const issue = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStatus(null);
    const { origin, headers } = bridge();
    const result = await mintOtp(origin, headers);
    setBusy(false);
    if (!result.ok) {
      setCode(null);
      setError(result.error);
      return;
    }
    setCode(result.value.code);
    setExpiresAt(result.value.expiresAt);
    setNow(Date.now());
  }, [bridge]);

  const revoke = useCallback(async () => {
    setBusy(true);
    setError(null);
    const { origin, headers } = bridge();
    const result = await revokeOtpSessions(origin, headers);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCode(null);
    setStatus(
      result.value.revoked === 1
        ? '1 phone session revoked'
        : `${result.value.revoked} phone sessions revoked`,
    );
  }, [bridge]);

  if (staticHosted) return null;

  const expired = code !== null && expiresAt > 0 && expiresAt <= now;

  return (
    <Box>
      <Text fontSize="sm" fontWeight="semibold" letterSpacing="0.04em" mb={1}>
        Phone pairing
      </Text>
      <Text fontSize="xs" color="whiteAlpha.600" mb={3}>
        Issue a one-time code instead of reading out <code>AURORA_ACCESS_TOKEN</code>. The phone
        types it once in Setup and keeps a session token; the code is single-use and dies after five
        minutes. Requires the instance to actually be gated — an open bridge has nothing to pair
        into.
      </Text>

      {code !== null ? (
        <Box
          borderWidth="1px"
          borderColor="whiteAlpha.200"
          borderRadius="md"
          px={4}
          py={3}
          mb={3}
          textAlign="center"
        >
          <Text
            fontFamily="mono"
            fontSize="2xl"
            fontWeight="bold"
            letterSpacing="0.12em"
            color={expired ? 'whiteAlpha.500' : 'gray.50'}
            m={0}
          >
            {formatPairingCode(code)}
          </Text>
          <Text fontSize="xs" color={expired ? 'orange.300' : 'whiteAlpha.600'} mt={1}>
            {expired ? 'Code expired' : remainingLabel(expiresAt, now)}
          </Text>
        </Box>
      ) : null}

      <Flex gap={2} wrap="wrap">
        <Button size="sm" loading={busy} onClick={() => void issue()}>
          {code === null ? 'Issue pairing code' : 'New code'}
        </Button>
        <Button size="sm" variant="surface" onClick={() => void revoke()}>
          Revoke phone sessions
        </Button>
      </Flex>

      {error ? (
        <Text fontSize="xs" color="red.300" mt={2}>
          {error}
        </Text>
      ) : null}
      {status ? (
        <Text fontSize="xs" color="whiteAlpha.700" mt={2}>
          {status}
        </Text>
      ) : null}
      <Text fontSize="xs" color="whiteAlpha.500" mt={2}>
        Sessions also end when the bridge restarts.
      </Text>
    </Box>
  );
}

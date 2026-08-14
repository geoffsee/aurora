import { Box, Button, Flex, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatPairingCode } from '../../../shared/pairing-code.ts';
import {
  clearHostSession,
  ensureHostSession,
  type HostSession,
  isCodeExpired,
  loadGuestPaired,
  loadHostSession,
  resolveRelayBaseUrl,
  rotateHostCode,
} from '../../../shared/relay-session.ts';
import { isStaticHosting } from '../../../shared/static-hosting.ts';

/** How often to notice that a phone paired, or that the code went stale. */
const POLL_MS = 1000;

function remainingLabel(session: HostSession, now: number): string {
  const ms = session.codeExpiresAt - now;
  if (!session.codeExpiresAt || ms <= 0) return 'Expired';
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return `Expires in ${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Relay pairing, in the Console top row.
 *
 * The code used to be painted on the projector, where it competed with the
 * artwork and stayed in every capture and IMAG feed. Pairing is an ops action,
 * so it belongs next to the other status pills — and it stays *hidden* until
 * asked for, which is strictly better than the old overlay for the same
 * shoulder-surfing reason that made a persistent code a problem.
 *
 * Registration is shared with the projector through same-origin storage
 * (`ensureHostSession`), so whichever surface opens first owns the session and
 * the other adopts it. Only relevant on the static build: a bridged stack has a
 * WebSocket bus and no relay.
 */
export function PairPhoneControl() {
  const [session, setSession] = useState<HostSession | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairedAt, setPairedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef<HostSession | null>(null);

  const relayHosted = isStaticHosting();

  // Adopt whatever session already exists (usually the projector's) without
  // registering one — Console should not create a session nobody asked for.
  useEffect(() => {
    if (!relayHosted) return;
    const existing = loadHostSession();
    sessionRef.current = existing;
    setSession(existing);
  }, [relayHosted]);

  useEffect(() => {
    if (!relayHosted) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
      // The projector may have registered after Console loaded.
      if (!sessionRef.current) {
        const adopted = loadHostSession();
        if (adopted) {
          sessionRef.current = adopted;
          setSession(adopted);
        }
      }
      const current = sessionRef.current;
      if (current) {
        const mark = loadGuestPaired(current.sessionId);
        setPairedAt(mark ? mark.pairedAt : null);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [relayHosted]);

  const applySession = useCallback((next: HostSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const reveal = useCallback(async () => {
    setOpen(true);
    setError(null);
    if (sessionRef.current) return;
    setBusy(true);
    const result = await ensureHostSession(resolveRelayBaseUrl());
    setBusy(false);
    if (result.ok) applySession(result.value);
    else setError(result.error);
  }, [applySession]);

  const rotate = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    const result = await rotateHostCode(current);
    setBusy(false);
    if (result.ok) {
      applySession(result.value);
      // A fresh code starts a fresh pairing story; the old guest keeps its
      // token, but "paired" no longer describes the code on screen.
      setPairedAt(null);
    } else {
      setError(result.error);
    }
  }, [applySession, busy]);

  /** Recovery when the stored session outlived its Durable Object. */
  const restart = useCallback(async () => {
    setBusy(true);
    setError(null);
    clearHostSession();
    sessionRef.current = null;
    setSession(null);
    setPairedAt(null);
    const result = await ensureHostSession(resolveRelayBaseUrl());
    setBusy(false);
    if (result.ok) applySession(result.value);
    else setError(result.error);
  }, [applySession]);

  if (!relayHosted) return null;

  const expired = session ? isCodeExpired(session, now) : false;
  const paired = pairedAt !== null;

  return (
    <Box position="relative">
      <Button
        size="sm"
        variant={open ? 'solid' : 'outline'}
        colorPalette={paired ? 'green' : 'cyan'}
        onClick={() => (open ? setOpen(false) : void reveal())}
        aria-expanded={open}
        aria-label={paired ? 'Phone paired — pairing options' : 'Pair a phone'}
        title="Pair a phone over the relay"
        minH="2.5rem"
      >
        {paired ? 'Phone paired' : 'Pair phone'}
      </Button>

      {open ? (
        <Box
          position="absolute"
          top="calc(100% + 0.5rem)"
          right={0}
          zIndex={1200}
          minW="16rem"
          p={4}
          borderWidth="1px"
          borderColor="whiteAlpha.300"
          borderRadius="lg"
          bg="#0e0b0b"
          boxShadow="lg"
          role="dialog"
          aria-label="Phone pairing"
        >
          {session ? (
            <>
              <Text
                fontFamily="mono"
                fontSize="2xl"
                fontWeight="bold"
                letterSpacing="0.12em"
                textAlign="center"
                color={expired ? 'whiteAlpha.500' : 'gray.50'}
                m={0}
              >
                {formatPairingCode(session.code)}
              </Text>
              <Text
                fontSize="xs"
                textAlign="center"
                mt={1}
                color={expired ? 'orange.300' : 'whiteAlpha.600'}
              >
                {expired ? 'Code expired' : remainingLabel(session, now)}
              </Text>
              <Text fontSize="xs" color="whiteAlpha.700" mt={3}>
                Enter this code in the mobile show client.
              </Text>
              {paired ? (
                <Text fontSize="xs" color="green.300" mt={2}>
                  A phone is live on this session. Issue a new code to pair another.
                </Text>
              ) : null}
              <Flex gap={2} mt={3}>
                <Button size="sm" flex={1} loading={busy} onClick={() => void rotate()}>
                  New code
                </Button>
                <Button
                  size="sm"
                  flex={1}
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(formatPairingCode(session.code));
                  }}
                >
                  Copy
                </Button>
              </Flex>
            </>
          ) : (
            <Text fontSize="sm" color="whiteAlpha.700">
              {busy ? 'Registering a session…' : 'No relay session yet.'}
            </Text>
          )}

          {error ? (
            <>
              <Text fontSize="xs" color="red.300" mt={3}>
                {error}
              </Text>
              <Button size="sm" variant="ghost" mt={1} onClick={() => void restart()}>
                Start a new session
              </Button>
            </>
          ) : null}

          <Button size="sm" variant="ghost" w="100%" mt={2} onClick={() => setOpen(false)}>
            Close
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}

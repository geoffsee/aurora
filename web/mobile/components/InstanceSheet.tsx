import { Box, Button, Dialog, Field, Flex, Input, Portal, Text } from '@chakra-ui/react';
import { useState } from 'react';
import {
  describeInstanceTarget,
  instanceLocationFor,
  loadInstanceTarget,
  parseInstanceOrigin,
  parseInstanceToken,
  saveInstanceTarget,
} from '../../../shared/instance-target.ts';
import { redeemOtp } from '../../../shared/otp-auth.ts';
import { formatPairingCode, normalizePairingCode } from '../../../shared/pairing-code.ts';
import { useControls } from '../../controls/context/ControlsContext.tsx';
import { bridgeHttpOrigin } from '../../controls/lib/modes-api-client.ts';

export function InstanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, updateState, micActive, toggleMicCapture } = useControls();

  const [instance] = useState(() => loadInstanceTarget());
  const [instanceInput, setInstanceInput] = useState(() => instance.origin ?? '');
  const [tokenInput, setTokenInput] = useState(() => instance.token ?? '');
  const [error, setError] = useState<string | null>(null);

  // --- One-time pairing code (#281) ---
  const [codeInput, setCodeInput] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);

  const connect = () => {
    const parsed = parseInstanceOrigin(instanceInput);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    saveInstanceTarget({ origin: parsed.origin, token: parseInstanceToken(tokenInput) });
    location.reload();
  };

  /**
   * Redeem the code against whichever bridge this phone is pointed at, then
   * store the returned session token *as* the instance token.
   *
   * That reuse is the point: everything downstream — the WebSocket URL, the
   * `/api/*` headers, reconnects — already knows how to carry an instance
   * token, so a paired phone needs no second code path and stays paired across
   * reloads until the token expires or the operator revokes it.
   */
  const pairWithCode = async () => {
    const code = normalizePairingCode(codeInput);
    if (pairing) return;
    setPairing(true);
    setPairError(null);

    const parsed = parseInstanceOrigin(instanceInput);
    if (!parsed.ok) {
      setPairing(false);
      setPairError(parsed.error);
      return;
    }
    const origin = bridgeHttpOrigin(instanceLocationFor({ origin: parsed.origin, token: null }));
    const result = await redeemOtp(origin, code);
    setPairing(false);
    if (!result.ok) {
      setPairError(result.error);
      return;
    }
    saveInstanceTarget({ origin: parsed.origin, token: result.value.token });
    location.reload();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="full">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content bg="#0c0e1a" color="gray.50" pt="env(safe-area-inset-top)">
            <Dialog.Header display="flex" justifyContent="space-between" alignItems="center">
              <Dialog.Title fontSize="lg" fontWeight="bold">
                Setup
              </Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <Button variant="ghost" minW="3rem" h="3rem" onClick={onClose} aria-label="Close">
                  &#x2715;
                </Button>
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body
              display="flex"
              flexDirection="column"
              gap={6}
              pb="max(env(safe-area-inset-bottom), 1.5rem)"
            >
              {/* ---- Audio source ---- */}
              <Box>
                <Text fontSize="sm" fontWeight="semibold" letterSpacing="0.04em" mb={1}>
                  Audio
                </Text>
                <Text fontSize="xs" color="whiteAlpha.600" mb={3}>
                  This phone's mic can drive tempo and energy directly — no Ableton, no OSC. Needs a
                  secure context, which the bridge's HTTPS ports provide.
                </Text>
                <Flex gap={2}>
                  <Button
                    flex={1}
                    h="3.25rem"
                    colorPalette="cyan"
                    variant={micActive ? 'solid' : 'surface'}
                    aria-pressed={micActive}
                    onClick={toggleMicCapture}
                  >
                    {micActive ? 'Mic on' : 'Use mic'}
                  </Button>
                  <Button
                    flex={1}
                    h="3.25rem"
                    colorPalette="purple"
                    variant={state.demoMode ? 'solid' : 'surface'}
                    aria-pressed={state.demoMode}
                    onClick={() => updateState({ demoMode: !state.demoMode })}
                  >
                    Demo audio
                  </Button>
                </Flex>
              </Box>

              {/* ---- Instance ---- */}
              <Box>
                <Text fontSize="sm" fontWeight="semibold" letterSpacing="0.04em" mb={1}>
                  Instance
                </Text>
                <Text fontSize="xs" color="whiteAlpha.600" mb={3}>
                  Driving <code>{describeInstanceTarget(instance)}</code>. Point this phone at the
                  show machine's bridge — open that address in a tab once and accept the certificate
                  first, or the connection will fail silently.
                </Text>
                <Flex direction="column" gap={3}>
                  <Field.Root invalid={error !== null}>
                    <Field.Label>Bridge address</Field.Label>
                    <Input
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="192.168.1.10:8444"
                      value={instanceInput}
                      onChange={(e) => setInstanceInput(e.target.value)}
                      h="3.25rem"
                    />
                    {error ? (
                      <Text fontSize="xs" color="red.300" mt={1}>
                        {error}
                      </Text>
                    ) : null}
                  </Field.Root>
                  {/* Codes first: this is the path an operator should take at
                      load-in, and burying it under a password field guarantees
                      they read out the hex token instead. */}
                  <Field.Root invalid={pairError !== null}>
                    <Field.Label>Pairing code</Field.Label>
                    <Input
                      value={formatPairingCode(normalizePairingCode(codeInput)) || codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void pairWithCode();
                      }}
                      placeholder="ABCD-EFGH"
                      // Codes are uppercase and unambiguous by construction; stop
                      // the OS autocapitalizing, autocorrecting, or spellchecking.
                      autoCapitalize="characters"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      textAlign="center"
                      fontFamily="mono"
                      fontSize="xl"
                      letterSpacing="0.12em"
                      h="3.5rem"
                    />
                    {pairError ? (
                      <Text fontSize="xs" color="red.300" mt={1}>
                        {pairError}
                      </Text>
                    ) : null}
                    <Button
                      mt={2}
                      w="100%"
                      h="3.25rem"
                      colorPalette="cyan"
                      loading={pairing}
                      onClick={() => void pairWithCode()}
                    >
                      Pair with code
                    </Button>
                    <Text fontSize="xs" color="whiteAlpha.600" mt={2}>
                      Console → Settings → <strong>Phone pairing</strong> issues one. Single-use,
                      expires in five minutes; this phone keeps a session token afterwards.
                    </Text>
                  </Field.Root>
                  <Field.Root>
                    <Field.Label>Access token</Field.Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Only if the instance sets one"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      h="3.25rem"
                    />
                  </Field.Root>
                  <Flex gap={2}>
                    <Button flex={1} h="3.25rem" onClick={connect}>
                      Connect &amp; reload
                    </Button>
                    <Button
                      flex={1}
                      h="3.25rem"
                      variant="surface"
                      onClick={() => {
                        saveInstanceTarget({ origin: null, token: null });
                        location.reload();
                      }}
                    >
                      This origin
                    </Button>
                  </Flex>
                </Flex>
              </Box>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

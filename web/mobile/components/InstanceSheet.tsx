import { Box, Button, Dialog, Field, Flex, Input, Portal, Text } from '@chakra-ui/react';
import { useState } from 'react';
import {
  describeInstanceTarget,
  loadInstanceTarget,
  parseInstanceOrigin,
  parseInstanceToken,
  saveInstanceTarget,
} from '../../../shared/instance-target.ts';
import { useControls } from '../../controls/context/ControlsContext.tsx';

export function InstanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, updateState, micActive, toggleMicCapture } = useControls();

  const [instance] = useState(() => loadInstanceTarget());
  const [instanceInput, setInstanceInput] = useState(() => instance.origin ?? '');
  const [tokenInput, setTokenInput] = useState(() => instance.token ?? '');
  const [error, setError] = useState<string | null>(null);

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

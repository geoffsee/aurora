import { Box, Button, Flex, Input, Text, Textarea } from '@chakra-ui/react';
import { useCallback, useRef, useState } from 'react';
import { buildCopilotRequest, type CopilotAction } from '../lib/copilot-prompt.ts';
import {
  anthropicProvider,
  COPILOT_DEFAULT_MODEL,
  type CopilotProviderFactory,
  type CopilotSettings,
  isCopilotConfigured,
  loadCopilotSettings,
  saveCopilotSettings,
} from '../lib/copilot-provider.ts';
import { type CopilotProposal, parseCopilotReply } from '../lib/copilot-response.ts';
import type { StudioKnobs } from '../lib/sketch-store.ts';
import type { WgslDiagnostic } from '../lib/wgsl-diagnostics.ts';

const ACTIONS: { id: CopilotAction; label: string; hint: string }[] = [
  { id: 'create', label: 'Create', hint: 'Describe a look — replaces the buffer' },
  { id: 'edit', label: 'Edit', hint: 'Revise the open sketch' },
  { id: 'explain', label: 'Explain', hint: 'What does this shader do?' },
  { id: 'fix', label: 'Fix errors', hint: 'Feed the compiler output back' },
];

/**
 * In-Studio authoring copilot.
 *
 * Two things this deliberately does not do:
 *
 * **It never writes to the editor on its own.** Every proposal lands behind an
 * explicit Apply, including `create`. Studio's buffer is the operator's work;
 * a copilot that silently replaces it is one bad generation away from losing a
 * sketch that took an hour.
 *
 * **It never offers Apply for something that would not export.** Proposals go
 * through the same package validation as Export and Publish, so a shader the
 * copilot hands over is one the rest of the pipeline will accept. Discovering
 * otherwise at Publish time — mid-load-in — is the failure worth designing out.
 */
export function CopilotPanel({
  wgsl,
  knobs,
  diagnostics,
  onApply,
  getSelection,
  providerFactory = anthropicProvider,
}: {
  wgsl: string;
  knobs: StudioKnobs;
  diagnostics: readonly WgslDiagnostic[];
  onApply: (wgsl: string) => void;
  /** Current editor selection, when the operator wants a scoped edit. */
  getSelection?: () => string;
  /** Injectable for tests and for a different backend. */
  providerFactory?: CopilotProviderFactory;
}) {
  const [settings, setSettings] = useState<CopilotSettings>(() => loadCopilotSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [action, setAction] = useState<CopilotAction>('create');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CopilotProposal | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const configured = isCopilotConfigured(settings);

  const persist = useCallback((next: CopilotSettings) => {
    setSettings(next);
    saveCopilotSettings(next);
  }, []);

  const run = useCallback(async () => {
    if (busy || !configured) return;
    setBusy(true);
    setError(null);
    setProposal(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const provider = await providerFactory(settings);
      const request = buildCopilotRequest({
        action,
        brief,
        wgsl,
        selection: action === 'edit' ? getSelection?.() : undefined,
        knobs,
        diagnostics,
      });
      const reply = await provider.complete(request, controller.signal);
      setProposal(parseCopilotReply(reply));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [
    action,
    brief,
    busy,
    configured,
    diagnostics,
    getSelection,
    knobs,
    providerFactory,
    settings,
    wgsl,
  ]);

  return (
    <Flex direction="column" gap={3} h="100%" minH={0}>
      <Flex align="center" justify="space-between" gap={2}>
        <Text fontWeight="bold" fontSize="sm">
          Copilot
        </Text>
        <Button size="xs" variant="surface" onClick={() => setShowSettings((v) => !v)}>
          {configured ? 'Provider' : 'Set up'}
        </Button>
      </Flex>

      {showSettings ? (
        <Flex
          direction="column"
          gap={2}
          p={3}
          borderWidth="1px"
          borderColor="#252a31"
          borderRadius="md"
        >
          <Text fontSize="xs" color="whiteAlpha.600">
            Your key stays in this browser and is never bundled or sent anywhere but the endpoint
            below. It is readable by anything that can run script in this tab — point{' '}
            <strong>Endpoint</strong> at a proxy instead if that is not a trade you want to make.
          </Text>
          <Input
            size="sm"
            type="password"
            placeholder="API key"
            autoComplete="off"
            value={settings.apiKey}
            onChange={(e) => persist({ ...settings, apiKey: e.target.value })}
          />
          <Input
            size="sm"
            placeholder={COPILOT_DEFAULT_MODEL}
            value={settings.model}
            onChange={(e) => persist({ ...settings, model: e.target.value })}
          />
          <Input
            size="sm"
            placeholder="Endpoint (optional — proxy or local)"
            autoComplete="off"
            value={settings.baseUrl}
            onChange={(e) => persist({ ...settings, baseUrl: e.target.value })}
          />
        </Flex>
      ) : null}

      <Flex gap={1} wrap="wrap">
        {ACTIONS.map((entry) => (
          <Button
            key={entry.id}
            size="xs"
            variant={action === entry.id ? 'solid' : 'surface'}
            colorPalette={action === entry.id ? 'cyan' : undefined}
            title={entry.hint}
            onClick={() => setAction(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
      </Flex>

      <Textarea
        rows={3}
        fontSize="sm"
        placeholder={
          action === 'create'
            ? 'slow glass horizon, bass lifts the field, idle stays calm'
            : action === 'fix'
              ? 'Optional: anything the compiler output does not say'
              : 'more particle density; react harder to mid'
        }
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void run();
        }}
      />

      <Flex gap={2}>
        <Button size="sm" flex={1} loading={busy} disabled={!configured} onClick={() => void run()}>
          {configured ? 'Run' : 'Configure a provider'}
        </Button>
        {busy ? (
          <Button size="sm" variant="surface" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        ) : null}
      </Flex>

      {error ? (
        <Text fontSize="xs" color="red.300">
          {error}
        </Text>
      ) : null}

      {proposal ? (
        <Box
          flex="1"
          minH={0}
          overflowY="auto"
          borderWidth="1px"
          borderColor="#252a31"
          borderRadius="md"
          p={3}
        >
          {proposal.prose ? (
            <Text
              fontSize="sm"
              whiteSpace="pre-wrap"
              mb={proposal.wgsl || proposal.errors.length ? 3 : 0}
            >
              {proposal.prose}
            </Text>
          ) : null}

          {proposal.errors.length ? (
            <Box>
              <Text fontSize="xs" color="orange.300" fontWeight="bold">
                Not applied — the reply would not pass package validation:
              </Text>
              {proposal.errors.map((err) => (
                <Text key={`${err.path}:${err.message}`} fontSize="xs" color="orange.200">
                  {err.path}: {err.message}
                </Text>
              ))}
            </Box>
          ) : null}

          {proposal.wgsl ? (
            <Flex gap={2} mt={2}>
              <Button
                size="sm"
                colorPalette="green"
                onClick={() => {
                  onApply(proposal.wgsl as string);
                  setProposal(null);
                }}
              >
                Apply to editor
              </Button>
              <Button size="sm" variant="surface" onClick={() => setProposal(null)}>
                Discard
              </Button>
            </Flex>
          ) : null}
        </Box>
      ) : null}
    </Flex>
  );
}

import { Box, Button, Flex, Input, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { accessTokenHeaders } from '../../../shared/access-token.ts';
import { loadInstanceTarget } from '../../../shared/instance-target.ts';
import type { HostShowSession, PublicShowSummary } from '../../../shared/live-show.ts';
import {
  clearHostShowSession,
  createPagesLiveShow,
  loadHostShowSession,
  resolveLiveApiBase,
  saveHostShowSession,
} from '../../../shared/live-show-client.ts';
import { ensureHostSession, resolveRelayBaseUrl } from '../../../shared/relay-session.ts';
import { isStaticHosting } from '../../../shared/static-hosting.ts';

type StatusPayload = {
  session: HostShowSession | null;
  sourceConnected?: boolean;
  configuration?: { enabled?: boolean; missing?: string[] };
  remote?: { show?: PublicShowSummary; sourceConnected?: boolean; packages?: unknown[] } | null;
};

function timeLeft(endsAt: number, now: number): string {
  const minutes = Math.max(0, Math.ceil((endsAt - now) / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function LiveShowControl() {
  const pages = isStaticHosting();
  const liveApi = useMemo(() => resolveLiveApiBase(), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<'open' | 'closed'>('open');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [status, setStatus] = useState<StatusPayload>({ session: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const target = useMemo(() => loadInstanceTarget(), []);
  const localApi = `${target.origin ?? location.origin}/api/live-show`;
  const localHeaders = useMemo(
    () => ({ 'content-type': 'application/json', ...accessTokenHeaders(target.token) }),
    [target.token],
  );

  const refresh = useCallback(async () => {
    try {
      if (pages) {
        const session = loadHostShowSession();
        if (!session) {
          setStatus({ session: null });
          return;
        }
        const response = await fetch(
          `${liveApi}/api/shows/${encodeURIComponent(session.show.id)}/manage`,
          { headers: { authorization: `Bearer ${session.hostToken}` }, cache: 'no-store' },
        );
        if (response.status === 404 || response.status === 410) {
          clearHostShowSession();
          setStatus({ session: null });
          return;
        }
        const remote = response.ok ? ((await response.json()) as StatusPayload['remote']) : null;
        setStatus({ session, sourceConnected: Boolean(remote?.sourceConnected), remote });
      } else {
        const response = await fetch(localApi, { headers: localHeaders, cache: 'no-store' });
        const payload = (await response.json()) as StatusPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
        setStatus(payload);
      }
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [liveApi, localApi, localHeaders, pages]);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 5_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  const start = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (pages) {
        const relay = await ensureHostSession(resolveRelayBaseUrl());
        if (!relay.ok) throw new Error(relay.error);
        const result = await createPagesLiveShow(liveApi, {
          name,
          access,
          durationMs: durationMinutes * 60_000,
          relaySessionId: relay.value.sessionId,
          relayHostToken: relay.value.hostToken,
        });
        if (!result.ok) throw new Error(result.error);
        saveHostShowSession(result.value);
      } else {
        const response = await fetch(localApi, {
          method: 'POST',
          headers: localHeaders,
          body: JSON.stringify({ name, access, durationMs: durationMinutes * 60_000 }),
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    const session = status.session;
    if (!session) return;
    setBusy(true);
    try {
      const response = pages
        ? await fetch(`${liveApi}/api/shows/${encodeURIComponent(session.show.id)}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${session.hostToken}` },
          })
        : await fetch(localApi, { method: 'DELETE', headers: localHeaders });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (pages) clearHostShowSession();
      setStatus({ session: null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    const session = status.session;
    if (!session) return;
    setBusy(true);
    try {
      const response = pages
        ? await fetch(`${liveApi}/api/shows/${encodeURIComponent(session.show.id)}/code/rotate`, {
            method: 'POST',
            headers: { authorization: `Bearer ${session.hostToken}` },
          })
        : await fetch(`${localApi}/code/rotate`, { method: 'POST', headers: localHeaders });
      const payload = (await response.json()) as { code?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
      session.code = payload.code;
      if (pages) saveHostShowSession(session);
      setStatus((current) => ({ ...current, session: { ...session } }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const session = status.session;
  const show = status.remote?.show ?? session?.show;
  const viewerCount = show?.viewerCount ?? 0;
  const setupMissing = status.configuration?.missing?.join(', ');

  return (
    <Box position="relative">
      <Button
        size="sm"
        variant={session ? 'solid' : 'outline'}
        colorPalette={session ? 'green' : 'purple'}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {session ? 'Show live' : 'Live show'}
      </Button>
      {open ? (
        <Box
          position="absolute"
          top="calc(100% + 0.5rem)"
          right={0}
          zIndex={1200}
          minW={{ base: '19rem', md: '24rem' }}
          p={4}
          borderWidth="1px"
          borderColor="whiteAlpha.300"
          borderRadius="lg"
          bg="#0e0b0b"
          boxShadow="lg"
          role="dialog"
          aria-label="Live show publishing"
        >
          <Text fontWeight="bold" mb={3}>
            Audience live show
          </Text>
          {session && show ? (
            <>
              <Text fontSize="lg">{show.name}</Text>
              <Text fontSize="xs" color="whiteAlpha.700" mt={1}>
                {show.access} · {viewerCount} viewer{viewerCount === 1 ? '' : 's'} · ends in{' '}
                {timeLeft(show.endsAt, now)}
              </Text>
              <Text
                fontSize="xs"
                color={status.sourceConnected ? 'green.300' : 'orange.300'}
                mt={2}
              >
                Source {status.sourceConnected ? 'connected' : 'reconnecting'} · public ingress{' '}
                {show.originOnline ? 'healthy' : 'checking'} · packages{' '}
                {pages ? 'temporary R2' : 'served by tunnel'}
              </Text>
              {session.code ? (
                <Box mt={3} p={2} borderRadius="md" bg="whiteAlpha.100">
                  <Text fontSize="xs" color="whiteAlpha.600">
                    Reusable audience code (not phone pairing)
                  </Text>
                  <Text fontFamily="mono" fontSize="xl" letterSpacing=".12em">
                    {session.code}
                  </Text>
                </Box>
              ) : null}
              <Flex gap={2} mt={3} wrap="wrap">
                <Button
                  size="sm"
                  onClick={() => {
                    const share = new URL('../shows/', location.href);
                    share.searchParams.set('show', show.id);
                    void navigator.clipboard?.writeText(share.href);
                  }}
                >
                  Copy link
                </Button>
                {show.access === 'closed' ? (
                  <Button size="sm" variant="outline" loading={busy} onClick={() => void rotate()}>
                    Rotate code
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  colorPalette="red"
                  variant="outline"
                  loading={busy}
                  onClick={() => void stop()}
                >
                  Stop
                </Button>
              </Flex>
            </>
          ) : (
            <>
              <Input
                placeholder="Show name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />
              <Flex gap={2} mt={2}>
                <select
                  aria-label="Audience access"
                  value={access}
                  onChange={(event) =>
                    setAccess(event.target.value === 'closed' ? 'closed' : 'open')
                  }
                  style={{
                    flex: 1,
                    color: 'white',
                    background: '#171714',
                    border: '1px solid #ffffff33',
                    borderRadius: '6px',
                    padding: '8px',
                  }}
                >
                  <option value="open">Open</option>
                  <option value="closed">Closed · code</option>
                </select>
                <select
                  aria-label="Show duration"
                  value={durationMinutes}
                  onChange={(event) => setDurationMinutes(Number(event.target.value))}
                  style={{
                    flex: 1,
                    color: 'white',
                    background: '#171714',
                    border: '1px solid #ffffff33',
                    borderRadius: '6px',
                    padding: '8px',
                  }}
                >
                  <option value={15}>15 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={120}>2 hours</option>
                  <option value={240}>4 hours</option>
                  <option value={480}>8 hours</option>
                  <option value={1440}>24 hours</option>
                </select>
              </Flex>
              <Button
                mt={3}
                w="100%"
                colorPalette="purple"
                loading={busy}
                disabled={!name.trim()}
                onClick={() => void start()}
              >
                Start immediately
              </Button>
              {setupMissing ? (
                <Text fontSize="xs" color="orange.300" mt={2}>
                  Set {setupMissing} and restart Aurora.
                </Text>
              ) : null}
              <Text fontSize="xs" color="whiteAlpha.600" mt={2}>
                Viewers receive visual/audio-feature state only. They cannot control the show and no
                audible media is streamed.
              </Text>
            </>
          )}
          {error ? (
            <Text fontSize="xs" color="red.300" mt={3}>
              {error}
            </Text>
          ) : null}
          <Button size="sm" variant="ghost" w="100%" mt={2} onClick={() => setOpen(false)}>
            Close
          </Button>
        </Box>
      ) : null}
    </Box>
  );
}

import { Box, Button, Flex, Grid, Image, Link, Text } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { accessTokenHeaders } from '../../../shared/access-token.ts';
import { loadInstanceTarget } from '../../../shared/instance-target.ts';
import {
  clearSoundCloudWorkerToken,
  consumeSoundCloudCallback,
  formatSoundCloudDuration,
  loadSoundCloudWorkerToken,
  SOUNDCLOUD_SOURCE_LABELS,
  type SoundCloudProfile,
  type SoundCloudTrack,
  type SoundCloudTrackSource,
  soundCloudApiBase,
  soundCloudWidgetUrl,
} from '../lib/soundcloud.ts';
import { Panel, SectionTitle, StatusPill } from './ui.tsx';

type StatusResponse = {
  configured: boolean;
  connected: boolean;
  profile: SoundCloudProfile | null;
};

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
  return payload;
}

function artworkFor(track: SoundCloudTrack): string | null {
  return track.artworkUrl ?? track.user.avatarUrl;
}

export function SoundCloudPanel() {
  const callback = useMemo(() => consumeSoundCloudCallback(), []);
  const apiBase = useMemo(() => soundCloudApiBase(), []);
  const externalWorker = apiBase !== location.origin;
  const [workerToken, setWorkerToken] = useState(
    () => callback.token || loadSoundCloudWorkerToken(),
  );
  const authHeaders = useMemo(
    () => ({
      ...accessTokenHeaders(loadInstanceTarget().token),
      ...(externalWorker && workerToken ? { authorization: `Bearer ${workerToken}` } : {}),
    }),
    [externalWorker, workerToken],
  );
  const apiUrl = useCallback(
    (path: string) => new URL(path, `${apiBase.replace(/\/$/, '')}/`).href,
    [apiBase],
  );
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [source, setSource] = useState<SoundCloudTrackSource>('likes');
  const [tracks, setTracks] = useState<SoundCloudTrack[]>([]);
  const [activeTrack, setActiveTrack] = useState<SoundCloudTrack | null>(null);
  const [busy, setBusy] = useState(true);
  const [callbackError] = useState<string | null>(() => {
    const queryMessage = new URLSearchParams(location.search).get('soundcloud_error');
    return callback.error ?? queryMessage ?? null;
  });
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setBusy(true);
    try {
      const next = await responseJson<StatusResponse>(
        await fetch(apiUrl('/api/soundcloud/status'), { headers: authHeaders }),
      );
      setStatus(next);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }, [apiUrl, authHeaders]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!status?.connected) {
      setTracks([]);
      setActiveTrack(null);
      return;
    }
    let live = true;
    setBusy(true);
    // The bridge owns and refreshes OAuth credentials; no SoundCloud token
    // ever enters browser storage or the console bundle.
    void fetch(apiUrl(`/api/soundcloud/tracks?source=${source}`), { headers: authHeaders })
      .then((response) => responseJson<{ tracks: SoundCloudTrack[] }>(response))
      .then((payload) => {
        if (!live) return;
        setTracks(payload.tracks);
        setActiveTrack((current) =>
          current && payload.tracks.some((track) => track.id === current.id) ? current : null,
        );
        setError(null);
      })
      .catch((reason: unknown) => {
        if (live) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [apiUrl, authHeaders, source, status?.connected]);

  const connect = async () => {
    setBusy(true);
    try {
      const payload = await responseJson<{ url: string }>(
        await fetch(apiUrl('/api/soundcloud/login'), { headers: authHeaders }),
      );
      location.assign(payload.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await responseJson<{ ok: boolean }>(
        await fetch(apiUrl('/api/soundcloud/logout'), { method: 'POST', headers: authHeaders }),
      );
      if (externalWorker) {
        clearSoundCloudWorkerToken();
        setWorkerToken('');
      }
      setTracks([]);
      setActiveTrack(null);
      setStatus((current) => ({
        configured: current?.configured ?? true,
        connected: false,
        profile: null,
      }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const widgetUrl = activeTrack ? soundCloudWidgetUrl(activeTrack.permalinkUrl) : null;
  const badge = !status
    ? { state: 'connecting' as const, label: 'Checking' }
    : !status.configured
      ? { state: 'warn' as const, label: 'Setup needed' }
      : status.connected
        ? { state: 'live' as const, label: status.profile?.username ?? 'Connected' }
        : { state: 'idle' as const, label: 'Disconnected' };

  return (
    <Panel area="snd" aria-label="SoundCloud client">
      <SectionTitle
        title="SoundCloud"
        badge={<StatusPill state={badge.state}>{badge.label}</StatusPill>}
      />

      {!status?.configured ? (
        <Box>
          <Text color="whiteAlpha.800" fontSize="sm" mb={3}>
            Configure SoundCloud app credentials on the Aurora bridge to connect your account.
          </Text>
          <Text as="code" display="block" color="orange.200" fontSize="xs">
            SOUNDCLOUD_CLIENT_ID · SOUNDCLOUD_CLIENT_SECRET · SOUNDCLOUD_REDIRECT_URI
          </Text>
        </Box>
      ) : !status.connected ? (
        <Button colorPalette="orange" size="lg" onClick={() => void connect()} loading={busy}>
          Connect SoundCloud
        </Button>
      ) : (
        <Box>
          <Flex gap={2} wrap="wrap" align="center" mb={3}>
            {(Object.keys(SOUNDCLOUD_SOURCE_LABELS) as SoundCloudTrackSource[]).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={source === key ? 'solid' : 'surface'}
                colorPalette="orange"
                aria-pressed={source === key}
                onClick={() => setSource(key)}
              >
                {SOUNDCLOUD_SOURCE_LABELS[key]}
              </Button>
            ))}
            <Button size="sm" variant="ghost" ml="auto" onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </Flex>

          {widgetUrl ? (
            <Box mb={3} borderRadius="md" overflow="hidden" bg="black">
              <iframe
                key={widgetUrl}
                title={`SoundCloud player: ${activeTrack?.title ?? ''}`}
                src={widgetUrl}
                width="100%"
                height="166"
                scrolling="no"
                frameBorder="0"
                allow="autoplay"
              />
            </Box>
          ) : null}

          <Grid
            templateColumns={{ base: '1fr', md: 'repeat(2, minmax(0, 1fr))' }}
            gap={2}
            maxH="25rem"
            overflowY="auto"
            pr={1}
          >
            {tracks.map((track) => (
              <Button
                key={track.id}
                variant={activeTrack?.id === track.id ? 'solid' : 'surface'}
                colorPalette="orange"
                h="auto"
                minH="4.5rem"
                p={2}
                justifyContent="flex-start"
                textAlign="left"
                whiteSpace="normal"
                onClick={() => setActiveTrack(track)}
                aria-label={`Play ${track.title} by ${track.user.username}`}
              >
                {artworkFor(track) ? (
                  <Image
                    src={artworkFor(track) ?? undefined}
                    alt=""
                    w="3.25rem"
                    h="3.25rem"
                    borderRadius="sm"
                    objectFit="cover"
                    flexShrink={0}
                  />
                ) : (
                  <Flex
                    w="3.25rem"
                    h="3.25rem"
                    bg="whiteAlpha.200"
                    borderRadius="sm"
                    align="center"
                    justify="center"
                    flexShrink={0}
                    aria-hidden
                  >
                    ♪
                  </Flex>
                )}
                <Box minW={0} ml={2}>
                  <Text fontWeight="bold" lineClamp={1}>
                    {track.title}
                  </Text>
                  <Text fontSize="xs" color="whiteAlpha.700" lineClamp={1}>
                    {track.user.username} · {formatSoundCloudDuration(track.duration)}
                  </Text>
                </Box>
              </Button>
            ))}
          </Grid>

          {!busy && tracks.length === 0 ? (
            <Text color="whiteAlpha.600" fontSize="sm">
              No tracks found in {SOUNDCLOUD_SOURCE_LABELS[source].toLowerCase()}.
            </Text>
          ) : null}
          {status.profile?.permalinkUrl ? (
            <Link
              href={status.profile.permalinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              display="inline-block"
              mt={3}
              fontSize="xs"
              color="orange.200"
            >
              Open profile on SoundCloud ↗
            </Link>
          ) : null}
        </Box>
      )}

      {error || callbackError ? (
        <Text mt={3} color="red.300" fontSize="sm" role="alert">
          {error ?? callbackError}
        </Text>
      ) : null}
    </Panel>
  );
}

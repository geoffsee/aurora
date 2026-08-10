export type SoundCloudTrackSource = 'likes' | 'mine' | 'following';

export type SoundCloudProfile = {
  id: number | string;
  username: string;
  permalinkUrl: string | null;
  avatarUrl: string | null;
  followersCount: number | null;
  followingsCount: number | null;
  trackCount: number | null;
};

export type SoundCloudTrack = {
  id: number | string;
  title: string;
  permalinkUrl: string;
  artworkUrl: string | null;
  duration: number;
  genre: string | null;
  playbackCount: number | null;
  likesCount: number | null;
  user: {
    username: string;
    permalinkUrl: string | null;
    avatarUrl: string | null;
  };
};

export const SOUNDCLOUD_SOURCE_LABELS: Record<SoundCloudTrackSource, string> = {
  likes: 'Likes',
  mine: 'My tracks',
  following: 'Following',
};

export const SOUNDCLOUD_WORKER_TOKEN_KEY = 'aurora.soundcloud.worker-token';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function soundCloudApiBase(
  doc: Pick<Document, 'querySelector'> = document,
  loc: Pick<Location, 'origin'> = location,
): string {
  const configured =
    doc.querySelector<HTMLMetaElement>('meta[name="aurora-soundcloud-api"]')?.content.trim() ?? '';
  if (!configured || configured.startsWith('__')) return loc.origin;
  try {
    return new URL(configured).origin;
  } catch {
    return loc.origin;
  }
}

export function loadSoundCloudWorkerToken(storage: StorageLike | null = safeStorage()): string {
  try {
    return storage?.getItem(SOUNDCLOUD_WORKER_TOKEN_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function clearSoundCloudWorkerToken(storage: StorageLike | null = safeStorage()): void {
  try {
    storage?.removeItem(SOUNDCLOUD_WORKER_TOKEN_KEY);
  } catch {
    // Private browsing / disabled storage: the in-memory session still works.
  }
}

export function consumeSoundCloudCallback(
  loc: Pick<Location, 'hash' | 'pathname' | 'search'> = location,
  storage: StorageLike | null = safeStorage(),
  replace: (url: string) => void = (url) => history.replaceState(null, '', url),
): { token: string; error: string | null } {
  const params = new URLSearchParams(loc.hash.replace(/^#/, ''));
  const token = params.get('soundcloud_token')?.trim() ?? '';
  const error = params.get('soundcloud_error')?.trim() || null;
  if (token) {
    try {
      storage?.setItem(SOUNDCLOUD_WORKER_TOKEN_KEY, token);
    } catch {
      // The caller retains the returned token in component state.
    }
  }
  const hadCallback =
    params.has('soundcloud_token') || params.has('soundcloud') || params.has('soundcloud_error');
  if (hadCallback) {
    params.delete('soundcloud_token');
    params.delete('soundcloud');
    params.delete('soundcloud_error');
    const remaining = params.toString();
    replace(`${loc.pathname}${loc.search}${remaining ? `#${remaining}` : ''}`);
  }
  return { token, error };
}

export function soundCloudWidgetUrl(permalinkUrl: string): string | null {
  let track: URL;
  try {
    track = new URL(permalinkUrl);
  } catch {
    return null;
  }
  const host = track.hostname.toLowerCase();
  if (
    track.protocol !== 'https:' ||
    (host !== 'soundcloud.com' && !host.endsWith('.soundcloud.com'))
  ) {
    return null;
  }
  const widget = new URL('https://w.soundcloud.com/player/');
  widget.searchParams.set('url', track.href);
  widget.searchParams.set('color', '#998862');
  widget.searchParams.set('auto_play', 'true');
  widget.searchParams.set('hide_related', 'false');
  widget.searchParams.set('show_comments', 'false');
  widget.searchParams.set('show_user', 'true');
  widget.searchParams.set('show_reposts', 'false');
  widget.searchParams.set('show_teaser', 'false');
  widget.searchParams.set('visual', 'false');
  return widget.href;
}

export function formatSoundCloudDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

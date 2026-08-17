import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LIVE_SHOW_PATHS,
  type PublicShowSummary,
  type ShowListResponse,
} from '../../shared/live-show.ts';
import { joinLiveShow } from '../../shared/live-show-client.ts';
import { DEFAULT_RELAY_BASE_URL } from '../../shared/relay-session.ts';

function liveApiBase(doc: Pick<Document, 'querySelector'> = document): string {
  const configured = doc
    .querySelector<HTMLMetaElement>('meta[name="aurora-live-api"]')
    ?.content.trim();
  if (configured && !configured.startsWith('__')) {
    try {
      return new URL(configured).origin;
    } catch {
      // Use the deployed relay below.
    }
  }
  return DEFAULT_RELAY_BASE_URL;
}

function remaining(endsAt: number, now: number): string {
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1_000));
  if (seconds <= 0) return 'ending now';
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m left` : `${Math.max(1, minutes)}m left`;
}

export function App() {
  const api = useMemo(() => liveApiBase(), []);
  const selected = useMemo(() => new URLSearchParams(location.search).get('show'), []);
  const [shows, setShows] = useState<PublicShowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [codeFor, setCodeFor] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState('');
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const all: PublicShowSummary[] = [];
      let cursor = '';
      do {
        const url = new URL(`${api}${LIVE_SHOW_PATHS.shows}`);
        if (cursor) url.searchParams.set('cursor', cursor);
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`directory HTTP ${response.status}`);
        const page = (await response.json()) as ShowListResponse;
        all.push(...page.shows);
        cursor = page.cursor ?? '';
      } while (cursor);
      setShows(all);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selected || loading) return;
    document.getElementById(`show-${selected}`)?.scrollIntoView({ block: 'center' });
  }, [loading, selected]);

  const join = async (show: PublicShowSummary, audienceCode?: string) => {
    if (show.access === 'closed' && audienceCode === undefined) {
      setCodeFor(show.id);
      setCode('');
      return;
    }
    setJoining(show.id);
    setError('');
    const result = await joinLiveShow(api, show.id, audienceCode);
    setJoining('');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Worker supplies a fragment URL. No grant or audience code enters query,
    // referrer, history, access logs, or the shareable deep link.
    window.location.assign(result.value.viewerUrl);
  };

  return (
    <main>
      <header>
        <p className="eyebrow">Aurora</p>
        <h1>Live shows</h1>
        <p className="lede">
          Visuals are rendered on your device from the performer’s synchronized state. No video or
          audio is streamed.
        </p>
      </header>

      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
      {loading ? <div className="notice">Loading active shows…</div> : null}
      {!loading && shows.length === 0 ? (
        <div className="notice">No shows are live right now.</div>
      ) : null}

      <section className="shows" aria-label="Active shows">
        {shows.map((show) => (
          <article
            id={`show-${show.id}`}
            className={selected === show.id ? 'selected' : ''}
            key={show.id}
          >
            <div>
              <span className="live-dot" /> Live · {show.runtime}
            </div>
            <h2>{show.name}</h2>
            <p>
              {show.access === 'closed' ? '🔒 Code required' : 'Open show'} ·{' '}
              {remaining(show.endsAt, now)}
            </p>
            <p className="viewers">{show.viewerCount.toLocaleString()} watching</p>
            <button type="button" disabled={joining === show.id} onClick={() => void join(show)}>
              {joining === show.id ? 'Joining…' : show.access === 'closed' ? 'Enter code' : 'Watch'}
            </button>
          </article>
        ))}
      </section>

      {codeFor ? (
        <div className="backdrop" role="presentation">
          <form
            className="dialog"
            aria-label="Closed show code"
            onSubmit={(event) => {
              event.preventDefault();
              const show = shows.find((candidate) => candidate.id === codeFor);
              if (show) void join(show, code);
            }}
          >
            <h2>Audience code</h2>
            <p>Ask the show operator for the reusable 8-character audience code.</p>
            <input
              autoComplete="off"
              maxLength={9}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              aria-label="Audience code"
            />
            <div className="actions">
              <button type="button" className="secondary" onClick={() => setCodeFor(null)}>
                Cancel
              </button>
              <button type="submit" disabled={code.replace(/[^A-Z0-9]/g, '').length !== 8}>
                Watch
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

export { liveApiBase, remaining };

'use client';

import { useEffect, useMemo, useState } from 'react';

type ProviderStatus = {
  id: string;
  label: string;
  description: string;
  connected: boolean;
  connected_at: string | null;
};

type StatusResponse = {
  providers?: ProviderStatus[];
  error?: string;
};

type WhoopSyncResponse = {
  whoop?: {
    basicProfile?: { first_name?: string; last_name?: string; email?: string };
    bodyMeasurement?: { height_meter?: number; weight_kilogram?: number; max_heart_rate?: number };
    recoveries?: { records?: Array<{ score?: { recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number } }> };
    workouts?: { records?: unknown[] };
  };
  import?: { imported?: number; errors?: string[] } | null;
  error?: string;
};

type StravaSyncResponse = {
  strava?: {
    activities?: Array<{ name?: string; distance?: number; moving_time?: number }>;
  };
  import?: { imported?: number; errors?: string[] } | null;
  error?: string;
};

// Minimal MusicKit surface we touch. The SDK is loaded on demand below.
type MusicKitInstance = { authorize: () => Promise<string>; storefrontId?: string };
type MusicKitGlobal = {
  configure: (opts: { developerToken: string; app: { name: string; build: string } }) => Promise<unknown>;
  getInstance: () => MusicKitInstance;
};

// Inject the MusicKit v3 script once and resolve when window.MusicKit exists.
let musicKitPromise: Promise<MusicKitGlobal> | null = null;
function loadMusicKit(): Promise<MusicKitGlobal> {
  const w = window as unknown as { MusicKit?: MusicKitGlobal };
  if (w.MusicKit) return Promise.resolve(w.MusicKit);
  if (musicKitPromise) return musicKitPromise;
  musicKitPromise = new Promise<MusicKitGlobal>((resolve, reject) => {
    const done = () => (w.MusicKit ? resolve(w.MusicKit) : reject(new Error('MusicKit failed to load.')));
    if (document.querySelector('script[data-musickit]')) {
      document.addEventListener('musickitloaded', done, { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
    s.async = true;
    s.setAttribute('data-musickit', '1');
    document.addEventListener('musickitloaded', done, { once: true });
    s.onerror = () => reject(new Error('Could not load Apple MusicKit.'));
    document.head.appendChild(s);
  });
  return musicKitPromise;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(payload.error || `Request failed: ${res.status}`);
  return payload;
}

function formatDate(value: string | null) {
  if (!value) return 'Not connected';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

export default function IntegrationsPanel() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<(WhoopSyncResponse & StravaSyncResponse) | null>(null);

  const whoop = useMemo(
    () => providers.find((provider) => provider.id === 'whoop'),
    [providers]
  );
  const strava = useMemo(
    () => providers.find((provider) => provider.id === 'strava'),
    [providers]
  );
  const spotify = useMemo(
    () => providers.find((provider) => provider.id === 'spotify'),
    [providers]
  );
  const appleMusic = useMemo(
    () => providers.find((provider) => provider.id === 'apple_music'),
    [providers]
  );

  async function loadStatus() {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchJson<StatusResponse>('/api/integrations/status');
      setProviders(payload.providers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load integrations.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  async function run(label: string, action: () => Promise<WhoopSyncResponse | StravaSyncResponse | unknown>) {
    setBusy(label);
    setError('');
    setResult(null);
    try {
      const payload = await action();
      setResult((payload ?? null) as (WhoopSyncResponse & StravaSyncResponse) | null);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${label} failed.`);
    } finally {
      setBusy('');
    }
  }

  function connectProvider(provider: string) {
    window.location.assign(`/api/integrations/${provider}/authorize?return=/dashboard/settings`);
  }

  // Apple Music authorizes on-device via MusicKit (no OAuth redirect): mint a
  // developer token, run authorize(), then persist the Music-User-Token.
  async function connectAppleMusic() {
    const tok = await fetchJson<{ developerToken?: string; error?: string }>(
      '/api/integrations/apple-music/developer-token'
    );
    if (!tok.developerToken) throw new Error(tok.error || 'Apple Music is not configured yet.');
    const MK = await loadMusicKit();
    await MK.configure({ developerToken: tok.developerToken, app: { name: 'Shape', build: '1.0.0' } });
    const music = MK.getInstance();
    const musicUserToken = await music.authorize();
    if (!musicUserToken) throw new Error('Apple Music authorization was cancelled.');
    await fetchJson('/api/integrations/apple-music/connect', {
      method: 'POST',
      body: JSON.stringify({ musicUserToken, storefront: music.storefrontId ?? null }),
    });
  }

  // Instacart: build a pre-filled shopping-list page from the grocery list and
  // open it in a new tab.
  async function sendInstacart() {
    const r = await fetchJson<{ url?: string }>('/api/integrations/instacart/shopping-list', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (r.url) window.open(r.url, '_blank', 'noopener');
    return r;
  }

  const recovery = result?.whoop?.recoveries?.records?.[0]?.score;
  const imported = result?.import?.imported;
  const importErrors = result?.import?.errors ?? [];

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-medium mb-1">Integrations</h2>
          <p className="text-sm text-neutral-400 max-w-2xl">
            Connect health, activity, and music platforms. WHOOP workout imports default to
            private feed posts.
          </p>
        </div>
        <button
          type="button"
          onClick={loadStatus}
          disabled={loading || Boolean(busy)}
          className="text-xs uppercase tracking-[0.16em] border border-neutral-700 px-3 py-2 text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-50"
        >
          {loading ? 'Checking' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="border border-neutral-800 bg-neutral-950/60">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-teal-300">
              Recovery · sleep · strain
            </div>
            <h3 className="mt-2 text-2xl font-light tracking-tight">WHOOP</h3>
            <p className="mt-2 max-w-xl text-sm text-neutral-400">
              Sync recovery, sleep, body measurements, cycles, and workouts into Shape. Imported
              workouts stay private until the member chooses to share them.
            </p>
            <p className="mt-3 text-xs uppercase tracking-[0.16em] text-neutral-500">
              {whoop?.connected ? `Connected ${formatDate(whoop.connected_at)}` : 'Not connected'}
            </p>
          </div>

          <div className="grid min-w-full grid-cols-2 gap-2 md:min-w-[320px]">
            <button
              type="button"
              onClick={() => connectProvider('whoop')}
              disabled={Boolean(busy)}
              className="border border-teal-400 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-teal-300 hover:bg-teal-400 hover:text-neutral-950 disabled:opacity-50"
            >
              {whoop?.connected ? 'Reconnect' : 'Connect'}
            </button>
            <button
              type="button"
              disabled={!whoop?.connected || Boolean(busy)}
              onClick={() => run('Syncing WHOOP', () => fetchJson<WhoopSyncResponse>('/api/integrations/whoop/sync'))}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {busy === 'Syncing WHOOP' ? 'Syncing' : 'Sync'}
            </button>
            <button
              type="button"
              disabled={!whoop?.connected || Boolean(busy)}
              onClick={() => run('Importing WHOOP', () => fetchJson<WhoopSyncResponse>('/api/integrations/whoop/sync?import=1'))}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {busy === 'Importing WHOOP' ? 'Importing' : 'Import workouts'}
            </button>
            <button
              type="button"
              disabled={!whoop?.connected || Boolean(busy)}
              onClick={() => run('Disconnecting WHOOP', () => fetchJson('/api/integrations/whoop/disconnect', { method: 'POST' }))}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 hover:border-red-400 hover:text-red-300 disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
        </div>

        {result?.whoop && (
          <div className="grid grid-cols-3 border-t border-neutral-800">
            {[
              ['Recovery', recovery?.recovery_score != null ? `${recovery.recovery_score}%` : '-'],
              ['RHR', recovery?.resting_heart_rate != null ? `${recovery.resting_heart_rate} bpm` : '-'],
              ['Workouts', `${result.whoop.workouts?.records?.length ?? 0}`],
            ].map(([label, value]) => (
              <div key={label} className="border-r border-neutral-800 p-4 last:border-r-0">
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">{label}</div>
                <div className="mt-1 text-xl font-light text-neutral-100">{value}</div>
              </div>
            ))}
          </div>
        )}

        {imported != null && (
          <div className="border-t border-neutral-800 px-5 py-3 text-sm text-neutral-300">
            Imported <span className="text-teal-300">{imported}</span> private workouts
            {importErrors.length ? ` · ${importErrors.length} errors` : ''}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Strava</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Runs, rides, GPS routes, and activity map data.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
              {strava?.connected ? 'Connected' : 'Ready'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => connectProvider('strava')}
              disabled={Boolean(busy)}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {strava?.connected ? 'Reconnect' : 'Connect'}
            </button>
            <button
              type="button"
              disabled={!strava?.connected || Boolean(busy)}
              onClick={() => run('Syncing Strava', () => fetchJson<StravaSyncResponse>('/api/integrations/strava/sync'))}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {busy === 'Syncing Strava' ? 'Syncing' : 'Sync'}
            </button>
            <button
              type="button"
              disabled={!strava?.connected || Boolean(busy)}
              onClick={() => run('Importing Strava', () => fetchJson<StravaSyncResponse>('/api/integrations/strava/sync?import=1'))}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {busy === 'Importing Strava' ? 'Importing' : 'Import routes'}
            </button>
            <button
              type="button"
              disabled={!strava?.connected || Boolean(busy)}
              onClick={() => run('Disconnecting Strava', () => fetchJson('/api/integrations/strava/disconnect', { method: 'POST' }))}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 hover:border-red-400 hover:text-red-300 disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
          {result?.strava?.activities && (
            <div className="mt-3 border-t border-neutral-800 pt-3 text-xs uppercase tracking-[0.16em] text-neutral-500">
              Latest Strava pull: {result.strava.activities.length} activities
              {result.import ? ` - ${result.import.imported ?? 0} imported` : ''}
            </div>
          )}
        </div>

        {/* Spotify */}
        <div className="border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Spotify</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Workout playlists from your library, streamed in Shape Radio.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
              {spotify?.connected ? 'Connected' : 'Ready'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => connectProvider('spotify')}
              disabled={Boolean(busy)}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {spotify?.connected ? 'Reconnect' : 'Connect'}
            </button>
            <button
              type="button"
              disabled={!spotify?.connected || Boolean(busy)}
              onClick={() => run('Disconnecting Spotify', () => fetchJson('/api/integrations/spotify/disconnect', { method: 'POST' }))}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 hover:border-red-400 hover:text-red-300 disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Apple Music */}
        <div className="border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Apple Music</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Authorize your MusicKit library — granted right here, no redirect.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
              {appleMusic?.connected ? 'Connected' : 'Ready'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => run('Connecting Apple Music', connectAppleMusic)}
              disabled={Boolean(busy)}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {busy === 'Connecting Apple Music' ? 'Authorizing' : appleMusic?.connected ? 'Reconnect' : 'Connect'}
            </button>
            <button
              type="button"
              disabled={!appleMusic?.connected || Boolean(busy)}
              onClick={() => run('Disconnecting Apple Music', () => fetchJson('/api/integrations/apple-music/disconnect', { method: 'POST' }))}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400 hover:border-red-400 hover:text-red-300 disabled:opacity-40"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Instacart */}
        <div className="border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Instacart</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Send your coach-built grocery list to a pre-filled Instacart cart.
              </p>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">Hand-off</span>
          </div>
          <div className="mt-4">
            <button
              type="button"
              onClick={() => run('Building Instacart list', sendInstacart)}
              disabled={Boolean(busy)}
              className="w-full border border-teal-400 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-teal-300 hover:bg-teal-400 hover:text-neutral-950 disabled:opacity-50"
            >
              {busy === 'Building Instacart list' ? 'Building list' : 'Send grocery list to Instacart →'}
            </button>
          </div>
        </div>

        {/* Garmin — still placeholder until credentials are live */}
        <div className="border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Garmin</h3>
              <p className="mt-1 text-sm text-neutral-500">Health + activity export</p>
            </div>
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">Next</span>
          </div>
        </div>
      </div>
    </section>
  );
}

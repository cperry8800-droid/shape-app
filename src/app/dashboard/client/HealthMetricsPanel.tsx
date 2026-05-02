'use client';

import { useEffect, useMemo, useState } from 'react';

type ProviderStatus = {
  id: string;
  label: string;
  connected: boolean;
  connected_at: string | null;
};

type WhoopSyncResponse = {
  whoop?: {
    recoveries?: {
      records?: Array<{
        score?: {
          recovery_score?: number;
          resting_heart_rate?: number;
          hrv_rmssd_milli?: number;
        };
      }>;
    };
    sleeps?: {
      records?: Array<{
        score?: {
          sleep_performance_percentage?: number;
          sleep_efficiency_percentage?: number;
        };
      }>;
    };
    workouts?: {
      records?: Array<{
        sport_name?: string;
        score?: {
          strain?: number;
          average_heart_rate?: number;
          max_heart_rate?: number;
        };
      }>;
    };
  };
  import?: { imported?: number; errors?: string[] } | null;
};

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

function formatMetric(value: number | undefined, suffix = '', digits = 0) {
  if (value == null || Number.isNaN(value)) return '-';
  return `${value.toFixed(digits)}${suffix}`;
}

export default function HealthMetricsPanel() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [whoopData, setWhoopData] = useState<WhoopSyncResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [imported, setImported] = useState<number | null>(null);

  const providerMap = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers]
  );
  const whoop = providerMap.get('whoop');
  const strava = providerMap.get('strava');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const status = await fetchJson<{ providers?: ProviderStatus[] }>('/api/integrations/status');
      const nextProviders = status.providers ?? [];
      setProviders(nextProviders);
      if (nextProviders.some((provider) => provider.id === 'whoop' && provider.connected)) {
        const sync = await fetchJson<WhoopSyncResponse>('/api/integrations/whoop/sync');
        setWhoopData(sync);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load health metrics.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function importWhoopWorkouts() {
    setBusy('import');
    setError('');
    setImported(null);
    try {
      const sync = await fetchJson<WhoopSyncResponse>('/api/integrations/whoop/sync?import=1');
      setWhoopData(sync);
      setImported(sync.import?.imported ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'WHOOP import failed.');
    } finally {
      setBusy('');
    }
  }

  const recovery = whoopData?.whoop?.recoveries?.records?.[0]?.score;
  const sleep = whoopData?.whoop?.sleeps?.records?.[0]?.score;
  const workout = whoopData?.whoop?.workouts?.records?.[0];
  const workoutScore = workout?.score;

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-medium">Connected health</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">
            WHOOP powers recovery, sleep, strain, and private workout imports. Strava is ready for
            route and activity connection next.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || Boolean(busy)}
          className="w-fit border border-neutral-700 px-3 py-2 text-xs uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-50"
        >
          {loading ? 'Loading' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-4 border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.8fr]">
        <div className="border border-neutral-800 bg-neutral-950/60">
          <div className="flex items-start justify-between gap-4 border-b border-neutral-800 p-5">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-teal-300">
                {whoop?.connected ? 'WHOOP connected' : 'WHOOP not connected'}
              </div>
              <h3 className="mt-2 text-2xl font-light tracking-tight">Recovery snapshot</h3>
            </div>
            <button
              type="button"
              onClick={() => window.location.assign('/api/integrations/whoop/authorize?return=/dashboard/client')}
              className="border border-teal-400 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-300 hover:bg-teal-400 hover:text-neutral-950"
            >
              {whoop?.connected ? 'Reconnect' : 'Connect'}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5">
            {[
              ['Recovery', formatMetric(recovery?.recovery_score, '%')],
              ['RHR', formatMetric(recovery?.resting_heart_rate, ' bpm')],
              ['HRV', formatMetric(recovery?.hrv_rmssd_milli, ' ms')],
              ['Sleep', formatMetric(sleep?.sleep_performance_percentage, '%')],
              ['Strain', formatMetric(workoutScore?.strain, '', 1)],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-r border-neutral-800 p-4 last:border-r-0 md:border-b-0">
                <div className="text-xs uppercase tracking-[0.18em] text-neutral-500">{label}</div>
                <div className="mt-1 text-2xl font-light text-neutral-100">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-neutral-500">
              Latest workout: {workout?.sport_name ?? 'No synced workout yet'}.
            </p>
            <button
              type="button"
              disabled={!whoop?.connected || Boolean(busy)}
              onClick={importWhoopWorkouts}
              className="border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-40"
            >
              {busy === 'import' ? 'Importing' : 'Import workouts'}
            </button>
          </div>

          {imported != null && (
            <div className="border-t border-neutral-800 px-5 py-3 text-sm text-neutral-300">
              Imported <span className="text-teal-300">{imported}</span> private workouts.
            </div>
          )}
        </div>

        <div className="border border-neutral-800 bg-neutral-950/60 p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-teal-300">
            {strava?.connected ? 'Strava connected' : 'Strava routes'}
          </div>
          <h3 className="mt-2 text-2xl font-light tracking-tight">Runs and rides</h3>
          <p className="mt-2 text-sm text-neutral-400">
            Connect Strava now so route maps and activity posts can use the same account once the
            sync/import endpoint is added.
          </p>
          <button
            type="button"
            onClick={() => window.location.assign('/api/integrations/strava/authorize?return=/dashboard/client')}
            className="mt-5 w-full border border-neutral-700 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300"
          >
            {strava?.connected ? 'Reconnect Strava' : 'Connect Strava'}
          </button>
        </div>
      </div>
    </section>
  );
}

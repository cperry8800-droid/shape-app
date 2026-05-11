'use client';

// Shared weekly readout panel. The same data is rendered on the client
// dashboard (motivation framing, no client picker), the trainer dashboard
// (training-load framing, picks an active subscriber), and the nutritionist
// dashboard (fueling framing, picks an active subscriber).
//
// Rendering: each insight cites a correlation_key. We look it up in the
// returned correlations array and render the underlying scatter (lag-0) or
// line (lag-1) plot as inline SVG so the AI claim sits next to the data.

import { useEffect, useMemo, useState } from 'react';

type Direction = 'positive' | 'negative';
type Strength = 'weak' | 'moderate' | 'strong';

type CorrelationResult = {
  x: string;
  y: string;
  lagDays: 0 | 1;
  label: string;
  explanation: string;
  r: number;
  n: number;
  pValue: number;
  strength: Strength;
  direction: Direction;
  series: Array<{ date: string; x: number; y: number }>;
};

type Insight = {
  headline: string;
  detail: string;
  correlation_key: string;
  evidence_chart: 'scatter' | 'line';
  recommendation: string;
};

type Readout = {
  summary: string;
  insights: Insight[];
};

type ReadoutResponse = {
  source: 'openai' | 'fallback';
  user_id: string;
  window_days: number;
  sample_size: number;
  generated_at: string;
  correlations: CorrelationResult[];
  readout: Readout;
};

type Subscriber = { client_id: string };

type Framing = {
  eyebrow: string;
  title: string;
  empty: string;
};

type Props = {
  framing: Framing;
  subscribers?: Subscriber[];
  defaultClientId?: string;
};

function correlationKey(c: CorrelationResult): string {
  return `${c.x}->${c.y}@lag${c.lagDays}`;
}

function formatMetric(name: string): string {
  return name.replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function ScatterChart({ correlation }: { correlation: CorrelationResult }) {
  const { series, x, y, r } = correlation;
  if (series.length < 3) return null;

  const xs = series.map((p) => p.x);
  const ys = series.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const lineY1 = slope * minX + intercept;
  const lineY2 = slope * maxX + intercept;

  const project = (px: number, py: number) => {
    const cx = 32 + ((px - minX) / spanX) * 256;
    const cy = 100 - ((py - minY) / spanY) * 76;
    return [cx, cy];
  };

  const [lx1, ly1] = project(minX, lineY1);
  const [lx2, ly2] = project(maxX, lineY2);

  return (
    <svg viewBox="0 0 320 116" className="h-32 w-full rounded border border-neutral-800 bg-black/30">
      <text x="6" y="14" fill="#52525b" fontSize="9" letterSpacing="0.12em">
        {formatMetric(y).toUpperCase()}
      </text>
      <text x="280" y="112" fill="#52525b" fontSize="9" letterSpacing="0.12em" textAnchor="end">
        {formatMetric(x).toUpperCase()}
      </text>
      <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke="#2dd4bf" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 3" />
      {series.map((p, i) => {
        const [cx, cy] = project(p.x, p.y);
        return <circle key={`${p.date}-${i}`} cx={cx} cy={cy} r="2.6" fill="#2dd4bf" opacity="0.85" />;
      })}
      <text x="312" y="14" fill="#2dd4bf" fontSize="9" textAnchor="end">
        r = {r.toFixed(2)}
      </text>
    </svg>
  );
}

function LineChart({ correlation }: { correlation: CorrelationResult }) {
  const { series, x, y, r } = correlation;
  if (series.length < 3) return null;

  const xs = series.map((p) => p.x);
  const ys = series.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;

  const px = (i: number) => 32 + (i / Math.max(series.length - 1, 1)) * 256;
  const xLine = series.map((p, i) => `${px(i)},${100 - ((p.x - minX) / spanX) * 76}`).join(' ');
  const yLine = series.map((p, i) => `${px(i)},${100 - ((p.y - minY) / spanY) * 76}`).join(' ');

  return (
    <svg viewBox="0 0 320 116" className="h-32 w-full rounded border border-neutral-800 bg-black/30">
      <text x="6" y="14" fill="#52525b" fontSize="9">
        <tspan fill="#2dd4bf">— {formatMetric(x)}</tspan>
        <tspan dx="10" fill="#f59e0b">— next-day {formatMetric(y)}</tspan>
      </text>
      <polyline fill="none" stroke="#2dd4bf" strokeWidth="1.6" points={xLine} strokeLinecap="round" />
      <polyline fill="none" stroke="#f59e0b" strokeWidth="1.6" points={yLine} strokeLinecap="round" />
      <text x="312" y="14" fill="#2dd4bf" fontSize="9" textAnchor="end">
        r = {r.toFixed(2)}
      </text>
    </svg>
  );
}

export default function WeeklyReadout({ framing, subscribers, defaultClientId }: Props) {
  const [selected, setSelected] = useState(defaultClientId ?? subscribers?.[0]?.client_id ?? '');
  const [data, setData] = useState<ReadoutResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const showPicker = Boolean(subscribers && subscribers.length > 0);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/weekly-readout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selected || undefined,
          window_days: 28,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as ReadoutResponse & { error?: string };
      if (!res.ok) throw new Error(json.error || `Request failed: ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load readout.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (showPicker && !selected) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const correlationByKey = useMemo(() => {
    const map = new Map<string, CorrelationResult>();
    for (const c of data?.correlations ?? []) map.set(correlationKey(c), c);
    return map;
  }, [data]);

  const insights = data?.readout.insights ?? [];

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-teal-300">{framing.eyebrow}</div>
          <h2 className="mt-2 text-2xl font-light tracking-tight text-neutral-100">{framing.title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showPicker && (
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              className="border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400"
            >
              {subscribers!.map((s) => (
                <option key={s.client_id} value={s.client_id}>
                  Client {s.client_id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="border border-neutral-700 px-3 py-2 text-xs uppercase tracking-[0.16em] text-neutral-200 hover:border-teal-400 hover:text-teal-300 disabled:opacity-50"
          >
            {loading ? 'Loading' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {data && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500">
          <span>
            {data.sample_size} day{data.sample_size === 1 ? '' : 's'} of data · {data.window_days}-day window
          </span>
          <span className="uppercase tracking-[0.16em]">
            {data.source === 'openai' ? 'AI synthesis' : 'Statistical fallback'}
          </span>
        </div>
      )}

      {data?.readout.summary && (
        <p className="mb-5 rounded-xl border border-teal-400/20 bg-teal-400/5 px-4 py-3 text-sm text-neutral-200">
          {data.readout.summary}
        </p>
      )}

      {!loading && data && insights.length === 0 && (
        <p className="text-sm text-neutral-400">{framing.empty}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {insights.map((insight, index) => {
          const correlation = correlationByKey.get(insight.correlation_key);
          if (!correlation) return null;

          return (
            <article
              key={`${insight.correlation_key}-${index}`}
              className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-medium text-neutral-100">{insight.headline}</h3>
                <span className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">
                  n={correlation.n} · {correlation.strength}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-300">{insight.detail}</p>
              <div className="mt-3">
                {insight.evidence_chart === 'scatter' ? (
                  <ScatterChart correlation={correlation} />
                ) : (
                  <LineChart correlation={correlation} />
                )}
              </div>
              <p className="mt-3 text-xs text-teal-300">→ {insight.recommendation}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

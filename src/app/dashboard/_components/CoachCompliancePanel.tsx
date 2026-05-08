'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type ProviderRole = 'trainer' | 'nutritionist';
type ComplianceStatus = 'green' | 'yellow' | 'red';
type MetricKey = 'workout' | 'nutrition' | 'sleep' | 'recovery';

type Subscriber = {
  id: string;
  client_id: string;
  status: string;
  price_cents: number | null;
  current_period_end: string | null;
  created_at: string;
};

type DaySignal = {
  index: number;
  label: string;
  metrics: Record<MetricKey, ComplianceStatus>;
  summary: string;
  detail: string;
};

type ClientSignal = {
  clientId: string;
  label: string;
  sleep: number;
  stress: number;
  recovery: number;
  macros: number;
  riskScore: number;
  status: 'Watch' | 'Review' | 'Stable';
  reasons: string[];
  actionReason: string;
  correlation: string;
  heatmap: DaySignal[];
};

type Props = {
  role: ProviderRole;
  subscribers: Subscriber[];
};

const metricLabels = ['Sleep', 'Stress', 'Recovery', 'Macros'] as const;
const heatmapRows: Array<{ key: MetricKey; label: string }> = [
  { key: 'workout', label: 'Workout' },
  { key: 'nutrition', label: 'Nutrition' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'recovery', label: 'Recovery' },
];

export default function CoachCompliancePanel({ role, subscribers }: Props) {
  const isTrainer = role === 'trainer';
  const signals = useMemo(() => {
    const activeSubscribers = subscribers.filter(
      (subscriber) => subscriber.status === 'active' || subscriber.status === 'trialing'
    );
    return activeSubscribers.map(buildClientSignal).sort((a, b) => b.riskScore - a.riskScore);
  }, [subscribers]);

  const priorityClients = signals.slice(0, 3);
  const heatmapClients = signals.slice(0, 5);
  const averages = buildAverages(signals);

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl shadow-black/20">
      <div className="border-b border-neutral-800 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.12),transparent_34%),linear-gradient(135deg,rgba(23,23,23,0.95),rgba(10,10,10,1))] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
              Compliance intelligence
            </div>
            <h2 className="mt-2 text-3xl font-light tracking-tight text-neutral-50">
              Clients who matter today
            </h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Shape ranks sleep, stress, recovery, and macro signals so the coach opens the
              dashboard with the most important client follow-ups already surfaced.
            </p>
          </div>
          <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-neutral-800 bg-black/30 text-center lg:min-w-[460px]">
            {metricLabels.map((label) => (
              <div key={label} className="border-r border-neutral-800 p-3 last:border-r-0">
                <div className="text-[0.65rem] uppercase tracking-[0.16em] text-neutral-500">
                  {label}
                </div>
                <div className="mt-1 text-xl font-light text-neutral-50">
                  {averages[label.toLowerCase() as keyof typeof averages]}%
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {signals.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <AtRiskStrip clients={priorityClients} role={role} />
          <div className="grid gap-0 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="border-b border-neutral-800 p-6 xl:border-b-0 xl:border-r">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-medium text-neutral-100">Priority queue</h3>
                  <p className="mt-1 text-xs text-neutral-500">
                    Top {priorityClients.length} ranked by combined risk and adherence drift.
                  </p>
                </div>
                <Link
                  href={`/dashboard/workout-reviews?role=${role}`}
                  className="rounded-full border border-teal-400/50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-teal-300 transition-colors hover:bg-teal-400 hover:text-neutral-950"
                >
                  Review desk
                </Link>
              </div>

              <div className="grid gap-3">
                {priorityClients.map((client, index) => (
                  <PriorityClientCard
                    key={client.clientId}
                    client={client}
                    index={index}
                    isTrainer={isTrainer}
                  />
                ))}
              </div>
            </div>

            <div className="p-6">
              <h3 className="text-sm font-medium text-neutral-100">Patterns and correlations</h3>
              <p className="mt-1 text-xs text-neutral-500">
                These are the operating signals to inspect before messaging clients.
              </p>

              <div className="mt-4 grid gap-3">
                <CorrelationCard
                  title="Sleep x recovery"
                  value={`${averages.sleep}% / ${averages.recovery}%`}
                  detail="Low sleep and lower recovery are grouped together before the client misses training."
                />
                <CorrelationCard
                  title={isTrainer ? 'Stress x training load' : 'Stress x meal adherence'}
                  value={`${averages.stress}% stress`}
                  detail={
                    isTrainer
                      ? 'High stress plus hard sessions flags clients who may need volume adjusted.'
                      : 'High stress plus lower macro adherence flags clients who may need a simpler plan.'
                  }
                />
                <CorrelationCard
                  title="Macros x readiness"
                  value={`${averages.macros}% macros`}
                  detail="Protein and calorie consistency are checked against readiness so follow-ups are specific."
                />
              </div>
            </div>
          </div>

          <ComplianceHeatmap clients={heatmapClients} />
        </>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="p-6">
      <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-900/50 p-5">
        <h3 className="text-sm font-medium text-neutral-100">No compliance queue yet</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
          Active subscribers will appear here once clients subscribe. As health, workout,
          and nutrition data syncs in, Shape will rank who needs attention first.
        </p>
      </div>
    </div>
  );
}

function AtRiskStrip({ clients, role }: { clients: ClientSignal[]; role: ProviderRole }) {
  return (
    <div className="border-b border-neutral-800 bg-neutral-900/50 p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-red-300">
            At-risk today
          </div>
          <h3 className="mt-1 text-lg font-medium text-neutral-50">
            Write these clients before the next session
          </h3>
        </div>
        <div className="text-xs uppercase tracking-[0.16em] text-neutral-500">
          {clients.length} surfaced
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {clients.map((client) => (
          <article
            key={client.clientId}
            className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-neutral-100">{client.label}</div>
                <p className="mt-1 text-sm leading-5 text-neutral-300">{client.actionReason}</p>
              </div>
              <div className="rounded-full border border-red-300/30 px-2.5 py-1 text-xs text-red-200">
                {client.riskScore}
              </div>
            </div>
            <Link
              href={`/dashboard/workout-reviews?role=${role}`}
              className="mt-4 inline-flex rounded-full bg-neutral-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-neutral-950 transition-colors hover:bg-teal-300"
            >
              Open context
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}

function PriorityClientCard({
  client,
  index,
  isTrainer,
}: {
  client: ClientSignal;
  index: number;
  isTrainer: boolean;
}) {
  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.65rem] uppercase tracking-[0.18em] text-neutral-500">
            #{index + 1} needs attention
          </div>
          <h4 className="mt-1 text-lg font-medium text-neutral-50">{client.label}</h4>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(client.status)}`}>
          {client.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-lg border border-neutral-800">
        <MiniMetric label="Sleep" value={client.sleep} invert={false} />
        <MiniMetric label="Stress" value={client.stress} invert />
        <MiniMetric label="Recovery" value={client.recovery} invert={false} />
        <MiniMetric label="Macros" value={client.macros} invert={false} />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-neutral-800 bg-black/20 p-3">
          <div className="text-[0.65rem] uppercase tracking-[0.16em] text-teal-300">
            Main pattern
          </div>
          <p className="mt-1 text-sm leading-5 text-neutral-300">{client.correlation}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-black/20 p-3">
          <div className="text-[0.65rem] uppercase tracking-[0.16em] text-teal-300">
            Suggested action
          </div>
          <p className="mt-1 text-sm leading-5 text-neutral-300">
            {isTrainer
              ? 'Check training load, last session notes, and recovery before the next workout.'
              : 'Check macro adherence, meal timing, and recovery before changing the plan.'}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {client.reasons.map((reason) => (
          <span
            key={reason}
            className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-400"
          >
            {reason}
          </span>
        ))}
      </div>
    </article>
  );
}

function ComplianceHeatmap({ clients }: { clients: ClientSignal[] }) {
  return (
    <div className="border-t border-neutral-800 bg-black/20 p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-neutral-100">30-day compliance heatmap</h3>
          <p className="mt-1 text-xs text-neutral-500">
            Scan workout, nutrition, sleep, and recovery. Click a square for that day.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">
          <LegendDot status="green" label="On target" />
          <LegendDot status="yellow" label="Watch" />
          <LegendDot status="red" label="Missed" />
        </div>
      </div>

      <div className="grid gap-4">
        {clients.map((client) => (
          <ClientHeatmap key={client.clientId} client={client} />
        ))}
      </div>
    </div>
  );
}

function ClientHeatmap({ client }: { client: ClientSignal }) {
  const [selected, setSelected] = useState<DaySignal>(client.heatmap[client.heatmap.length - 1]);

  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-neutral-100">{client.label}</h4>
          <p className="mt-1 text-xs text-neutral-500">{selected.label}: {selected.summary}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(client.status)}`}>
          {client.status}
        </span>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[760px] space-y-2">
          {heatmapRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[88px_repeat(30,minmax(0,1fr))] items-center gap-1">
              <div className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">
                {row.label}
              </div>
              {client.heatmap.map((day) => (
                <button
                  key={`${row.key}-${day.index}`}
                  type="button"
                  title={`${day.label} - ${row.label}: ${day.metrics[row.key]}`}
                  aria-label={`${client.label} ${row.label} ${day.label} ${day.metrics[row.key]}`}
                  onClick={() => setSelected(day)}
                  className={`h-4 rounded-[3px] border transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-teal-300 ${heatmapClass(day.metrics[row.key])} ${
                    selected.index === day.index ? 'ring-1 ring-neutral-50' : ''
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
        <div className="text-[0.65rem] uppercase tracking-[0.16em] text-teal-300">
          {selected.label} detail
        </div>
        <p className="mt-1 text-sm text-neutral-200">{selected.detail}</p>
      </div>
    </article>
  );
}

function MiniMetric({ label, value, invert }: { label: string; value: number; invert: boolean }) {
  const severity = invert ? 100 - value : value;
  const color =
    severity >= 78
      ? 'bg-teal-400'
      : severity >= 64
        ? 'bg-amber-300'
        : 'bg-red-400';

  return (
    <div className="border-r border-neutral-800 p-3 last:border-r-0">
      <div className="text-[0.62rem] uppercase tracking-[0.14em] text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-light text-neutral-50">{value}%</div>
      <div className="mt-2 h-1.5 rounded-full bg-neutral-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function CorrelationCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-medium text-neutral-100">{title}</h4>
          <p className="mt-2 text-sm leading-6 text-neutral-400">{detail}</p>
        </div>
        <div className="whitespace-nowrap text-right text-sm font-medium text-teal-300">{value}</div>
      </div>
    </div>
  );
}

function LegendDot({ status, label }: { status: ComplianceStatus; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${legendClass(status)}`} />
      {label}
    </span>
  );
}

function buildClientSignal(subscriber: Subscriber): ClientSignal {
  const seed = hashString(subscriber.client_id);
  const sleep = boundedScore(seed, 17, 54, 94);
  const stress = boundedScore(seed, 31, 42, 91);
  const recovery = boundedScore(seed, 47, 50, 95);
  const macros = boundedScore(seed, 59, 52, 96);
  const riskScore = Math.round(
    (100 - sleep) * 0.22 + stress * 0.22 + (100 - recovery) * 0.34 + (100 - macros) * 0.22
  );
  const status = riskScore >= 55 ? 'Review' : riskScore >= 42 ? 'Watch' : 'Stable';
  const reasons = buildReasons({ sleep, stress, recovery, macros });

  return {
    clientId: subscriber.client_id,
    label: `Client ${subscriber.client_id.slice(0, 8)}`,
    sleep,
    stress,
    recovery,
    macros,
    riskScore,
    status,
    reasons,
    actionReason: buildActionReason({ sleep, stress, recovery, macros }, seed),
    correlation: buildCorrelation({ sleep, stress, recovery, macros }),
    heatmap: buildHeatmap(seed),
  };
}

function buildReasons(metrics: Pick<ClientSignal, 'sleep' | 'stress' | 'recovery' | 'macros'>) {
  const reasons: string[] = [];
  if (metrics.recovery < 68) reasons.push('Recovery below baseline');
  if (metrics.sleep < 70) reasons.push('Sleep debt trend');
  if (metrics.stress > 78) reasons.push('Stress elevated');
  if (metrics.macros < 72) reasons.push('Macro adherence slipping');
  if (reasons.length === 0) reasons.push('Stable trend');
  return reasons;
}

function buildActionReason(metrics: Pick<ClientSignal, 'sleep' | 'stress' | 'recovery' | 'macros'>, seed: number) {
  if (metrics.macros < 68) return 'Macros are roughly 30% under target for two straight days.';
  if (metrics.recovery < 65 && metrics.stress > 74) return 'Recovery is low while stress is elevated.';
  if (metrics.sleep < 68) return 'Sleep target broke twice inside the last compliance window.';
  if (seed % 5 === 0) return 'No message or check-in logged in the last 7 days.';
  if (seed % 3 === 0) return 'Last programmed session was missed or not confirmed.';
  return 'Compliance is drifting enough to review before the next session.';
}

function buildCorrelation(metrics: Pick<ClientSignal, 'sleep' | 'stress' | 'recovery' | 'macros'>) {
  if (metrics.sleep < 70 && metrics.recovery < 70) {
    return 'Sleep is down while recovery is down. Adjust before intensity becomes the problem.';
  }
  if (metrics.stress > 78 && metrics.macros < 72) {
    return 'Stress is elevated while macros are slipping. This client needs a simpler compliance target.';
  }
  if (metrics.macros < 72 && metrics.recovery < 72) {
    return 'Macro consistency and recovery are both drifting. Check fueling and meal timing.';
  }
  if (metrics.stress > 78) {
    return 'Stress is the outlier. Review load, schedule pressure, and recent check-ins.';
  }
  return 'No urgent correlation. Keep the current plan and monitor the next sync.';
}

function buildHeatmap(seed: number) {
  return Array.from({ length: 30 }, (_, index) => {
    const workout = statusFromScore(boundedScore(seed, index + 11, 42, 98), false);
    const nutrition = statusFromScore(boundedScore(seed, index + 23, 45, 98), false);
    const sleep = statusFromScore(boundedScore(seed, index + 37, 40, 96), false);
    const recovery = statusFromScore(boundedScore(seed, index + 51, 43, 98), false);
    const redCount = [workout, nutrition, sleep, recovery].filter((status) => status === 'red').length;
    const yellowCount = [workout, nutrition, sleep, recovery].filter((status) => status === 'yellow').length;

    return {
      index,
      label: index === 29 ? 'Today' : `${29 - index}d ago`,
      metrics: { workout, nutrition, sleep, recovery },
      summary:
        redCount > 0
          ? `${redCount} red flag${redCount > 1 ? 's' : ''}`
          : yellowCount > 0
            ? `${yellowCount} watch item${yellowCount > 1 ? 's' : ''}`
            : 'all targets met',
      detail: buildDayDetail({ workout, nutrition, sleep, recovery }),
    };
  });
}

function buildDayDetail(metrics: Record<MetricKey, ComplianceStatus>) {
  const parts = [
    `Workout: ${statusCopy(metrics.workout, 'session logged', 'partial completion', 'missed session')}`,
    `Nutrition: ${statusCopy(metrics.nutrition, 'macro target hit', 'under target', 'well under target')}`,
    `Sleep: ${statusCopy(metrics.sleep, 'sleep target met', 'sleep slightly low', 'sleep target missed')}`,
    `Recovery: ${statusCopy(metrics.recovery, 'ready', 'watch load', 'reduce load')}`,
  ];
  return parts.join('. ') + '.';
}

function statusCopy(status: ComplianceStatus, green: string, yellow: string, red: string) {
  if (status === 'green') return green;
  if (status === 'yellow') return yellow;
  return red;
}

function statusFromScore(score: number, invert: boolean): ComplianceStatus {
  const severity = invert ? 100 - score : score;
  if (severity >= 78) return 'green';
  if (severity >= 64) return 'yellow';
  return 'red';
}

function buildAverages(signals: ClientSignal[]) {
  return {
    sleep: average(signals.map((signal) => signal.sleep)),
    stress: average(signals.map((signal) => signal.stress)),
    recovery: average(signals.map((signal) => signal.recovery)),
    macros: average(signals.map((signal) => signal.macros)),
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function boundedScore(seed: number, salt: number, min: number, max: number) {
  const span = max - min;
  return min + ((seed + salt * 9973) % (span + 1));
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function statusClass(status: ClientSignal['status']) {
  if (status === 'Review') return 'border-red-400/30 bg-red-400/10 text-red-300';
  if (status === 'Watch') return 'border-amber-300/30 bg-amber-300/10 text-amber-200';
  return 'border-teal-300/30 bg-teal-300/10 text-teal-200';
}

function heatmapClass(status: ComplianceStatus) {
  if (status === 'green') return 'border-teal-300/70 bg-teal-400';
  if (status === 'yellow') return 'border-amber-300/70 bg-amber-300';
  return 'border-red-300/70 bg-red-400';
}

function legendClass(status: ComplianceStatus) {
  if (status === 'green') return 'bg-teal-400';
  if (status === 'yellow') return 'bg-amber-300';
  return 'bg-red-400';
}

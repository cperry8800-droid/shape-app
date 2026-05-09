'use client';

export type Series = {
  label: string;
  color: string;
  unit?: string;
  values: Array<number | null>;
};

const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];

function toPath(values: Array<number | null>, width = 320, height = 86): string {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return '';
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  const segments: string[] = [];
  let active = false;
  values.forEach((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    if (value === null) {
      active = false;
      return;
    }
    const y = height - ((value - min) / span) * height;
    segments.push(`${active ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    active = true;
  });
  return segments.join(' ');
}

function formatValue(value: number, unit?: string): string {
  const digits = unit === '%' || unit === 'in' ? 1 : 0;
  return `${value.toFixed(digits)}${unit ?? ''}`;
}

function ChartCard({ title, series, source }: { title: string; series: Series[]; source: 'real' | 'mock' }) {
  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
        <span
          className={`text-[0.65rem] uppercase tracking-[0.16em] ${
            source === 'real' ? 'text-teal-300' : 'text-neutral-500'
          }`}
        >
          {source === 'real' ? 'Last 8 weeks · live' : 'Last 8 weeks · sample'}
        </span>
      </div>
      <svg viewBox="0 0 320 86" className="h-[92px] w-full rounded border border-neutral-800 bg-black/25 p-2">
        {series.map((item) => (
          <path
            key={item.label}
            fill="none"
            stroke={item.color}
            strokeWidth="2.2"
            d={toPath(item.values)}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {series.map((item) => {
          const present = item.values.filter((v): v is number => v !== null);
          if (present.length === 0) {
            return (
              <div
                key={`legend-${item.label}`}
                className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-xs text-neutral-500"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                  {item.label}
                </div>
                <div className="mt-1">No data yet</div>
              </div>
            );
          }
          const start = present[0];
          const end = present[present.length - 1];
          const delta = end - start;
          const deltaText = `${delta >= 0 ? '+' : ''}${delta.toFixed(item.unit === '%' || item.unit === 'in' ? 1 : 0)}${item.unit ?? ''}`;
          return (
            <div key={`legend-${item.label}`} className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-neutral-300">
                <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                {item.label}
              </div>
              <div className="mt-1 text-neutral-100">
                {formatValue(end, item.unit)} ·{' '}
                <span className={delta >= 0 ? 'text-teal-300' : 'text-amber-300'}>{deltaText}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">
        {weeks.map((week) => (
          <span key={`${title}-${week}`}>{week}</span>
        ))}
      </div>
    </article>
  );
}

export type ChartGroup = { series: Series[]; source: 'real' | 'mock' };

type Props = {
  bodyComp: ChartGroup;
  strength: ChartGroup;
  nutrition: ChartGroup;
  sleep: ChartGroup;
  readiness: number;
  sleepScore: number;
  strainLoad: number;
  restScore: number;
  goalPct: number;
  daysOfData: number;
};

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3">
      <div className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-light text-neutral-100">{value}</div>
    </div>
  );
}

export default function ClientProgressAnalyticsClient(props: Props) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-teal-300">Progress analytics</div>
          <h2 className="mt-2 text-2xl font-light tracking-tight text-neutral-100">
            Body, strength, nutrition, sleep
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            {props.daysOfData > 0
              ? `${props.daysOfData} day${props.daysOfData === 1 ? '' : 's'} of synced data — live charts highlight real measurements; sample charts fill gaps until data flows.`
              : 'Connect WHOOP or Strava to replace the sample charts with your real measurements.'}
          </p>
        </div>
        <div className="rounded-full border border-teal-400/40 bg-teal-400/10 px-4 py-2 text-xs uppercase tracking-[0.14em] text-teal-200">
          Readiness index {props.readiness}
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <Mini label="Sleep score" value={`${props.sleepScore}%`} />
        <Mini label="Intensity / load" value={`${props.strainLoad}%`} />
        <Mini label="Rest quality" value={`${props.restScore}%`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Body composition trend" series={props.bodyComp.series} source={props.bodyComp.source} />
        <ChartCard title="Strength progression (12w style)" series={props.strength.series} source={props.strength.source} />
        <ChartCard title="Calories + macros weekly averages" series={props.nutrition.series} source={props.nutrition.source} />
        <ChartCard title="Sleep quality trend" series={props.sleep.series} source={props.sleep.source} />
      </div>

      <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-neutral-100">Goal timeline</h3>
          <span className="text-xs text-neutral-400">8 weeks to event · {props.goalPct}% there</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-neutral-800">
          <div className="h-full rounded-full bg-teal-400" style={{ width: `${props.goalPct}%` }} />
        </div>
        <div className="mt-3 text-sm text-neutral-400">
          Keep current pace to hit target by event week. Primary levers: sleep consistency + weekly protein adherence.
        </div>
      </div>
    </section>
  );
}

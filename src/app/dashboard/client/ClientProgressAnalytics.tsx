'use client';

type Series = {
  label: string;
  color: string;
  unit?: string;
  values: number[];
};

const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];

const bodyComp: Series[] = [
  { label: 'Weight', color: '#2dd4bf', unit: 'lb', values: [188, 187, 186.5, 186, 185, 184.5, 184, 183.5] },
  { label: 'Body fat', color: '#f59e0b', unit: '%', values: [23.2, 23, 22.8, 22.5, 22.2, 22, 21.8, 21.5] },
  { label: 'Waist', color: '#60a5fa', unit: 'in', values: [36, 35.8, 35.6, 35.5, 35.3, 35.1, 35, 34.8] },
];

const strength: Series[] = [
  { label: 'Bench press', color: '#2dd4bf', unit: 'lb', values: [155, 160, 160, 165, 170, 170, 175, 180] },
  { label: 'Squat', color: '#f97316', unit: 'lb', values: [205, 210, 215, 220, 225, 230, 230, 235] },
  { label: 'Deadlift', color: '#a78bfa', unit: 'lb', values: [255, 260, 265, 270, 275, 280, 285, 290] },
];

const nutrition: Series[] = [
  { label: 'Calories avg', color: '#2dd4bf', unit: 'kcal', values: [2280, 2210, 2185, 2160, 2140, 2125, 2105, 2090] },
  { label: 'Protein avg', color: '#34d399', unit: 'g', values: [142, 148, 151, 153, 156, 158, 160, 162] },
  { label: 'Carbs avg', color: '#f59e0b', unit: 'g', values: [245, 238, 232, 228, 224, 220, 216, 212] },
  { label: 'Fat avg', color: '#ef4444', unit: 'g', values: [74, 72, 71, 70, 68, 67, 66, 64] },
];

const sleepTrend: Series = {
  label: 'Sleep quality',
  color: '#2dd4bf',
  unit: '%',
  values: [68, 70, 72, 74, 73, 76, 78, 81],
};

function toPoints(values: number[], width = 320, height = 86) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

function ChartCard({ title, series }: { title: string; series: Series[] }) {
  return (
    <article className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-neutral-100">{title}</h3>
        <span className="text-[0.65rem] uppercase tracking-[0.16em] text-neutral-500">
          Last 8 weeks
        </span>
      </div>
      <svg viewBox="0 0 320 86" className="h-[92px] w-full rounded border border-neutral-800 bg-black/25 p-2">
        {series.map((item) => (
          <polyline
            key={item.label}
            fill="none"
            stroke={item.color}
            strokeWidth="2.2"
            points={toPoints(item.values)}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {series.map((item) => {
          const start = item.values[0];
          const end = item.values[item.values.length - 1];
          const delta = (end - start).toFixed(item.unit === '%' ? 1 : 0);
          const showDelta = delta.startsWith('-') ? delta : `+${delta}`;
          return (
            <div key={`legend-${item.label}`} className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-neutral-300">
                <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                {item.label}
              </div>
              <div className="mt-1 text-neutral-100">
                {end}
                {item.unit} · <span className={showDelta.startsWith('+') ? 'text-teal-300' : 'text-amber-300'}>{showDelta}{item.unit}</span>
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

export default function ClientProgressAnalytics() {
  const readiness = 79;
  const sleepScore = sleepTrend.values[sleepTrend.values.length - 1];
  const strainLoad = 74;
  const restScore = 86;
  const goalPct = 67;

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-teal-300">Progress analytics</div>
          <h2 className="mt-2 text-2xl font-light tracking-tight text-neutral-100">
            Body, strength, nutrition, sleep
          </h2>
        </div>
        <div className="rounded-full border border-teal-400/40 bg-teal-400/10 px-4 py-2 text-xs uppercase tracking-[0.14em] text-teal-200">
          Readiness index {readiness}
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <Mini label="Sleep score" value={`${sleepScore}%`} />
        <Mini label="Intensity / load" value={`${strainLoad}%`} />
        <Mini label="Rest quality" value={`${restScore}%`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Body composition trend" series={bodyComp} />
        <ChartCard title="Strength progression (12w style)" series={strength} />
        <ChartCard title="Calories + macros weekly averages" series={nutrition} />
        <ChartCard title="Sleep quality trend" series={[sleepTrend]} />
      </div>

      <div className="mt-5 rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-neutral-100">Goal timeline</h3>
          <span className="text-xs text-neutral-400">8 weeks to event · {goalPct}% there</span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-neutral-800">
          <div className="h-full rounded-full bg-teal-400" style={{ width: `${goalPct}%` }} />
        </div>
        <div className="mt-3 text-sm text-neutral-400">
          Keep current pace to hit target by event week. Primary levers: sleep consistency + weekly protein adherence.
        </div>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-4 py-3">
      <div className="text-[0.65rem] uppercase tracking-[0.14em] text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-light text-neutral-100">{value}</div>
    </div>
  );
}

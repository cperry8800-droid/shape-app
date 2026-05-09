import type { CSSProperties } from 'react';

type Series = {
  label: string;
  color: string;
  unit?: string;
  values: number[];
};

const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8'];

const bodyComp: Series[] = [
  { label: 'Weight', color: '#34d399', unit: 'lb', values: [188, 187, 186.5, 186, 185, 184.5, 184, 183.5] },
  { label: 'Body fat', color: '#f59e0b', unit: '%', values: [23.2, 23, 22.8, 22.5, 22.2, 22, 21.8, 21.5] },
  { label: 'Waist', color: '#60a5fa', unit: 'in', values: [36, 35.8, 35.6, 35.5, 35.3, 35.1, 35, 34.8] },
];

const strength: Series[] = [
  { label: 'Bench', color: '#2dd4bf', unit: 'lb', values: [155, 160, 160, 165, 170, 170, 175, 180] },
  { label: 'Squat', color: '#f97316', unit: 'lb', values: [205, 210, 215, 220, 225, 230, 230, 235] },
  { label: 'Deadlift', color: '#a78bfa', unit: 'lb', values: [255, 260, 265, 270, 275, 280, 285, 290] },
];

const nutrition: Series[] = [
  { label: 'Calories', color: '#2dd4bf', unit: 'kcal', values: [2280, 2210, 2185, 2160, 2140, 2125, 2105, 2090] },
  { label: 'Protein', color: '#34d399', unit: 'g', values: [142, 148, 151, 153, 156, 158, 160, 162] },
  { label: 'Carbs', color: '#f59e0b', unit: 'g', values: [245, 238, 232, 228, 224, 220, 216, 212] },
  { label: 'Fat', color: '#ef4444', unit: 'g', values: [74, 72, 71, 70, 68, 67, 66, 64] },
];

const sleepTrend: Series = {
  label: 'Sleep quality',
  color: '#2dd4bf',
  unit: '%',
  values: [68, 70, 72, 74, 73, 76, 78, 81],
};

function toPoints(values: number[], width = 292, height = 82) {
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

function TrendCard({ title, series }: { title: string; series: Series[] }) {
  return (
    <div style={trendCardStyle}>
      <div style={trendHeadStyle}>
        <strong>{title}</strong>
        <span style={trendCaptionStyle}>Last 8 weeks</span>
      </div>
      <svg viewBox="0 0 292 82" style={svgStyle}>
        {series.map((item) => (
          <polyline
            key={item.label}
            fill="none"
            stroke={item.color}
            strokeWidth="2.2"
            strokeLinecap="round"
            points={toPoints(item.values)}
          />
        ))}
      </svg>
      <div style={legendWrapStyle}>
        {series.map((item) => {
          const start = item.values[0];
          const end = item.values[item.values.length - 1];
          const delta = end - start;
          return (
            <div key={`legend-${title}-${item.label}`} style={legendItemStyle}>
              <span style={{ ...legendDotStyle, background: item.color }} />
              <span>{item.label}</span>
              <span style={{ color: delta >= 0 ? 'var(--teal-bright)' : '#f59e0b' }}>
                {delta >= 0 ? '+' : ''}{delta.toFixed(item.unit === '%' ? 1 : 0)}{item.unit}
              </span>
            </div>
          );
        })}
      </div>
      <div style={weeksStyle}>
        {weeks.map((week) => <span key={`${title}-${week}`}>{week}</span>)}
      </div>
    </div>
  );
}

export function ClientAnalyticsPanel() {
  const readiness = 79;
  const goalPct = 67;
  const sleepScore = sleepTrend.values[sleepTrend.values.length - 1];
  const intensityScore = 74;
  const restScore = 86;

  return (
    <section style={panelStyle}>
      <header style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Analytics</div>
          <h2 style={titleStyle}>Client progress</h2>
        </div>
        <div style={readinessStyle}>Readiness {readiness}</div>
      </header>

      <div style={miniGridStyle}>
        <Mini label="Sleep" value={`${sleepScore}%`} />
        <Mini label="Intensity" value={`${intensityScore}%`} />
        <Mini label="Rest" value={`${restScore}%`} />
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <TrendCard title="Body composition trend" series={bodyComp} />
        <TrendCard title="Strength progression" series={strength} />
        <TrendCard title="Calories + macros weekly" series={nutrition} />
        <TrendCard title="Sleep quality trend" series={[sleepTrend]} />
      </div>

      <div style={goalCardStyle}>
        <div style={trendHeadStyle}>
          <strong>Goal timeline</strong>
          <span style={trendCaptionStyle}>8 weeks to event · {goalPct}% there</span>
        </div>
        <div style={goalTrackStyle}>
          <div style={{ ...goalFillStyle, width: `${goalPct}%` }} />
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12 }}>
          Keep pace with current trend. Biggest levers: sleep consistency and protein adherence.
        </p>
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniStyle}>
      <div style={miniLabelStyle}>{label}</div>
      <div style={miniValueStyle}>{value}</div>
    </div>
  );
}

const panelStyle: CSSProperties = { display: 'grid', gap: 10 };
const headerStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 };
const titleStyle: CSSProperties = { margin: '4px 0 0', fontSize: 26, lineHeight: 1 };
const readinessStyle: CSSProperties = { border: '1px solid rgba(45,212,191,0.45)', color: 'var(--teal-bright)', padding: '6px 10px', borderRadius: 999, fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.08em' };
const miniGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 };
const miniStyle: CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'rgba(242,237,228,0.03)' };
const miniLabelStyle: CSSProperties = { fontFamily: 'var(--mono)', color: 'var(--muted)', fontSize: 10 };
const miniValueStyle: CSSProperties = { fontSize: 18, marginTop: 4 };
const trendCardStyle: CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, padding: 10, background: 'rgba(13,12,11,0.65)' };
const trendHeadStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const trendCaptionStyle: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.08em' };
const svgStyle: CSSProperties = { width: '100%', height: 88, border: '1px solid var(--border)', borderRadius: 10, marginTop: 8, background: 'rgba(0,0,0,0.2)' };
const legendWrapStyle: CSSProperties = { display: 'grid', gap: 6, marginTop: 8 };
const legendItemStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '10px minmax(0,1fr) auto', gap: 8, alignItems: 'center', fontSize: 12 };
const legendDotStyle: CSSProperties = { width: 8, height: 8, borderRadius: 999 };
const weeksStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 4, marginTop: 8, fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.07em' };
const goalCardStyle: CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, padding: 10, background: 'rgba(242,237,228,0.03)' };
const goalTrackStyle: CSSProperties = { marginTop: 8, height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.12)' };
const goalFillStyle: CSSProperties = { height: '100%', borderRadius: 999, background: 'var(--teal)' };
const eyebrowStyle: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--teal-bright)', letterSpacing: '0.12em', textTransform: 'uppercase' };

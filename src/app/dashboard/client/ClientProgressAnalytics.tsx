// Server-side wrapper for the progress analytics charts. Loads the user's
// last 8 weeks of daily snapshots, buckets to weekly averages, and falls
// back to sample data per series when fewer than 3 weeks of values exist.
//
// Strength data isn't in daily_health_snapshot yet (it lives in
// workout_set_logs); for now strength always shows the sample curve and is
// labelled accordingly.

import { getMySnapshots, buildWeeklySeries, countNonNull } from '@/lib/analytics-data';
import ClientProgressAnalyticsClient, {
  type ChartGroup,
} from './ClientProgressAnalyticsClient';

const MOCK_BODY_COMP: ChartGroup = {
  source: 'mock',
  series: [
    { label: 'Weight', color: '#2dd4bf', unit: 'lb', values: [188, 187, 186.5, 186, 185, 184.5, 184, 183.5] },
    { label: 'Body fat', color: '#f59e0b', unit: '%', values: [23.2, 23, 22.8, 22.5, 22.2, 22, 21.8, 21.5] },
    { label: 'Waist', color: '#60a5fa', unit: 'in', values: [36, 35.8, 35.6, 35.5, 35.3, 35.1, 35, 34.8] },
  ],
};

const MOCK_STRENGTH: ChartGroup = {
  source: 'mock',
  series: [
    { label: 'Bench press', color: '#2dd4bf', unit: 'lb', values: [155, 160, 160, 165, 170, 170, 175, 180] },
    { label: 'Squat', color: '#f97316', unit: 'lb', values: [205, 210, 215, 220, 225, 230, 230, 235] },
    { label: 'Deadlift', color: '#a78bfa', unit: 'lb', values: [255, 260, 265, 270, 275, 280, 285, 290] },
  ],
};

const MOCK_NUTRITION: ChartGroup = {
  source: 'mock',
  series: [
    { label: 'Calories avg', color: '#2dd4bf', unit: 'kcal', values: [2280, 2210, 2185, 2160, 2140, 2125, 2105, 2090] },
    { label: 'Protein avg', color: '#34d399', unit: 'g', values: [142, 148, 151, 153, 156, 158, 160, 162] },
    { label: 'Carbs avg', color: '#f59e0b', unit: 'g', values: [245, 238, 232, 228, 224, 220, 216, 212] },
    { label: 'Fat avg', color: '#ef4444', unit: 'g', values: [74, 72, 71, 70, 68, 67, 66, 64] },
  ],
};

const MOCK_SLEEP: ChartGroup = {
  source: 'mock',
  series: [
    { label: 'Sleep quality', color: '#2dd4bf', unit: '%', values: [68, 70, 72, 74, 73, 76, 78, 81] },
  ],
};

const MIN_WEEKS_FOR_REAL = 3;

function roundedSeries(values: Array<number | null>, digits: number): Array<number | null> {
  return values.map((v) => (v === null ? null : Number(v.toFixed(digits))));
}

export default async function ClientProgressAnalytics() {
  const rows = await getMySnapshots(56);
  const weekly = buildWeeklySeries(rows, 8);

  const bodyCompWeeks = countNonNull(weekly.weight_lb) + countNonNull(weekly.body_fat_pct);
  const bodyComp: ChartGroup =
    bodyCompWeeks >= MIN_WEEKS_FOR_REAL
      ? {
          source: 'real',
          series: [
            { label: 'Weight', color: '#2dd4bf', unit: 'lb', values: roundedSeries(weekly.weight_lb, 1) },
            { label: 'Body fat', color: '#f59e0b', unit: '%', values: roundedSeries(weekly.body_fat_pct, 1) },
          ],
        }
      : MOCK_BODY_COMP;

  const nutritionWeeks =
    countNonNull(weekly.calories) + countNonNull(weekly.protein_g) + countNonNull(weekly.carbs_g);
  const nutrition: ChartGroup =
    nutritionWeeks >= MIN_WEEKS_FOR_REAL
      ? {
          source: 'real',
          series: [
            { label: 'Calories avg', color: '#2dd4bf', unit: 'kcal', values: roundedSeries(weekly.calories, 0) },
            { label: 'Protein avg', color: '#34d399', unit: 'g', values: roundedSeries(weekly.protein_g, 0) },
            { label: 'Carbs avg', color: '#f59e0b', unit: 'g', values: roundedSeries(weekly.carbs_g, 0) },
            { label: 'Fat avg', color: '#ef4444', unit: 'g', values: roundedSeries(weekly.fat_g, 0) },
          ],
        }
      : MOCK_NUTRITION;

  const sleepWeeks = countNonNull(weekly.sleep_performance_pct);
  const sleep: ChartGroup =
    sleepWeeks >= MIN_WEEKS_FOR_REAL
      ? {
          source: 'real',
          series: [
            {
              label: 'Sleep quality',
              color: '#2dd4bf',
              unit: '%',
              values: roundedSeries(weekly.sleep_performance_pct, 0),
            },
          ],
        }
      : MOCK_SLEEP;

  // Headline mini stats: prefer real averages when available.
  const sleepLatest = sleep.source === 'real'
    ? sleep.series[0].values.filter((v): v is number => v !== null).at(-1) ?? 0
    : 81;
  const readiness = sleep.source === 'real' ? Math.min(99, Math.round(sleepLatest * 0.95 + 8)) : 79;

  return (
    <ClientProgressAnalyticsClient
      bodyComp={bodyComp}
      strength={MOCK_STRENGTH}
      nutrition={nutrition}
      sleep={sleep}
      readiness={readiness}
      sleepScore={Math.round(sleepLatest)}
      strainLoad={74}
      restScore={86}
      goalPct={67}
      daysOfData={rows.length}
    />
  );
}

// Pearson correlation across daily_health_snapshot rows. Pure functions —
// no Supabase, no Next. Consumers (the /api/insights/correlations route,
// the AI weekly readout) load rows and pass them in.
//
// "Lag" matters: training quality on day D often depends on sleep from
// D-1. We compute correlations both same-day and one-day-lagged so the
// UI can show "Sleep last night → next-day strain" alongside "Same-day
// macros vs same-day workout".
//
// ⚠ .mjs + .d.ts, NOT .ts, and that is the point: node --test cannot import
// TypeScript, so as a .ts file this module had ZERO tests despite being the
// entire evidence layer under both the insights route and the AI readout.
// This is the shape the repo already uses for exactly that reason
// (console-triage, funnel, guardrail-health, age-derive, sentry-context).

/**
 * The metric columns this module understands, and the ONE source of truth for
 * them.
 *
 * ⚠ IT IS ALSO THE SELECT LIST. Both consuming routes used to hand-type their
 * own copy of these column names, so the catalog and the query could disagree
 * silently — extend the catalog and the pair simply never appears, because the
 * column was never fetched. That is not hypothetical: `energy`, `hunger`,
 * `sleep_quality` and `steps` have existed on daily_health_snapshot since the
 * check-in wave and were missing from BOTH hand-typed lists, so no correlation
 * could ever be computed over the gauges a member logs every single day.
 * Derive the select from the catalog and the class is closed by construction.
 */
export const SNAPSHOT_METRICS = [
  'sleep_hours',
  'sleep_performance_pct',
  'recovery_score',
  'hrv_ms',
  'resting_hr',
  'strain',
  'workout_minutes',
  'workout_volume_lb',
  'avg_heart_rate',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'hydration_l',
  'weight_lb',
  'body_fat_pct',
  'mood',
  'stress',
  'soreness',
  // The daily check-in gauges + NEAT. Logged by the member themselves rather
  // than synced from a device, which is why they are the most consistently
  // populated columns on the table for a member with no wearable.
  'energy',
  'hunger',
  'sleep_quality',
  'steps',
];

/** The PostgREST select for a correlation read. Derived — never hand-typed. */
export const SNAPSHOT_SELECT = ['snapshot_date', ...SNAPSHOT_METRICS].join(',');

// Pairs we score. Each pair is (x, y, lagDays). lagDays = 1 means y is on the
// day AFTER x — e.g. sleep_hours[D-1] vs strain[D]. The label is what the UI
// surfaces; the explanation makes the AI prompt richer.
//
// ⚠ EVERY PAIR MUST NAME A METRIC IN SNAPSHOT_METRICS, and a test asserts it.
// A pair naming an unlisted column is not an error anywhere at runtime — the
// column is simply never fetched, every value reads undefined, and the pair
// silently produces nothing.
export const CORRELATION_PAIRS = [
  { x: 'sleep_hours', y: 'strain', lagDays: 1, label: 'Sleep → next-day strain capacity', explanation: 'Hours slept the night before vs the workload the body actually held the next day.' },
  { x: 'sleep_hours', y: 'recovery_score', lagDays: 0, label: 'Sleep ↔ same-day recovery', explanation: 'Hours slept vs WHOOP recovery score for the same morning.' },
  { x: 'sleep_performance_pct', y: 'workout_minutes', lagDays: 1, label: 'Sleep quality → next-day training volume', explanation: 'How much of training duration the next day tracks with sleep performance.' },
  { x: 'protein_g', y: 'recovery_score', lagDays: 1, label: 'Protein → next-day recovery', explanation: 'Daily protein intake vs the recovery score the following morning.' },
  { x: 'calories', y: 'workout_minutes', lagDays: 0, label: 'Calories ↔ training duration', explanation: 'Same-day calories vs same-day training minutes; energy availability.' },
  { x: 'carbs_g', y: 'strain', lagDays: 0, label: 'Carbs ↔ training strain', explanation: 'Same-day carbohydrate intake vs strain produced.' },
  { x: 'hydration_l', y: 'recovery_score', lagDays: 1, label: 'Hydration → next-day recovery', explanation: 'Daily hydration vs next-morning recovery.' },
  { x: 'stress', y: 'sleep_hours', lagDays: 0, label: 'Stress ↔ sleep', explanation: 'Subjective stress score vs hours slept that night.' },
  { x: 'workout_minutes', y: 'soreness', lagDays: 1, label: 'Training volume → next-day soreness', explanation: 'How much soreness shows up the morning after training.' },
  { x: 'protein_g', y: 'weight_lb', lagDays: 0, label: 'Protein ↔ weight', explanation: 'Trends in protein intake vs body weight across the window.' },

  // The check-in gauges. Deliberately a SHORT list with a physiological story
  // each, not every pairing the columns allow: every pair added enlarges the
  // family this readout tests, and the false-positive cost is real (see the
  // q-value note on computeCorrelations).
  { x: 'sleep_quality', y: 'energy', lagDays: 1, label: 'Rested rating → next-day energy', explanation: 'How rested they said they felt vs the energy they reported the next day.' },
  { x: 'sleep_hours', y: 'energy', lagDays: 1, label: 'Sleep → next-day energy', explanation: 'The objective twin of the rested rating: hours slept vs next-day energy.' },
  { x: 'energy', y: 'workout_minutes', lagDays: 0, label: 'Energy ↔ same-day training', explanation: 'Whether the days they report more energy are the days they actually train longer.' },
  { x: 'calories', y: 'hunger', lagDays: 1, label: 'Calories → next-day hunger', explanation: 'Whether under-eating one day shows up as hunger the next.' },
  { x: 'protein_g', y: 'hunger', lagDays: 0, label: 'Protein ↔ hunger', explanation: 'Same-day protein vs how hungry they felt; satiety.' },
  { x: 'steps', y: 'energy', lagDays: 0, label: 'Steps ↔ energy', explanation: 'Daily movement outside training vs reported energy on the same day.' },
];

/**
 * A metric value as a usable number, or null.
 *
 * ⚠ THE STRING CASE IS NOT DEFENSIVE PADDING — IT IS THE PRODUCTION SHAPE.
 * PostgREST returns `numeric` columns as STRINGS, which this repo has already
 * been bitten by once and browser-verified (the roster variance band, #1769:
 * "the unit tests only cover the JS-number shape, so this was a real production
 * gap"). Fourteen of the metrics here are `numeric` — sleep_hours, strain,
 * recovery_score, hrv_ms, resting_hr, protein_g, carbs_g, fat_g, hydration_l,
 * weight_lb, body_fat_pct and friends — so a strict `typeof === 'number'` test
 * silently drops every row for most of the catalog and the pair computes over
 * nothing, returning 200 with one fewer finding and no error anywhere.
 * Accepting both shapes is correct whichever way the driver serialises them.
 *
 * ⚠ AND IT MUST NOT BE `Number(v)`. Number(null), Number('') and Number(false)
 * are all a finite 0 — the fabrication class this repo has paid for repeatedly
 * (the cycle-read module invented a "significant" gap out of eight missing
 * rows exactly this way). A missing reading is ABSENCE and drops the day; it is
 * never a zero on the chart.
 */
function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (trimmed === '') return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pearson(xs, ys) {
  if (xs.length < 4) return null;
  const n = xs.length;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

// Approximate two-sided p-value for Pearson r using the t-distribution
// approximation. Good enough for "is this significant or noise" — we are
// not doing inference, just gating which insights surface.
function approxPValue(r, n) {
  if (n <= 2 || Math.abs(r) >= 1) return 0;
  const t = (r * Math.sqrt(n - 2)) / Math.sqrt(Math.max(1 - r * r, 1e-9));
  // Two-sided survival approximation via Abramowitz & Stegun 26.7.1.
  const x = Math.abs(t);
  const a = 1 / (1 + 0.2316419 * x);
  const phi =
    (1 / Math.sqrt(2 * Math.PI)) *
    Math.exp(-(x * x) / 2) *
    (a * (0.319381530 + a * (-0.356563782 + a * (1.781477937 + a * (-1.821255978 + a * 1.330274429)))));
  return Math.min(1, 2 * phi);
}

function strengthOf(r) {
  const abs = Math.abs(r);
  if (abs >= 0.5) return 'strong';
  if (abs >= 0.3) return 'moderate';
  return 'weak';
}

/**
 * Benjamini–Hochberg false-discovery-rate adjustment, in place, over the
 * correlations actually computed for this member.
 *
 * ⚠ WHY THIS EXISTS, AND WHY IT SHIPPED WITH THE NEW PAIRS RATHER THAN AFTER.
 * Every pair is an independent test, so the more pairs, the more likely at
 * least one crosses a threshold on noise alone. With a 28-day window an |r| of
 * 0.3 — the "moderate" floor — is roughly p = 0.12, so a catalog of 16 pairs
 * expects about TWO "moderate" findings from pure noise. A readout that always
 * has something to say is not a readout; it is a horoscope. This wave enlarged
 * the family, so this wave carries the correction: registering it and shipping
 * the extra pairs anyway would have knowingly made the output less honest.
 *
 * q is the smallest FDR at which a finding survives, computed over the whole
 * batch — so it is only meaningful RELATIVE to the other pairs in the same
 * response, which is exactly the comparison a reader makes.
 */
function annotateQValues(results) {
  const m = results.length;
  if (m === 0) return results;
  const order = results
    .map((res, i) => ({ i, p: res.pValue }))
    .sort((a, b) => a.p - b.p);
  // Walk from the largest p downward, keeping a running minimum so q is
  // monotone in p — the standard step-up correction. Without the running
  // minimum a pair could report a LOWER q than a stronger one beside it.
  let running = 1;
  for (let rank = m; rank >= 1; rank -= 1) {
    const entry = order[rank - 1];
    running = Math.min(running, (entry.p * m) / rank);
    results[entry.i].qValue = Number(Math.min(1, running).toFixed(4));
  }
  return results;
}

export function computeCorrelations(rows) {
  const byDate = new Map();
  for (const row of rows) byDate.set(row.snapshot_date, row);
  const dates = Array.from(byDate.keys()).sort();

  const results = [];
  for (const pair of CORRELATION_PAIRS) {
    const xs = [];
    const ys = [];
    const series = [];

    for (const date of dates) {
      const xRow = byDate.get(date);
      const yDate =
        pair.lagDays === 0
          ? date
          // Both sides are UTC (a bare YYYY-MM-DD parses as UTC midnight), so
          // this is immune to the caller's timezone and to DST.
          : new Date(new Date(date).getTime() + 86_400_000).toISOString().slice(0, 10);
      const yRow = byDate.get(yDate);
      const xVal = toNumber(xRow?.[pair.x]);
      const yVal = toNumber(yRow?.[pair.y]);
      if (xVal !== null && yVal !== null) {
        xs.push(xVal);
        ys.push(yVal);
        series.push({ date, x: xVal, y: yVal });
      }
    }

    const r = pearson(xs, ys);
    if (r === null) continue;
    const n = xs.length;
    results.push({
      x: pair.x,
      y: pair.y,
      lagDays: pair.lagDays,
      label: pair.label,
      explanation: pair.explanation,
      r: Number(r.toFixed(3)),
      n,
      pValue: Number(approxPValue(r, n).toFixed(4)),
      // A seed the annotator below always overwrites — mutation-testing
      // confirms changing it changes nothing, because annotateQValues assigns
      // every index and its only early return is the empty case. Kept rather
      // than deleted so the shape the .d.ts promises is complete at the point
      // of construction, and so an annotator that grows a new early return
      // cannot silently emit a result with no qValue at all.
      qValue: 1,
      strength: strengthOf(r),
      direction: r >= 0 ? 'positive' : 'negative',
      series,
    });
  }

  annotateQValues(results);
  return results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

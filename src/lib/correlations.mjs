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

// Pairs we score. Each pair is (x, y, lagDays). lagDays = 1 means y is read on
// the day AFTER x. The label is what the UI surfaces; the explanation makes the
// AI prompt richer.
//
// ⚠ EVERY PAIR MUST NAME A METRIC IN SNAPSHOT_METRICS, and a test asserts it.
// A pair naming an unlisted column is not an error anywhere at runtime — the
// column is simply never fetched, every value reads undefined, and the pair
// silently produces nothing.
//
// ⚠ A SLEEP COLUMN ON DAY D IS THE NIGHT THAT **ENDED** ON THE MORNING OF D —
// which means the intuitive "sleep → next day" lag is off by one, and five of
// the pairs below were. Established by reading the writers, not assumed:
//   • `/api/client/checkin` puts sleepHours, sleepQuality AND energy into the
//     SAME row keyed on the member's local today (route.ts:52-88), and the
//     mobile card submits all four in one `doLog()` — the member is logging
//     last night's sleep beside this morning's energy.
//   • Device sync agrees: WHOOP sleeps and Oura `daily_sleep` both merge on the
//     provider's own day field, which is the WAKE day (health-snapshot.ts:220,
//     :318), and the neighbouring `sleep_hours × recovery_score` pair already
//     encodes this in its own words — "for the same morning", at lag 0.
// So the sleep that fuelled day D's training sits on row D, not row D-1, and
// the night that FOLLOWS a day-D stress rating sits on row D+1. Getting this
// backwards does not fail loudly; it silently reports a different relationship
// from the one the member logged, which is the fabrication class this file is
// most exposed to. Check the writer before choosing a lag.
//
// ⚠ AND THE CORRECT LAG CAN STILL CARRY A CONFOUND. Fixing the lag put two
// pairs at lag 0 whose x and y a member sets in the SAME tap sequence on the
// SAME card, seconds apart — `sleep_quality × energy` most of all. That is not
// a tautology (they rate different things) and not a reason to drop the pair,
// but it is shared-method variance: someone having a good morning rates both
// high, which inflates r relative to an independent measurement. The
// explanations say so, because they are what the model is handed as evidence —
// and a readout that reports a self-report agreeing with itself as a discovery
// is the same over-claim as a wrong lag, arrived at honestly.
export const CORRELATION_PAIRS = [
  { x: 'sleep_hours', y: 'strain', lagDays: 0, label: 'Sleep ↔ that day’s strain capacity', explanation: 'Hours slept the night before vs the workload the body held that day. Lag 0 because the night ending on the morning of D is stored on row D.' },
  { x: 'sleep_hours', y: 'recovery_score', lagDays: 0, label: 'Sleep ↔ same-day recovery', explanation: 'Hours slept vs WHOOP recovery score for the same morning.' },
  { x: 'sleep_performance_pct', y: 'workout_minutes', lagDays: 0, label: 'Sleep quality ↔ that day’s training volume', explanation: 'How much training duration tracks with the sleep performance of the night before it.' },
  { x: 'protein_g', y: 'recovery_score', lagDays: 1, label: 'Protein → next-day recovery', explanation: 'Daily protein intake vs the recovery score the following morning.' },
  { x: 'calories', y: 'workout_minutes', lagDays: 0, label: 'Calories ↔ training duration', explanation: 'Same-day calories vs same-day training minutes; energy availability.' },
  { x: 'carbs_g', y: 'strain', lagDays: 0, label: 'Carbs ↔ training strain', explanation: 'Same-day carbohydrate intake vs strain produced.' },
  { x: 'hydration_l', y: 'recovery_score', lagDays: 1, label: 'Hydration → next-day recovery', explanation: 'Daily hydration vs next-morning recovery.' },
  { x: 'stress', y: 'sleep_hours', lagDays: 1, label: 'Stress → sleep that night', explanation: 'A day’s stress rating vs the sleep that followed it. Lag 1 because the night AFTER day D is stored on row D+1 — the label always said “that night”; only the lag disagreed.' },
  { x: 'workout_minutes', y: 'soreness', lagDays: 1, label: 'Training volume → next-day soreness', explanation: 'How much soreness shows up the morning after training.' },
  { x: 'protein_g', y: 'weight_lb', lagDays: 0, label: 'Protein ↔ weight', explanation: 'Trends in protein intake vs body weight across the window.' },

  // The check-in gauges. Deliberately a SHORT list with a physiological story
  // each, not every pairing the columns allow: every pair added enlarges the
  // family this readout tests, and the false-positive cost is real (see the
  // q-value note on computeCorrelations).
  { x: 'sleep_quality', y: 'energy', lagDays: 0, label: 'Rested rating ↔ that morning’s energy', explanation: 'How rested they said they felt vs the energy they reported in the SAME check-in. Both are 1-10 self-reports set seconds apart, so shared-method variance can inflate this one — a member having a good morning rates both high. Descriptive only; the sleep_hours twin is the objective check on it.' },
  { x: 'sleep_hours', y: 'energy', lagDays: 0, label: 'Sleep ↔ that morning’s energy', explanation: 'The objective twin of the rested rating: hours slept last night (a duration, device-synced or entered) vs the energy reported that morning. Carries no shared-method confound, so where the two disagree, trust this one.' },
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

/**
 * The fewest overlapping days a pair may be scored on.
 *
 * ⚠ NAMED BECAUSE THREE COMMENTS ALREADY CITED IT AS `MIN_DAYS` WHILE IT WAS A
 * BARE `4` — a constant that only exists in prose is one nobody can grep for,
 * and the p-value rationale below turns on this being the floor. Four is two
 * degrees of freedom, the lowest at which the t tail is defined at all.
 */
export const MIN_DAYS = 4;

function pearson(xs, ys) {
  if (xs.length < MIN_DAYS) return null;
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

// ── Student-t two-sided p-value for Pearson r ────────────────────────────────
//
// ⚠ THIS COMPUTED A NORMAL TAIL WHILE CALLING ITSELF A t-DISTRIBUTION, and at
// this module's sample sizes that is not a rounding difference. The t statistic
// was formed correctly with n-2 degrees of freedom and then fed into
// Abramowitz & Stegun 26.2.17 — the STANDARD NORMAL survival approximation,
// which is the df -> infinity limit. Our windows are small by construction
// (MIN_DAYS is 4, and the readout gates at n >= 7), and that is exactly where
// the normal tail is far too thin: for n = 4, r = 0.9 the true two-sided p is
// 0.10 and the old code returned ~0.004. Every p was understated, and since q
// is a monotone transform of the p ordering and thresholds, every q with it —
// so the FDR gate added in this same wave was calibrated against numbers that
// were not the p-values they claimed to be.
//
// The exact expression is used instead of an approximation, because it is only
// a few lines more: for T ~ t(df),
//     P(|T| >= t) = I_{df/(df + t^2)}(df/2, 1/2)
// where I is the regularized incomplete beta function. Deterministic, no table,
// no lookup, and correct at every df rather than only in the large-n limit.

// Lanczos log-gamma (g = 7, n = 9). Standard coefficients.
const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function logGamma(z) {
  if (z < 0.5) {
    // Reflection: Gamma(z)Gamma(1-z) = pi / sin(pi z)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const x = z - 1;
  let a = LANCZOS_C[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_C.length; i += 1) a += LANCZOS_C[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Continued fraction for the incomplete beta (modified Lentz). Converges for
// x < (a+1)/(a+b+2); the caller flips to the symmetric form otherwise.
function betaContinuedFraction(a, b, x) {
  const TINY = 1e-30;
  const EPS = 3e-12;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a, b), in [0, 1].
function incompleteBeta(a, b, x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

function approxPValue(r, n) {
  if (n <= 2 || Math.abs(r) >= 1) return 0;
  const df = n - 2;
  const t = (r * Math.sqrt(df)) / Math.sqrt(Math.max(1 - r * r, 1e-9));
  if (!Number.isFinite(t)) return 0;
  const p = incompleteBeta(df / 2, 0.5, df / (df + t * t));
  return Math.min(1, Math.max(0, p));
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

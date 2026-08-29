// The evidence layer under BOTH the insights route and the AI weekly readout.
//
// ⚠ THIS FILE EXISTS BECAUSE THE MODULE HAD NO TESTS AT ALL. It was a .ts file,
// which `node --test` cannot import, so the entire correlation engine — the
// thing that decides which "insights" a member is shown about their own body —
// was gated by nothing but a typecheck. Converting it to .mjs + .d.ts (the
// shape console-triage / funnel / guardrail-health / age-derive already use)
// is what made these assertions possible.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CORRELATION_PAIRS,
  SNAPSHOT_METRICS,
  SNAPSHOT_SELECT,
  computeCorrelations,
} from '../src/lib/correlations.mjs';

// ⚠ THE DRIFT THIS CLOSES WAS REAL AND SHIPPED. Both consuming routes used to
// hand-type their own copy of the column list, so a pair could name a column
// the query never fetched — which fails LOUDLY nowhere: the value reads
// undefined, the pair contributes nothing, and the route returns 200 with one
// fewer finding than it claims to compute.
test('every pair names a metric that is actually selected', () => {
  const selected = new Set(SNAPSHOT_SELECT.split(','));
  assert.ok(selected.has('snapshot_date'), 'the select must carry the date it pairs on');
  for (const pair of CORRELATION_PAIRS) {
    assert.ok(selected.has(pair.x), `pair x "${pair.x}" (${pair.label}) is not in the select`);
    assert.ok(selected.has(pair.y), `pair y "${pair.y}" (${pair.label}) is not in the select`);
  }
});

test('the select is derived from the metric list, with no duplicates', () => {
  const parts = SNAPSHOT_SELECT.split(',');
  assert.equal(new Set(parts).size, parts.length, 'duplicate column in the select');
  assert.deepEqual(parts, ['snapshot_date', ...SNAPSHOT_METRICS]);
});

// ⚠ THE REGRESSION THAT WOULD HAVE CAUGHT THE OMISSION. energy / hunger /
// sleep_quality / steps have existed on daily_health_snapshot since the
// check-in wave, and a member logs them by hand every day — they are the most
// reliably populated columns for anyone without a wearable. They were in
// NEITHER route's hand-typed list, so not one correlation over them could ever
// be computed. Named individually so a future edit that drops one fails by name.
test('the daily check-in gauges are part of the evidence', () => {
  for (const gauge of ['energy', 'hunger', 'sleep_quality', 'steps']) {
    assert.ok(SNAPSHOT_METRICS.includes(gauge), `${gauge} missing from SNAPSHOT_METRICS`);
    assert.ok(
      CORRELATION_PAIRS.some((p) => p.x === gauge || p.y === gauge),
      `${gauge} is selected but no pair uses it — it would be fetched and ignored`
    );
  }
});

// A perfectly correlated pair, to pin the arithmetic end to end rather than
// trusting the formula by eye.
function daysOf(n, fn) {
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    rows.push({ snapshot_date: d, ...fn(i) });
  }
  return rows;
}

test('a perfect same-day relationship reads r = 1 with the right n', () => {
  const rows = daysOf(10, (i) => ({ calories: 2000 + i * 10, workout_minutes: 30 + i }));
  const hit = computeCorrelations(rows).find((c) => c.x === 'calories' && c.y === 'workout_minutes' && c.lagDays === 0);
  assert.ok(hit, 'the calories ↔ training pair did not compute');
  assert.equal(hit.r, 1);
  assert.equal(hit.n, 10);
  assert.equal(hit.direction, 'positive');
  assert.equal(hit.strength, 'strong');
});

// ⚠ THE LAG IS THE WHOLE POINT OF THE MODULE — "sleep last night → today" is a
// different claim from "sleep and strain on the same day". A lagged pair must
// read the Y value from the FOLLOWING date, and must lose exactly one usable
// day at the end of the window.
test('a lagged pair reads y from the next day and drops the last day', () => {
  // energy on day i+1 mirrors sleep_quality on day i, inverted.
  const rows = daysOf(8, (i) => ({ sleep_quality: i, energy: 10 - i }));
  const lagged = computeCorrelations(rows).find(
    (c) => c.x === 'sleep_quality' && c.y === 'energy' && c.lagDays === 1
  );
  assert.ok(lagged, 'the rested → next-day energy pair did not compute');
  // 8 days, one lost to the lag.
  assert.equal(lagged.n, 7);
  // sleep_quality[i] vs energy[i+1] = 10-(i+1) — still perfectly linear, negative.
  assert.equal(lagged.r, -1);
  assert.equal(lagged.direction, 'negative');
  assert.equal(lagged.series[0].date, '2026-01-01');
});

test('a gap in the window breaks the lag rather than pairing across it', () => {
  const rows = [
    { snapshot_date: '2026-01-01', sleep_quality: 1, energy: 1 },
    { snapshot_date: '2026-01-02', sleep_quality: 2, energy: 2 },
    // 01-03 missing entirely
    { snapshot_date: '2026-01-04', sleep_quality: 4, energy: 4 },
    { snapshot_date: '2026-01-05', sleep_quality: 5, energy: 5 },
    { snapshot_date: '2026-01-06', sleep_quality: 6, energy: 6 },
    { snapshot_date: '2026-01-07', sleep_quality: 7, energy: 7 },
    { snapshot_date: '2026-01-08', sleep_quality: 8, energy: 8 },
  ];
  const lagged = computeCorrelations(rows).find(
    (c) => c.x === 'sleep_quality' && c.y === 'energy' && c.lagDays === 1
  );
  // 7 rows; 01-02→01-03 and 01-08→01-09 have no y row, so 5 usable pairs.
  assert.ok(lagged);
  assert.equal(lagged.n, 5);
  assert.ok(!lagged.series.some((s) => s.date === '2026-01-02'),
    'paired across the missing day');
});

test('a flat metric yields no correlation rather than a fabricated one', () => {
  const rows = daysOf(10, () => ({ calories: 2000, workout_minutes: 45 }));
  const hit = computeCorrelations(rows).find((c) => c.x === 'calories' && c.y === 'workout_minutes');
  assert.equal(hit, undefined, 'zero variance must produce nothing, not r = 0');
});

test('too few overlapping days yields nothing', () => {
  const rows = daysOf(3, (i) => ({ calories: 2000 + i, workout_minutes: 30 + i }));
  assert.equal(computeCorrelations(rows).length, 0);
});

test('a null value drops that day rather than counting as zero', () => {
  const rows = daysOf(10, (i) => ({
    calories: i === 4 ? null : 2000 + i * 10,
    workout_minutes: 30 + i,
  }));
  const hit = computeCorrelations(rows).find((c) => c.x === 'calories' && c.y === 'workout_minutes' && c.lagDays === 0);
  assert.ok(hit);
  assert.equal(hit.n, 9, 'the null day must be dropped, not coerced');
  assert.equal(hit.r, 1, 'dropping a day must not distort the relationship');
});

// ⚠ THE MULTIPLE-COMPARISON CORRECTION. Every pair is a separate test, so a
// larger catalog finds more on noise alone — with a 28-day window an |r| of 0.3
// (the "moderate" floor) is roughly p = 0.12, so 16 pairs expect about two
// spurious "moderate" findings per readout. A readout that always has something
// to say is a horoscope. q is what separates the two.
test('q is never below p and never above 1', () => {
  const rows = daysOf(20, (i) => ({
    sleep_hours: 6 + (i % 5) * 0.4,
    strain: 8 + (i % 3),
    calories: 2000 + (i % 7) * 40,
    workout_minutes: 20 + (i % 4) * 10,
    protein_g: 120 + (i % 6) * 5,
    weight_lb: 180 - i * 0.1,
    energy: 5 + (i % 4),
    sleep_quality: 4 + (i % 5),
    hunger: 3 + (i % 3),
    steps: 6000 + (i % 8) * 300,
  }));
  const out = computeCorrelations(rows);
  assert.ok(out.length > 1, 'need several pairs to exercise the adjustment');
  for (const c of out) {
    assert.ok(c.qValue >= c.pValue - 1e-9, `q (${c.qValue}) below p (${c.pValue}) for ${c.label}`);
    assert.ok(c.qValue <= 1, `q above 1 for ${c.label}`);
  }
});

test('q is monotone in p — a weaker finding never reports a better q', () => {
  const rows = daysOf(20, (i) => ({
    sleep_hours: 6 + (i % 5) * 0.4,
    strain: 8 + (i % 3),
    calories: 2000 + (i % 7) * 40,
    workout_minutes: 20 + (i % 4) * 10,
    protein_g: 120 + (i % 6) * 5,
    weight_lb: 180 - i * 0.1,
    energy: 5 + (i % 4),
    sleep_quality: 4 + (i % 5),
    hunger: 3 + (i % 3),
    steps: 6000 + (i % 8) * 300,
  }));
  const byP = computeCorrelations(rows).slice().sort((a, b) => a.pValue - b.pValue);
  for (let i = 1; i < byP.length; i += 1) {
    assert.ok(
      byP[i].qValue >= byP[i - 1].qValue - 1e-9,
      `q decreased as p increased (${byP[i - 1].label} → ${byP[i].label})`
    );
  }
});

// The .d.ts is what every TypeScript consumer sees; a shape it promises but the
// module does not produce is an `any` at the call site, not a compile error.
test('the module produces every field the .d.ts promises', () => {
  const rows = daysOf(10, (i) => ({ calories: 2000 + i * 10, workout_minutes: 30 + i }));
  const [c] = computeCorrelations(rows);
  assert.ok(c);
  for (const key of ['x', 'y', 'lagDays', 'label', 'explanation', 'r', 'n',
                     'pValue', 'qValue', 'strength', 'direction', 'series']) {
    assert.ok(key in c, `CorrelationResult is missing ${key}`);
  }
});

// ⚠ THE PRODUCTION SHAPE, and the reason this is not a hypothetical: PostgREST
// returns `numeric` columns as STRINGS — browser-verified in this repo once
// already (#1769, the roster variance band: "the unit tests only cover the
// JS-number shape, so this was a real production gap"). FOURTEEN of the metrics
// on daily_health_snapshot are `numeric`, so a strict typeof-number test drops
// every row for most of the catalog and the pair computes over nothing, with a
// 200 and no error to show for it.
test('numeric values arriving as strings still count', () => {
  const rows = daysOf(10, (i) => ({
    protein_g: String(120 + i * 5),      // numeric → string, the PostgREST shape
    recovery_score: String(50 + i * 2),
  }));
  const hit = computeCorrelations(rows).find(
    (c) => c.x === 'protein_g' && c.y === 'recovery_score' && c.lagDays === 1
  );
  assert.ok(hit, 'a string-valued numeric pair computed nothing');
  assert.equal(hit.n, 9, 'lagged pair over 10 days');
  assert.equal(hit.r, 1);
});

// ⚠ AND THE COERCION MUST NOT BE `Number(v)`. Number(null), Number('') and
// Number(false) are all a finite 0 — the fabrication class this repo has paid
// for more than once. A missing reading is ABSENCE and drops the day; it is
// never a zero plotted on the member's own chart.
test('absent and unparseable values are dropped, never coerced to zero', () => {
  for (const junk of [null, undefined, '', '   ', 'n/a', {}, [], true, false, NaN, Infinity]) {
    const rows = daysOf(10, (i) => ({
      calories: i === 4 ? junk : 2000 + i * 10,
      workout_minutes: 30 + i,
    }));
    const hit = computeCorrelations(rows).find(
      (c) => c.x === 'calories' && c.y === 'workout_minutes' && c.lagDays === 0
    );
    assert.ok(hit, `pair vanished entirely for ${String(junk)}`);
    assert.equal(hit.n, 9, `${String(junk)} was counted instead of dropped`);
    assert.equal(hit.r, 1, `${String(junk)} distorted the relationship`);
  }
});

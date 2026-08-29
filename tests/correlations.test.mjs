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
  MIN_DAYS,
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
  // hunger on day i+1 mirrors calories on day i, inverted. `calories → hunger`
  // is genuinely lagged: intake is logged across day D, and the hunger it
  // produces is rated in the NEXT morning's check-in.
  const rows = daysOf(8, (i) => ({ calories: i, hunger: 10 - i }));
  const lagged = computeCorrelations(rows).find(
    (c) => c.x === 'calories' && c.y === 'hunger' && c.lagDays === 1
  );
  assert.ok(lagged, 'the calories → next-day hunger pair did not compute');
  // 8 days, one lost to the lag.
  assert.equal(lagged.n, 7);
  // calories[i] vs hunger[i+1] = 10-(i+1) — still perfectly linear, negative.
  assert.equal(lagged.r, -1);
  assert.equal(lagged.direction, 'negative');
  assert.equal(lagged.series[0].date, '2026-01-01');
});

test('a gap in the window breaks the lag rather than pairing across it', () => {
  const rows = [
    { snapshot_date: '2026-01-01', calories: 1, hunger: 1 },
    { snapshot_date: '2026-01-02', calories: 2, hunger: 2 },
    // 01-03 missing entirely
    { snapshot_date: '2026-01-04', calories: 4, hunger: 4 },
    { snapshot_date: '2026-01-05', calories: 5, hunger: 5 },
    { snapshot_date: '2026-01-06', calories: 6, hunger: 6 },
    { snapshot_date: '2026-01-07', calories: 7, hunger: 7 },
    { snapshot_date: '2026-01-08', calories: 8, hunger: 8 },
  ];
  const lagged = computeCorrelations(rows).find(
    (c) => c.x === 'calories' && c.y === 'hunger' && c.lagDays === 1
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

// ⚠ THE KEY IS AN IDENTITY, AND TWO CONSUMERS DEPEND ON IT BEING UNIQUE. The
// readout builds `${x}->${y}@lag${lag}` and (a) filters the model's insights
// against a Set of those keys and (b) hands the key to the UI so it can plot
// the right chart. Two pairs sharing a key would let an insight about one
// finding be plotted against another's data — a wrong chart under a real
// headline, which is worse than no chart. Nothing else enforces it, so a pair
// added later with a duplicate (x, y, lag) fails here.
test('no two pairs share a correlation key', () => {
  const seen = new Map();
  for (const p of CORRELATION_PAIRS) {
    const key = `${p.x}->${p.y}@lag${p.lagDays}`;
    assert.ok(!seen.has(key), `duplicate key ${key}: "${seen.get(key)}" and "${p.label}"`);
    seen.set(key, p.label);
  }
  assert.equal(seen.size, CORRELATION_PAIRS.length);
});

// A pair correlating a metric with itself is always r = 1 at lag 0 and would
// present a tautology as a finding.
test('no pair correlates a metric with itself at the same lag', () => {
  for (const p of CORRELATION_PAIRS) {
    if (p.lagDays === 0) {
      assert.notEqual(p.x, p.y, `"${p.label}" correlates ${p.x} with itself`);
    }
  }
});

// ── The p-value, and the sleep-day convention the lags rest on ───────────────

// ⚠ THIS MODULE COMPUTED A NORMAL TAIL WHILE ITS OWN COMMENT SAID
// "t-distribution". The t statistic was formed correctly with n-2 degrees of
// freedom and then pushed through Abramowitz & Stegun 26.2.17 — the STANDARD
// NORMAL survival approximation, i.e. the df -> infinity limit — so every
// p-value was understated, worst exactly where this module lives: n is 4 at the
// floor and 7 at the readout gate. A wrong p is not cosmetic here, because the
// FDR gate added in the same wave is a monotone transform of the p ordering and
// its threshold: the readout was deciding what to tell a member about their own
// body using numbers that were not the p-values they claimed to be.
//
// Pinned against PUBLISHED critical values rather than against the previous
// output: at each alpha = 0.05 critical r for that df, p must land on 0.05. A
// table generated from the implementation would only pin the implementation.
test('the p-value is a real Student-t tail, not a normal approximation', () => {
  const series = (xs, ys) =>
    xs.map((x, i) => ({
      snapshot_date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      protein_g: x,
      weight_lb: ys[i],
    }));
  // `protein_g x weight_lb` at lag 0 is a real pair, so this drives the shipped
  // path rather than a private helper.
  const pFor = (xs, ys) => {
    const out = computeCorrelations(series(xs, ys));
    const hit = out.find((c) => c.x === 'protein_g' && c.y === 'weight_lb');
    assert.ok(hit, 'the protein x weight pair should compute');
    return { p: hit.pValue, r: hit.r, n: hit.n };
  };

  // r = 0: a two-sided p of exactly 1. y is symmetric about the middle of x, so
  // the covariance numerator cancels exactly.
  const flat = pFor([1, 2, 3, 4, 5, 6, 7, 8], [1, 2, 3, 4, 4, 3, 2, 1]);
  assert.equal(flat.r, 0);
  assert.ok(Math.abs(flat.p - 1) < 1e-9, `r=0 should give p=1, got ${flat.p}`);

  // The published alpha = 0.05 critical correlations. Each must land on 0.05.
  // The old normal-tail code returned roughly a third of this at n = 8.
  for (const [n, rCrit] of [
    [8, 0.7067],
    [10, 0.6319],
    [16, 0.4973],
  ]) {
    // Build a series with exactly this r: y = r*x + sqrt(1-r^2)*z, on an
    // orthonormal x/z pair, so the correlation is the coefficient itself.
    const xs = [];
    const zs = [];
    for (let i = 0; i < n; i += 1) {
      const th = (2 * Math.PI * i) / n;
      xs.push(Math.cos(th));
      zs.push(Math.sin(th));
    }
    const ys = xs.map((x, i) => rCrit * x + Math.sqrt(1 - rCrit * rCrit) * zs[i]);
    const got = pFor(xs, ys);
    // `r` is reported rounded to 3dp; the p-value is computed from the raw one.
    assert.ok(Math.abs(got.r - rCrit) < 1e-3, `n=${n}: built r=${got.r}, wanted ${rCrit}`);
    assert.ok(
      Math.abs(got.p - 0.05) < 0.002,
      `n=${n}, r=${rCrit} is the published .05 critical value; got p=${got.p}`
    );
  }
});

// ⚠ AN INDEPENDENT ORACLE, NOT A PINNED OUTPUT. The critical-value test above
// checks three points against published tables; this checks the whole curve
// against CLOSED FORMS that share not one line with the implementation. The
// Student-t survival function is elementary at df 1, 2 and 4:
//     df=2: 1 - t/sqrt(2 + t^2)
//     df=4: 1 - x*(1.5 - 0.5x^2),  x = t/sqrt(4 + t^2)
// df 2 and 4 are n = 4 and 6 — n = 4 is MIN_DAYS, the floor of what this module
// will compute at all, so df=2 is the lowest reachable through the public API
// and exactly where the old normal tail was worst and where a continued
// fraction is most likely to misbehave. A test that pinned the implementation's
// own numbers would have passed just as happily on the normal approximation.
test('the p-value matches closed-form Student-t at the smallest samples', () => {
  const series = (xs, ys) =>
    xs.map((x, i) => ({
      snapshot_date: `2026-03-${String(i + 1).padStart(2, '0')}`,
      protein_g: x,
      weight_lb: ys[i],
    }));
  // Build a series with exactly the requested r on an orthonormal basis.
  const pAt = (r, n) => {
    const xs = [];
    const zs = [];
    for (let i = 0; i < n; i += 1) {
      const th = (2 * Math.PI * i) / n;
      xs.push(Math.cos(th));
      zs.push(Math.sin(th));
    }
    const ys = xs.map((x, i) => r * x + Math.sqrt(1 - r * r) * zs[i]);
    const hit = computeCorrelations(series(xs, ys)).find(
      (c) => c.x === 'protein_g' && c.y === 'weight_lb'
    );
    assert.ok(hit, `no pair computed at n=${n}`);
    return hit.pValue;
  };
  const tOf = (r, n) => (r * Math.sqrt(n - 2)) / Math.sqrt(1 - r * r);
  assert.equal(MIN_DAYS, 4, 'the oracle sits at the floor; update it if the floor moves');
  const oracles = [
    [MIN_DAYS, (t) => 1 - t / Math.sqrt(2 + t * t)],
    [
      6,
      (t) => {
        const x = t / Math.sqrt(4 + t * t);
        return 1 - x * (1.5 - 0.5 * x * x);
      },
    ],
  ];
  for (const [n, oracle] of oracles) {
    for (const r of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const want = oracle(tOf(r, n));
      const got = pAt(r, n);
      // pValue is reported to 4dp, so that is the achievable tolerance.
      assert.ok(
        Math.abs(got - want) < 1e-4,
        `n=${n}, r=${r}: implementation ${got}, closed form ${want.toFixed(6)}`
      );
    }
  }
});

// ⚠ THE LAGS BELOW REST ON A FACT ABOUT ANOTHER FILE, so that fact is what this
// asserts. A sleep column on day D is the night that ENDED on the morning of D,
// which is only true because `/api/client/checkin` writes sleepHours,
// sleepQuality AND energy into the SAME snapshot row keyed on one local day. If
// that route ever splits them across days, five pairs here silently start
// measuring a relationship the member never logged — and nothing else would
// catch it, because a wrong lag produces a perfectly well-formed correlation.
test('the check-in still writes sleep and energy onto one snapshot day', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(
    new URL('../src/app/api/client/checkin/route.ts', import.meta.url),
    'utf8'
  );
  // One local day resolved once...
  assert.match(
    src,
    /const\s+today\s*=\s*clientLocalDay\(/,
    'the check-in should resolve ONE local day for the whole write'
  );
  // ...and every field, sleep and energy alike, patched onto that one row.
  for (const field of ['sleep_hours', 'sleep_quality', 'energy']) {
    assert.match(
      src,
      new RegExp(`patch\\.${field}\\s*=`),
      `${field} should be written into the same patch as the rest of the check-in`
    );
  }
  assert.equal(
    (src.match(/clientLocalDay\(/g) || []).length,
    1,
    'a second day resolution in this route would mean sleep and energy can land on different rows'
  );
});

// The consequence of that fact, pinned per pair so a silent flip back to the
// intuitive-but-wrong "sleep -> next day" fails here with its reason attached.
test('sleep pairs use the lag their storage day implies', () => {
  const expected = new Map([
    // Sleep on row D fuelled day D — the night ended that morning.
    ['sleep_hours->strain', 0],
    ['sleep_hours->recovery_score', 0],
    ['sleep_hours->energy', 0],
    ['sleep_quality->energy', 0],
    ['sleep_performance_pct->workout_minutes', 0],
    // The night that FOLLOWS a day-D rating is stored on row D+1.
    ['stress->sleep_hours', 1],
  ]);
  const SLEEP_COLS = new Set([
    'sleep_hours',
    'sleep_quality',
    'sleep_performance_pct',
    'sleep_efficiency_pct',
  ]);
  const seen = new Set();
  for (const p of CORRELATION_PAIRS) {
    if (!SLEEP_COLS.has(p.x) && !SLEEP_COLS.has(p.y)) continue;
    const key = `${p.x}->${p.y}`;
    assert.ok(
      expected.has(key),
      `"${p.label}" pairs a sleep column but is not in the pinned lag map — ` +
        'decide the lag from which day the sleep is STORED on, then add it here'
    );
    assert.equal(
      p.lagDays,
      expected.get(key),
      `"${p.label}" (${key}) must use lag ${expected.get(key)}: a sleep column on ` +
        'day D is the night that ended on the morning of D'
    );
    seen.add(key);
  }
  // Guard the guard: an entry that stops matching any pair would silently
  // stop asserting anything.
  for (const key of expected.keys()) {
    assert.ok(seen.has(key), `pinned pair ${key} no longer exists in CORRELATION_PAIRS`);
  }
});

// ⚠ THE ROUTE'S OWN GATE, ASSERTED AT THE ROUTE. `computeCorrelations` is pure
// and every test above builds its own input, so none of them can see what the
// weekly-readout handler does with the result — the exact blind spot that let
// the model path ship filtering on `n` alone while the fallback filtered on q.
// The invariant is not "there is a threshold" but "the two paths share ONE", so
// that is what this checks: a member must never be shown a finding from the
// model that the deterministic fallback would have refused. Source-level
// because the handler pulls in Supabase and the AI client and cannot be driven
// under `node --test`.
test('the readout gates both paths on one shared predicate', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(
    new URL('../src/app/api/ai/weekly-readout/route.ts', import.meta.url),
    'utf8'
  );
  // Strip comments first — the rationale prose below quotes these very names,
  // and a guard that fires on its own explanation is no guard.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  // ⚠ ONE PREDICATE, NOT ONE THRESHOLD. Sharing only `Q_THRESHOLD` left the two
  // filters disagreeing on the other two terms — the fallback took any non-weak
  // pair at any `n`, the model catalog took any `n >= 7` pair at any strength —
  // so which findings a member saw depended on whether OpenAI was reachable.
  assert.match(src, /function isReportable\(/, 'the shared predicate should exist');
  assert.equal(
    (src.match(/\.filter\(isReportable\)/g) || []).length,
    2,
    'both the fallback and the model catalog must select through isReportable'
  );
  // Nobody may hand-roll the terms at a call site — that is exactly how the two
  // paths drifted the first time.
  const callSiteFilters = src.match(/\.filter\(\(c\)[^)]*\)/g) || [];
  for (const f of callSiteFilters) {
    assert.doesNotMatch(f, /qValue|strength|c\.n\s*>=/, `inline eligibility test: ${f}`);
  }
  assert.equal(
    (src.match(/const Q_THRESHOLD\s*=/g) || []).length,
    1,
    'two threshold declarations would let the paths drift apart again'
  );
  // ⚠ AND THE MEMBER-FACING EMPTY STATE MUST QUOTE THE GATE, NOT A GUESS. It
  // read "~14 days of overlap" while the gate was 7 — a number the code
  // contradicts, told to the member about their own data. Interpolated from the
  // constant so the two cannot drift; a hardcoded day count here fails.
  const emptyLine = src.match(/Not enough signal yet[^`']*/);
  assert.ok(emptyLine, 'the honest empty summary should still exist');
  assert.doesNotMatch(
    emptyLine[0],
    /\d+\s*day/,
    'the empty state must interpolate MIN_REPORTABLE_DAYS, not name a literal day count'
  );
  assert.match(
    emptyLine[0],
    /\$\{MIN_REPORTABLE_DAYS\}/,
    'the empty state should quote the gate it is describing'
  );
  assert.doesNotMatch(
    src,
    /qValue\s*<\s*[0-9.]/,
    'a literal q threshold is how the two paths drift'
  );

  // ⚠ AND NEITHER PATH MAY TURN A CORRELATION INTO A LEVER. The fallback's
  // recommendation used to read "Protect the {x} input — when it dips, {y} dips
  // with it", and the system prompt asked for the "most ACTIONABLE" findings
  // and to "recommend an action". Both assert a causal direction an
  // observational r cannot support — in a module that computes a
  // false-discovery rate precisely because it takes over-claiming seriously.
  // The two renderings must not disagree about what the evidence SUPPORTS any
  // more than about which evidence qualifies, so this pins both.
  assert.doesNotMatch(src, /Protect the \$\{/, 'the fallback must not prescribe a lever');
  assert.doesNotMatch(src, /gains there cost/, 'the fallback must not assert a cost');
  assert.doesNotMatch(src, /recommend an action/i, 'the prompt must not ask for a causal action');
  assert.doesNotMatch(src, /most actionable/i, 'the prompt must not frame findings as levers');
  assert.match(
    src,
    /never claim one metric causes the other/i,
    'the prompt should forbid causal claims outright'
  );
  assert.match(
    src,
    /Worth watching together/,
    'the fallback should report the association rather than prescribe'
  );
});

// ⚠ A `.d.ts` IS NOT CHECKED AGAINST ITS `.mjs`, so `MetricKey` — a hand-typed
// copy of SNAPSHOT_METRICS — can diverge in silence, and neither `tsc` nor the
// tests above can see it: the pair-vs-select test compares two things that both
// come from the module. A metric added to the runtime only is unnameable from
// TypeScript; a name left in the union only is a type that admits a column that
// is never fetched. Both directions are asserted here rather than in a
// type-test file, so the check runs in `npm test` alongside every other guard
// on this module and needs no new build artifact.
test('MetricKey and SNAPSHOT_METRICS have not drifted', async () => {
  const { readFileSync } = await import('node:fs');
  const dts = readFileSync(new URL('../src/lib/correlations.d.ts', import.meta.url), 'utf8');
  const block = dts.match(/export type MetricKey =([\s\S]*?);/);
  assert.ok(block, 'MetricKey union not found — did the declaration move?');
  const declared = [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(declared.length > 0, 'parsed an empty union — the guard would pass vacuously');

  const listed = [...SNAPSHOT_METRICS];
  const missingFromUnion = listed.filter((m) => !declared.includes(m));
  const extraInUnion = declared.filter((m) => !listed.includes(m));
  assert.deepEqual(
    missingFromUnion,
    [],
    'in SNAPSHOT_METRICS but not MetricKey — TypeScript consumers cannot name it'
  );
  assert.deepEqual(
    extraInUnion,
    [],
    'in MetricKey but not SNAPSHOT_METRICS — a type admitting a column never fetched'
  );
});

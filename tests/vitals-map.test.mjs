// vitalsFromProgress (spec §3A): the vitals leg is built from the SAME cached
// progress response the sleep leg reads. The load-bearing property is the
// absence doctrine — a null/junk value is a DROPPED observation, never a
// fabricated 0 (Number(null) is finite 0: the documented fabrication class) —
// and a hydration target is never defaulted, so the rule structurally cannot
// fire against a target the member never set.
//
// The window is the last 7 CALENDAR DAYS. /api/client/progress returns up to
// 400 chronological snapshots with no recency filter, so these vectors pin
// BOTH halves: recent readings feed the average, and readings older than the
// cutoff are dropped even when they are the only readings the member has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vitalsFromProgress, recordFromSelfData, recordFromCoachData } from '../mobile-app/src/services/signalsMap.mjs';

// A fixed clock so the vectors read the same on every day of the year.
const NOW = new Date(2026, 7, 17); // 2026-08-17, local parts (the fn reads local parts)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - n));

const series = (over) => ({ series: over });
// The LAST value is today; each earlier value is one day older.
const pts = (...vals) => vals.map((value, i) => ({ date: daysAgo(vals.length - 1 - i), value }));
// Every value stamped the SAME number of days ago (for the stale-window vectors).
const ptsAt = (ago, ...vals) => vals.map((value) => ({ date: daysAgo(ago), value }));
const vitals = (s, opts) => vitalsFromProgress(s, Object.assign({ now: NOW }, opts));

test('a normal week builds every leg with avg-of-last-7 + n', () => {
  const v = vitals(series({
    energy: pts(3, 4, 5, 4, 3, 4, 5),
    hunger: pts(8, 9, 8, 7, 8, 9, 8),
    hydration: pts(1.5, 2, 1, 1.5, 2, 1, 1.5),
    sleepQuality: pts(6, 7, 6, 7, 6, 7, 6),
  }), { hydrationTargetL: 3 });
  assert.ok(v);
  assert.equal(v.energy.n, 7);
  assert.ok(Math.abs(v.energy.avg7 - 4) < 1e-9);
  assert.equal(v.hunger.n, 7);
  assert.equal(v.hydration.n, 7);
  assert.equal(v.hydration.targetL, 3);
  assert.ok(Math.abs(v.hydration.avg7L - 1.5) < 1e-9);
  assert.equal(v.rested.n, 7);
});

test('only the LAST 7 real values feed the average (older days age out)', () => {
  // 9 points: the first two (10, 10) are 8 and 7 days old — outside the window.
  const v = vitals(series({ energy: pts(10, 10, 4, 4, 4, 4, 4, 4, 4) }));
  assert.equal(v.energy.n, 7);
  assert.ok(Math.abs(v.energy.avg7 - 4) < 1e-9);
});

test('a sparse leg (2 logged days) still reports honestly with its small n', () => {
  const v = vitals(series({ energy: pts(3, 4) }));
  assert.equal(v.energy.n, 2);
  assert.ok(Math.abs(v.energy.avg7 - 3.5) < 1e-9);
  assert.equal(v.hunger, undefined);
});

test('null-riddled series: nulls are ABSENCE — dropped from numerator AND denominator, never 0', () => {
  // Number(null) === 0; if nulls leaked in, avg would be (4+4+0+0)/4 = 2 and
  // the ≤4 energy rule would fire on data that does not exist.
  const v = vitals(series({ energy: pts(4, null, 4, null, '', undefined) }));
  assert.equal(v.energy.n, 2);
  assert.ok(Math.abs(v.energy.avg7 - 4) < 1e-9);
});

test('an all-null leg is ABSENT, not a zero-average leg', () => {
  const v = vitals(series({ energy: pts(null, null, null), hunger: pts(8, 8, 8) }));
  assert.equal(v.energy, undefined);
  assert.equal(v.hunger.n, 3);
});

test('no real data anywhere → null (never an empty object that reads as a leg)', () => {
  assert.equal(vitals(series({ energy: pts(null), hydration: [] })), null);
  assert.equal(vitals(series({})), null);
  assert.equal(vitals(null), null);
  assert.equal(vitals({}), null);
});

test('hydration target is NEVER defaulted: absent/junk target → targetL null → rule cannot fire', () => {
  const noTarget = vitals(series({ hydration: pts(1, 1, 1, 1) }));
  assert.equal(noTarget.hydration.targetL, null);
  const junkTarget = vitals(series({ hydration: pts(1, 1, 1, 1) }), { hydrationTargetL: 0 });
  assert.equal(junkTarget.hydration.targetL, null);
  const realTarget = vitals(series({ hydration: pts(1, 1, 1, 1) }), { hydrationTargetL: 3 });
  assert.equal(realTarget.hydration.targetL, 3);
});

test('a zero reading is dropped (indistinguishable from a row another metric created)', () => {
  const v = vitals(series({ hydration: pts(0, 2, 0, 2) }), { hydrationTargetL: 3 });
  assert.equal(v.hydration.n, 2);
  assert.ok(Math.abs(v.hydration.avg7L - 2) < 1e-9);
});

// ── the 7-CALENDAR-DAY window (stale observations can never fire a rule) ─────
test('a member who only logged MONTHS ago has NO vitals leg at all', () => {
  // Three low-energy readings from ~3 months back. Without the date window these
  // satisfy n >= 3 and fire an "energy is low this week" directive forever.
  const v = vitals(series({
    energy: ptsAt(90, 2, 2, 2),
    hunger: ptsAt(90, 9, 9, 9),
    hydration: ptsAt(90, 0.5, 0.5, 0.5),
    sleepQuality: ptsAt(90, 3, 3, 3),
  }), { hydrationTargetL: 3 });
  assert.equal(v, null);
});

test('the cutoff is inclusive at 6 days and excludes the 7th', () => {
  const inWindow = vitals(series({ energy: ptsAt(6, 2) }));
  assert.equal(inWindow.energy.n, 1);
  const outOfWindow = vitals(series({ energy: ptsAt(7, 2) }));
  assert.equal(outOfWindow, null);
});

test('stale readings never contaminate a fresh average', () => {
  // Two stale 10s + three fresh 4s: only the fresh ones count.
  const v = vitals(series({ energy: [...ptsAt(30, 10, 10), ...pts(4, 4, 4)] }));
  assert.equal(v.energy.n, 3);
  assert.ok(Math.abs(v.energy.avg7 - 4) < 1e-9);
});

test('a point with no usable date is DROPPED — recency it cannot prove is absence', () => {
  const v = vitals(series({ energy: [{ value: 2 }, { date: null, value: 2 }, { date: 12345, value: 2 }] }));
  assert.equal(v, null);
});

test('a duplicated date cannot widen the "7-day" average past 7 readings', () => {
  const v = vitals(series({ energy: ptsAt(1, 4, 4, 4, 4, 4, 4, 4, 10) }));
  assert.equal(v.energy.n, 7);
});

// ── the WIRING that feeds the target (the absence gate's second half) ───────
// vitalsFromProgress refuses to default a hydration target, but that is only
// worth anything if its caller hands it a target the member actually SET.
// /api/client/hydration returns two fields — `targetL` (display-defaulted to
// 3.0 L for the hydration card) and `targetStoredL` (null until the member
// picks one). Passing the display default would fire the rule against a target
// nobody chose, which is exactly what the gate above exists to prevent. These
// are source guards because the seam is an API response feeding a browser
// global — there is no unit seam between them.
test('the client passes the STORED target into the engine, never the display default', () => {
  const src = readFileSync(new URL('../mobile-app/src/services/shapeSignals.js', import.meta.url), 'utf8');
  const call = src.match(/vitalsFromProgress\([^;]*?\)/s);
  assert.ok(call, 'vitalsFromProgress call not found in shapeSignals.js');
  assert.match(call[0], /hydrationTargetL:\s*hydro && hydro\.targetStoredL/);
  assert.doesNotMatch(call[0], /hydro\.targetL/);
});

test('the hydration route exposes targetStoredL alongside the defaulted targetL', () => {
  const src = readFileSync(new URL('../src/app/api/client/hydration/route.ts', import.meta.url), 'utf8')
    .replace(/\/\/[^\n]*/g, '');
  // The stored reader returns null for an unset target rather than substituting.
  assert.match(src, /readStoredTargetL[\s\S]*?Promise<number \| null>/);
  // Both responses carry the pair; the default is applied only to the display field.
  const bodies = src.match(/NextResponse\.json\(\{ ok: true[^}]*\}/g) || [];
  assert.equal(bodies.length, 2, 'expected the GET and POST success bodies');
  for (const body of bodies) {
    assert.match(body, /targetStoredL/);
    assert.match(body, /targetL/);
  }
  assert.match(src, /const targetL = targetStoredL \?\? DEFAULT_TARGET_L/);
});

// ── the record builders carry the leg (second-receiver class) ───────────────
test('recordFromSelfData attaches vitals when present and omits it when absent', () => {
  const withV = recordFromSelfData({ uid: 'u1', name: 'Q', vitals: { energy: { avg7: 3, n: 5 } } }, {});
  assert.deepEqual(withV.vitals, { energy: { avg7: 3, n: 5 } });
  const without = recordFromSelfData({ uid: 'u1', name: 'Q' }, {});
  assert.equal(without.vitals, undefined);
});

test('recordFromCoachData attaches vitals when present and omits it when absent', () => {
  const withV = recordFromCoachData({ id: 'c1', name: 'Q', vitals: { hunger: { avg7: 9, n: 4 } } }, {});
  assert.deepEqual(withV.vitals, { hunger: { avg7: 9, n: 4 } });
  const without = recordFromCoachData({ id: 'c1', name: 'Q' }, {});
  assert.equal(without.vitals, undefined);
});

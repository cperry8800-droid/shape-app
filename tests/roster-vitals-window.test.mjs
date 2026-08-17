// The COACH half of the vitals window (spec §3A). /api/coach/roster-sleep reads
// 14 days because the SLEEP leg needs it, and its vitals buckets used to average
// the last 7 LOGGED values — so three energy/hunger readings from 8-14 days ago
// still satisfied `n >= 3` and could raise a coach flag the member's own engine
// (vitalsFromProgress, on a 7-CALENDAR-DAY cutoff) treats as stale.
//
// These vectors drive the route's REAL bucket builder, and then push its output
// through the REAL engine rules, so they assert the end state that matters: a
// stale-only client raises no coach flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildRosterVitals, vitalsCutoffISO, VITALS_WINDOW_DAYS } from '../src/lib/roster-vitals.mjs';
const require = createRequire(import.meta.url);
const { evaluateClient } = require('../public/newdesign/dashSignals.js');

// A fixed clock. The route builds its cutoff in UTC, so the vectors do too.
const NOW = new Date('2026-08-17T12:00:00Z');
const daysAgo = (n) => new Date(Date.UTC(2026, 7, 17 - n)).toISOString().slice(0, 10);
const row = (ago, over) => Object.assign({ user_id: 'u1', snapshot_date: daysAgo(ago) }, over);
const build = (rows) => buildRosterVitals(rows, { now: NOW });
const rec = (vitals) => ({ profile: { name: 'Q' }, vitals });
const has = (ev, key) => ev.flags.some((x) => x.key === key);

test('the cutoff is a 7-calendar-day window, inclusive at today - 6', () => {
  assert.equal(VITALS_WINDOW_DAYS, 7);
  assert.equal(vitalsCutoffISO(NOW), '2026-08-11');
});

// ── the defect this closes ──────────────────────────────────────────────────
test('readings 8-14 days old produce NO vitals at all (they cannot raise a flag)', () => {
  const rows = [8, 10, 13].map((ago) => row(ago, { energy: 2, hunger: 9 }));
  const out = build(rows);
  assert.equal(out.size, 0, 'no user should have a vitals leg from stale rows alone');
  // And the end state: pushed through the real rules, nothing fires.
  const ev = evaluateClient(rec(out.get('u1')), NOW, 'trainer');
  assert.equal(has(ev, 'energy_low'), false);
  assert.equal(evaluateClient(rec(out.get('u1')), NOW, 'nutritionist').flags.some((x) => x.key === 'hunger_high'), false);
});

test('readings INSIDE the window still flag exactly as before', () => {
  const rows = [0, 2, 5].map((ago) => row(ago, { energy: 2, hunger: 9 }));
  const v = build(rows).get('u1');
  assert.deepEqual(v.energy, { avg7: 2, n: 3 });
  assert.deepEqual(v.hunger, { avg7: 9, n: 3 });
  assert.ok(has(evaluateClient(rec(v), NOW, 'trainer'), 'energy_low'));
  assert.ok(has(evaluateClient(rec(v), NOW, 'nutritionist'), 'hunger_high'));
});

test('stale readings never contaminate a fresh average, and never pad n', () => {
  // Three stale 10s + three fresh 2s. Pre-fix this averaged 6 over n=6; now the
  // stale rows are gone entirely.
  const rows = [
    ...[9, 11, 13].map((ago) => row(ago, { energy: 10 })),
    ...[0, 1, 2].map((ago) => row(ago, { energy: 2 })),
  ];
  assert.deepEqual(build(rows).get('u1').energy, { avg7: 2, n: 3 });
});

test('the 7th-day boundary: day 6 is in, day 7 is out', () => {
  assert.deepEqual(build([row(6, { energy: 2 })]).get('u1').energy, { avg7: 2, n: 1 });
  assert.equal(build([row(7, { energy: 2 })]).size, 0);
});

// ── absence doctrine (carried from the client mapper) ───────────────────────
test('null / junk values are ABSENCE — dropped from numerator AND denominator', () => {
  // Number(null) === 0; leaking it would average (4+4+0+0)/4 = 2 and fire.
  const rows = [
    row(0, { energy: 4 }), row(1, { energy: null }),
    row(2, { energy: 4 }), row(3, { energy: '' }),
  ];
  assert.deepEqual(build(rows).get('u1').energy, { avg7: 4, n: 2 });
});

test('a zero reading is dropped (indistinguishable from a row another metric created)', () => {
  const rows = [row(0, { hydration_l: 0 }), row(1, { hydration_l: 2 }), row(2, { hydration_l: 0 })];
  assert.deepEqual(build(rows).get('u1').hydration, { avg7L: 2, targetL: null, n: 1 });
});

test('a row with no usable snapshot_date is DROPPED — recency it cannot prove is absence', () => {
  const rows = [{ user_id: 'u1', energy: 2 }, { user_id: 'u1', snapshot_date: 20260817, energy: 2 }];
  assert.equal(build(rows).size, 0);
});

test('a user with no in-window reading is ABSENT from the map (never an empty vitals object)', () => {
  const out = build([row(0, { sleep_hours: 8 })]); // sleep only — no vitals columns
  assert.equal(out.size, 0);
});

test('duplicated dates cannot widen an average that calls itself a 7-day average', () => {
  const rows = Array.from({ length: 9 }, () => row(1, { energy: 4 }));
  assert.equal(build(rows).get('u1').energy.n, 7);
});

test('targetL is ALWAYS null on the coach side — hydration_low can never fire there', () => {
  const rows = [0, 1, 2, 3].map((ago) => row(ago, { hydration_l: 0.4 }));
  const v = build(rows).get('u1');
  assert.equal(v.hydration.targetL, null);
  assert.equal(has(evaluateClient(rec(v), NOW, 'client'), 'hydration_low'), false);
});

test('per-user isolation: one client\'s stale rows never feed another\'s average', () => {
  const out = build([
    { user_id: 'stale', snapshot_date: daysAgo(10), energy: 2 },
    { user_id: 'fresh', snapshot_date: daysAgo(1), energy: 3 },
    { user_id: 'fresh', snapshot_date: daysAgo(2), energy: 3 },
  ]);
  assert.equal(out.has('stale'), false);
  assert.deepEqual(out.get('fresh').energy, { avg7: 3, n: 2 });
});

test('malformed input is inert (never throws, never fabricates)', () => {
  assert.equal(build(null).size, 0);
  assert.equal(build([null, undefined, 42]).size, 0);
});

// The directive engine ("one lead per page"): buildDirective derives the ONE
// verdict + cross-domain reason + single action from a unified record, honestly
// (real signal or "—"), with the coach override winning. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildDirective, getTriageFeed } = require('../public/newdesign/dashSignals.js');

const NOW = new Date('2026-06-16T12:00:00');
const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(NOW.getTime() - n * 86400000));

test('coach override WINS — a coach-flagged sleep lever yields "Log last night\'s sleep" + the reason', () => {
  const rec = {
    profile: { name: 'Quinn Harper' },
    nutrition: { avgCalories: 1850, targetCalories: 2000 },
    coachDirective: {
      lever: 'sleep',
      reason: "Deficit's fine — sleep is stalling recovery; tonight: lights out by 11.",
    },
  };
  const d = buildDirective(rec, NOW, 'client');
  assert.equal(d.source, 'coach');
  assert.equal(d.lever, 'sleep');
  assert.equal(d.action.label, "Log last night's sleep");
  assert.equal(d.action.kind, 'log_sleep');
  assert.equal(d.reason, "Deficit's fine — sleep is stalling recovery; tonight: lights out by 11.");
  assert.equal(d.verdict, 'Sleep is the lever');
  assert.equal(d.read.oneThingNow, d.reason);
});

test('cross-domain: sleep is the lever from DATA when recovery is low and nutrition is holding', () => {
  const rec = {
    profile: { name: 'Sam' },
    nutrition: { avgCalories: 1800, targetCalories: 2000 },        // deficit holding
    recovery: { sleepHours: { avg7: 6.2, lastNight: null, target: 7.5 } }, // short + not logged
  };
  const d = buildDirective(rec, NOW, 'client');
  assert.equal(d.source, 'engine');
  assert.equal(d.lever, 'sleep');
  assert.equal(d.action.label, "Log last night's sleep");
  assert.match(d.reason, /Deficit's fine/);
  assert.match(d.reason, /sleep is stalling recovery/);
  assert.deepEqual(d.cited, ['recovery.sleepHours', 'nutrition']);
});

test('a real triage flag (food gap) leads the directive over the sleep lever', () => {
  const rec = {
    profile: { name: 'Deandre' },
    foodLogs: { lastLoggedOn: daysAgo(5), daysLogged7d: 1 },
    nutrition: { avgCalories: 1800, targetCalories: 2000 },
    recovery: { sleepHours: { avg7: 6.0, lastNight: null, target: 7.5 } },
  };
  const d = buildDirective(rec, NOW, 'client');
  assert.equal(d.lever, 'nutrition');
  assert.equal(d.action.label, 'Log a meal today');
  assert.match(d.reason, /No food logs in 5 days/);
});

test('HONEST DATA — an empty record returns "—", never a fabricated directive', () => {
  const d = buildDirective({ profile: { name: 'New' } }, NOW, 'client');
  assert.equal(d.verdict, '—');
  assert.equal(d.reason, '—');
  assert.equal(d.action, null);
  assert.equal(d.read.summary30d, '—');
  assert.equal(d.read.oneThingNow, 'Not enough signal yet.');
});

test('on-track record cites what is actually going well (grounded), not a fake nudge', () => {
  const rec = {
    profile: { name: 'Jordan' },
    streaks: { current: 6, best: 9 },
    nutrition: { avgCalories: 1900, targetCalories: 2000 },
    trainingAdherence: { pct: 92, done: 11, planned: 12 },
  };
  const d = buildDirective(rec, NOW, 'client');
  assert.equal(d.severity, 'green');
  assert.match(d.reason, /6-day streak/);
  assert.match(d.reason, /deficit holding/);
  assert.match(d.read.summary30d, /11\/12 sessions/);
});

test('the read carries a 30-day summary from real stats', () => {
  const rec = {
    profile: { name: 'Marcus' },
    trainingAdherence: { done: 8, planned: 14 },
    nutrition: { avgCalories: 2400, targetCalories: 2000 },
    weighIns: [{ on: daysAgo(56), weight: 184, unit: 'lb' }, { on: daysAgo(1), weight: 181, unit: 'lb' }],
    coachDirective: { lever: 'nutrition', reason: 'Ledger ran +20% — tighten dinners.' },
  };
  const d = buildDirective(rec, NOW, 'nutritionist');
  assert.match(d.read.summary30d, /8\/14 sessions/);
  assert.match(d.read.summary30d, /avg 2400 kcal/);
  assert.match(d.read.summary30d, /-3 lb/);
});

test('getTriageFeed rows each carry a directive (one reason source for every coach surface)', () => {
  const records = [
    { profile: { name: 'A' }, foodLogs: { lastLoggedOn: daysAgo(6), daysLogged7d: 0 } },
    { profile: { name: 'B' }, streaks: { current: 0, best: 8 } },
  ];
  const rows = getTriageFeed('trainer', records, NOW);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok(row.directive, 'row has a directive');
    assert.ok(typeof row.directive.reason === 'string');
    assert.ok(row.directive.read && typeof row.directive.read.oneThingNow === 'string');
    assert.ok(row.directive.action && row.directive.action.label);
  }
});

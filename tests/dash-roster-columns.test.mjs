// The roster's REVENUE and TENURE columns, and the coach's live momentum
// (review 2026-09-09, R10 + R9). Both are brace-matched out of the SHIPPED
// source and evaluated, so an equivalent rewrite passes and a real regression
// fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROSTER = readFileSync(new URL('../public/newdesign/dashRoster.jsx', import.meta.url), 'utf8');
const DATA = readFileSync(new URL('../public/newdesign/dashData.jsx', import.meta.url), 'utf8');

function fn(src, name) {
  const at = src.indexOf('function ' + name + '(');
  assert.notEqual(at, -1, name + ' not found');
  let depth = 0;
  for (let j = src.indexOf('{', src.indexOf(')', at)); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced braces around ' + name);
}
const load = (src, names, deps = '') =>
  new Function(deps + names.map((n) => fn(src, n)).join('\n') + '\nreturn {' + names.join(',') + '};')();

const { dashRevenueLabel, dashTenureLabel } = load(ROSTER, ['dashDaysSince', 'dashRevenueLabel', 'dashTenureLabel']);
const { coachLiveMomentum } = load(DATA, ['coachLiveMomentum']);
const ago = (d) => new Date(Date.now() - d * 86400000).toISOString();

test('revenue: a client on no paid plan is $0, not "not shared"', () => {
  // 0 is a real answer about a real client; only a missing leg is unknown.
  assert.deepEqual(dashRevenueLabel({ payments: { mrrCents: 0 } }), { text: "$0/mo", dim: true });
  assert.equal(dashRevenueLabel({ payments: { mrrCents: 18000 } }).text, "$180/mo");
  assert.equal(dashRevenueLabel({ payments: { mrrCents: 249900 } }).text, "$2.5k/mo", 'four figures read in thousands');
  assert.equal(dashRevenueLabel({ payments: null }).dim, true);
  assert.equal(dashRevenueLabel({}).text, "Not shared");
});

test('tenure: days, then months, then years — and an unparseable date is not "NaNd"', () => {
  assert.equal(dashTenureLabel({ payments: { joinedAt: ago(12) } }).text, "12d");
  assert.equal(dashTenureLabel({ payments: { joinedAt: ago(30) } }).text, "30d");
  assert.equal(dashTenureLabel({ payments: { joinedAt: ago(96) } }).text, "3mo");
  assert.equal(dashTenureLabel({ payments: { joinedAt: ago(400) } }).text, "1.1y");
  assert.equal(dashTenureLabel({ payments: { joinedAt: null } }).text, "Not shared");
  assert.equal(dashTenureLabel({ payments: {} }).text, "Not shared");
  // ⚠ dashDaysSince runs a bad date through Math.max(0, NaN) and returns NaN,
  // which passes a `== null` check and renders "NaNd".
  assert.equal(dashTenureLabel({ payments: { joinedAt: 'not-a-date' } }).text, "Not shared");
});

test('live momentum is computed only from figures that exist', () => {
  const summary = { activeNow: 21, active30dAgo: 18, addsThisMonth: 5, endedThisMonth: 2, churnRate30dPct: 11, medianTenureDays: 96, totalEverSubscribed: 34 };
  const rows = coachLiveMomentum({ kind: 'live', trajectory: { summary } });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], ['+3', 'Net new clients', '5 joined · 2 left']);
  assert.deepEqual(rows[1], ['21', 'Active clients', '+3 vs 30d ago']);
  assert.equal(rows[2][0], '11%');
  assert.equal(rows[3][0], '3mo');
  // A negative month reads as negative, not as an unsigned number.
  assert.equal(coachLiveMomentum({ kind: 'live', trajectory: { summary: { ...summary, addsThisMonth: 1, endedThisMonth: 4 } } })[0][0], '-3');
});

test('momentum is null — never a row of zeroes — when there is nothing measured', () => {
  // Four zeroes read as a flat quarter; an empty card reads as no data, which
  // is the truth for a coach whose trajectory could not be built.
  assert.equal(coachLiveMomentum(null), null);
  assert.equal(coachLiveMomentum({ kind: 'demo' }), null);
  assert.equal(coachLiveMomentum({ kind: 'unknown' }), null);
  // ⚠ The KIND is what decides, not merely the presence of a trajectory. This
  // helper is on `window`, so "it happens to carry a summary" must not be
  // enough to publish measured-looking rows for a viewer we could not identify.
  const summary = { activeNow: 9, active30dAgo: 9, addsThisMonth: 1, endedThisMonth: 0, churnRate30dPct: 0, medianTenureDays: 40, totalEverSubscribed: 12 };
  assert.equal(coachLiveMomentum({ kind: 'demo', trajectory: { summary } }), null);
  assert.equal(coachLiveMomentum({ kind: 'unknown', trajectory: { summary } }), null);
  assert.equal(coachLiveMomentum({ trajectory: { summary } }), null, 'no kind at all is not live');
  assert.equal(coachLiveMomentum({ kind: 'live', trajectory: null }), null, 'a failed subscriptions read is not a flat quarter');
  assert.equal(coachLiveMomentum({ kind: 'live', trajectory: { summary: {} } }), null);
  // A partially-answerable summary yields only the rows it can support.
  const partial = coachLiveMomentum({ kind: 'live', trajectory: { summary: { activeNow: 4, active30dAgo: 4 } } });
  assert.equal(partial.length, 1);
  assert.deepEqual(partial[0], ['4', 'Active clients', '+0 vs 30d ago']);
});

test('both roster views carry the two columns, and their track counts line up', () => {
  // A cols string with fewer tracks than cells silently overlays the overflow
  // onto the last track — the collision class the review already caught once.
  const at = ROSTER.indexOf('const DASH_ROSTER_VIEWS');
  const block = ROSTER.slice(at, ROSTER.indexOf('\n};', at));
  for (const role of ['nutritionist', 'trainer']) {
    const seg = block.slice(block.indexOf(role + ': {'));
    const cols = /cols: "([^"]+)"/.exec(seg)[1];
    const heads = /heads: \[([^\]]+)\]/.exec(seg)[1].split(',').length;
    const tracks = cols.replace(/minmax\([^)]*\)/g, 'X').trim().split(/\s+/).length;
    assert.equal(tracks, heads + 1, role + ': ' + tracks + ' grid tracks for ' + heads + ' heads + the name column');
    assert.match(seg, /REVENUE/, role + ' needs a REVENUE column');
    assert.match(seg, /TENURE/, role + ' needs a TENURE column');
    // The scroller's floor must cover the widened row.
    const minWidth = Number(/minWidth: (\d+)/.exec(seg)[1]);
    const fixed = cols.replace(/minmax\([^)]*\)/g, '180px').match(/(\d+)px/g).reduce((s, p) => s + parseInt(p, 10), 0);
    assert.ok(minWidth >= fixed, role + ': minWidth ' + minWidth + ' must cover ' + fixed + 'px of fixed tracks');
  }
});

// ── R9: a goal bound to a live metric ───────────────────────────────────────
const GOAL = readFileSync(new URL('../public/newdesign/trainerGoalPage.jsx', import.meta.url), 'utf8');
const NUTRI_GOAL = readFileSync(new URL('../public/newdesign/nutritionistGoalPage.jsx', import.meta.url), 'utf8');
const { goalLiveValue } = load(GOAL, ['goalLiveValue'], GOAL.slice(GOAL.indexOf('const GOAL_METRICS'), GOAL.indexOf('];', GOAL.indexOf('const GOAL_METRICS')) + 2) + '\n');

test('a bound goal reads the practice; an UNREADABLE one is null, never the stale typed value', () => {
  const live = { kind: 'live', activeClients: 21, mrrNetCents: 2601000, avgAdherencePct: 88 };
  assert.equal(goalLiveValue('activeClients', live), 21);
  assert.equal(goalLiveValue('mrrNetMonthly', live), 26010, 'cents → dollars');
  assert.equal(goalLiveValue('avgAdherencePct', live), 88);
  // undefined = "this goal is not bound, use the number the coach typed".
  assert.equal(goalLiveValue('', live), undefined);
  assert.equal(goalLiveValue(undefined, live), undefined);
  // ⚠ null = "bound, but we could not read it" → the card shows "—". Returning
  // the stored `cur` here is exactly how a figure from March gets presented as
  // today's, which is the drift this binding exists to end.
  assert.equal(goalLiveValue('activeClients', { kind: 'demo' }), null);
  assert.equal(goalLiveValue('activeClients', { kind: 'unknown' }), null);
  assert.equal(goalLiveValue('activeClients', { kind: 'loading' }), null);
  assert.equal(goalLiveValue('mrrNetMonthly', { kind: 'live', mrrNetCents: null }), null);
  assert.equal(goalLiveValue('nonsense', live), null, 'an unknown metric is unreadable, not the typed value');
});

test('both Goal pages format a negative as -$n, not $-n', () => {
  // Binding the pace to real subscriptions is what starts producing negatives.
  for (const [name, src] of [['trainer', GOAL], ['nutritionist', NUTRI_GOAL]]) {
    const { fmt } = new Function(/const fmt = [^;]+;/.exec(src)[0] + '\nreturn { fmt };')();
    assert.equal(fmt(-6007), '-$6,007', name);
    assert.equal(fmt(6007), '$6,007', name);
    assert.equal(fmt(0), '$0', name);
  }
});

test('both Goal pages share the same live bindings', () => {
  // They are near-identical files; a metric added to one and not the other is
  // how the two roles quietly stop agreeing about what a goal can read.
  const list = (src) => /const GOAL_METRICS = \[([\s\S]*?)\];/.exec(src)[1].replace(/\s+/g, '');
  assert.equal(list(GOAL), list(NUTRI_GOAL));
  for (const src of [GOAL, NUTRI_GOAL]) {
    assert.match(src, /useCoachLiveFigures\("(trainer|nutritionist)"\)/);
    assert.match(src, /coachLiveMomentum\(live\)/);
    assert.match(src, /paceIsLive/);
  }
});

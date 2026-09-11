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
  // ⚠ NOT dim — dim is rendered in the same italic 40% ink as "Not shared",
  // so dimming a real $0 made it indistinguishable from an unknown.
  assert.deepEqual(dashRevenueLabel({ payments: { mrrCents: 0 } }), { text: "$0/mo" });
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
  assert.deepEqual(rows[0], ['+3', 'Net new · this month', '5 joined · 2 left']);
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
  // A partially-answerable summary yields only the rows it can support — but
  // only once the coach has actually had a subscriber to measure.
  const partial = coachLiveMomentum({ kind: 'live', trajectory: { summary: { activeNow: 4, active30dAgo: 4, totalEverSubscribed: 6 } } });
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
    // ⚠ THE ARRAY IS PARSED, NOT SPLIT ON COMMAS. `heads` became a list of
    // [label, sortKey] PAIRS when the roster learned to sort, and both the
    // `[^\]]+` capture and the comma split then counted the pairs' own brackets
    // and commas — so a correct change failed a test about grid tracks. The
    // invariant here is tracks === heads + 1; how the heads are spelled is not
    // the invariant.
    const hAt = seg.indexOf('heads: [');
    let depth = 0, end = hAt + 'heads: '.length;
    for (; end < seg.length; end += 1) {
      const c = seg[end];
      if (c === '[') depth += 1;
      else if (c === ']') { depth -= 1; if (!depth) { end += 1; break; } }
    }
    const headList = new Function('return ' + seg.slice(hAt + 'heads: '.length, end))();
    const heads = headList.length;
    assert.ok(heads >= 6, role + ': parsed only ' + heads + ' heads');
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
const { goalLiveValue, goalMetricsFor } = load(DATA, ['goalMetricsFor', 'goalLiveValue']);

test('a bound goal reads the practice; unreadable is null, loading is neither', () => {
  const live = { kind: 'live', activeClients: 21, mrrNetCents: 2601000, adherencePct: 88 };
  assert.equal(goalLiveValue('activeClients', live), 21);
  assert.equal(goalLiveValue('mrrNetMonthly', live), 26010, 'cents → dollars');
  assert.equal(goalLiveValue('adherencePct', live), 88);
  // undefined = not bound; use the number the coach typed.
  assert.equal(goalLiveValue('', live), undefined);
  assert.equal(goalLiveValue(undefined, live), undefined);
  // ⚠ null = bound but unreadable → the card shows "—". Returning the stored
  // `cur` here is how a figure from March gets presented as today's.
  assert.equal(goalLiveValue('activeClients', { kind: 'demo' }), null);
  assert.equal(goalLiveValue('activeClients', { kind: 'unknown' }), null);
  assert.equal(goalLiveValue('mrrNetMonthly', { kind: 'live', mrrNetCents: null }), null);
  assert.equal(goalLiveValue('nonsense', live), null);
  // ⚠ "loading" IS NOT a failure. Treating it as one painted "Couldn't read
  // active clients" on every page load until /analytics returned.
  assert.equal(goalLiveValue('activeClients', { kind: 'loading' }), 'loading');
});

test('the two roles are offered bindings their OWN payload can answer', () => {
  // The trainer route returns avgAdherencePct; the nutritionist route returns
  // proteinAdherencePct and has no avgAdherencePct at all — one shared list
  // offered the nutritionist a binding that could never resolve.
  const t = goalMetricsFor('trainer'), n = goalMetricsFor('nutritionist');
  assert.deepEqual(t.map(([v]) => v), n.map(([v]) => v), 'the same metric KEYS');
  assert.notEqual(t[3][1], n[3][1], 'but named for what each role actually measures');
  assert.match(t[3][1], /session/i);
  assert.match(n[3][1], /protein/i);
});

test('the Goal pages consume the shared helpers rather than each keeping a copy', () => {
  for (const src of [GOAL, NUTRI_GOAL]) {
    assert.doesNotMatch(src, /const GOAL_METRICS = \[/, 'the metric list belongs in dashData.jsx');
    assert.doesNotMatch(src, /function goalLiveValue/, 'goalLiveValue belongs in dashData.jsx');
    assert.match(src, /goalMetricsFor\(/);
    assert.match(src, /useCoachLiveFigures\("(trainer|nutritionist)"\)/);
    assert.match(src, /coachLiveMomentum\(live\)/);
  }
});

test('no coloured delta is drawn against a subscriptions-only pace', () => {
  // The target includes session and one-time income; the live figure is
  // subscription revenue only. Subtracting them showed a surplus that isn't one.
  for (const [name, src] of [['trainer', GOAL], ['nutritionist', NUTRI_GOAL]]) {
    assert.match(src, /paceIsLive \? null : paceDelta/, name + ' must suppress the delta when the pace is live');
  }
});

test('both Goal pages format a negative as -$n, not $-n', () => {
  for (const [name, src] of [['trainer', GOAL], ['nutritionist', NUTRI_GOAL]]) {
    const { fmt } = new Function(/const fmt = [^;]+;/.exec(src)[0] + '\nreturn { fmt };')();
    assert.equal(fmt(-6007), '-$6,007', name);
    assert.equal(fmt(6007), '$6,007', name);
    assert.equal(fmt(0), '$0', name);
  }
});

test('a coach who has never had a client gets no momentum card at all', () => {
  // buildTrajectory always returns a summary; for no subscriptions every field
  // is a legitimate 0, all pass a != null check, and the card would render
  // "+0 net new · 0 active" under a MEASURED eyebrow.
  const empty = { activeNow: 0, active30dAgo: 0, addsThisMonth: 0, endedThisMonth: 0, churnRate30dPct: null, medianTenureDays: null, totalEverSubscribed: 0 };
  assert.equal(coachLiveMomentum({ kind: 'live', trajectory: { summary: empty } }), null);
  // One ever-subscribed client is enough to have something to say.
  const one = { ...empty, totalEverSubscribed: 1, activeNow: 1, active30dAgo: 1 };
  assert.equal(coachLiveMomentum({ kind: 'live', trajectory: { summary: one } }).length, 2);
});

test('the momentum rows name their own window, since the card cannot', () => {
  // Net-new is calendar month-to-date, churn is 30d and median tenure is taken
  // over every membership ever; a single "MEASURED · 30D" eyebrow over all of
  // them was wrong about three of four rows.
  //
  // ⚠ PINS THE INVARIANT, NOT THE WORDING. This first read `match(/lifetime/i)`
  // and failed the moment that row was RE-LABELLED CORRECTLY — the denominator
  // moved from people to memberships and the label followed. What the card
  // actually promises is that no row leaves its period to the eyebrow to state.
  const summary = { activeNow: 21, active30dAgo: 18, addsThisMonth: 5, endedThisMonth: 2, churnRate30dPct: 11, medianTenureDays: 96, totalEverSubscribed: 34, totalSpans: 37 };
  const rows = coachLiveMomentum({ kind: 'live', trajectory: { summary } });
  const PERIOD = /this month|30d|month ago|per membership|lifetime|ever|all time/i;
  for (const [, label, sub] of rows) {
    assert.ok(PERIOD.test(label) || PERIOD.test(sub), `row "${label}" names no period: ${sub}`);
  }
  assert.match(rows[0][1], /this month/i);
  // The tenure row quotes the SPAN count, never the people count — the median
  // it sits beside is taken over spans.
  const tenure = rows.find(([, label]) => /tenure/i.test(label));
  assert.match(tenure[2], /\b37\b/);
  assert.ok(!/\b34\b/.test(tenure[2]), 'tenure subtext must not quote the client count');
});

// ── A failed subscriptions read must not read as $0 (Codex review on #2020) ──
// `coachClientsResponse` dropped its subscriptions error and emitted
// session-derived clients with mrrCents 0, and `_dashRecordFromLive` coerced
// that through `|| 0`, so a transient/RLS/schema failure was reported to the
// coach as measured zero revenue on every row.

const { goalMetricUnit } = load(DATA, ['goalMetricUnit']);

test('revenue: null (the read failed) is "Not shared", never $0', () => {
  assert.deepEqual(dashRevenueLabel({ payments: { mrrCents: null } }), { text: 'Not shared', dim: true });
  // and the two states stay distinguishable
  assert.notDeepEqual(
    dashRevenueLabel({ payments: { mrrCents: null } }),
    dashRevenueLabel({ payments: { mrrCents: 0 } })
  );
});

test('the live record preserves a null on every money leg instead of coercing it to 0', () => {
  // ⚠ Pins the OPERATOR, because `|| 0` and `?? null` are indistinguishable on
  // every input except the one that matters.
  //
  // ⚠ AND IT READS THE BLOCK, NOT A LINE. This guard used to find the single line
  // containing `payments: { mrrCents:` — so adding a field and wrapping the object
  // over four lines FAILED A TEST ABOUT SOMETHING ELSE. The invariant is the operator
  // on each leg; the layout is not the invariant.
  const at = DATA.indexOf('payments: {');
  assert.ok(at > 0, 'the payments leg moved');
  const block = DATA.slice(at, DATA.indexOf('}', DATA.indexOf('origin:', at)) + 1);
  for (const leg of ['mrrCents', 'feeCents']) {
    assert.match(block, new RegExp(leg + ':\\s*row\\.' + leg + '\\s*\\?\\?\\s*null'), leg + ' lost its ?? null');
    assert.ok(!new RegExp(leg + ':\\s*row\\.' + leg + '\\s*\\|\\|').test(block),
      '`|| 0` on ' + leg + ' relabels an unreadable leg as a measured zero');
  }
  assert.match(block, /origin:\s*row\.origin\s*\?\?\s*null/);
});

test('a bound metric carries its own unit, so the card cannot format it wrongly', () => {
  // Binding changed only `metric` while the card formats through money/pct:
  // MRR rendered as a bare 12000, adherence as a bare 88, and active clients
  // as `$12` on a goal that had been a revenue one.
  assert.deepEqual(goalMetricUnit('mrrNetMonthly'), { money: true, pct: false });
  assert.deepEqual(goalMetricUnit('adherencePct'), { money: false, pct: true });
  assert.deepEqual(goalMetricUnit('activeClients'), { money: false, pct: false });
  assert.deepEqual(goalMetricUnit(undefined), {}, 'unbinding leaves the typed goal’s own unit alone');
  assert.deepEqual(goalMetricUnit(''), {});
  // Every metric the modal offers has a unit — a new one added without one
  // would silently inherit whatever the goal was last formatted as.
  const { goalMetricsFor } = load(DATA, ['goalMetricsFor']);
  for (const role of ['trainer', 'nutritionist']) {
    for (const [value] of goalMetricsFor(role)) {
      if (!value) continue;
      assert.equal(Object.keys(goalMetricUnit(value)).length, 2, `${value} declares no unit`);
    }
  }
});

test('both Goal modals apply the metric’s unit when the binding changes', () => {
  for (const f of ['trainerGoalPage', 'nutritionistGoalPage']) {
    const src = readFileSync(new URL(`../public/newdesign/${f}.jsx`, import.meta.url), 'utf8');
    assert.match(src, /setG\(\{\s*\.\.\.g,\s*metric,\s*\.\.\.\(metric \? goalMetricUnit\(metric\) : \{\}\)\s*\}\)/, f);
    // and the unit checkboxes stop accepting input the card would override
    assert.match(src, /disabled=\{!!g\.metric\}/, `${f}: the unit checkboxes stay live while bound`);
  }
});

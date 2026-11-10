// The flags each coach gets, trainer vs nutritionist (owner, 2026-11-10: "you need to make sure these
// are relevant to each coach. Trainer vs nutritionist", then, from the coach-alerts research, "include
// both": the two-areas red and no broken streak for coaches). Each test is one rule of
// public/newdesign/dashSignals.js, on records built here. Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'package.json'));
const S = require(join(ROOT, 'public/newdesign/dashSignals.js'));
const src = (p) => readFileSync(join(ROOT, p), 'utf8');

const NOW = new Date('2026-11-12T12:00:00'); // a Thursday, past the check-in grace
const DAY = 86400000;
const ago = (d) => { const x = new Date(NOW.getTime() - d * DAY); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const monday = (weeksAgo) => { const x = new Date(NOW); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7) - 7 * weeksAgo); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

// A client of 60 days with nothing wrong; `over` adds the case.
function rec(over = {}) {
  return {
    profile: { id: 'c1', name: 'Client One', joinedAt: ago(60) },
    lastContact: { trainer: ago(1), nutritionist: ago(1) },
    foodLogs: { lastLoggedOn: ago(0), daysLogged7d: 6 },
    ...over,
  };
}
const solo = (who) => ({ pros: { trainer: who === 'trainer', nutritionist: who === 'nutritionist' } });
const both = { pros: { trainer: true, nutritionist: true } };
const row = (role, r, t) => S.getTriageFeed(role, [r], NOW, t)[0];
const keys = (r) => r.flags.map((f) => f.key);

// ── per-role house defaults ──────────────────────────────────────────────────
test('a trainer\'s food-log gap is 5 days, a nutritionist\'s and the member\'s 3; a dietitian reads the nutritionist\'s', () => {
  assert.equal(S.defaultsForRole('trainer').FOOD_GAP_DAYS, 5);
  assert.equal(S.defaultsForRole('nutritionist').FOOD_GAP_DAYS, 3);
  assert.equal(S.defaultsForRole('dietitian').FOOD_GAP_DAYS, 3);
  assert.equal(S.defaultsForRole('client').FOOD_GAP_DAYS, 3);
  assert.equal(S.DEFAULT_THRESHOLDS.FOOD_GAP_DAYS, 3, 'the house policy itself is unchanged');
  // A NEW object each time: nothing can write the shared set through it.
  const d = S.defaultsForRole('trainer'); d.FOOD_GAP_DAYS = 99;
  assert.equal(S.defaultsForRole('trainer').FOOD_GAP_DAYS, 5);
  assert.equal(S.DEFAULT_THRESHOLDS.CONTACT_GAP_DAYS, 7, 'contact gap is a week');
});

test('resolveThresholds fills a role\'s untuned values from that role, and a coach\'s own value wins', () => {
  assert.equal(S.resolveThresholds({}, 'trainer').thresholds.FOOD_GAP_DAYS, 5);
  assert.equal(S.resolveThresholds({}, 'nutritionist').thresholds.FOOD_GAP_DAYS, 3);
  assert.equal(S.resolveThresholds({}).thresholds.FOOD_GAP_DAYS, 3, 'no role: the house policy, as before');
  assert.equal(S.resolveThresholds({ FOOD_GAP_DAYS: 4 }, 'trainer').thresholds.FOOD_GAP_DAYS, 4);
  // The member's absolute score drop is no coach's tunable: a stored one is refused, never applied.
  const r = S.resolveThresholds({ SCORE_DROP_PTS: 2 }, 'trainer');
  assert.equal(r.thresholds.SCORE_DROP_PTS, 5);
  assert.deepEqual(r.refused.map((x) => x.key), ['SCORE_DROP_PTS']);
});

test('with no set passed, a trainer\'s feed runs on the trainer\'s defaults; a coach\'s tuning is never put back to them inside the feed', () => {
  const r = rec({ ...solo('trainer'), foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 2 } });
  assert.deepEqual(keys(row('trainer', r)), [], 'a 4-day gap is under a trainer\'s 5');
  assert.deepEqual(keys(row('nutritionist', rec({ ...solo('nutritionist'), foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 4 } }))), ['food_gap']);
  // Tuned to 4: the nested evaluateClient keeps 4 (no re-scope to the house 5).
  const tuned = S.resolveThresholds({ FOOD_GAP_DAYS: 4 }, 'trainer').thresholds;
  assert.deepEqual(keys(row('trainer', r, tuned)), ['food_gap']);
  // And the engine's set is back to the house policy after each call.
  assert.equal(S.THRESHOLDS.FOOD_GAP_DAYS, 3);
});

// ── the broken streak ────────────────────────────────────────────────────────
test('a broken streak is no coach\'s flag; the member\'s own view keeps it', () => {
  const r = rec({ ...both, streaks: { current: 0, best: 12, lastActiveOn: ago(3) } });
  for (const role of ['trainer', 'nutritionist', 'dietitian']) {
    const x = row(role, r);
    assert.ok(!keys(x).includes('streak_broken'), role);
    assert.equal(x.severity, 'green', role);
  }
  assert.ok(S.evaluateClient(r, NOW, 'client').flags.some((f) => f.key === 'streak_broken'));
});

// ── the score drop ───────────────────────────────────────────────────────────
const score = (a, b) => ({ shapeScoreHistory: [{ weekOf: monday(2), points: a }, { weekOf: monday(1), points: b }] });

test('a coach\'s score drop is 20% of the week before, over a week of 30 points or more', () => {
  assert.deepEqual(keys(row('trainer', rec(score(70, 60)))), [], '14% is not a drop');
  const x = row('trainer', rec(score(70, 56)));
  assert.deepEqual(keys(x), ['score_drop']);
  assert.equal(x.flags[0].label, 'Score ↓20%');
  assert.match(x.flags[0].reason, /down 14 pts \(20%\)/);
  assert.deepEqual(keys(row('nutritionist', rec(score(25, 10)))), [], 'under the 30-point floor nothing speaks');
  // The line is the exact share: 41 to 33 is 19.5%, which would round to 20; 40 to 32 is 20% on the line.
  assert.deepEqual(keys(row('trainer', rec(score(41, 33)))), [], '19.5% is under the line');
  assert.deepEqual(keys(row('trainer', rec(score(40, 32)))), ['score_drop'], 'exactly 20% is on it');
  // Tunable, refused outside its range.
  assert.deepEqual(keys(row('trainer', rec(score(70, 60)), S.resolveThresholds({ SCORE_DROP_PCT: 10 }, 'trainer').thresholds)), ['score_drop']);
  assert.deepEqual(S.resolveThresholds({ SCORE_DROP_PCT: 2 }).refused.map((r) => r.why), ['out of range']);
});

test('a coach\'s score drop is context: it never colours a row, never leads one with anything counted, never alerts', () => {
  const alone = row('trainer', rec(score(70, 40)));
  assert.equal(alone.severity, 'green');
  assert.ok(alone.flags[0].owned, 'it is the coach\'s to see');
  const withQuiet = row('trainer', rec({ ...score(70, 40), lastContact: { trainer: ago(9), nutritionist: ago(1) } }));
  assert.equal(withQuiet.severity, 'amber', 'the contact gap alone makes it amber, not red');
  assert.equal(withQuiet.lead.key, 'contact_gap', 'the push and Today name what made it amber');
  // …even where it would outrank the flag that counts: a program ending (25) under the drop (30).
  const ending = row('trainer', rec({ ...score(70, 40), programs: { trainer: { name: 'Block', estimatedEndAt: new Date(NOW.getTime() + 3 * DAY).toISOString() } } }));
  assert.deepEqual(keys(ending).sort(), ['program_ending', 'score_drop']);
  assert.equal(ending.severity, 'amber');
  assert.equal(ending.lead.key, 'program_ending');
  assert.ok(S.CONTEXT_FLAGS.score_drop);
});

test('the member\'s own score drop is unchanged: 5 points, absolute', () => {
  const f = S.evaluateClient(rec(score(70, 64)), NOW, 'client').flags.find((x) => x.key === 'score_drop');
  assert.ok(f, 'a 6-point fall still reaches the member');
  assert.equal(f.label, 'Score ↓6');
  assert.deepEqual(f.figures, { drop: 6 });
});

// ── red: two areas, or a safety flag ─────────────────────────────────────────
test('two flags in one area are amber; flags in two areas are red', () => {
  // A food-log gap and calories nobody really logged: one area.
  const nut = rec({ ...solo('nutritionist'), foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 4 }, nutrition: { avgCalories: 2600, targetCalories: 2000 } });
  const one = row('nutritionist', nut);
  assert.deepEqual(keys(one).sort(), ['food_gap', 'ledger_blown']);
  assert.equal(one.severity, 'amber');
  // A quiet thread and the reply waiting in it: one area.
  const thread = rec({ lastContact: { trainer: ago(8), nutritionist: ago(1) }, replyWait: { trainer: new Date(NOW.getTime() - 30 * 3600000).toISOString() } });
  const t = row('trainer', thread);
  assert.deepEqual(keys(t).sort(), ['contact_gap', 'reply_waiting']);
  assert.equal(t.severity, 'amber');
  // Missed sessions and the quiet thread: training and contact.
  const two = row('trainer', rec({ lastContact: { trainer: ago(8), nutritionist: ago(1) }, bookedSessions: { trainer: { done: 4, planned: 9 } } }));
  assert.deepEqual(keys(two).sort(), ['contact_gap', 'missed_sessions']);
  assert.equal(two.severity, 'red');
  // The member's own view keeps two flags: a food-log gap and hunger, one area, red for them only.
  const hungry = rec({ ...solo('nutritionist'), foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 4 }, vitals: { hunger: { avg7: 9, n: 5 } } });
  assert.deepEqual(S.evaluateClient(hungry, NOW, 'client').flags.map((f) => f.key).sort(), ['food_gap', 'hunger_high']);
  assert.equal(S.evaluateClient(hungry, NOW, 'client').severity, 'red');
  assert.equal(row('nutritionist', hungry).severity, 'amber');
});

test('a yes on the health screening is red on its own; a missing one is amber; the check-in rule still reds', () => {
  assert.equal(row('trainer', rec({ screening: 'flagged' })).severity, 'red');
  assert.equal(row('nutritionist', rec({ screening: 'flagged' })).severity, 'red');
  assert.equal(row('trainer', rec({ screening: 'missing' })).severity, 'amber');
  // Dismissed (read), it stops being red.
  const read = row('trainer', rec({ screening: 'flagged', dismissals: [{ key: 'screening_flagged', sig: 'flagged', until: null }] }));
  assert.equal(read.severity, 'green');
  assert.equal(row('trainer', rec({ checkIn: { lastWeekOf: monday(3) } })).severity, 'red');
  assert.equal(S.flagArea({ key: 'goal_slip', discipline: 'training' }), 'training');
  assert.equal(S.flagArea({ key: 'goal_slip' }), 'progress');
});

// ── logging and intake ───────────────────────────────────────────────────────
test('a food-log gap is the nutritionist\'s: a trainer sees it as context while one is on, and owns it at 5 days alone', () => {
  const gap = { foodLogs: { lastLoggedOn: ago(6), daysLogged7d: 1 } };
  const ctx = row('trainer', rec({ ...both, ...gap }));
  assert.deepEqual(keys(ctx), ['food_gap']);
  assert.equal(ctx.flags[0].owned, false);
  assert.equal(ctx.flags[0].routeTo, 'nutritionist');
  assert.equal(ctx.severity, 'green', 'context never colours the trainer\'s row');
  assert.equal(ctx.lead, null);
  const own = row('trainer', rec({ ...solo('trainer'), ...gap }));
  assert.equal(own.flags[0].owned, true);
  assert.equal(own.severity, 'amber');
  assert.equal(row('nutritionist', rec({ ...both, ...gap })).severity, 'amber');
});

test('a nutritionist hears of a client logging on fewer than 3 of 7 days; not twice with a gap, not on day one, not on an empty week', () => {
  const thin = rec({ ...both, foodLogs: { lastLoggedOn: ago(1), daysLogged7d: 2 } });
  const x = row('nutritionist', thin);
  assert.deepEqual(keys(x), ['food_logging']);
  assert.equal(x.flags[0].label, 'Logged 2 of 7 days');
  assert.equal(x.flags[0].discipline, 'nutrition');
  assert.equal(x.severity, 'amber');
  assert.equal(x.lead.action.label, 'Nudge to log');
  assert.deepEqual(keys(row('nutritionist', rec({ foodLogs: { lastLoggedOn: ago(1), daysLogged7d: 3 } }))), []);
  assert.deepEqual(keys(row('nutritionist', rec({ foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 2 } }))), ['food_gap'], 'the gap says it');
  assert.deepEqual(keys(row('nutritionist', rec({ profile: { id: 'n', name: 'New', joinedAt: ago(3) }, foodLogs: { lastLoggedOn: ago(1), daysLogged7d: 1 } }))), [], 'their first week');
  assert.deepEqual(keys(row('nutritionist', rec({ foodLogs: { lastLoggedOn: null, daysLogged7d: 0 } }), S.resolveThresholds({ FOOD_GAP_DAYS: 14 }).thresholds)), [], 'an empty week is the gap\'s');
  // Only the nutrition evaluation reads it: a trainer's feed holds still while it moves.
  const roster = S.buildMockClients(NOW).concat([thin]);
  const at = (n) => JSON.stringify(S.getTriageFeed('trainer', roster, NOW, S.resolveThresholds({ FOOD_LOG_DAYS: n }, 'trainer').thresholds).map((r) => [r.severity, keys(r), r.readOnly.map((f) => f.key)]));
  assert.equal(at(2), at(7));
  assert.notEqual(JSON.stringify(S.getTriageFeed('nutritionist', [thin], NOW, S.resolveThresholds({ FOOD_LOG_DAYS: 2 }).thresholds).map(keys)), JSON.stringify([['food_logging']]));
});

test('calories over and protein under need 4 logged days of the last 7; an unknown count is no evidence', () => {
  const intake = { nutrition: { avgCalories: 2600, targetCalories: 2000, avgProtein: 90, targetProtein: 150 } };
  const at = (n) => keys(row('nutritionist', rec({ ...intake, foodLogs: { lastLoggedOn: ago(0), daysLogged7d: n } }))).filter((k) => k !== 'food_logging').sort();
  assert.deepEqual(at(3), []);
  assert.deepEqual(at(4), ['ledger_blown', 'protein_under']);
  assert.deepEqual(keys(row('nutritionist', rec({ ...intake, foodLogs: null }))), []);
  // The trainer's routed context obeys the same floor.
  assert.deepEqual(row('trainer', rec({ ...both, ...intake, foodLogs: { lastLoggedOn: ago(0), daysLogged7d: 3 } })).readOnly, []);
});

test('a trainer alone owns calories and protein as amber only, and shares guidance or a dietitian, never a target', () => {
  const r = rec({ ...solo('trainer'), nutrition: { avgCalories: 2600, targetCalories: 2000, avgProtein: 90, targetProtein: 150 }, bookedSessions: { trainer: { done: 4, planned: 9 } } });
  const x = row('trainer', r);
  assert.deepEqual(keys(x).sort(), ['ledger_blown', 'missed_sessions', 'protein_under']);
  assert.equal(x.severity, 'amber', 'nutrition and training, and still not red');
  for (const key of ['ledger_blown', 'protein_under']) {
    const a = S.coachActionFor(key, 'trainer', r);
    assert.equal(a.label, 'Share guidance');
    assert.match(a.draft, /registered dietitian/);
    assert.doesNotMatch(a.draft, /\d/, 'no number, no target');
    assert.equal(S.coachActionFor(key, 'nutritionist', r).label, 'Adjust plan');
  }
});

// ── sessions, contact and goals ──────────────────────────────────────────────
test('missed sessions are each coach\'s own: a nutritionist with a trainer on hears of their own missed consults', () => {
  const r = rec({ ...both, bookedSessions: { trainer: { done: 8, planned: 8 }, nutritionist: { done: 1, planned: 5 } } });
  const n = row('nutritionist', r);
  assert.deepEqual(keys(n), ['missed_sessions']);
  assert.equal(n.flags[0].owned, true);
  assert.match(n.flags[0].reason, /4 of 5 booked sessions/);
  assert.deepEqual(keys(row('trainer', r)), [], 'the trainer\'s own were all kept');
});

test('the contact gap is a week', () => {
  assert.deepEqual(keys(row('trainer', rec({ lastContact: { trainer: ago(6), nutritionist: ago(1) } }))), []);
  assert.deepEqual(keys(row('trainer', rec({ lastContact: { trainer: ago(7), nutritionist: ago(1) } }))), ['contact_gap']);
});

test('a goal\'s slip goes to the coach of what it measures: weight to the nutritionist, strength to the trainer, a habit to both', () => {
  const slipping = (metric) => rec({ ...both, goals: [{ id: 'g', label: 'Goal', metric, unit: 'kg', target: 70, start: 80,
    history: [[56, 80], [49, 79], [42, 78], [35, 77], [28, 76], [21, 75.6], [14, 75.4], [7, 75.3], [1, 75.3]].map(([d, v]) => ({ on: ago(d), value: v })) }] });
  // A goal heading DOWN reads as a weight cut; the projection does not care what it measures.
  const w = slipping('weight');
  assert.equal(row('nutritionist', w).flags[0].owned, true);
  assert.equal(row('trainer', w).flags[0].owned, false);
  assert.equal(row('trainer', w).severity, 'green');
  const s = slipping('strength');
  assert.equal(row('trainer', s).flags[0].owned, true);
  assert.equal(row('trainer', s).flags[0].discipline, 'training');
  assert.equal(row('nutritionist', s).flags[0].owned, false);
  const h = slipping('habit');
  assert.equal(row('trainer', h).flags[0].owned, true);
  assert.equal(row('nutritionist', h).flags[0].owned, true);
  assert.equal(S.goalDiscipline({ metric: 'endurance' }), 'training');
  assert.equal(S.goalDiscipline({ metric: 'custom' }), null);
});

test('a coach\'s goal slip names their own worst slipped goal: a worse weight goal never hides a trainer\'s strength goal', () => {
  const hist = (pts) => pts.map(([d, v]) => ({ on: ago(d), value: v }));
  const goal = (id, metric, pts) => ({ id, label: id, metric, unit: 'kg', target: 70, start: 80, history: hist(pts) });
  // The weight goal slips 13 days and comes first; the strength goal slips 9.
  const weight = goal('Cut', 'weight', [[56, 80], [49, 79], [42, 78], [35, 77], [28, 76], [21, 75.6], [14, 75.4], [7, 75.3], [1, 75.3]]);
  const squat = goal('Squat', 'strength', [[56, 80], [49, 79], [42, 78], [35, 77], [28, 76], [21, 75.5], [14, 75.0], [7, 74.7], [1, 74.6]]);
  const r = rec({ ...both, goals: [weight, squat] });
  const t = row('trainer', r).flags.find((f) => f.key === 'goal_slip');
  assert.equal(t.owned, true);
  assert.equal(t.discipline, 'training');
  assert.match(t.reason, /Squat/);
  assert.equal(row('trainer', r).severity, 'amber');
  const n = row('nutritionist', r).flags.find((f) => f.key === 'goal_slip');
  assert.equal(n.owned, true);
  assert.match(n.reason, /Cut/);
  // The member owns both and hears of the worse, even when the lesser is a habit both coaches own.
  assert.match(S.evaluateClient(r, NOW, 'client').flags.find((f) => f.key === 'goal_slip').reason, /Cut/);
  const habit = { ...squat, id: 'Steps', label: 'Steps', metric: 'habit' };
  assert.match(S.evaluateClient(rec({ ...both, goals: [weight, habit] }), NOW, 'client').flags.find((f) => f.key === 'goal_slip').reason, /Cut/);
  // A trainer alone owns every goal, so hears of the worse.
  assert.match(row('trainer', rec({ ...solo('trainer'), goals: [weight, squat] })).flags.find((f) => f.key === 'goal_slip').reason, /Cut/);
  // With none of their own past the line, the coach sees the other's as routed context.
  const only = row('trainer', rec({ ...both, goals: [weight] })).flags.find((f) => f.key === 'goal_slip');
  assert.equal(only.owned, false);
  assert.match(only.reason, /Cut/);
  // Their own slipping only 4 days, under the line, doesn't hide the other's either.
  const nudge = goal('Bench', 'strength', [[56, 80], [49, 79], [42, 78], [35, 77], [28, 76], [21, 75.2], [14, 74.6], [7, 74.0], [1, 73.6]]);
  assert.equal(S.goalSlipDays(nudge, NOW), 4);
  const under = row('trainer', rec({ ...both, goals: [weight, nudge] })).flags.find((f) => f.key === 'goal_slip');
  assert.equal(under.owned, false);
  assert.match(under.reason, /Cut/);
});

test('joint attention reads each side at its own coach\'s line, so both coaches agree on who needs a note', () => {
  const co = { coCoaches: [{ role: 'nutritionist', userId: 'n1', name: 'Rae' }, { role: 'trainer', userId: 't1', name: 'Alex' }], ...both };
  // A 4-day gap: past the nutritionist's 3 days, inside a trainer's own 5.
  const r = rec({ ...co, foodLogs: { lastLoggedOn: ago(4), daysLogged7d: 3 }, bookedSessions: { trainer: { done: 4, planned: 9 } } });
  for (const role of ['trainer', 'nutritionist']) {
    const j = S.findJointAttention([r], NOW, null, role);
    assert.deepEqual(j.map((x) => x.nutritionFlags.map((f) => f.key)), [['food_gap']], role);
    assert.deepEqual(j.map((x) => x.trainingFlags.map((f) => f.key)), [['missed_sessions']], role);
  }
  // A trainer's own tuning moves their side, never the nutritionist's.
  assert.equal(S.findJointAttention([r], NOW, { FOOD_GAP_DAYS: 7 }, 'trainer').length, 1);
  assert.equal(S.findJointAttention([r], NOW, { MISSED_SESSIONS: 6 }, 'trainer').length, 0);
  // And the nutritionist's own tuning moves theirs.
  assert.equal(S.findJointAttention([r], NOW, { FOOD_GAP_DAYS: 7 }, 'nutritionist').length, 0);
});

test('joint attention reads training from missed sessions, never the streak', () => {
  const co = { coCoaches: [{ role: 'nutritionist', userId: 'n1', name: 'Rae' }, { role: 'trainer', userId: 't1', name: 'Alex' }], ...both };
  const gap = { foodLogs: { lastLoggedOn: ago(6), daysLogged7d: 1 } };
  const streakOnly = rec({ ...co, ...gap, streaks: { current: 0, best: 12, lastActiveOn: ago(3) } });
  assert.deepEqual(S.findJointAttention([streakOnly], NOW, null, 'trainer'), []);
  const missed = rec({ ...co, ...gap, bookedSessions: { trainer: { done: 4, planned: 9 } } });
  const j = S.findJointAttention([missed], NOW, null, 'trainer');
  assert.equal(j.length, 1);
  assert.deepEqual(j[0].trainingFlags.map((f) => f.key), ['missed_sessions']);
  assert.deepEqual(j[0].nutritionFlags.map((f) => f.key), ['food_gap']);
  // The nutrition side as the nutritionist reads it: protein under is no trainer's flag while one is on.
  const protein = rec({ ...co, bookedSessions: { trainer: { done: 4, planned: 9 } }, nutrition: { avgProtein: 90, targetProtein: 150 } });
  assert.deepEqual(S.findJointAttention([protein], NOW, null, 'trainer').map((x) => x.nutritionFlags.map((f) => f.key)), [['protein_under']]);
  // The demo's joint case shows for both coaches.
  for (const role of ['trainer', 'nutritionist']) assert.deepEqual(S.findJointAttention(S.buildMockClients(NOW), NOW, null, role).map((x) => x.client.profile.name), ['Marcus T.'], role);
});

// ── the rows each Settings page offers ──────────────────────────────────────
test('each role\'s Settings rows are the ones its evaluation reads, in its words, with its house values', () => {
  const t = Object.fromEntries(S.tunablesFor('trainer').map((x) => [x.key, x]));
  const n = Object.fromEntries(S.tunablesFor('nutritionist').map((x) => [x.key, x]));
  assert.ok(!t.FOOD_LOG_DAYS, 'a trainer\'s evaluation never reads logging days');
  assert.equal(n.FOOD_LOG_DAYS.house, 3);
  assert.equal(t.FOOD_GAP_DAYS.house, 5);
  assert.equal(n.FOOD_GAP_DAYS.house, 3);
  assert.equal(n.PROGRAM_END_DAYS.label, 'Plan ending');
  assert.equal(t.PROGRAM_END_DAYS.label, 'Program ending');
  assert.match(t.LEDGER_OVER_PCT.help, /only coach/);
  assert.ok(!t.SCORE_DROP_PTS && !n.SCORE_DROP_PTS, 'the member\'s absolute drop is not offered');
  assert.equal(t.SCORE_DROP_PCT.house, 20);
  assert.equal(S.tunablesFor().length, S.TUNABLES.length, 'without a role, every row');
  // Every tunable's house value is in its range for every role.
  for (const role of ['trainer', 'nutritionist']) for (const x of S.tunablesFor(role)) assert.ok(x.house >= x.min && x.house <= x.max, role + ' ' + x.key);
});

test('every caller resolves the tuning for the roster\'s role', () => {
  assert.match(src('public/newdesign/dashData.jsx'), /DashSignals\.resolveThresholds\(t, role\)/);
  assert.match(src('public/newdesign/dashData.jsx'), /dashResolveCoachThresholds\(doc, role\)/);
  assert.match(src('src/lib/ai/notify-core.ts'), /engine\.resolveThresholds\(t, role\)/);
  assert.match(src('src/app/api/ai/notify/route.ts'), /loadCoachThresholds\(actor\.supabase, actor\.user\.id, role\)/);
  assert.match(src('src/app/api/ai/notify/cron/route.ts'), /loadCoachThresholds\(admin, userId, snapshot\.role\)/);
  assert.match(src('src/lib/ai/coachToday.mjs'), /resolveFor\(thresholds, role\)/);
  assert.match(src('mobile-app/src/services/shapeSignals.js'), /coachThresholds\(role\)/);
  // No caller resolves without one.
  for (const p of ['public/newdesign/dashData.jsx', 'src/lib/ai/notify-core.ts', 'src/lib/ai/coachToday.mjs', 'mobile-app/src/services/shapeSignals.js']) {
    assert.doesNotMatch(src(p), /resolveThresholds\(t\)/, p);
  }
});

// The nutritionist's weight alerts (the 2026-11-11 coach-alerts plan, PR 2): losing fast and the
// safety red, the weigh-in gap, a slow start on a weight-loss goal, the gain bands, and the GLP-1
// lines (its own fast-loss and slow-start lines, the 3-to-4-month total and protein as context). The
// engine's rules on records, who owns each, the record and the push's snapshot, a break, Settings and
// the demo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DS = require('../public/newdesign/dashSignals.js');
const NOW = new Date('2026-11-11T12:00:00');
const day = (d) => { const x = new Date(NOW.getTime()); x.setDate(x.getDate() - d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const BOTH = { trainer: true, nutritionist: true };
const base = (over = {}) => ({ profile: { id: 'c1', name: 'Ada', joinedAt: day(200) }, pros: BOTH, ...over });
// A weight goal in kg: `pts` are [days ago, kg], oldest first.
const goal = ({ start, target, from, pts, id = 'g-w' }) => ({ goals: [{ id, label: 'Goal weight', metric: 'weight', unit: 'kg', target, start, startedOn: from == null ? null : day(from), setBy: 'nutritionist', history: pts.map(([d, v]) => ({ on: day(d), value: v })) }] });
const feed = (role, rec, t) => DS.getTriageFeed(role, [rec], NOW, t)[0];
const keys = (row) => row.flags.map((f) => f.key).sort();
const flag = (row, key) => row.flags.find((f) => f.key === key) || null;
const hungry = { vitals: { hunger: { avg7: 8.5, n: 5 } } };
const tired = { vitals: { energy: { avg7: 3, n: 5 } } };

// ── 6. Losing fast ─────────────────────────────────────────────────────────────
// About 1.3% a week over the last 3 weeks, from week 5 of the goal.
const fast = (over = {}) => base({ ...goal({ start: 85, target: 72, from: 35, pts: [[35, 85], [28, 84.4], [21, 83.6], [14, 82.5], [7, 81.4], [1, 80.3]] }), ...over });
test('losing fast: the 2-week trend over 1% of body weight a week, the nutritionist\'s, a trainer\'s context', () => {
  const n = feed('nutritionist', fast());
  assert.equal(flag(n, 'weight_fast').reason, 'Losing 1.4% of body weight a week over the last 2 weeks');
  assert.equal(n.severity, 'amber');
  assert.equal(n.lead.action.label, 'Review the plan');
  // The trainer sees it on the client and it never counts, with a nutritionist on and as the only coach.
  for (const pros of [BOTH, { trainer: true, nutritionist: false }]) {
    const t = feed('trainer', fast({ pros }));
    assert.ok(flag(t, 'weight_fast') || t.readOnly.some((f) => f.key === 'weight_fast'), 'shown to the trainer');
    assert.equal(t.severity, 'green', JSON.stringify(pros));
  }
  // Context never leads a row with something counted on it: the only coach's no-booking leads.
  const booked = { bookedSessions: { trainer: { done: 3, planned: 3, lastKeptAt: day(20) + 'T10:00:00', nextAt: null }, nutritionist: null } };
  const sole = feed('trainer', fast({ pros: { trainer: true, nutritionist: false }, ...booked }));
  assert.equal(sole.lead.key, 'no_booking');
  // A 1.5% line on a coach's own tuning holds it.
  const tuned = DS.resolveThresholds({ LOSS_FAST_PCT: 1.5 }, 'nutritionist').thresholds;
  assert.equal(flag(feed('nutritionist', fast(), tuned), 'weight_fast'), null);
});
test('losing fast needs week 3 of the goal, 3 weigh-ins over 2 weeks, and a loss goal', () => {
  const pts = [[35, 85], [28, 84.4], [21, 83.6], [14, 82.5], [7, 81.4], [1, 80.3]];
  // Week 2 of the goal (10 days in): the weigh-ins before its start date are its history, not its weeks.
  assert.equal(flag(feed('nutritionist', base(goal({ start: 85, target: 72, from: 10, pts }))), 'weight_fast'), null, 'week 2');
  assert.equal(flag(feed('nutritionist', base(goal({ start: 85, target: 72, from: 35, pts: [[35, 85], [7, 81.4], [1, 80.3]] }))), 'weight_fast'), null, 'two in the last 3 weeks');
  assert.equal(flag(feed('nutritionist', base(goal({ start: 85, target: 72, from: 35, pts: [[35, 85], [12, 82.6], [6, 81.6], [1, 80.3]] }))), 'weight_fast'), null, 'three, spanning 11 days');
  assert.equal(flag(feed('nutritionist', base(goal({ start: 85, target: 90, from: 35, pts }))), 'weight_fast'), null, 'a gain goal');
  // A goal with no start date counts from its first weigh-in.
  assert.ok(flag(feed('nutritionist', base(goal({ start: 85, target: 72, from: null, pts }))), 'weight_fast'));
  // Two weigh-ins in the last 3 weeks are no trend, however far apart.
  assert.equal(flag(feed('nutritionist', base(goal({ start: 85, target: 72, from: 35, pts: [[35, 85], [20, 83.5], [1, 80.3]] }))), 'weight_fast'), null, 'two, 19 days apart');
  // A goal to hold a weight is neither loss nor gain.
  assert.equal(flag(feed('nutritionist', base(goal({ start: 85, target: 85, from: 35, pts }))), 'weight_fast'), null, 'a hold goal');
  // Regaining on a loss goal is not losing fast.
  assert.equal(flag(feed('nutritionist', base(goal({ start: 85, target: 72, from: 35, pts: [[35, 80], [21, 80.5], [14, 81.8], [7, 83], [1, 84.2]] }))), 'weight_fast'), null, 'regaining');
  // The weight goal, wherever it sits among the goals.
  const squat = { id: 'g-squat', label: 'Back squat', metric: 'strength', unit: 'kg', target: 140, start: 100, startedOn: day(60), history: [{ on: day(30), value: 110 }, { on: day(1), value: 118 }] };
  const both = base({ goals: [squat, ...goal({ start: 85, target: 72, from: 35, pts }).goals] });
  assert.ok(flag(feed('nutritionist', both), 'weight_fast'), 'after a strength goal');
  // Weigh-ins with no weight goal say nothing, with no notice.
  assert.deepEqual(keys(feed('nutritionist', base({ weighIns: pts.map(([d, v]) => ({ on: day(d), weight: v, unit: 'kg' })) }))), []);
});
test('on a GLP-1 the fast-loss line is 1.5% a week', () => {
  assert.equal(flag(feed('nutritionist', fast({ glp1: true })), 'weight_fast'), null, '1.4% a week on a GLP-1');
  const faster = base({ glp1: true, ...goal({ start: 90, target: 72, from: 35, pts: [[35, 90], [21, 87.5], [14, 85.6], [7, 83.7], [1, 82]] }) });
  const f = flag(feed('nutritionist', faster), 'weight_fast');
  assert.match(f.reason, /^Losing 2(\.\d)?% of body weight a week over the last 2 weeks \(on a GLP-1\)$/);
});

// ── 6. The safety red ──────────────────────────────────────────────────────────
const steep = (over = {}) => base({ ...goal({ start: 86, target: 70, from: 40, pts: [[40, 86], [21, 83], [14, 82.6], [7, 81.3], [0, 80]] }), ...over });
test('the safety red: 1 kg a week for 2 weeks in a row with high hunger or low energy, red on its own', () => {
  const n = feed('nutritionist', steep(hungry));
  const f = flag(n, 'weight_unsafe');
  assert.equal(f.reason, 'Down 2.6 kg in 2 weeks, with high hunger. Check in, and suggest they see their doctor if it goes on');
  assert.equal(n.severity, 'red');
  assert.ok(!flag(n, 'weight_fast'), 'in place of losing fast');
  assert.equal(n.lead.key, 'weight_unsafe');
  assert.equal(n.lead.action.label, 'Check in');
  assert.match(flag(feed('nutritionist', steep(tired)), 'weight_unsafe').reason, /with low energy\./);
  // Red on its own: low energy is the trainer's, so the red is the safety flag's alone.
  assert.equal(feed('nutritionist', steep(tired)).severity, 'red');
  // Without hunger or energy it is losing fast, not the red.
  const plain = feed('nutritionist', steep());
  assert.ok(!flag(plain, 'weight_unsafe') && flag(plain, 'weight_fast'));
  assert.equal(plain.severity, 'amber');
  // One week at 1 kg is not two.
  const oneWeek = base({ ...hungry, ...goal({ start: 86, target: 70, from: 40, pts: [[40, 86], [21, 83], [14, 82.6], [7, 81.3], [0, 80.4]] }) });
  assert.equal(flag(feed('nutritionist', oneWeek), 'weight_unsafe'), null);
  // Each week's ends need a weigh-in within 4 days of them; a later one is no reading for the week.
  const far = base({ ...hungry, ...goal({ start: 86, target: 70, from: 40, pts: [[40, 86], [24, 84.6], [12, 82.4], [2, 80]] }) });
  assert.equal(flag(feed('nutritionist', far), 'weight_unsafe'), null, 'no weigh-in near a week\'s end');
  // A tuned 3 safety weeks needs a third.
  const t3 = DS.resolveThresholds({ LOSS_SAFETY_WEEKS: 3 }, 'nutritionist').thresholds;
  assert.equal(flag(feed('nutritionist', steep(hungry), t3), 'weight_unsafe'), null);
  // The trainer: the nutritionist's while one is on; the only coach's otherwise, red too.
  assert.equal(feed('trainer', steep(hungry)).severity, 'green');
  assert.equal(feed('trainer', steep({ ...hungry, pros: { trainer: true, nutritionist: false } })).severity, 'red');
});

// ── 9. The weigh-in gap ────────────────────────────────────────────────────────
const weekly = (lastAgo, over = {}) => base({ ...goal({ start: 85, target: 78, from: 80, pts: [[lastAgo + 28, 84], [lastAgo + 21, 83.8], [lastAgo + 14, 83.5], [lastAgo + 7, 83.3], [lastAgo, 83]] }), ...over });
test('a weigh-in gap: none for 14 days, for a client who weighed in weekly over the 4 weeks before', () => {
  const g = flag(feed('nutritionist', weekly(15)), 'weighin_gap');
  assert.equal(g.reason, 'No weigh-in for 15 days');
  assert.equal(g.label, 'No weigh-in 15d');
  assert.equal(flag(feed('nutritionist', weekly(13)), 'weighin_gap'), null, '13 days');
  assert.equal(flag(feed('nutritionist', weekly(14)), 'weighin_gap').reason, 'No weigh-in for 14 days', 'on the line');
  // Two weigh-ins in the 4 weeks before: never a weekly habit to miss.
  const sparse = base(goal({ start: 85, target: 78, from: 80, pts: [[60, 84], [40, 83.6], [20, 83.2]] }));
  assert.equal(flag(feed('nutritionist', sparse), 'weighin_gap'), null);
  // A coach goal's own history stops, the member's weigh-ins go on (Codex on #2720): read both.
  const frozen = weekly(30);
  const live = { ...frozen, weighIns: [[23, 82.9], [16, 82.7], [9, 82.6], [2, 82.4]].map(([d, v]) => ({ on: day(d), weight: v, unit: 'kg' })) };
  assert.ok(flag(feed('nutritionist', frozen), 'weighin_gap'), 'the goal\'s history alone: 30 days');
  assert.equal(flag(feed('nutritionist', live), 'weighin_gap'), null, 'weighed in 2 days ago');
  // …in their own unit, and the live reading wins on a day both have one.
  const lb = { ...base(goal({ start: 85, target: 72, from: 35, pts: [[35, 85], [21, 83.6], [14, 82.5], [7, 81.4], [1, 85]] })), weighIns: [{ on: day(1), weight: 177, unit: 'lb' }] };
  assert.ok(flag(feed('nutritionist', lb), 'weight_fast'), '177 lb is 80.3 kg: still losing fast');
  // On a break it is quiet.
  assert.equal(flag(feed('nutritionist', weekly(15, { pause: { until: day(-5), by: 'client' } })), 'weighin_gap'), null);
  // After one it counts from the day they came back, never from before it.
  assert.equal(flag(feed('nutritionist', weekly(30, { pause: { until: day(5), by: 'client' } })), 'weighin_gap'), null, '5 days back, 30 since the last');
  const ten = DS.resolveThresholds({ WEIGHIN_GAP_DAYS: 10 }, 'nutritionist').thresholds;
  assert.equal(flag(feed('nutritionist', weekly(40, { pause: { until: day(12), by: 'client' } }), ten), 'weighin_gap').reason, 'No weigh-in in the 11 days since their break', 'at a 10-day line');
  // At the house 14 days and over it, still from the return (Codex on #2721): the other gaps stop reading
  // a break 14 days back, this one a day past its own line.
  assert.equal(flag(feed('nutritionist', weekly(40, { pause: { until: day(15), by: 'client' } })), 'weighin_gap').reason, 'No weigh-in in the 14 days since their break', 'at the house line');
  const twenty = DS.resolveThresholds({ WEIGHIN_GAP_DAYS: 20 }, 'nutritionist').thresholds;
  assert.equal(flag(feed('nutritionist', weekly(30, { pause: { until: day(16), by: 'client' } }), twenty), 'weighin_gap'), null, '15 days back under a 20-day line');
  assert.equal(flag(feed('nutritionist', weekly(30, { pause: { until: day(21), by: 'client' } }), twenty), 'weighin_gap').reason, 'No weigh-in in the 20 days since their break');
  const five = DS.resolveThresholds({ WEIGHIN_GAP_DAYS: 5 }, 'nutritionist').thresholds;
  assert.equal(flag(feed('nutritionist', weekly(6, { pause: { until: day(12), by: 'client' } }), five), 'weighin_gap').reason, 'No weigh-in for 6 days', 'weighed in after the break: from that weigh-in');
  // A trainer with a nutritionist on sees it as theirs.
  const t = feed('trainer', weekly(15));
  assert.equal(t.severity, 'green');
  assert.equal(feed('trainer', weekly(15, { pros: { trainer: true, nutritionist: false } })).severity, 'amber', 'the only coach\'s');
});

// ── 10. A slow start ───────────────────────────────────────────────────────────
const slow = (from, lostPct, over = {}) => {
  const start = 100, end = start * (1 - lostPct / 100);
  return base({ ...goal({ start, target: 85, from, pts: [[from, start], [Math.round(from * 0.66), start - (start - end) * 0.4], [Math.round(from * 0.33), start - (start - end) * 0.75], [2, end]] }), ...over });
};
test('a slow start: under 2% lost by week 4, or under 3% by week 8, counted from the goal\'s start', () => {
  const s = flag(feed('nutritionist', slow(30, 1.2)), 'slow_start');
  assert.equal(s.reason, 'Down 1.2% after 4 weeks');
  assert.equal(feed('nutritionist', slow(30, 1.2)).severity, 'amber');
  assert.equal(flag(feed('nutritionist', slow(30, 2.4)), 'slow_start'), null, '2.4% by week 4');
  assert.equal(flag(feed('nutritionist', slow(27, 0.5)), 'slow_start'), null, 'week 3');
  assert.equal(flag(feed('nutritionist', slow(60, 2.5)), 'slow_start').reason, 'Down 2.5% after 8 weeks');
  assert.equal(flag(feed('nutritionist', slow(60, 3.2)), 'slow_start'), null, '3.2% by week 8');
  assert.equal(flag(feed('nutritionist', slow(90, 1)), 'slow_start'), null, 'week 12: past the slow start');
  // A gain says "Up".
  assert.equal(flag(feed('nutritionist', slow(30, -0.5)), 'slow_start').reason, 'Up 0.5% after 4 weeks');
  // Its weigh-in is from its own weeks, or it says nothing.
  const stale = base(goal({ start: 100, target: 85, from: 40, pts: [[40, 100], [20, 99.4]] }));
  assert.equal(flag(feed('nutritionist', stale), 'slow_start'), null, 'the last weigh-in 20 days old');
  // The two lines are the coach's.
  const t = DS.resolveThresholds({ SLOW_START_EARLY_PCT: 1 }, 'nutritionist').thresholds;
  assert.equal(flag(feed('nutritionist', slow(30, 1.2), t), 'slow_start'), null);
});
test('on a GLP-1 the slow start is under 5% by week 12', () => {
  assert.equal(flag(feed('nutritionist', slow(30, 1, { glp1: true })), 'slow_start'), null, 'week 4 on a GLP-1');
  assert.equal(flag(feed('nutritionist', slow(90, 4, { glp1: true })), 'slow_start').reason, 'Down 4% after 12 weeks on a GLP-1');
  assert.equal(flag(feed('nutritionist', slow(90, 6, { glp1: true })), 'slow_start'), null, '6% by week 12');
  assert.equal(flag(feed('nutritionist', slow(115, 3, { glp1: true })), 'slow_start'), null, 'week 16');
});
test('one weight goal, one line: a slow start takes the place of that goal\'s slip', () => {
  // Nadia's plateau from before PR 2 (a clean month of loss, then flat): 2.9% by week 10 and a slip.
  const pts = [[56, 178], [49, 177], [42, 176], [35, 175], [28, 174], [21, 173.2], [14, 172.9], [7, 172.8], [1, 172.8]];
  const rec = base({ goals: [{ id: 'g-weight', label: 'Goal weight', metric: 'weight', unit: 'lb', target: 165, start: 178, startedOn: day(70), setBy: 'nutritionist', history: pts.map(([d, v]) => ({ on: day(d), value: v })) }] });
  const n = feed('nutritionist', rec);
  assert.deepEqual(keys(n), ['slow_start']);
  assert.equal(n.severity, 'amber', 'one area, not two');
  // Without the slow start, the slip still speaks.
  const later = { ...rec, goals: [{ ...rec.goals[0], start: 178.6 }] };
  assert.deepEqual(keys(feed('nutritionist', later)), ['goal_slip']);
});

// ── The gain bands ─────────────────────────────────────────────────────────────
const gain = (pts, over = {}) => base({ ...goal({ start: 60, target: 68, from: 30, pts }), ...over });
test('the gain bands: over 0.5% a week, or not gaining, for both coaches', () => {
  const fastGain = gain([[30, 60], [20, 60.6], [13, 61.1], [6, 61.6], [0, 62.1]]);
  for (const role of ['trainer', 'nutritionist']) {
    const r = feed(role, fastGain);
    assert.match(flag(r, 'gain_fast').reason, /^Gaining 0\.\d% of body weight a week over the last 2 weeks$/, role);
    assert.equal(r.severity, 'amber', role + ' owns it');
  }
  const flat = feed('nutritionist', gain([[30, 60], [20, 60.4], [13, 60.4], [6, 60.3], [0, 60.3]]));
  assert.equal(flag(flat, 'gain_stalled').reason, 'No gain over the last 2 weeks on a weight-gain goal');
  assert.deepEqual(keys(feed('nutritionist', gain([[30, 60], [20, 60.3], [13, 60.5], [6, 60.7], [0, 60.9]]))), [], 'about 0.3% a week');
  assert.deepEqual(keys(feed('nutritionist', base(goal({ start: 60, target: 68, from: 10, pts: [[30, 60], [20, 60.6], [13, 61.1], [6, 61.6], [0, 62.1]] })))), [], 'week 2');
  const t = DS.resolveThresholds({ GAIN_FAST_PCT: 1 }, 'trainer').thresholds;
  assert.equal(flag(feed('trainer', fastGain, t), 'gain_fast'), null, 'a 1% line');
});

// ── GLP-1 context ──────────────────────────────────────────────────────────────
test('on a GLP-1: 14% or more in 3 to 4 months, and protein under 1.2 g per kg, show as context', () => {
  const big = base({ glp1: true, ...goal({ start: 100, target: 75, from: 130, pts: [[130, 100], [100, 98], [60, 91], [30, 86], [10, 84], [3, 83.5]] }) });
  const n = feed('nutritionist', big);
  assert.equal(flag(n, 'glp1_total').reason, 'Down 15% in about 3 months on a GLP-1: worth checking protein and strength work');
  assert.equal(n.severity, DS.getTriageFeed('nutritionist', [{ ...big, glp1: false }], NOW)[0].severity, 'context never colours the row');
  assert.equal(flag(feed('nutritionist', { ...big, glp1: false }), 'glp1_total'), null, 'not on one');
  const under = base({ glp1: true, ...goal({ start: 100, target: 75, from: 130, pts: [[130, 100], [100, 98], [60, 92], [30, 88], [10, 86], [3, 85]] }) });
  assert.equal(flag(feed('nutritionist', under), 'glp1_total'), null, '13.3%');
  // Protein 70 g at 83.5 kg is 0.8 g per kg, over enough logged days.
  const low = { ...big, nutrition: { avgProtein: 70, targetProtein: 90, avgCalories: 1600, targetCalories: 1700 }, foodLogs: { lastLoggedOn: day(0), daysLogged7d: 5 } };
  assert.equal(flag(feed('nutritionist', low), 'glp1_protein').reason, 'Protein averaging 0.8 g per kg a day, under the 1.2 to 1.6 often advised on a GLP-1');
  const enough = { ...low, nutrition: { ...low.nutrition, avgProtein: 110 } };
  assert.equal(flag(feed('nutritionist', enough), 'glp1_protein'), null, '1.3 g per kg');
  assert.equal(flag(feed('nutritionist', { ...low, foodLogs: { lastLoggedOn: day(0), daysLogged7d: 2 } }), 'glp1_protein'), null, 'two logged days');
});

// ── The record, the push, Settings ────────────────────────────────────────────
test('the record reads the GLP-1 answer from the health profile, and the push keeps it', () => {
  assert.equal(DS.recordFromOverview({ id: 'c1' }, { healthProfile: { glp1: 'yes' } }).glp1, true);
  assert.equal(DS.recordFromOverview({ id: 'c1' }, { healthProfile: { glp1: 'no' } }).glp1, false);
  assert.ok(!('glp1' in DS.recordFromOverview({ id: 'c1' }, { healthProfile: { rxMeds: 'no' } })), 'unanswered is unknown');
  assert.ok(!('glp1' in DS.recordFromOverview({ id: 'c1' }, {})));
  assert.equal(DS.engineSnapshot({ profile: { id: 'c1' }, glp1: true }).glp1, true);
});
test('Settings: the weight rows on the nutritionist\'s Plans & progress, the gain pace on both', () => {
  const n = DS.tunablesFor('nutritionist').map((r) => r.key), t = DS.tunablesFor('trainer').map((r) => r.key);
  for (const k of ['LOSS_FAST_PCT', 'LOSS_SAFETY_KG', 'LOSS_SAFETY_WEEKS', 'WEIGHIN_GAP_DAYS', 'SLOW_START_EARLY_PCT', 'SLOW_START_LATE_PCT', 'GAIN_FAST_PCT']) {
    assert.ok(n.includes(k) && t.includes(k), k + ' moves both views (the trainer sees the weight alerts as context)');
    assert.doesNotMatch(k, /\d/, k);
  }
  const house = Object.fromEntries(DS.tunablesFor('nutritionist').map((r) => [r.key, r.house]));
  assert.deepEqual([house.LOSS_FAST_PCT, house.LOSS_SAFETY_KG, house.LOSS_SAFETY_WEEKS, house.WEIGHIN_GAP_DAYS, house.SLOW_START_EARLY_PCT, house.SLOW_START_LATE_PCT, house.GAIN_FAST_PCT], [1, 1, 2, 14, 2, 3, 0.5]);
});
test('the demo: Priya loses fast, the nutritionist\'s amber and the trainer\'s context', () => {
  const clients = DS.buildMockClients(NOW);
  const n = DS.getTriageFeed('nutritionist', clients, NOW).find((r) => r.client.profile.name === 'Priya S.');
  assert.deepEqual(keys(n), ['protein_under', 'weight_fast']);
  assert.equal(n.severity, 'amber');
  const t = DS.getTriageFeed('trainer', clients, NOW).find((r) => r.client.profile.name === 'Priya S.');
  assert.equal(t.severity, 'green');
});
test('every draft for a weight alert says what to do, never a weight, a percentage or a target', () => {
  for (const k of ['weight_unsafe', 'weight_fast', 'weighin_gap', 'slow_start', 'gain_fast', 'gain_stalled', 'glp1_total', 'glp1_protein']) {
    for (const role of ['trainer', 'nutritionist']) {
      const a = DS.coachActionFor(k, role, fast(), null);
      assert.ok(a, k);
      if (a.draft) assert.doesNotMatch(a.draft, /\d|%|kg|lb|target/i, k + ' ' + role);
    }
  }
});

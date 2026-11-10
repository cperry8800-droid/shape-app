// Coach triage discipline classification + routing: each signal is tagged by
// discipline and routed to the owning pro; the other pro sees it READ-ONLY. A
// single pro owns everything. Severity ordering is unchanged (read-only context
// never escalates the viewer). node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getTriageFeed, flagDiscipline, disciplineOwner } = require('../public/newdesign/dashSignals.js');

const NOW = new Date('2026-06-16T12:00:00');

function row(role, client) {
  return getTriageFeed(role, [client], NOW)[0];
}

test('PREVIEW: protein well under target routes to the dietitian; the trainer sees it READ-ONLY', () => {
  const c = {
    profile: { name: 'Priya S.' },
    nutrition: { avgProtein: 118, targetProtein: 175, avgCalories: 1900, targetCalories: 2000 },
    // The week's days the averages are over (NUTRITION_MIN_DAYS, 2026-11-10).
    foodLogs: { lastLoggedOn: '2026-06-15', daysLogged7d: 5 },
    pros: { trainer: true, nutritionist: true },
  };
  // Nutritionist OWNS it — actionable, with the plain-language reason, and it
  // counts toward her severity (amber).
  const nut = row('nutritionist', c);
  const nutProtein = nut.flags.find((f) => f.key === 'protein_under');
  assert.ok(nutProtein, 'nutritionist sees the protein flag in her actionable feed');
  assert.equal(nutProtein.discipline, 'nutrition');
  assert.equal(nutProtein.owned, true);
  assert.equal(nutProtein.routeTo, 'nutritionist');
  assert.match(nutProtein.reason, /118g protein vs a 175g target/);
  assert.equal(nut.severity, 'amber');

  // Trainer sees the SAME flag READ-ONLY (routed to the dietitian), and it does
  // NOT escalate his severity.
  const tr = row('trainer', c);
  assert.equal(tr.flags.find((f) => f.key === 'protein_under'), undefined, "not in the trainer's actionable flags");
  const trProtein = tr.readOnly.find((f) => f.key === 'protein_under');
  assert.ok(trProtein, 'trainer sees it as read-only context');
  assert.equal(trProtein.owned, false);
  assert.equal(trProtein.routeTo, 'nutritionist');
  assert.equal(trProtein.reason, nutProtein.reason, 'same plain-language reason');
  assert.equal(tr.severity, 'green', "trainer severity unchanged — read-only doesn't escalate");
});

test('a trainer\'s signal (a wearable\'s low recovery) routes to the trainer; the nutritionist sees it READ-ONLY', () => {
  // (A broken streak was this case until 2026-11-10; it is no coach's flag now.)
  const c = { profile: { name: 'Marcus T.' }, recovery: { recoveryScore: { avg7: 20, n: 5 } }, pros: { trainer: true, nutritionist: true } };
  const tr = row('trainer', c).flags.find((f) => f.key === 'recovery_low');
  assert.equal(tr.discipline, 'recovery');
  assert.equal(tr.owned, true);
  assert.equal(tr.routeTo, 'trainer');
  const nut = row('nutritionist', c).flags.find((f) => f.key === 'recovery_low');
  assert.ok(nut, 'nutritionist sees the recovery flag');
  assert.equal(nut.owned, false, 'but read-only — it routes to the trainer');
  assert.equal(nut.routeTo, 'trainer');
  // …and a food-log gap is the nutritionist's: the trainer sees it read-only.
  const gap = { profile: { name: 'Sam' }, foodLogs: { lastLoggedOn: '2026-06-09', daysLogged7d: 1 }, pros: { trainer: true, nutritionist: true } };
  assert.equal(row('trainer', gap).flags.find((f) => f.key === 'food_gap').routeTo, 'nutritionist');
  assert.equal(row('trainer', gap).flags.find((f) => f.key === 'food_gap').owned, false);
  assert.equal(row('nutritionist', gap).flags.find((f) => f.key === 'food_gap').owned, true);
});

test('general signals (check-in, contact, sessions, score) are owned by whoever is viewing', () => {
  const c = { profile: { name: 'Sam R.' }, checkIn: { lastWeekOf: '2026-05-25' }, pros: { trainer: true, nutritionist: true } };
  for (const role of ['trainer', 'nutritionist']) {
    const ci = row(role, c).flags.find((f) => f.key === 'checkin_overdue');
    assert.ok(ci, `${role} sees the check-in flag`);
    assert.equal(ci.discipline, 'general');
    assert.equal(ci.owned, true);
    assert.equal(ci.routeTo, null);
  }
});

test('one pro → everything routes to them (the nutrition flag is OWNED by a solo trainer)', () => {
  const c = {
    profile: { name: 'Jamie' },
    nutrition: { avgProtein: 110, targetProtein: 175 },
    foodLogs: { lastLoggedOn: '2026-06-15', daysLogged7d: 5 },
    pros: { trainer: true, nutritionist: false }, // solo trainer
  };
  // ⚠ P2: OWNED MEANS IT IS THEIRS TO ACT ON — so it is one of their flags, counted and alerted, not
  // routed context. As read-only context it was labelled owned and still never reached the trainer.
  const r = row('trainer', c);
  const own = r.flags.find((f) => f.key === 'protein_under');
  assert.ok(own, 'the solo trainer still sees the nutrition signal');
  assert.equal(own.owned, true, 'and OWNS it — no other pro to route to');
  assert.equal(r.readOnly.some((f) => f.key === 'protein_under'), false, 'not shown twice');
  assert.equal(r.severity, 'amber', 'and it counts');
});

test('severity ordering is unchanged — the sort + thresholds still hold', () => {
  const quiet = { trainer: '2026-06-07' }; // 9 days
  const clients = [
    { profile: { name: 'Red' }, lastContact: quiet, bookedSessions: { trainer: { done: 4, planned: 9 } }, pros: { trainer: true } }, // two areas → red
    { profile: { name: 'Amber' }, lastContact: quiet, pros: { trainer: true } }, // 1 flag → amber
    { profile: { name: 'Green' }, streaks: { current: 0, best: 9 }, pros: { trainer: true } }, // a broken streak is no coach's flag → green
  ];
  const feed = getTriageFeed('trainer', clients, NOW);
  assert.deepEqual(feed.map((r) => r.severity), ['red', 'amber', 'green']);
});

test('classifier exports map keys to disciplines + owners', () => {
  assert.equal(flagDiscipline('protein_under'), 'nutrition');
  assert.equal(flagDiscipline('streak_broken'), 'training');
  assert.equal(flagDiscipline('checkin_overdue'), 'general');
  assert.equal(disciplineOwner('nutrition'), 'nutritionist');
  assert.equal(disciplineOwner('training'), 'trainer');
  assert.equal(disciplineOwner('general'), null);
});

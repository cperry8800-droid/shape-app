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

test('a training signal (streak broken) routes to the trainer; the nutritionist sees it READ-ONLY', () => {
  const c = { profile: { name: 'Marcus T.' }, streaks: { current: 0, best: 8 }, pros: { trainer: true, nutritionist: true } };
  const tr = row('trainer', c).flags.find((f) => f.key === 'streak_broken');
  assert.equal(tr.discipline, 'training');
  assert.equal(tr.owned, true);
  assert.equal(tr.routeTo, 'trainer');
  const nut = row('nutritionist', c).flags.find((f) => f.key === 'streak_broken');
  assert.ok(nut, 'nutritionist sees the streak flag');
  assert.equal(nut.owned, false, 'but read-only — it routes to the trainer');
  assert.equal(nut.routeTo, 'trainer');
});

test('general signals (check-in, contact, goal, score, food-logging) are owned by whoever is viewing', () => {
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
    pros: { trainer: true, nutritionist: false }, // solo trainer
  };
  const ro = row('trainer', c).readOnly.find((f) => f.key === 'protein_under');
  assert.ok(ro, 'the solo trainer still sees the nutrition signal');
  assert.equal(ro.owned, true, 'and OWNS it — no other pro to route to');
});

test('severity ordering is unchanged — the sort + thresholds still hold', () => {
  const clients = [
    { profile: { name: 'Red' }, streaks: { current: 0, best: 8 }, foodLogs: { lastLoggedOn: '2026-06-10', daysLogged7d: 0 }, pros: { trainer: true } }, // 2 flags → red
    { profile: { name: 'Amber' }, streaks: { current: 0, best: 8 }, pros: { trainer: true } }, // 1 flag → amber
    { profile: { name: 'Green' }, streaks: { current: 6, best: 9 }, pros: { trainer: true } }, // 0 → green
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

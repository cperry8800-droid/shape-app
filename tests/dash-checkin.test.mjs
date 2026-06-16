// AI check-in drafting: buildEvidencePack + buildCheckinDraft must ground every
// draft in REAL cross-discipline signals (cite a training AND a nutrition signal
// when both are present), and OMIT a missing signal rather than invent it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildEvidencePack, buildCheckinDraft } = require('../public/newdesign/dashSignals.js');

const NOW = new Date('2026-06-16T12:00:00');

const crossRecord = {
  profile: { name: 'Marcus Tan' },
  trainingAdherence: { done: 4, planned: 5, pct: 80 },
  streaks: { current: 6, best: 9 },
  nutrition: { avgCalories: 2150, targetCalories: 2000, avgProtein: 150, targetProtein: 175 },
  foodLogs: { daysLogged7d: 3 },
  weighIns: [{ on: '2026-04-21', weight: 184, unit: 'lb' }, { on: '2026-06-15', weight: 181, unit: 'lb' }],
};

test('evidence pack carries both disciplines, with real values only', () => {
  const pack = buildEvidencePack(crossRecord, 'trainer', NOW);
  assert.equal(pack.hasTraining, true);
  assert.equal(pack.hasNutrition, true);
  const labels = pack.signals.map((s) => s.label);
  assert.ok(labels.includes('Sessions'));
  assert.ok(labels.includes('Avg calories') || labels.includes('Days logged'));
  // every value is a concrete string from the record — nothing invented
  for (const s of pack.signals) assert.ok(typeof s.value === 'string' && s.value.length);
});

test("trainer's draft cites a real TRAINING and a real NUTRITION signal (cross-discipline)", () => {
  const d = buildCheckinDraft(crossRecord, 'trainer', NOW);
  assert.match(d.text, /Marcus/);
  assert.match(d.text, /4\/5 sessions/);           // real training signal
  assert.match(d.text, /3 days|2150|150g/);        // real nutrition signal (the OTHER discipline)
  assert.ok(d.cited.length >= 2);
  const domains = d.cited.map((c) => c.label);
  assert.ok(domains.includes('Sessions'));
  // ends with an open question — it's a conversation starter, not a broadcast
  assert.match(d.text, /\?$/);
});

test("nutritionist's draft leads with nutrition but still cites training (the other side)", () => {
  const d = buildCheckinDraft(crossRecord, 'nutritionist', NOW);
  // nutrition clause appears before the training clause
  const idxNut = d.text.search(/3 days|2150 kcal|150g/);
  const idxTrain = d.text.search(/4\/5 sessions|6-day streak/);
  assert.ok(idxNut > -1 && idxTrain > -1 && idxNut < idxTrain, 'nutrition leads, training follows');
});

test('OMITS a missing discipline — no invented numbers when nutrition is absent', () => {
  const trainingOnly = {
    profile: { name: 'Jamie' },
    trainingAdherence: { done: 5, planned: 5, pct: 100 },
  };
  const pack = buildEvidencePack(trainingOnly, 'trainer', NOW);
  assert.equal(pack.hasNutrition, false);
  const d = buildCheckinDraft(trainingOnly, 'trainer', NOW);
  assert.match(d.text, /5\/5 sessions/);
  assert.doesNotMatch(d.text, /kcal|protein|logged food/); // nothing fabricated for nutrition
  assert.ok(d.cited.every((c) => c.label !== 'Avg calories'));
});

test('an empty record yields an honest generic check-in with NO numbers', () => {
  const d = buildCheckinDraft({ profile: { name: 'New' } }, 'trainer', NOW);
  assert.equal(d.cited.length, 0);
  assert.doesNotMatch(d.text, /\d/); // not a single fabricated figure
  assert.match(d.text, /checking in/i);
});

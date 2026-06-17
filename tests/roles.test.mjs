// Dietitian (RD/RDN) as a first-class NUTRITION-discipline provider: the role
// model + the engine treat a dietitian exactly like a nutritionist (same
// discipline, surfaces, write path), and the shared trainer+nutrition record
// routes cross-discipline data read-only. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const engine = require('../public/newdesign/dashSignals.js');
import {
  COACH_ROLES, NUTRITION_ROLES, disciplineForRole, isCoachRole, isNutritionRole,
  isTrainingRole, providerRoleForRole, ownsDiscipline, roleLabel, nutritionRoleForCredential,
} from '../src/lib/roles.mjs';

const NOW = new Date('2026-06-16T12:00:00');
const row = (role, client) => engine.getTriageFeed(role, [client], NOW)[0];

// ── the role model ───────────────────────────────────────────────────────────
test('dietitian + nutritionist are the nutrition discipline; trainer is training', () => {
  assert.equal(disciplineForRole('trainer'), 'training');
  assert.equal(disciplineForRole('nutritionist'), 'nutrition');
  assert.equal(disciplineForRole('dietitian'), 'nutrition');   // RD/RDN === nutrition owner
  assert.equal(disciplineForRole('client'), 'general');
  assert.deepEqual(NUTRITION_ROLES, ['nutritionist', 'dietitian']);
  assert.ok(COACH_ROLES.includes('dietitian'));
});

test('coach / nutrition / training role predicates include the dietitian', () => {
  assert.equal(isCoachRole('dietitian'), true);
  assert.equal(isNutritionRole('dietitian'), true);
  assert.equal(isNutritionRole('nutritionist'), true);
  assert.equal(isTrainingRole('dietitian'), false);
  assert.equal(isCoachRole('client'), false);
});

test('a dietitian rides the nutritionist provider rails (no constraint churn)', () => {
  assert.equal(providerRoleForRole('dietitian'), 'nutritionist'); // subscriptions/RLS/meal-plan
  assert.equal(providerRoleForRole('nutritionist'), 'nutritionist');
  assert.equal(providerRoleForRole('trainer'), 'trainer');
});

test('writes are scoped to your own discipline; reads cross over', () => {
  assert.equal(ownsDiscipline('dietitian', 'nutrition'), true);
  assert.equal(ownsDiscipline('dietitian', 'training'), false);  // trainer's to write
  assert.equal(ownsDiscipline('trainer', 'nutrition'), false);   // dietitian's to write
  assert.equal(ownsDiscipline('trainer', 'general'), true);
});

test('label distinguishes RD/RDN; credential maps to the display role', () => {
  assert.equal(roleLabel('dietitian'), 'Dietitian (RD/RDN)');
  assert.equal(roleLabel('nutritionist'), 'Nutritionist');
  assert.equal(nutritionRoleForCredential('rd'), 'dietitian');
  assert.equal(nutritionRoleForCredential('rdn'), 'dietitian');
  assert.equal(nutritionRoleForCredential(null), 'nutritionist');
});

// ── the engine MUST agree with the role model (single source of truth) ───────
test('the engine mirrors disciplineForRole verbatim (no drift)', () => {
  for (const r of ['trainer', 'nutritionist', 'dietitian', 'client', 'admin', '']) {
    assert.equal(engine.disciplineForRole(r), disciplineForRole(r), `engine disagrees on "${r}"`);
  }
});

// ── PREVIEW: a client with BOTH a trainer and a dietitian ────────────────────
test('PREVIEW: dietitian OWNS nutrition; the trainer sees the dietitian’s nutrition READ-ONLY', () => {
  // The nutrition pro on this client is a DIETITIAN (pros keyed by the canonical
  // nutrition-owner role). Protein well under target = a nutrition signal.
  const c = {
    profile: { name: 'Priya S.' },
    nutrition: { avgProtein: 118, targetProtein: 175, avgCalories: 1900, targetCalories: 2000 },
    streaks: { current: 0, best: 8 }, // a training signal too
    pros: { trainer: true, nutritionist: true },
  };

  // The DIETITIAN owns the nutrition flag (actionable), exactly like a nutritionist.
  const die = row('dietitian', c);
  const dieProtein = die.flags.find((f) => f.key === 'protein_under');
  assert.ok(dieProtein, 'dietitian sees the protein flag in their actionable feed');
  assert.equal(dieProtein.discipline, 'nutrition');
  assert.equal(dieProtein.owned, true);
  assert.equal(dieProtein.routeTo, 'nutritionist');
  // …and sees the TRAINING signal READ-ONLY (routes to the trainer).
  const dieStreak = die.flags.find((f) => f.key === 'streak_broken');
  assert.equal(dieStreak.owned, false);
  assert.equal(dieStreak.routeTo, 'trainer');

  // The TRAINER owns training and sees the dietitian's nutrition READ-ONLY.
  const tr = row('trainer', c);
  assert.equal(tr.flags.find((f) => f.key === 'streak_broken').owned, true);
  assert.equal(tr.flags.find((f) => f.key === 'protein_under'), undefined, 'not actionable for the trainer');
  const trProtein = tr.readOnly.find((f) => f.key === 'protein_under');
  assert.ok(trProtein, 'the trainer sees the dietitian’s nutrition change as read-only context');
  assert.equal(trProtein.owned, false);
  assert.equal(trProtein.routeTo, 'nutritionist');
  assert.equal(trProtein.reason, dieProtein.reason, 'same plain-language reason both ways');
});

test('a dietitian and a nutritionist route IDENTICALLY (same discipline)', () => {
  const c = { profile: { name: 'X' }, nutrition: { avgProtein: 100, targetProtein: 175 }, pros: { trainer: true, nutritionist: true } };
  const die = row('dietitian', c).flags.find((f) => f.key === 'protein_under');
  const nut = row('nutritionist', c).flags.find((f) => f.key === 'protein_under');
  assert.deepEqual({ owned: die.owned, routeTo: die.routeTo, discipline: die.discipline },
                   { owned: nut.owned, routeTo: nut.routeTo, discipline: nut.discipline });
});

test('the directive engine treats a dietitian as the nutrition owner', () => {
  const c = { profile: { name: 'Priya' }, nutrition: { avgProtein: 100, targetProtein: 175 }, pros: { trainer: true, nutritionist: true } };
  // buildDirective runs without error for the dietitian role and yields a directive.
  const d = engine.buildDirective(c, NOW, 'dietitian');
  assert.ok(d && typeof d.verdict === 'string');
});

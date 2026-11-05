// P6 (2026-11-05): "One draft core for the app". The app's ＋ New composer used /api/ai/generate-plan's
// text outlines; it now asks the cores the website and Nora use: /api/ai/draft-workout for a trainer's
// workout, program or plan (real builder rows), and /api/ai/draft-meal-plan for a nutritionist's meal plan
// (Shape Kitchen, training and rest days), saved unpublished and opened in the meal-plan editor.
// generate-plan stays for the nutritionist's programs and diets, and anything else that calls it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const PROS = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
const BACKEND = read('mobile-app/src/services/shapeBackend.js');
const trainer = PROS.slice(PROS.indexOf('// ── AI draft sheet (workout builder) ──'), PROS.indexOf("right={tr('coach:plans.footerAiWorkout'"));
const nutri = PROS.slice(PROS.indexOf('// ── AI draft sheet (meal-plan builder) ──'), PROS.indexOf("right={tr('coach:diet.footerAiMealPlan'"));

test('the app service posts to the two drafting routes with the session\'s Bearer, bounded, and says why it could not', () => {
  assert.match(BACKEND, /const draftWorkout = \(input\) => postDraft\('\/api\/ai\/draft-workout', input\);/);
  assert.match(BACKEND, /const draftMealPlan = \(input\) => postDraft\('\/api\/ai\/draft-meal-plan', input\);/);
  assert.match(BACKEND, /window\.ShapeAI = \{\n\s*generatePlanDraft,\n\s*draftWorkout,\n\s*draftMealPlan,\n\};/);
  const post = BACKEND.slice(BACKEND.indexOf('async function postDraft('), BACKEND.indexOf('const draftWorkout ='));
  assert.match(post, /headers: sessionsAuthHeaders\(\{ 'Content-Type': 'application\/json' \}\)/, 'Bearer: the installed app sends no cookie');
  assert.match(post, /GENERATE_TIMEOUT_MS/, 'the same deadline the old generator call kept');
  assert.match(post, /return \{ ok: false, status: response\.status, code: \(payload && payload\.code\) \|\| '', error: \(payload && payload\.error\) \|\| '' \};/);
});

test('the trainer\'s composer drafts with the website\'s core and opens its rows in the editor', () => {
  assert.match(trainer, /window\.ShapeAI\?\.draftWorkout\?\.\(\{ request: \[focus, desc, equip\]\.filter\(Boolean\)\.join\(' · '\), kind, \.\.\.\(buildType === 'program' \? \{ weeks: 1 \} : \{\}\), \.\.\.\(minutes > 0 \? \{ minutes \} : \{\}\), equipment: equip, level: exp \}\)/);
  assert.match(trainer, /const kind = buildType === 'workout' \? 'day' : 'program';/);
  assert.doesNotMatch(trainer, /generatePlanDraft/, 'not the text outline any more');
  assert.match(trainer, /setEditDraft\(\{ name: res\.data\.draft\.name \|\| `\$\{focus\} \$\{BUILD_LABEL\[buildType\]\}`, builder: res\.data\.draft\.builder, draft: res\.data\.draft\.snapshot \|\| null, note: res\.data\.notes \|\| '' \}\);/);
  // A spent budget or an off-topic brief is said on the composer; it does not fall to a template.
  assert.match(trainer, /if \(res && !res\.ok && \(res\.status === 429 \|\| res\.status === 422\)\) \{/);
  assert.match(trainer, /tr\('coach:plans\.draftLimit'/);
  assert.match(trainer, /tr\('coach:plans\.draftOffTopic'/);
  // The editor opens the rows (and keeps her draft in the detail it saves).
  assert.match(PROS, /builder: editDraft\.builder, \.\.\.\(editDraft\.draft \? \{ draft: editDraft\.draft \} : \{\}\)/);
  assert.match(PROS, /hint=\{draftError \|\| tr\('coach:plans\.editBeforePublish'/);
});

test('the nutritionist\'s meal plan drafts with the Kitchen core, saves unpublished and opens in the meal-plan editor; programs and diets keep generate-plan', () => {
  assert.match(nutri, /if \(!blankMode && buildType === 'mealplan'\) \{/);
  assert.match(nutri, /window\.ShapeAI\?\.draftMealPlan\?\.\(\{ request: \[goal, desc\]\.filter\(Boolean\)\.join\(' · '\), \.\.\.\(phase \? \{ goalPhase: phase \} : \{\}\), kcal: kcalTarget, days: 7, slots, \.\.\.\(diet !== 'Omnivore' \? \{ exclude: \[diet\.toLowerCase\(\)\] \} : \{\}\) \}\)/);
  assert.match(nutri, /window\.ShapeCoachPlans\.create\(\{ kind: 'meal_plan', name: d\.name, meta: `\$\{d\.doc\.days\.length\}-day rotation · \$\{d\.doc\.targets\.kcal\} kcal`, published: false, detail: \{ mealBuilder: d\.doc, draft: d\.snapshot \} \}\)/);
  assert.match(nutri, /rememberRow\(row\);\n\s*setDrafting\(false\);\n\s*setBuilderPlan\(row\);/, 'the BSMealBuilderEditor the website\'s document opens in');
  assert.match(nutri, /\} else if \(!blankMode\) \{\n\s*const mode = bsDraftMode\('nutrition', buildType\);/, 'program and diet: the generator, as before');
  assert.match(nutri, /window\.ShapeAI\?\.generatePlanDraft\?\.\(/);
  assert.match(nutri, /tr\('coach:diet\.draftNothingFits'/);
  assert.match(nutri, /tr\('coach:diet\.draftSaveFailed'/);
});

test('the composer\'s new words are in all 13 catalogs', () => {
  const LOCALES = ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];
  for (const loc of LOCALES) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/coach.json`));
    for (const key of ['plans.draftLimit', 'plans.draftOffTopic', 'diet.draftNothingFits', 'diet.draftSaveFailed']) {
      assert.equal(typeof cat[key], 'string', `${loc} ${key}`);
      assert.ok(cat[key].trim().length > 20, `${loc} ${key}`);
    }
  }
});

test('the orphan /api/program-tools/templates is retired: nothing called it, and the builders save to coach_plans', () => {
  assert.throws(() => read('src/app/api/program-tools/templates/route.ts'));
  assert.doesNotMatch(read('src/lib/warroom.ts'), /\['\/api\/program-tools\/templates'/);
  for (const r of ['/api/ai/draft-meal-plan', '/api/kitchen/foods', '/api/coach/clients/training-days']) assert.match(read('src/lib/warroom.ts'), new RegExp(`\\['${r.replace(/\//g, '\\/')}', '(GET|POST)'\\]`), r);
});

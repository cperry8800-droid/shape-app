// Client-onboarding review, fix 2c: what the coach sees (H8, M17).
//   - One coach-only read (get_client_intake) of the screening, goal, training and diet
//     preferences and the coaching answer, for subscribers AND session clients
//     (2026-10-15-coach-client-intake.sql; probed on a PostgreSQL 16 copy, see the PR).
//   - Both coach views show it, and show a missing screening instead of hiding the card.
//   - A flagged or missing screening goes to Needs you; a read that failed never does.
//   - client_intakes, which nothing read, is retired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const { coachIntakeView, coachingAnswer, screeningState, COACH_INTAKE_ROWS } = await imp('mobile-app/src/services/coachIntake.mjs');
const { recordFromCoachData } = await imp('mobile-app/src/services/signalsMap.mjs');
globalThis.window = globalThis.window || {};
require_(join(ROOT, 'public/newdesign/dashSignals.js'));
const DS = globalThis.window.DashSignals || globalThis.DashSignals || require_(join(ROOT, 'public/newdesign/dashSignals.js'));
const MIGRATION = read('supabase-migrations/2026-10-15-coach-client-intake.sql');

test('the intake rows: Settings labels, the member\'s words, nothing for what they left blank', () => {
  const view = coachIntakeView({
    goal: 'muscle', goalLabel: 'Build muscle', goalShared: true,
    training: { experience: 'advanced', sessions_per_week: '4', injuries: '  left knee  ', equipment: '' },
    nutrition: { dietary_style: 'vegan', allergies: 'peanuts', calorie_range: 'r1800_2000' },
    wantsCoaching: true, coachingFor: ['training'],
  });
  assert.equal(view.goal, 'Build muscle', 'the member\'s own label');
  assert.equal(view.coaching, 'training');
  assert.deepEqual(view.training.map((r) => [r.label, r.value]), [['Experience', 'Advanced'], ['Sessions / week', '4'], ['Injuries & notes', 'left knee']]);
  assert.deepEqual(view.nutrition.map((r) => [r.label, r.value]), [['Dietary style', 'Vegan'], ['Allergies', 'peanuts'], ['Calorie range', '1800–2000']]);
  // A translator: the row labels are the Settings keys every catalog already has.
  const tr = (key, o) => (key.startsWith('settings:') ? `«${key}»` : o.defaultValue);
  const translated = coachIntakeView({ training: { experience: 'beginner' } }, tr);
  assert.equal(translated.training[0].label, '«settings:training.experience»');
  for (const r of COACH_INTAKE_ROWS) assert.match(r.labelKey, /^settings:(training|nutrition)\./);
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/settings.json'));
  for (const r of COACH_INTAKE_ROWS) assert.equal(en[r.labelKey.slice('settings:'.length)], r.en, `${r.labelKey} is the Settings label`);

  const privateGoal = coachIntakeView({ goal: null, goalShared: false, training: {}, nutrition: {} });
  assert.equal(privateGoal.goal, null);
  assert.equal(privateGoal.goalShared, false, 'the coach is told it is private, not that there is none');
  assert.equal(coachIntakeView({ goal: 'fat_loss', training: {}, nutrition: {} }).goal, 'Fat loss', 'no mirror: the token made readable, never fat_loss');
  assert.equal(coachIntakeView(null), null, 'not their coach, or the read failed');
  assert.deepEqual(coachIntakeView({ training: 'junk', nutrition: null }).training, []);
});

test('the coaching answer and the screening state', () => {
  assert.equal(coachingAnswer({}), null, 'not asked');
  assert.equal(coachingAnswer({ wantsCoaching: false, coachingFor: ['training'] }), 'no');
  assert.equal(coachingAnswer({ wantsCoaching: true, coachingFor: ['nutrition'] }), 'nutrition');
  assert.equal(coachingAnswer({ wantsCoaching: true, coachingFor: ['training', 'nutrition'] }), 'both');
  assert.equal(screeningState(null, true), 'unknown', 'a failed read is never "missing"');
  assert.equal(screeningState({ consentAt: 'x', flagged: true }, true), 'unknown');
  assert.equal(screeningState(null, false), 'missing');
  assert.equal(screeningState({ parq: [] }, false), 'missing', 'answers without the confirmation are not a screening');
  assert.equal(screeningState({ consentAt: 'x', flagged: true }, false), 'flagged');
  assert.equal(screeningState({ consentAt: 'x' }, false), 'clear');
});

test('Needs you: a flagged or missing screening flags a coach, never the member, and never on an unknown read (M17)', () => {
  const base = { profile: { id: 'c1', name: 'Jordan' } };
  const flagsFor = (screening, role) => DS.evaluateClient({ ...base, screening }, new Date('2026-10-15T12:00:00Z'), role).flags.map((f) => f.key);
  for (const role of ['trainer', 'nutritionist', 'dietitian']) {
    assert.deepEqual(flagsFor('flagged', role), ['screening_flagged'], role);
    assert.deepEqual(flagsFor('missing', role), ['screening_missing'], role);
    assert.deepEqual(flagsFor('clear', role), [], role);
    assert.deepEqual(flagsFor('unknown', role), [], `${role}: a read that could not tell`);
    assert.deepEqual(flagsFor(undefined, role), [], `${role}: an older record`);
  }
  assert.deepEqual(flagsFor('missing', 'client'), [], 'the member\'s own view is not told to screen themselves');
  assert.equal(DS.flagDiscipline('screening_flagged'), 'general', 'both pros program around it');
  // The directive leads with a health flag over a quiet week, and says to reach out.
  const feed = DS.getTriageFeed('trainer', [{ ...base, screening: 'flagged' }], new Date('2026-10-15T12:00:00Z'));
  assert.equal(feed[0].severity, 'amber');
  assert.equal(feed[0].directive.lever, 'contact');
  assert.match(feed[0].directive.reason, /health screening/);
});

test('the records carry the screening on both sides', () => {
  const dash = read('public/newdesign/dashData.jsx');
  assert.match(dash, /screening: ov && ov\.screening \? ov\.screening : null,/);
  assert.equal(recordFromCoachData({ id: 'c1', screening: 'missing' }).screening, 'missing');
  assert.equal(recordFromCoachData({ id: 'c1', screening: 'nonsense' }).screening, undefined);
  const sig = read('mobile-app/src/services/shapeSignals.js');
  assert.match(sig, /kit\.healthRead \? kit\.healthRead\(c\.id\)\.then\(\(data\) => \(\{ ok: true, data \}\), \(\) => \(\{ ok: false \}\)\) : null,/);
  assert.match(sig, /: screeningState\(null, !\(health && health\.ok\) \|\| !\(intake && intake\.ok && intake\.data\)\);/,
    '"missing" only when the coach-only read says this coach is theirs');
  assert.match(sig, /id: c\.id, name: c\.name, isNew: c\.isNew, joinedAt: c\.joinedAt, stats, lifts, goalsDoc, checkins, screening,/);
});

test('the overview: the intake rows, and "missing" only when the caller is confirmed as their coach', () => {
  const ov = read('src/lib/shared-overview.ts');
  assert.match(ov, /supabase\.rpc\('get_client_intake', \{ p_user_id: clientId \}\),/);
  assert.match(ov, /\{ data: healthProfile, error: healthError \},\n\s+\{ data: intake, error: intakeError \},/);
  assert.match(ov, /screening: healthProfile\n\s+\? screeningState\(healthProfile, false\)\n\s+: screeningState\(null, !!healthError \|\| !!intakeError \|\| !intake\),/);
  assert.match(ov, /intake: intakeError \? null : coachIntakeView\(intake\),/);
});

test('the coach views show who they are, and a missing screening instead of no card', () => {
  const web = read('public/newdesign/coachClientDetail.jsx');
  assert.match(web, /<CKSecHead>WHO THEY ARE · INTAKE<\/CKSecHead>/);
  assert.match(web, /\{!data\.healthProfile && data\.screening === "missing" && \(/);
  assert.match(web, /This client hasn't completed the health screening\./);
  assert.match(web, /\{!data\.healthProfile && data\.screening === "unknown" && data\.intake && \(/, 'a failed read is said, only to their coach');

  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  assert.match(app, /settle\(kit\.healthRead \? kit\.healthRead\(clientUid\) : null\),/);
  assert.match(app, /settle\(kit\.intake \? kit\.intake\(clientUid\) : null\),/);
  assert.match(app, /intake: intake\.ok \? coachIntakeView\(intake\.data, tr\) : null/);
  assert.match(app, /const screening = doc \? screeningState\(doc, false\) : screeningState\(null, !health\.ok \|\| !\(intake\.ok && intake\.data\)\);/,
    'the case file says "not completed" only when the coach-only read confirms this coach is theirs');
  assert.match(app, /\) : cKit\.screening === 'missing' \? \(/);
  assert.match(app, /tr\('coach:case\.intake', \{ defaultValue: 'WHO THEY ARE · INTAKE' \}\)/);
  assert.match(app, /tr\('onboarding:coaching\.optTraining', \{ defaultValue: 'Yes, a trainer' \}\)/, 'the coaching answer in the words the member was asked');

  const keys = ['case.screeningNotCompleted', 'case.screeningAsk', 'case.screeningUnread', 'case.intake', 'case.intakeGoal', 'case.intakeGoalPrivate', 'case.intakeCoaching'];
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/coach.json'));
  for (const k of keys) assert.match(app, new RegExp(`tr\\('coach:${k.replace('.', '\\.')}', \\{ defaultValue: ${JSON.stringify(en[k]).replace(/[.?()]/g, '\\$&').replace(/"/g, "'")} \\}\\)`), `${k}: the default is the English catalog's`);
  for (const loc of ['de', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/coach.json`));
    for (const k of keys) assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}: ${k}`);
  }
});

test('ShapeClientKit.healthRead and .intake throw on a failed read; health keeps its old shape', async () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  const start = be.indexOf('window.ShapeClientKit = {');
  const end = be.indexOf('\n};\n', start) + 3;
  const kitFor = (result) => new Function('window', 'supabase', `${be.slice(start, end)}; return window.ShapeClientKit;`)({}, { rpc: async () => result });
  await assert.rejects(kitFor({ data: null, error: { message: 'down' } }).healthRead('c1'));
  await assert.rejects(kitFor({ data: null, error: { message: 'down' } }).intake('c1'));
  assert.equal(await kitFor({ data: null, error: null }).healthRead('c1'), null);
  assert.equal(await kitFor({ data: {}, error: null }).healthRead('c1'), null, 'an empty document is none on file');
  assert.deepEqual(await kitFor({ data: { consentAt: 'x' }, error: null }).healthRead('c1'), { consentAt: 'x' });
  assert.equal(await kitFor({ data: null, error: { message: 'down' } }).health('c1'), null, 'the old read is unchanged for its callers');
});

test('the migration: who counts as their coach, what the read returns, and who may call it', () => {
  const coach = MIGRATION.slice(MIGRATION.indexOf('create or replace function public.is_coach_with_client'), MIGRATION.indexOf('create or replace function public.get_client_health_profile'));
  assert.match(coach, /public\.is_coach_on_client\(p_client_id\)/, 'a subscriber');
  assert.match(coach, /coalesce\(s\.status, ''\) not in \('cancelled', 'canceled', 'declined'\)/, 'a session that still stands');
  assert.match(coach, /s\.scheduled_at >= now\(\) - interval '90 days'/, 'upcoming or recent, not forever');
  assert.match(coach, /p\.kind = 'booking'\n\s+and p\.status = 'paid'/, 'a paid session purchase, not a program or meal plan');
  assert.match(coach, /t\.owner_id = auth\.uid\(\)/);
  assert.match(coach, /select auth\.uid\(\) is not null and p_client_id is not null and \(/);
  const health = MIGRATION.slice(MIGRATION.indexOf('create or replace function public.get_client_health_profile'), MIGRATION.indexOf('create or replace function public.get_client_intake'));
  assert.match(health, /and public\.is_coach_with_client\(p_user_id\)/, 'session clients\' screening reaches their coach');
  const intake = MIGRATION.slice(MIGRATION.indexOf('create or replace function public.get_client_intake'), MIGRATION.indexOf('revoke all on function public.is_coach_with_client'));
  assert.match(intake, /if not public\.is_coach_with_client\(p_user_id\) then\n\s+return null;/);
  assert.match(intake, /shared := coalesce\(goals->>'share', 'true'\) <> 'false';/, 'the goal follows the member\'s share switch');
  assert.match(intake, /'goal', case when shared then nullif\(goals->>'primaryGoal', ''\) else null end,/);
  for (const col of COACH_INTAKE_ROWS) {
    const list = col.section === 'training' ? 'pick_training' : 'pick_nutrition';
    assert.match(intake, new RegExp(`${list} text\\[\\] := array\\[[^\\]]*'${col.key}'`), `${col.key} is returned`);
  }
  for (const f of ['is_coach_with_client', 'get_client_health_profile', 'get_client_intake']) {
    assert.match(MIGRATION, new RegExp(`revoke all on function public\\.${f}\\(uuid\\) from public, anon;`));
  }
  assert.match(MIGRATION, /if exists \(select 1 from public\.client_intakes\) then\n\s+raise exception/, 'the retirement refuses a table with rows');
  assert.match(MIGRATION, /security definer\nset search_path = public, pg_temp/);
});

test('client_intakes is gone from the app', () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  for (const gone of ['client_intakes', 'getClientIntake', 'saveClientIntake', 'listVisibleClientIntakes', 'clientIntakeToPayload']) {
    assert.ok(!be.includes(gone), `${gone} is gone`);
  }
  assert.doesNotMatch(read('mobile-app/supabase/schema.sql'), /create table if not exists public\.client_intakes/);
});

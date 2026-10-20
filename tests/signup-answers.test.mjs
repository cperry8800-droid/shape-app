// Client-onboarding review, fix 2a: one record of who the member is.
//   - The website sign-up keeps its answers (H4): the goal, experience, weekly sessions and the
//     coaching question, as the app's own tokens, written to the app's records on the first
//     signed-in visit (src/lib/signup-answers.mjs, POST /api/me/onboarding). No health answers.
//   - The app asks "Are you looking for personal coaching?", and only a yes is screened
//     (mobile-app/src/services/firstRun.mjs).
//   - A failed read asks nothing, and a failed save says so (M3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const nextServer = require_('next/server');
const { parse } = require_('@babel/parser');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

const { SIGNUP_GOALS, SIGNUP_GOAL_MAX, signupGoalFromText, COACHING_KINDS, normalizeSignupAnswers, planOnboardingSeed } = await imp('src/lib/signup-answers.mjs');
const { BS_PREF_OPTIONS } = await imp('mobile-app/src/services/prefOptions.mjs');
const { bsFirstRunStage, bsFirstRunNeedsSeed } = await imp('mobile-app/src/services/firstRun.mjs');
const { CHOICES, FORMS } = await imp('src/lib/ai/noraForms.mjs');

const SIGNUP = read('public/newdesign/signup.jsx');
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');

// A module-scope `const NAME = [...]` of plain literals, read as data from a JSX source.
function constArray(src, name) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  for (const node of ast.program.body) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const d of node.declarations) {
      if (d.id.name === name) return new Function(`return ${src.slice(d.init.start, d.init.end)};`)();
    }
  }
  throw new Error(`${name} not found`);
}
// A top-level declaration's source, by name.
function declSource(src, name) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  for (const node of ast.program.body) {
    if (node.type === 'FunctionDeclaration' && node.id.name === name) return src.slice(node.start, node.end);
    if (node.type === 'VariableDeclaration' && node.declarations.some((d) => d.id.name === name)) return src.slice(node.start, node.end);
  }
  throw new Error(`${name} not found`);
}

test('one goal vocabulary: the server, the app and the website form agree', () => {
  assert.deepEqual(SIGNUP_GOALS, constArray(CLIENT, 'BS_PRIMARY_GOALS'), 'the app\'s goal step and Goals page');
  assert.deepEqual(SIGNUP_GOALS, constArray(SIGNUP, 'SU_GOALS'), 'the website form');
  const exp = constArray(SIGNUP, 'SU_EXPERIENCE');
  for (const o of exp) assert.deepEqual(BS_PREF_OPTIONS.experience.find((p) => p.id === o.id), o, `experience ${o.id} is a Settings option`);
  assert.deepEqual(constArray(SIGNUP, 'SU_SESSIONS').map((o) => o.id), BS_PREF_OPTIONS.sessions_per_week.map((o) => o.id), 'weekly sessions are the Settings ids');
  // Nora fills the form with the labels the page shows.
  assert.deepEqual(CHOICES.goal, constArray(SIGNUP, 'SU_GOALS').map((o) => o.en));
  assert.deepEqual(CHOICES.experience, exp.map((o) => o.en));
  assert.deepEqual(CHOICES.frequency, constArray(SIGNUP, 'SU_SESSIONS').map((o) => o.en));
  assert.deepEqual(CHOICES.coaching, constArray(SIGNUP, 'SU_COACHING').map((o) => o.en));
  assert.deepEqual(FORMS.signup.steps.map((s) => s.name), ['Personal', 'Goals', 'Coaching']);
  assert.deepEqual(COACHING_KINDS, ['training', 'nutrition']);
});

test('the website form sends tokens, asks the coaching question, and asks no health questions (H4)', () => {
  const lifted = new Function(
    ['SU_GOALS', 'SU_EXPERIENCE', 'SU_SESSIONS', 'SU_COACHING', 'suTokenOf', 'SU_OWN_GOAL', 'suOnboardingAnswers'].map((n) => declSource(SIGNUP, n)).join('\n') + '\nreturn suOnboardingAnswers;'
  )();
  assert.deepEqual(lifted({ goal: 'Build muscle', experience: 'Advanced', frequency: '4 days a week', coaching: 'Both' }),
    { goal: 'muscle', experience: 'advanced', sessionsPerWeek: '4', wantsCoaching: true, coachingFor: ['training', 'nutrition'] });
  assert.deepEqual(lifted({ coaching: 'A nutritionist' }),
    { goal: null, experience: null, sessionsPerWeek: null, wantsCoaching: true, coachingFor: ['nutrition'] });
  assert.deepEqual(lifted({ coaching: 'Not right now', goal: 'nonsense' }),
    { goal: null, experience: null, sessionsPerWeek: null, wantsCoaching: false, coachingFor: [] });
  assert.equal(lifted({}).wantsCoaching, null);
  // A goal in the member's own words rides as goalText, and only while its chip is the one picked.
  assert.deepEqual(lifted({ goal: 'Your own goal', goalText: '  Run my first 10k ', coaching: 'Not right now' }),
    { goal: null, goalText: 'Run my first 10k', experience: null, sessionsPerWeek: null, wantsCoaching: false, coachingFor: [] });
  assert.equal('goalText' in lifted({ goal: 'Lose fat', goalText: 'Run my first 10k' }), false, 'a listed goal picked after drops the words');
  assert.equal('goalText' in lifted({ goal: 'Your own goal', goalText: '   ' }), false, 'no words, no goal');

  assert.match(SIGNUP, /steps: \["Personal", "Goals", "Coaching"\],/);
  assert.match(SIGNUP, /date_of_birth: values\.dob,\r?\n(?:\s*\/\/.*\r?\n)*\s*onboarding: suOnboardingAnswers\(values\),/, 'the answers ride in the sign-up\'s metadata');
  assert.match(SIGNUP, /if \(!suTokenOf\(SU_COACHING, values\.coaching\)\) \{ setError\("Tell us whether you're looking for personal coaching\."\); return; \}/);
  assert.ok(SIGNUP.indexOf('if (!suTokenOf(SU_COACHING, values.coaching))') < SIGNUP.indexOf('await sb.auth.signUp('), 'required before the account is made');
  assert.match(SIGNUP, /<Field label="Date of birth — Shape is for adults 18 and over" span=\{2\}>/, 'the date of birth moved to the first step');
  for (const gone of ['ClientHealth', 'ClientPrefs', 'set({ injuries:', 'set({ medications:', 'set({ medical:', 'set({ emergency:', 'set({ waiver:', 'set({ budget:', 'set({ accountability:']) {
    assert.ok(!SIGNUP.includes(gone), `${gone} is gone: those answers went nowhere`);
  }
});

test('normalizeSignupAnswers keeps only what is on a list', () => {
  assert.equal(normalizeSignupAnswers(null), null);
  assert.equal(normalizeSignupAnswers([]), null);
  assert.equal(normalizeSignupAnswers({}), null, 'an app sign-up has nothing to keep');
  assert.equal(normalizeSignupAnswers({ goal: 'world_peace', experience: 'god', sessionsPerWeek: '9' }), null);
  assert.deepEqual(normalizeSignupAnswers({ goal: 'race', experience: 'novice', sessionsPerWeek: '3', wantsCoaching: true, coachingFor: ['nutrition', 'astrology', 'training'] }),
    { goal: 'race', experience: 'novice', sessionsPerWeek: '3', wantsCoaching: true, coachingFor: ['training', 'nutrition'] });
  assert.deepEqual(normalizeSignupAnswers({ wantsCoaching: false, coachingFor: ['training'] }),
    { goal: null, experience: null, sessionsPerWeek: null, wantsCoaching: false, coachingFor: [] }, 'a no carries no kind');
  assert.equal(normalizeSignupAnswers({ wantsCoaching: 'yes' }), null, 'only a real boolean');
  assert.equal(normalizeSignupAnswers({ goal: 'fat_loss' }).goal, 'fat_loss');
});

test("a goal in the member's own words: the website tidies it as the app does (owner, 2026-10-20)", () => {
  // The app's own tidy-up, lifted from the client module.
  const app = new Function(['BS_PRIMARY_GOALS', 'bsPrimaryGoalToken', 'BS_PRIMARY_GOAL_MAX', 'bsPrimaryGoalFromText'].map((n) => declSource(CLIENT, n)).join('\n')
    + '\nreturn { max: BS_PRIMARY_GOAL_MAX, tidy: bsPrimaryGoalFromText };')();
  assert.equal(SIGNUP_GOAL_MAX, app.max, "the server keeps as many characters as the app");
  assert.equal(constArray(SIGNUP, 'SU_GOAL_MAX'), SIGNUP_GOAL_MAX, "the website's field stops there too");
  const long = 'Run '.repeat(20);
  const emoji = 'x'.repeat(59) + '\u{1F3C3}\u{1F3C3}';
  for (const text of ['  Run my   first 10k ', 'lose FAT', 'fat_loss', 'FAT_LOSS', 'Get fit!', 'Run\u0007 a\u0000 marathon', long, emoji, '   ', '']) {
    assert.equal(signupGoalFromText(text), app.tidy(text), JSON.stringify(text));
  }
  assert.equal(signupGoalFromText('lose FAT'), 'fat_loss', 'a listed goal typed out is that goal');
  assert.equal(signupGoalFromText('Run\u0007 a\u0000 marathon'), 'Run a marathon', 'no control characters');
  assert.equal(Array.from(signupGoalFromText(emoji)).length, 60, 'cut by code point, never mid-emoji');
  assert.equal(signupGoalFromText(42), '');
  // The answers: the words when no listed goal came; a listed one wins; nothing for blank.
  assert.equal(normalizeSignupAnswers({ goalText: '  Run my first 10k ' }).goal, 'Run my first 10k');
  assert.equal(normalizeSignupAnswers({ goal: 'race', goalText: 'Run my first 10k' }).goal, 'race');
  assert.equal(normalizeSignupAnswers({ goalText: '   ' }), null);
  assert.equal(normalizeSignupAnswers({ goalText: 'Lose fat' }).goal, 'fat_loss');
  // Written to both records as the words themselves, as the app's picker writes them.
  assert.deepEqual(planOnboardingSeed({ goal: 'Run my first 10k', experience: null, sessionsPerWeek: null, wantsCoaching: null, coachingFor: [] }, {}, 'T').slice(0, 2), [
    { kind: 'client_goals', data: { primaryGoal: 'Run my first 10k' } },
    { kind: 'client_identity', data: { goal: 'Run my first 10k' } },
  ]);
  // The form offers it, with a field that stops at the limit.
  assert.match(SIGNUP, /<Chip on=\{v\.goal === SU_OWN_GOAL\} onClick=\{\(\) => set\(\{ goal: SU_OWN_GOAL \}\)\}>\{SU_OWN_GOAL\}<\/Chip>/);
  assert.match(SIGNUP, /\{v\.goal === SU_OWN_GOAL && \(\s*<TextInput autoFocus value=\{v\.goalText \|\| ""\} maxLength=\{SU_GOAL_MAX\}/);
});

test('planOnboardingSeed fills only what is empty, and marks the account seeded last', () => {
  const NOW = '2026-10-14T12:00:00.000Z';
  const answers = { goal: 'muscle', experience: 'advanced', sessionsPerWeek: '4', wantsCoaching: true, coachingFor: ['training'] };
  const fresh = planOnboardingSeed(answers, {}, NOW);
  assert.deepEqual(fresh, [
    { kind: 'client_goals', data: { primaryGoal: 'muscle' } },
    { kind: 'client_identity', data: { goal: 'Build muscle' } },
    { kind: 'client_training_prefs', data: { experience: 'advanced', sessions_per_week: '4' } },
    { kind: 'client_onboarding', data: { seededAt: NOW, intentSeen: true, wantsCoaching: true, coachingFor: ['training'], coachingAt: NOW } },
  ]);
  // A goal set in the app first, and a coaching answer given there, are the member's.
  const kept = planOnboardingSeed(answers, {
    client_goals: { primaryGoal: 'race', weekly: 3 },
    client_identity: { name: 'Sam', goal: 'Run a race' },
    client_training_prefs: { experience: 'beginner' },
    client_onboarding: { intentSeen: true, wantsCoaching: false, tourSeen: true },
  }, NOW);
  assert.deepEqual(kept, [
    { kind: 'client_training_prefs', data: { experience: 'beginner', sessions_per_week: '4' } },
    { kind: 'client_onboarding', data: { intentSeen: true, wantsCoaching: false, tourSeen: true, seededAt: NOW } },
  ]);
  assert.equal(planOnboardingSeed(answers, { client_onboarding: { seededAt: '2026-10-01' } }, NOW), null, 'never twice');
  const noGoal = planOnboardingSeed({ ...answers, goal: null }, {}, NOW);
  assert.equal(noGoal.at(-1).data.intentSeen, undefined, 'without a goal the app still asks it');
});

// The route, against a scripted user_goals.
function goalsTable({ docs = {}, readError = null, writeError = {} } = {}) {
  const writes = [];
  const client = {
    from(table) {
      assert.equal(table, 'user_goals');
      const q = {
        select: () => q, eq: () => q,
        in: (col, kinds) => Promise.resolve(readError ? { data: null, error: readError } : { data: kinds.filter((k) => k in docs).map((k) => ({ kind: k, data: docs[k] })), error: null }),
        upsert: (row, opts) => {
          if (writeError[row.kind]) return Promise.resolve({ error: writeError[row.kind] });
          writes.push({ row, opts });
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return { client, writes };
}
async function runSeed({ user = { id: 'u1', user_metadata: { onboarding: { goal: 'tone', wantsCoaching: false } } }, table = goalsTable() } = {}) {
  const route = await loadRealModule(join(ROOT, 'src/app/api/me/onboarding/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { currentUser: async () => user, clientForRequest: async () => table.client }],
      ['@/lib/signup-answers.mjs', await imp('src/lib/signup-answers.mjs')],
    ]),
  });
  const errLog = console.error; console.error = () => {};
  try {
    const res = await route.POST(new Request('https://shape.test/api/me/onboarding', { method: 'POST' }));
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control'), writes: table.writes };
  } finally { console.error = errLog; }
}

test('POST /api/me/onboarding writes the answers once, as the member, and says when it could not', async () => {
  assert.equal((await runSeed({ user: null })).status, 401);
  const none = await runSeed({ user: { id: 'u1', user_metadata: {} } });
  assert.deepEqual([none.status, none.body, none.writes.length], [200, { seeded: false }, 0], 'an app sign-up: nothing to do');

  const fresh = await runSeed();
  assert.deepEqual(fresh.body, { seeded: true });
  assert.equal(fresh.cache, 'no-store');
  assert.deepEqual(fresh.writes.map((w) => w.row.kind), ['client_goals', 'client_identity', 'client_onboarding'], 'client_onboarding last');
  assert.ok(fresh.writes.every((w) => w.row.user_id === 'u1' && w.opts.onConflict === 'user_id,kind'));
  assert.equal(fresh.writes.at(-1).row.data.wantsCoaching, false);

  const again = await runSeed({ table: goalsTable({ docs: { client_onboarding: { seededAt: 'x' } } }) });
  assert.deepEqual([again.body, again.writes.length], [{ seeded: false }, 0], 'a finished seed is not run twice');

  const unread = await runSeed({ table: goalsTable({ readError: { message: 'down' } }) });
  assert.deepEqual([unread.status, unread.writes.length], [503, 0], 'a failed read writes nothing over what may be there');

  const partial = await runSeed({ table: goalsTable({ writeError: { client_identity: { message: 'down' } } }) });
  assert.equal(partial.status, 503);
  assert.ok(!partial.writes.some((w) => w.row.kind === 'client_onboarding'), 'not marked seeded, so the next visit finishes it');

  const route = read('src/app/api/me/onboarding/route.ts');
  assert.doesNotMatch(route, /createAdminClient|service_role|SERVICE_ROLE/, 'it writes as the member, never as the service role');
  assert.doesNotMatch(read('src/lib/supabase/middleware.ts'), /'\/api\/me'/, 'not behind the membership gate: a website sign-up arrives unpaid');
});

test('the first-run steps: the goal, the coaching question, and the screening only for a yes', () => {
  assert.equal(bsFirstRunStage({}, null), 'intent');
  assert.equal(bsFirstRunStage({ intentSeen: true }, null), 'coaching');
  assert.equal(bsFirstRunStage({ intentSeen: true, wantsCoaching: true }, null), 'health');
  assert.equal(bsFirstRunStage({ intentSeen: true, wantsCoaching: false }, null), 'ok', 'a no is never screened at first run');
  assert.equal(bsFirstRunStage({ intentSeen: true }, { consentAt: '2026-01-01' }), 'ok', 'a completed screening ends the steps');
  assert.equal(bsFirstRunStage({ intentSeen: true, wantsCoaching: true }, { consentAt: '2026-01-01' }), 'ok');
  assert.equal(bsFirstRunStage({ intentSeen: true, wantsCoaching: true }, { parq: [] }), 'health', 'a screening without consent is not complete');
  assert.equal(bsFirstRunStage(null, null), 'intent');
  assert.equal(bsFirstRunNeedsSeed({}), true);
  assert.equal(bsFirstRunNeedsSeed({ seededAt: 'x' }), false);
  assert.equal(bsFirstRunNeedsSeed({ intentSeen: true, wantsCoaching: false }), false, 'nothing left for the website\'s answers to fill');

  // The client app runs the steps by that rule, and a failed read shows none of them (M3).
  const gate = CLIENT.slice(CLIENT.indexOf('const [firstRun, setFirstRun]'), CLIENT.indexOf('const firstRunNext ='));
  assert.match(gate, /if \(doc == null\) throw new Error\('Could not read ' \+ kind\);/);
  assert.match(gate, /if \(bsFirstRunNeedsSeed\(onb\) && \(await window\.ShapeOnboarding\?\.seed\?\.\(\)\)\) onb = await read\('client_onboarding'\);/);
  assert.match(gate, /if \(on\) setFirstRun\(\{ stage: bsFirstRunStage\(onb, health\), onb, health \}\);\n\s+\} catch \(e\) \{ if \(on\) setFirstRun\(\(f\) => \(\{ \.\.\.f, stage: 'ok' \}\)\); \}/);
  assert.match(CLIENT, /if \(firstRun\.stage === 'health'\) \{\n\s+return <BSHealthIntake /, 'the screening is drawn at the health stage only');
  assert.equal((CLIENT.match(/<BSHealthIntake onDone=/g) || []).length, 1, 'and from nowhere else as a gate');
  assert.match(CLIENT, /if \(firstRun\.stage === 'coaching'\) \{\n\s+return <BSCoachingStep onDone=\{\(answer\) => firstRunNext\(\{ \.\.\.firstRun\.onb, \.\.\.answer \}\)\} \/>;/);
  assert.doesNotMatch(CLIENT, /intentGate|healthGate/, 'the old gates, which screened everyone, are gone');
});

test('the coaching step and the goal step save honestly (M3)', () => {
  const coaching = declSource(CLIENT, 'BSCoachingStep');
  assert.match(coaching, /const patch = \{ wantsCoaching: wants, coachingFor: wants \? kinds : \[\], coachingAt: new Date\(\)\.toISOString\(\) \};/);
  assert.match(coaching, /if \(onb != null\) \{\n\s+const res = await window\.shapeDb\.saveUserGoals\('client_onboarding', \{ \.\.\.onb, \.\.\.patch \}\);\n\s+ok = !!\(res && res\.ok === true\);/);
  assert.match(coaching, /if \(ok\) onDone\(patch\);\n\s+else window\.__bsToast\?\.\(tr\('onboarding:firstRun\.saveFailed'/);
  const intent = declSource(CLIENT, 'BSIntentStep');
  assert.match(intent, /const goals = await db\.getUserGoals\('client_goals'\);\n\s+if \(goals == null\) return false;/, 'a failed read never writes { primaryGoal } over the whole document');
  assert.match(intent, /if \(!saved \|\| saved\.ok !== true\) return false;/);
  assert.match(intent, /if \(onb == null\) return false;/);
  assert.match(intent, /if \(ok\) setPicked\(id\);\n\s+else window\.__bsToast\?\.\(tr\('onboarding:firstRun\.saveFailed'/);
  assert.doesNotMatch(intent, /\(await window\.shapeDb\?\.getUserGoals\?\.\('client_goals'\)\) \|\| \{\}/, 'the old `|| {}` turned a failed read into an empty document');
});

// healthProfileGet/Set, lifted from the shipping backend.
function liftHealth(shapeDb) {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const start = src.indexOf('async function healthProfileGet(');
  const end = src.indexOf('window.ShapeHealthProfile = ', start);
  return new Function('window', `${src.slice(start, end)}; return { get: healthProfileGet, set: healthProfileSet };`)({ shapeDb });
}

test('the health profile: a failed read is not "none", and a failed save is not "saved" (M3)', async () => {
  const stored = liftHealth({ getUserGoals: async () => ({ consentAt: 'x' }) });
  assert.deepEqual(await stored.get(), { consentAt: 'x' });
  assert.equal(await liftHealth({ getUserGoals: async () => ({}) }).get(), null, 'nothing stored');
  await assert.rejects(liftHealth({ getUserGoals: async () => null }).get(), /Could not read/, 'a failed read throws');
  assert.equal(await liftHealth({ saveUserGoals: async () => ({ ok: true }) }).set({}), true);
  assert.equal(await liftHealth({ saveUserGoals: async () => ({ error: { message: 'RLS' } }) }).set({}), false, 'saveUserGoals resolves { error }; that is a failure');
  assert.equal(await liftHealth({ saveUserGoals: async () => { throw new Error('x'); } }).set({}), false);
  assert.equal(await liftHealth({}).set({}), false, 'no store, no save');
});

test('the website: the dashboard writes the sign-up answers, and a known minor is told before the membership offer', () => {
  const shell = read('public/newdesign/ClientApp.html');
  assert.match(shell, /fetch\("\/api\/me\/onboarding", \{ method: "POST", credentials: "same-origin", cache: "no-store" \}\)\.catch\(\(\) => \{\}\);/);
  assert.match(shell, /caSeedOnboarding\(membership\);/);
  const age = shell.indexOf('if (membership.signedIn && membership.ageRestricted === true && route !== "settings") return <ClientAgeRestrictedPage />;');
  assert.ok(age > 0, '#2353\'s moved item');
  assert.ok(age < shell.indexOf('return <ClientJoinPage />;'), 'before the join panel');
  const dash = read('public/newdesign/dashClient.jsx');
  assert.match(dash, /function ClientAgeRestrictedPage\(\) \{[\s\S]*?Shape is for adults 18 and over\./);
  assert.match(dash, /Object\.assign\(window, \{ ClientDashboardPage, ClientJoinPage, ClientAgeRestrictedPage,/);
});

test('the coaching step speaks every language the app does', () => {
  const keys = ['firstRun.saveFailed', 'coaching.eyebrow', 'coaching.title', 'coaching.body', 'coaching.optTraining', 'coaching.optNutrition', 'coaching.optBoth', 'coaching.optNo'];
  const en = JSON.parse(read('mobile-app/src/i18n/catalogs/en/onboarding.json'));
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/onboarding.json`));
    for (const k of keys) {
      assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}: ${k}`);
      if (loc !== 'en' && loc !== 'pcm') assert.notEqual(cat[k], en[k], `${loc}: ${k} is translated`);
    }
  }
  for (const k of keys.filter((k) => k.startsWith('coaching.'))) {
    assert.match(CLIENT, new RegExp(`tr\\('onboarding:${k.replace('.', '\\.')}', \\{ defaultValue: ${JSON.stringify(en[k]).replace(/[.?()]/g, '\\$&').replace(/"/g, "'")} \\}\\)`), `${k}: the default is the English catalog's`);
  }
});

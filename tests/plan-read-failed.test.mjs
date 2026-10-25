// A plan read that failed is not "no plan". ShapePlan.get resolves null when /api/client/plan fails,
// and the route sends `read: false` on a part whose table read failed (#2449). Train offered the
// member the Build door and Eat said "No meals planned", and the website said "No program assigned
// yet" and "No meal plan assigned yet". Each now says it could not load and can read again. The
// shared rule is services/planRead.mjs, and the block is BSPlanReadFailed, mounted in jsdom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsPlanPartRead, bsPlanCheckinParts } from '../mobile-app/src/services/planRead.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, from);
  return src.slice(a, b);
}
const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');

test('a part counts as read only when the read answered for it', () => {
  assert.equal(bsPlanPartRead(null, 'training'), false, 'the request failed (ShapePlan.get resolves null)');
  assert.equal(bsPlanPartRead({ ok: false }, 'training'), false);
  assert.equal(bsPlanPartRead({ ok: true, training: { hasPlan: false, read: false } }, 'training'), false, 'the workouts read failed');
  assert.equal(bsPlanPartRead({ ok: true, training: { hasPlan: false, read: true } }, 'training'), true, 'no plan, really');
  assert.equal(bsPlanPartRead({ ok: true, training: { hasPlan: false } }, 'training'), true, 'a server before `read` counts as read');
  assert.equal(bsPlanPartRead({ ok: true, training: { hasPlan: true, read: true }, meals: { read: false } }, 'meals'), false, 'each part on its own');
  assert.equal(bsPlanPartRead({ ok: true }, 'meals'), false, 'a part the answer left out');
  assert.equal(bsPlanPartRead({ training: { hasPlan: true } }, 'training'), true, 'an answer that carries the part');
});

test('the check-in asks adherence for a plan, and for a part the read could not answer', () => {
  const p = (training, meals) => ({ ok: true, training, meals });
  assert.deepEqual(bsPlanCheckinParts(p({ hasPlan: false, read: true }, { hasPlan: true, read: true })), { training: false, nutrition: true });
  assert.deepEqual(bsPlanCheckinParts(p({ hasPlan: false, read: false }, { hasPlan: false, read: true })), { training: true, nutrition: false });
  assert.deepEqual(bsPlanCheckinParts(p({ hasPlan: false, read: false }, { hasPlan: false, read: false })), { training: true, nutrition: true });
  assert.match(client, /window\.ShapePlan\.get\(\)\.then\(\(p\) => \{ if \(on && p\) setPlans\(bsPlanCheckinParts\(p\)\); \}\)/);
  // The website's check-in, the same rule inline.
  assert.match(read('public/newdesign/dashProgress.jsx'), /setPlans\(\{ training: !!\(p\.training && \(p\.training\.hasPlan \|\| p\.training\.read === false\)\), nutrition: !!\(p\.meals && \(p\.meals\.hasPlan \|\| p\.meals\.read === false\)\) \}\)/);
});

test('the route says when its workouts read or its meal plan read failed', () => {
  const route = read('src/app/api/client/plan/route.ts');
  assert.match(route, /const \{ data: cwRows, error: cwErr \} = await supabase\s+\.from\('client_workouts'\)/);
  assert.match(route, /const \{ data: mpRows, error: mpErr \} = await supabase\s+\.from\('client_meal_plans'\)/);
  assert.match(route, /if \(mpErr\) console\.error\('\[client\/plan\] meal plan read failed:', mpErr\.message\);/);
  assert.match(route, /training: \{\s+hasPlan: workouts\.length > 0,[\s\S]{0,320}?read: !cwErr,/);
  assert.match(route, /meals: \{\s+hasPlan: Array\.isArray\(mealDays\) && mealDays\.length > 0,[\s\S]{0,200}?read: !mpErr,/);
});

// Train's loader, run as it ships with stand-ins for its setters and the plan read.
function trainLoader(answer) {
  const body = slice(client, '  const loadPlan = React.useCallback(async () => {', '  React.useEffect(() => { let cancelled = false; (async () => { if (!cancelled) await loadPlan(); })();');
  const state = { workouts: 'before', failed: null, loaded: false, invalidated: 0 };
  const win = { ShapeMetrics: { invalidate: () => { state.invalidated++; } }, ShapePlan: { get: async () => (typeof answer === 'function' ? answer() : answer) } };
  const React = { useCallback: (f) => f };
  const make = new Function('React', 'window', 'bsPlanPartRead', 'useStateBSC', 'setTrainCoaching', 'setLiveWorkouts', 'setLiveTrainCoach', 'setDay', 'bsWeekdayIdx', 'setPlanFailed', 'setPlanLoaded', 'setPlanRetrying',
    body + ';return { loadPlan, retryPlan };');
  const api = make(React, win, bsPlanPartRead, null, () => {}, (w) => { state.workouts = w; }, () => {}, () => {}, () => 0,
    (v) => { state.failed = v; }, (v) => { state.loaded = v; }, () => {});
  return { ...api, state };
}

test('Train: a failed read says it could not load, and keeps a plan an earlier read found', async () => {
  for (const answer of [null, { ok: true, training: { hasPlan: false, read: false, workouts: [] }, meals: { hasPlan: false } }, () => { throw new Error('offline'); }]) {
    const t = trainLoader(answer);
    await t.loadPlan();
    assert.equal(t.state.failed, true);
    assert.equal(t.state.loaded, true);
    assert.equal(t.state.workouts, 'before', 'the workouts are not cleared to "none"');
  }
  const none = trainLoader({ ok: true, training: { hasPlan: false, read: true, workouts: [] } });
  await none.loadPlan();
  assert.equal(none.state.failed, false);
  assert.equal(none.state.workouts, null, 'no plan, really: the Build door');
  const plan = trainLoader({ ok: true, training: { hasPlan: true, read: true, workouts: [{ id: 'w1' }] } });
  await plan.loadPlan();
  assert.deepEqual(plan.state.workouts, [{ id: 'w1' }]);
  assert.equal(plan.state.invalidated, 1, 'each read goes past the cache, so Try again reads again');
  // The page: the failed block comes before the Build door, signed in, once the read answered.
  const page = slice(client, '  // A plan read that failed, with no plan read before it', '  const showBuildDoor = ');
  assert.match(page, /if \(bsTrainSignedIn && planLoaded && planFailed && !liveProgram\) \{/);
  assert.match(page, /<BSPlanReadFailed part="training" onRetry=\{retryPlan\} busy=\{planRetrying\} \/>/);
  assert.doesNotMatch(page, /BSBuildDoor|BSFindCoachBar/, 'no Build door and no marketplace on a failed read');
});

// Eat's loader, the same way.
async function eatLoad(answer, reads = 0) {
  const fx = slice(client, '  React.useEffect(() => {\n    let cancelled = false;\n    (async () => {\n      let read = false;', '  // ⚠ THE BUILT MENU IS DERIVED, NEVER STORED');
  const state = { invalidated: 0 };
  let done;
  const finished = new Promise((r) => { done = r; });
  const win = { ShapeMetrics: { invalidate: () => { state.invalidated++; } }, ShapePlan: { get: async () => answer } };
  const React = { useEffect: (f) => { f(); } };
  const set = (k) => (v) => { state[k] = v; if (k === 'retrying') done(); };
  new Function('React', 'window', 'bsPlanPartRead', 'eatPlanReads', 'setEatCoaching', 'setLiveMealDays', 'setLiveMealCoach', 'setLiveMealTitle', 'setDay', 'bsWeekdayIdx', 'setEatPlanRead', 'setEatPlanFailed', 'setEatPlanRetrying', fx)(
    React, win, bsPlanPartRead, reads, set('coaching'), set('days'), () => {}, () => {}, () => {}, () => 0, set('read'), set('failed'), set('retrying'));
  await finished;
  return state;
}

test('Eat: a failed read says it could not load instead of "No meals planned"', async () => {
  for (const answer of [null, { ok: true, meals: { hasPlan: false, read: false, days: [] } }]) {
    const s = await eatLoad(answer);
    assert.equal(s.read, false, 'so "No meals planned" stays hidden');
    assert.equal(s.failed, true);
    assert.equal(s.days, undefined);
  }
  const none = await eatLoad({ ok: true, meals: { hasPlan: false, read: true, days: [] } });
  assert.equal(none.read, true);
  assert.equal(none.failed, false);
  const plan = await eatLoad({ ok: true, meals: { hasPlan: true, read: true, days: [{ dow: 0 }] } });
  assert.deepEqual(plan.days, [{ dow: 0 }]);
  assert.equal(plan.invalidated, 0, 'the first read uses the shared cache');
  assert.equal((await eatLoad(null, 1)).invalidated, 1, 'Try again reads past it');
  assert.match(client, /\{bsEatSignedIn && eatPlanFailed && !liveMealDays && <BSPlanReadFailed part="meals" busy=\{eatPlanRetrying\} onRetry=\{\(\) => \{ setEatPlanRetrying\(true\); setEatPlanReads\(\(n\) => n \+ 1\); \}\} \/>\}/);
  assert.match(client, /\{effMeals\.length === 0 && \(eatPlanRead \|\| !bsEatSignedIn\) && \(/, '"No meals planned" only once the meals read answered');
  // Tonight's prep: a failed read is unknown, not "nothing owed".
  assert.match(slice(client, 'async function bsLoadPrepTonight() {', '// Names as one phrase'), /if \(!bsPlanPartRead\(plan, 'meals'\)\) return null;\s+if \(!plan\.meals\.hasPlan\) return \[\];/);
});

test('the website: a failed read says so on Workouts and Nutrition, and reads again', () => {
  const train = read('public/newdesign/dashTrain.jsx');
  const dtrPlanFailed = new Function(slice(train, 'function dtrPlanFailed(', 'function ClientWorkoutsPage(') + ';return dtrPlanFailed;')();
  const nutri = read('public/newdesign/dashNutri.jsx');
  const dnuPlanFailed = new Function(slice(nutri, 'function dnuPlanFailed(', 'function ClientNutritionPage(') + ';return dnuPlanFailed;')();
  for (const [f, part] of [[dtrPlanFailed, 'training'], [dnuPlanFailed, 'meals']]) {
    assert.equal(f(null), true);
    assert.equal(f({ ok: true, [part]: { hasPlan: false, read: false } }), true);
    assert.equal(f({ ok: true, [part]: { hasPlan: false, read: true } }), false);
    assert.equal(f({ ok: true, [part]: { hasPlan: false } }), false, 'a server before `read`');
  }
  assert.match(train, /setPlanFailed\(dtrPlanFailed\(pl\)\);/);
  assert.match(train, /\{weeks\.length === 0 && anytime\.length === 0 && live && planFailed && \(\s+<div data-dtr-plan-failed[\s\S]{0,700}?onClick=\{reloadAll\}[^>]*>Try again ↻<\/button>/);
  assert.match(train, /\{weeks\.length === 0 && anytime\.length === 0 && !\(live && planFailed\) && \(/, '"No program assigned yet" only when the read answered');
  assert.match(nutri, /setPlanFailed\(dnuMemberReadFailed\(pl, plRes\.status, signedIn\)\);/);
  assert.match(nutri, /setSource\(dnuSourceOf\(pl, nu, plRes\.status, signedIn\)\);/);
  assert.match(nutri, /\.then\(async \(r\) => \(\{ status: r\.status, body: r\.ok \? await r\.json\(\)\.catch\(\(\) => null\) : null \}\)\)\s+\.catch\(\(\) => \(\{ status: 0, body: null \}\)\);/, 'no network is status 0');
  assert.match(nutri, /\}, \[reloadTick\]\);/);
  assert.match(nutri, /const failedPlate = live && planFailed \? \(\s+<div data-dnu-plan-failed[\s\S]{0,900}?onClick=\{\(\) => setReloadTick\(\(n\) => n \+ 1\)\}[^>]*>Try again ↻<\/button>/);
  assert.match(nutri, /\{ key: "noplan", title: "No meal plan yet", size: "full", render: \(\) => failedPlate \|\| \(/);
});

// Owner, 2026-10-25: "fix the website Nutrition demo menu on a failed read". A member with no coach known
// and nothing logged got the demo menu, under the demo band, when their plan read failed. The gate
// answers 401, 402 or 403 to a caller who isn't a signed-in member, so those keep the preview; any other
// failure is the member's own plan not loading, and the page is live, saying so.
test('website Nutrition: a member\'s failed plan read is live, not the demo menu', () => {
  const nutri = read('public/newdesign/dashNutri.jsx');
  const f = new Function(slice(nutri, 'function dnuSourceOf(', 'function ClientNutritionPage(') + ';return { dnuSourceOf, dnuMemberReadFailed };')();
  const nothingLogged = { ok: true, today: null };
  const noCoach = { ok: true, meals: { hasPlan: false, read: true, coaching: null } };
  const mealsFailed = { ok: true, meals: { hasPlan: false, read: false, coaching: null } };
  // The route answered, so the caller is a member, but its meal plan read failed: live, session or not.
  for (const signedIn of [true, false]) {
    assert.equal(f.dnuMemberReadFailed(mealsFailed, 200, signedIn), true);
    assert.equal(f.dnuSourceOf(mealsFailed, nothingLogged, 200, signedIn), 'live');
  }
  // No answer, with a session: the member's own read failing.
  for (const [status, why] of [[500, 'a server error'], [429, 'rate-limited'], [0, 'no network']]) {
    assert.equal(f.dnuMemberReadFailed(null, status, true), true, why);
    assert.equal(f.dnuSourceOf(null, nothingLogged, status, true), 'live', `${why}: not the demo menu`);
    assert.equal(f.dnuSourceOf(null, null, status, true), 'live', `${why}, the nutrition read failing too`);
    // Without one (Codex P2 on #2453): the rate limiter and a lost connection reach visitors too.
    assert.equal(f.dnuMemberReadFailed(null, status, false), false, `${why}, signed out`);
    assert.equal(f.dnuSourceOf(null, null, status, false), 'demo', `${why}, signed out: the preview`);
  }
  // The gate's refusals keep the preview, session or not.
  for (const status of [401, 402, 403]) {
    for (const signedIn of [true, false]) {
      assert.equal(f.dnuMemberReadFailed(null, status, signedIn), false, String(status));
      assert.equal(f.dnuSourceOf(null, null, status, signedIn), 'demo', String(status));
    }
  }
  // A read that answered is as before: no coach and nothing logged is the preview; a coach is live.
  assert.equal(f.dnuMemberReadFailed(noCoach, 200, true), false);
  assert.equal(f.dnuSourceOf(noCoach, nothingLogged, 200, true), 'demo');
  assert.equal(f.dnuSourceOf({ ok: true, meals: { hasPlan: false, read: true, coaching: { name: 'Maya' } } }, nothingLogged, 200, true), 'live');
  assert.equal(f.dnuSourceOf(null, null), 'demo', 'no status: as before');
  // The page reads whether it is signed in alongside the two reads.
  assert.match(nutri, /const \[plRes, nu, signedIn\] = await Promise\.all\(\[jStatus\("\/api\/client\/plan"\), j\("\/api\/client\/nutrition"\), dnuSignedIn\(\)\]\);/);
});

test('website Nutrition: signed in is the dashboard\'s account reading first, then the Supabase session', async () => {
  const nutri = read('public/newdesign/dashNutri.jsx');
  const make = (win) => new Function('window', slice(nutri, 'function dnuSignedIn(', 'function ClientNutritionPage(') + ';return dnuSignedIn;')(win);
  let asked = 0;
  const shapeDb = (answer) => ({ getSession: () => { asked++; return typeof answer === 'function' ? answer() : Promise.resolve(answer); } });
  // Codex P2 on #2453: the dashboard's cached /api/me reading needs no request, so a 429 can't refuse it.
  assert.equal(await make({ ShapePortalSession: { peek: () => ({ user: { id: 'u1' } }) }, shapeDb: shapeDb(null) })(), true);
  assert.equal(asked, 0, 'no session request when the dashboard already read the account');
  // Without it, the Supabase session decides; one that fails, or none, is signed out.
  assert.equal(await make({ ShapePortalSession: { peek: () => null }, shapeDb: shapeDb({ user: { id: 'u1' } }) })(), true);
  assert.equal(await make({ shapeDb: shapeDb({ user: { id: 'u1' } }) })(), true, 'the standalone page has no portal reading');
  assert.equal(await make({ shapeDb: shapeDb(null) })(), false);
  assert.equal(await make({ shapeDb: shapeDb(() => Promise.reject(new Error('429'))) })(), false);
  assert.equal(await make({})(), false, 'no auth client at all');
});

// The block, mounted with the shipping module.
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');

test('the block: what failed, that a plan is still there, and Try again', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
  const before = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require_('react');
  const ReactDOMClient = require_('react-dom/client');
  const cat = JSON.parse(read('mobile-app/src/i18n/catalogs/en/common.json'));
  dom.window.ShapeI18n = { t: (key, opts = {}) => { const [ns, k] = key.split(':'); const msg = ns === 'common' ? cat[k] : undefined; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); } };
  dom.window.useBS = () => ({ MONO: 'mono', DISPLAY: 'display', INK: '#111', INK70: '#555', padX: 18 });
  const M = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSPlanReadFailed.jsx'), { registry: new Map([['react', React]]) });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  try {
    let retries = 0;
    const render = (props) => React.act(async () => { root.render(React.createElement(M.BSPlanReadFailed, props)); });
    await render({ part: 'training', onRetry: () => { retries++; } });
    assert.equal(host.querySelector('[data-plan-read-failed]').getAttribute('data-plan-read-failed'), 'training');
    assert.equal(host.querySelector('[role="status"]') != null, true);
    assert.match(host.textContent, /Not loaded/);
    assert.match(host.textContent, /Couldn’t load your training/);
    assert.match(host.textContent, /If you have a plan, it’s still there\./);
    const btn = host.querySelector('button');
    assert.match(btn.textContent, /Try again ↻/);
    await React.act(async () => { btn.click(); });
    assert.equal(retries, 1);
    await render({ part: 'meals', onRetry: () => { retries++; }, busy: true });
    assert.match(host.textContent, /Couldn’t load your meal plan/);
    assert.equal(host.querySelector('button').disabled, true, 'one read at a time');
    assert.match(host.querySelector('button').textContent, /Loading…/);
  } finally {
    await React.act(async () => root.unmount());
    host.remove();
    dom.window.close();
    globalThis.window = before.window; globalThis.document = before.document; globalThis.IS_REACT_ACT_ENVIRONMENT = before.act;
  }
});

test('the strings are in all 13 locales and format', () => {
  const keys = ['planRead.eyebrow', 'planRead.training', 'planRead.meals', 'planRead.body', 'planRead.retry', 'planRead.retrying'];
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/common.json`));
    for (const k of keys) {
      assert.equal(typeof cat[k], 'string', `${loc} ${k}`);
      assert.ok(new IntlMessageFormat(cat[k], loc).format({}).length > 0, `${loc} ${k}`);
    }
  }
  // The module asks for exactly these.
  const mod = read('mobile-app/src/broadsheet/BSPlanReadFailed.jsx');
  for (const k of keys) assert.ok(mod.includes(`'common:${k}'`), k);
});

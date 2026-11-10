// The tours and guides (owner, 2026-11-10: tutorials for the coach dashboard and new app accounts,
// "have viewing the tutorial once initially, have the option to go through it again at a later
// date ... make sure user has option to cancel tutorial if they don't want it").
//
// Covers: the coach welcome and guides in public/newdesign/dashTour.js (their size, that every
// dashboard page has its guide, that every anchor they name exists in the dashboard's source, the
// progress merge), the engine in public/newdesign/spotlightTour.js (Skip tour on every step and its
// note, translated labels, steps an account lacks, keys, one tour at a time, the open mark), the
// pure geometry, and the app's tours (the Build door, the Coaches step, the Radio box, Settings →
// Take the tour, the card's words in 13 locales).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { dockPos, visibleSteps, DOCK_BELOW } from '../public/newdesign/spotlightGeom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const ND = 'public/newdesign';
const TOUR_SRC = read(`${ND}/dashTour.js`);

function loadDashTour(win = {}) {
  const ctx = { window: win };
  vm.runInNewContext(TOUR_SRC, ctx, { filename: 'dashTour.js' });
  return ctx.window.ShapeDashTour;
}
const T = loadDashTour()._test;

// ── The coach welcome and guides ────────────────────────────────────────────────────────────
test('the coach welcome is five stops: Nora on the first, the guides on the last', () => {
  for (const role of ['trainer', 'nutritionist']) {
    const steps = T.coachSteps(role);
    assert.equal(steps.length, 5, role);
    assert.equal(steps[0].altLabel, 'Set up with Nora');
    assert.match(steps[0].body, /Skip it if you like: it stays in Settings → Guides\./, 'the first stop says it can be skipped and found again');
    const last = steps[steps.length - 1];
    assert.equal(last.final, true);
    assert.equal(last.ctaLabel, 'See all guides →');
    assert.equal(typeof last.onCta, 'function');
  }
  assert.match(T.coachSteps('nutritionist')[2].body, /Plans/);
  assert.match(T.coachSteps('trainer')[2].body, /Programs/);
});

test('every coach page has exactly one guide, and no guide runs past six steps', () => {
  const routesOf = (file) => {
    const src = read(`${ND}/${file}`);
    const block = /const [A-Z]+_ROUTES = \{([\s\S]*?)\n\};/.exec(src)[1];
    return [...block.matchAll(/^\s+([a-z]+):\s/gm)].map((m) => m[1]);
  };
  for (const [role, file] of [['trainer', 'TrainerApp.html'], ['nutritionist', 'NutritionistApp.html']]) {
    const guides = T.coachGuides(role);
    assert.equal(guides.length, 12, role);
    assert.equal(new Set(guides.map((g) => g.key)).size, guides.length, 'keys are unique');
    for (const g of guides) assert.ok(g.steps.length >= 2 && g.steps.length <= 6, `${role} ${g.key}: ${g.steps.length} steps`);
    const routes = routesOf(file);
    assert.ok(routes.length >= 12, `read only ${routes.length} routes from ${file}`);
    for (const r of routes) {
      const owners = guides.filter((g) => g.routes.includes(r));
      assert.equal(owners.length, 1, `${role}: the ${r} page has ${owners.length} guides`);
      assert.equal(T.guideForRoute(role, r).key, owners[0].key);
    }
  }
  assert.equal(T.guideForRoute('client', 'today'), null, 'a member\'s dashboard has no guides');
  assert.equal(T.guideForRoute('nutritionist', 'plans').title, 'Meal plans');
  assert.equal(T.guideForRoute('trainer', 'score').key, 'goal');
});

test('no step promises what its page cannot do', () => {
  // The Programs page has no sell control: only the builder's Publish puts a program on the profile.
  assert.doesNotMatch(TOUR_SRC, /sell them in the marketplace/);
  // The calendar feed is one-way.
  for (const role of ['trainer', 'nutritionist']) {
    for (const g of T.coachGuides(role)) for (const s of g.steps) assert.doesNotMatch(String(s.body), /\bsyncs?\b|two-way/i, `${g.key}: ${s.title}`);
  }
});

// Every handle a step reaches for, read from dashTour.js's own calls, has to exist in the page code
// it points at, so a refactor that drops one fails here instead of leaving a guide lighting nothing.
test('every anchor a guide names exists in the dashboard\'s source', () => {
  const files = readdirSync(join(ROOT, ND)).filter((f) => /\.(jsx|js|html|css)$/.test(f) && f !== 'dashTour.js');
  const corpus = files.map((f) => read(`${ND}/${f}`)).join('\n') + read('public/newdesign/globalChatButton.js');
  const has = (needle) => corpus.includes(needle);
  const missing = [];
  const keys = [...TOUR_SRC.matchAll(/\bq\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(keys.length > 20, 'read only ' + keys.length + ' data-tour keys');
  const navSlugs = read(`${ND}/coachNav.jsx`) + read(`${ND}/clientNav.jsx`);
  for (const k of new Set(keys)) {
    if (k.startsWith('webtab-')) { if (!navSlugs.includes(`slug: "${k.slice(7)}"`)) missing.push(k); continue; }
    if (!has(`data-tour="${k}"`) && !has(`tourHero="${k}"`) && !has(`"${k}"`) && !has(`'${k}'`)) missing.push(k);
  }
  const css = [...TOUR_SRC.matchAll(/\b(?:sel|shown|sized|closest)\('((?:[^'\\]|\\.)+)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  assert.ok(css.length > 25, 'read only ' + css.length + ' selectors');
  for (const c of new Set(css)) {
    for (const m of c.matchAll(/\[([\w-]+)(?:="([^"]+)")?\]/g)) {
      const [, attr, val] = m;
      if (attr === 'role' || attr === 'aria-selected') continue;
      if (val) { if (!has(val)) missing.push(`${c} (${val})`); } else if (!has(attr)) missing.push(`${c} (${attr})`);
    }
    for (const m of c.matchAll(/(?:^|[\s>])\.([\w-]+)/g)) if (!has(m[1])) missing.push(`${c} (.${m[1]})`);
    for (const m of c.matchAll(/#([\w-]+)/g)) if (!has(m[1])) missing.push(`${c} (#${m[1]})`);
  }
  for (const m of TOUR_SRC.matchAll(/\b(?:byText\([^,]+, |eyebrowCard\()'([^']+)'/g)) if (!has(m[1])) missing.push(`text "${m[1]}"`);
  for (const m of TOUR_SRC.matchAll(/openTab\('[a-z]+', '([^']+)', '([^']+)'\)/g)) if (!has(m[1]) || !has(m[2])) missing.push(`tab ${m[1]} → ${m[2]}`);
  assert.deepEqual(missing, [], 'guide anchors with nothing behind them');
  // The handles this change added, where the pages had none.
  assert.match(read(`${ND}/coachClientDetail.jsx`), /<DashPage\n\s+tourHero="hero-client"/);
  assert.match(read(`${ND}/dashProfileExtras.jsx`), /data-tour="dash-guides"/);
  const btn = read(`${ND}/trainerDashboard.jsx`);
  assert.match(btn, /data-guide-btn=""\n\s+onClick=\{\(\) => T\.startGuide\(g\.key\)\}/, 'the Guide button opens this page\'s guide');
  assert.match(btn, /<DashGuideButton place="bar" \/>/);
  assert.match(btn, /<DashGuideButton place="rail" \/>/);
  assert.match(read(`${ND}/dashProfileExtras.jsx`), /onClick=\{\(\) => start\(g\.key\)\}/);
  // While a guide is open the chat launcher sits under its dim, never on the docked card.
  assert.match(read(`${ND}/dash.css`), /html\[data-guide-open\] #shape-global-chat-button \{ z-index: 99990 !important; \}/);
});

test('progress merges without losing a tick: the earliest day wins, garbage is ignored', () => {
  const m = T.mergeProgress;
  assert.deepEqual(JSON.parse(JSON.stringify(m(null, undefined))), { chapters: {} });
  const a = { welcome: '2026-11-10', chapters: { today: '2026-11-10', week: '2026-11-12' } };
  const b = { welcome: '2026-11-09', note: '2026-11-11', chapters: { week: '2026-11-11', schedule: '2026-11-13' } };
  const out = JSON.parse(JSON.stringify(m(a, b)));
  assert.deepEqual(out, { welcome: '2026-11-09', note: '2026-11-11', chapters: { today: '2026-11-10', week: '2026-11-11', schedule: '2026-11-13' } });
  assert.deepEqual(JSON.parse(JSON.stringify(m(b, a))), out, 'order does not matter');
  assert.deepEqual(JSON.parse(JSON.stringify(m(out, { chapters: { today: null, week: '' } }))), out, 'an empty value never unticks');
  assert.deepEqual(JSON.parse(JSON.stringify(m({ chapters: 'x' }, 7))), { chapters: {} });
  assert.deepEqual(JSON.parse(JSON.stringify(m({}, { chapters: { ghost: null, gone: '' } }))), { chapters: {} }, 'an empty value is no tick');
});

test('the progress write reads first, is bound to the account, and writes nothing on a failed read', () => {
  const fn = TOUR_SRC.slice(TOUR_SRC.indexOf('function recordProgress('), TOUR_SRC.indexOf('function loadProgress('));
  assert.match(fn, /db\.getUserGoals\(GUIDE_KEY, \{ expectedUserId: uid \}\)\)\.then\(function \(remote\) \{\n\s+if \(remote == null \|\| UID !== uid\) return;/);
  assert.match(fn, /var merged = mergeProgress\(remote, PROG\);/);
  assert.match(fn, /db\.saveUserGoals\(GUIDE_KEY, merged, \{ expectedUserId: uid \}\)/);
  assert.match(TOUR_SRC, /var GUIDE_KEY = 'web_coach_guides';/);
  // Never the app's documents (replace semantics would clobber the app tour's own flag).
  assert.doesNotMatch(TOUR_SRC, /saveUserGoals\('(client|coach)_onboarding'/);
});

test('a guide is ticked only when it is finished, not when it is skipped', async () => {
  const saved = [];
  const started = [];
  const win = {
    location: { hash: '#programs' },
    dispatchEvent() {}, addEventListener() {},
    SpotlightTour: { start: (steps, o) => started.push({ steps, o }) },
    shapeDb: {
      getUser: async () => ({ id: 'u1' }),
      getUserGoals: async () => ({}),
      saveUserGoals: async (kind, data, opts) => { saved.push({ kind, data: JSON.parse(JSON.stringify(data)), opts }); return {}; },
    },
  };
  const ctx = { window: win, document: { documentElement: { getAttribute: () => null } }, localStorage: { getItem: () => null, setItem() {} }, Event: class { constructor(t) { this.type = t; } }, setTimeout: () => 0 };
  vm.runInNewContext(TOUR_SRC, ctx, { filename: 'dashTour.js' });
  const api = ctx.window.ShapeDashTour;
  api.init('trainer');
  await new Promise((r) => setImmediate(r));
  assert.equal(api.guideHere().key, 'programs');
  api.startGuide('programs');
  assert.equal(started.length, 1);
  started[0].o.onDone('skipped');
  await new Promise((r) => setImmediate(r));
  assert.equal(saved.length, 0, 'a skipped guide is not ticked');
  started[0].o.onDone('finished');
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].kind, 'web_coach_guides');
  assert.deepEqual(JSON.parse(JSON.stringify(saved[0].opts)), { expectedUserId: 'u1' });
  assert.ok(saved[0].data.chapters.programs, 'the Programs guide is ticked');
  assert.equal(api.guideHere().done, true);
  assert.equal(api.list().find((g) => g.key === 'programs').done, true);
  assert.equal(api.list().find((g) => g.key === 'client').startable, false, 'a client\'s file is taken from the file');
});

test('the welcome says where to find it again when skipped, member and coach alike', () => {
  assert.match(TOUR_SRC, /coach: 'Tour skipped\. You can take it again any time from Settings → Guides\.'/);
  assert.match(TOUR_SRC, /client: 'Tour skipped\. You can take it again any time from Settings\.'/);
  assert.match(TOUR_SRC, /skipNote: isCoach\(role\) \? SKIP_NOTE\.coach : SKIP_NOTE\.client,/);
  // The replay: Settings → Guides on the website (the coach card) and the member's Settings row.
  assert.match(read(`${ND}/dashProfileExtras.jsx`), /Take the welcome tour again<\/button>/);
  assert.match(read(`${ND}/clientMeSettings.jsx`), /<Row label="Take a tour"[^\n]*shape:startTour/);
  assert.match(TOUR_SRC, /window\.addEventListener\('shape:startTour', function \(\) \{ start\(role\); \}\);/);
});

// ── The engine ───────────────────────────────────────────────────────────────────────────────
async function inDom(fn) {
  const { JSDOM } = require_('jsdom');
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"><div id="a">a</div><div id="b">b</div></div></body></html>', { pretendToBeVisual: true });
  const w = dom.window;
  const keys = ['window', 'document', 'getComputedStyle', 'matchMedia', 'requestAnimationFrame'];
  const prev = Object.fromEntries(keys.map((k) => [k, globalThis[k]]));
  Object.assign(globalThis, {
    window: w, document: w.document, getComputedStyle: w.getComputedStyle.bind(w),
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }), requestAnimationFrame: (cb) => setTimeout(cb, 0),
  });
  try { return await fn(w); } finally { Object.assign(globalThis, prev); dom.window.close(); }
}
const settle = async (root, sel) => { for (let i = 0; i < 40 && !root.querySelector(sel); i += 1) await new Promise((r) => setTimeout(r, 5)); };
const tick = () => new Promise((r) => setTimeout(r, 20));

test('the engine: Skip tour on every step but the last, and skipping says where to find it', async () => {
  const { startTour } = await loadRealModule(join(ROOT, `${ND}/spotlightTour.js`));
  await inDom(async (w) => {
    const root = w.document.getElementById('root');
    const done = []; const notes = [];
    startTour([
      { anchor: () => w.document.getElementById('a'), title: 'One', body: 'x' },
      { anchor: () => w.document.getElementById('b'), title: 'Two', body: 'y' },
    ], { root, skipNote: 'Find it in Settings.', notify: (t) => notes.push(t), onDone: (r) => done.push(r),
      labels: { skip: 'Tour überspringen', next: 'Weiter →', progress: (n, total) => `${n} von ${total}` } });
    await settle(root, '[data-st="cancel"]');
    const cancel = root.querySelector('[data-st="cancel"]');
    assert.equal(cancel.textContent, 'Tour überspringen', 'the caller\'s words');
    assert.equal(root.querySelector('[data-st="next"]').textContent, 'Weiter →');
    assert.match(root.querySelector('[data-guide-card]').textContent, /1 von 2/);
    assert.ok(w.document.documentElement.hasAttribute('data-guide-open'), 'the page knows a tour is open');
    cancel.onclick();
    assert.deepEqual(done, ['skipped']);
    assert.deepEqual(notes, ['Find it in Settings.']);
    assert.ok(!root.querySelector('[role="dialog"]'), 'gone');
    assert.ok(!w.document.documentElement.hasAttribute('data-guide-open'), 'the mark goes with it');
  });
  await inDom(async (w) => {
    const root = w.document.getElementById('root');
    const done = []; const notes = [];
    startTour([{ anchor: () => w.document.getElementById('a'), title: 'Only', body: 'x' }], { root, skipNote: 'n', notify: (t) => notes.push(t), onDone: (r) => done.push(r) });
    await settle(root, '[data-st="next"]');
    assert.ok(!root.querySelector('[data-st="cancel"]'), 'the last step\'s Done does the same');
    root.querySelector('[data-st="skip"]').onclick();
    assert.deepEqual(done, ['finished'], 'the × on the last step finishes it');
    assert.deepEqual(notes, [], 'and says nothing');
  });
  await inDom(async (w) => {
    const root = w.document.getElementById('root');
    const done = []; const notes = [];
    startTour([{ anchor: () => w.document.getElementById('a'), title: 'A', body: 'x' }, { title: 'B', body: 'y' }], { root, skipNote: 'Back in Settings.', onDone: (r) => done.push(r) });
    await settle(root, '[data-st="cancel"]');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.deepEqual(done, ['skipped'], 'Escape skips');
    const note = root.querySelector('[data-guide-note]');
    assert.ok(note && note.textContent === 'Back in Settings.', 'with no toast of the caller\'s, the engine says it');
    assert.equal(note.getAttribute('role'), 'status');
  });
});

test('the engine: steps the account lacks are left out; arrows step; one tour at a time', async () => {
  const { startTour } = await loadRealModule(join(ROOT, `${ND}/spotlightTour.js`));
  await inDom(async (w) => {
    const root = w.document.getElementById('root');
    const a = () => w.document.getElementById('a');
    startTour([
      { anchor: a, title: 'Kept', body: 'x' },
      { anchor: a, title: 'Absent', body: 'x', when: () => false },
      { anchor: a, title: 'Last', body: 'x' },
    ], { root });
    await settle(root, '[data-st="next"]');
    assert.match(root.querySelector('[data-guide-card]').textContent, /1 of 2/);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await tick();
    assert.equal(root.querySelector('[data-guide-card]').getAttribute('aria-label'), 'Last', '→ skips past the absent step');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    await tick();
    assert.equal(root.querySelector('[data-guide-card]').getAttribute('aria-label'), 'Kept');
    startTour([{ anchor: a, title: 'Second', body: 'x' }], { root });
    await tick();
    assert.equal(root.querySelectorAll('[data-guide-card]').length, 1, 'a second start replaces the first');
    assert.equal(root.querySelector('[data-guide-card]').getAttribute('aria-label'), 'Second');
  });
  await inDom(async (w) => {
    const root = w.document.getElementById('root');
    const h = startTour([{ title: 'No', body: 'x', when: () => false }], { root });
    assert.ok(!root.querySelector('[role="dialog"]'), 'nothing to show draws nothing');
    h.destroy();
  });
  await inDom(async (w) => {
    const root = w.document.getElementById('root');
    let cta = 0; const done = [];
    startTour([{ anchor: () => w.document.getElementById('a'), title: 'End', body: 'x', final: true, ctaLabel: 'Go →', onCta: () => { cta += 1; } }], { root, onDone: (r) => done.push(r) });
    await settle(root, '[data-st="next"]');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight' }));
    await tick();
    assert.equal(cta, 0, '→ never follows a finale\'s link off the page');
    assert.ok(root.querySelector('[data-st="done"]'), 'a plain Done beside the link');
  });
});

test('the docked card: across the visible width, away from its target', () => {
  assert.equal(DOCK_BELOW, 560);
  const vis = { y: 0, h: 800 };
  const card = { w: 0, h: 200 };
  assert.deepEqual(dockPos({ x: 10, y: 100, w: 50, h: 40 }, vis, 390, card), { top: 592, left: 8, width: 374 }, 'a target up top: the card goes to the bottom');
  assert.deepEqual(dockPos({ x: 10, y: 700, w: 50, h: 40 }, vis, 390, card), { top: 8, left: 8, width: 374 }, 'a target low down: the card goes to the top');
  assert.equal(dockPos(null, vis, 390, card).top, 592, 'no target: the bottom');
  assert.equal(dockPos({ x: 0, y: 1700, w: 10, h: 10 }, { y: 1200, h: 800 }, 390, card).top, 1208, 'a scrolled page docks inside what is on screen: the top of it');
  assert.equal(dockPos({ x: 0, y: 1300, w: 10, h: 10 }, { y: 1200, h: 800 }, 390, card).top, 1792, '...or the bottom of it');
  assert.deepEqual(visibleSteps([{ a: 1 }, null, { when: () => false }, { when: () => { throw new Error('x'); } }]).length, 2);
});

// ── The app ──────────────────────────────────────────────────────────────────────────────────
test('the app tour: the Build door for a member with no plan, a Coaches stop, the Radio box', () => {
  const app = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const tour = app.slice(app.indexOf('function BSOnboardingTour('), app.indexOf('function BSScoreIntro('));
  assert.match(tour, /anchor: q\('hero-train'\), fallback: \(\) => q\('hero-build'\)\(\) \|\| q\('tab-train'\)\(\),/);
  assert.match(app, /<div data-tour="hero-build" style=\{\{ padding: `2px \$\{t\.padX\}px 40px` \}\}>/, 'the Build door carries the anchor');
  assert.match(tour, /navigate: go\('market'\), anchor: q\('tab-market'\)/);
  assert.match(tour, /anchor: \(\) => root\.querySelector\('\[data-bs-now-playing\]'\), fallback: q\('tab-home'\), final: true/);
  assert.doesNotMatch(tour, /Coaches & community/);
  assert.match(tour, /labels: bsTourLabels\(tr\)/);
  assert.match(tour, /skipNote: tr\('onboarding:tour\.ui\.skipped'/);
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  const coach = pros.slice(pros.indexOf('function BSProOnboardingTour('), pros.indexOf('function BSTrainerApp('));
  assert.match(coach, /labels: window\.bsTourLabels \? window\.bsTourLabels\(tr\) : undefined/);
  assert.match(coach, /skipNote: tr\('onboarding:tour\.ui\.skipped'/);
  // Settings → About → Take the tour, for every shell (each listens for shape:startTour).
  assert.match(app, /\{ l: tr\('settings:about\.tour', \{ defaultValue: 'Take the tour' \}\), r: tr\('settings:about\.tourMeta', \{ defaultValue: 'Start' \}\), action: \(\) => \{ try \{ window\.dispatchEvent\(new Event\('shape:startTour'\)\); \} catch \(e\) \{\} \} \},/);
  assert.match(app, /window\.addEventListener\('shape:startTour', start\);/);
  // Nothing first-run draws over the card.
  assert.match(read('mobile-app/src/broadsheet/BSNoraHint.jsx'), /<div role="note" data-guide-wait="" style=\{\{/);
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx'), /<div data-guide-wait="" style=\{\{\n\s+position: 'absolute', inset: 0, zIndex: 90,/);
  assert.match(read(`${ND}/spotlightTour.js`), /html\[data-guide-open\] \[data-guide-wait\]\{visibility:hidden!important\}/);
});

test('the card\'s words and the new steps are in all 13 app locales, with the same placeholders', () => {
  const dir = join(ROOT, 'mobile-app/src/i18n/catalogs');
  const locales = readdirSync(dir);
  assert.equal(locales.length, 13);
  const keys = ['tour.ui.next', 'tour.ui.back', 'tour.ui.done', 'tour.ui.skip', 'tour.ui.close', 'tour.ui.progress', 'tour.ui.skipped', 'tour.coaches.eyebrow', 'tour.coaches.title', 'tour.coaches.body', 'tour.chat.title', 'tour.chat.body'];
  const en = JSON.parse(readFileSync(join(dir, 'en/onboarding.json'), 'utf8'));
  for (const loc of locales) {
    const on = JSON.parse(readFileSync(join(dir, loc, 'onboarding.json'), 'utf8'));
    const st = JSON.parse(readFileSync(join(dir, loc, 'settings.json'), 'utf8'));
    for (const k of keys) assert.ok(on[k] && on[k].trim(), `${loc}: ${k}`);
    assert.ok(st['about.tour'] && st['about.tourMeta'], `${loc}: the Settings row`);
    assert.ok(/\{n, number\}/.test(on['tour.ui.progress']) && /\{total, number\}/.test(on['tour.ui.progress']), `${loc}: the counter keeps both numbers`);
    if (loc !== 'en' && loc !== 'pcm') {
      assert.notEqual(on['tour.ui.skip'], en['tour.ui.skip'], `${loc}: Skip tour is still English`);
      assert.notEqual(on['tour.chat.title'], 'Coaches & community.', `${loc}: the old Chat title`);
    }
  }
});

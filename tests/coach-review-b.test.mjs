// The coach's review page as the owner picked it (2026-11-04: "option B", confirmed as Client review B):
// BSWorkoutReview.jsx, MOUNTED in jsdom with real React, for a nutritionist (Client review) and a trainer
// (Workout review), on both papers. The queue on glass rows with a ring in the role's colour on the
// selected one; the selected day or session as a raised hero holding a pair board (Kcal | Target over
// Protein | Logged with slim bars, or Sets | Avg set over Avg rest | Elapsed); meals or sets on glass rows;
// the note in a glass composer with Save inside it. A trainer's hero ends on the client's own ratings
// (owner, 2026-11-04: "show both ratings to coaches"): difficulty (`session_rpe`) and enjoyment
// (`summary.enjoyment`), each only when given, and no row when neither was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = join(ROOT, 'mobile-app/src/broadsheet/BSWorkoutReview.jsx');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.localStorage = W.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

// The catalogs the app ships, formatted as its ICU runtime formats them.
const { IntlMessageFormat } = require_('intl-messageformat');
const cats = Object.fromEntries(['coach', 'session'].map((ns) => [ns, JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/en/${ns}.json`), 'utf8'))]));
W.ShapeI18n = {
  t: (key, opts = {}) => { const [ns, k] = key.split(':'); const m = cats[ns] && cats[ns][k]; return m == null ? undefined : new IntlMessageFormat(m, 'en').format(opts); },
  intlLocale: () => 'en-US',
};
const paper = (light) => ({
  PAPER: light ? '#f4efe4' : '#0f0e0c', PAPER2: light ? '#ede6d6' : '#181612', INK: light ? '#14120f' : '#f5f0e6',
  INK50: light ? 'rgba(20,18,15,0.5)' : 'rgba(245,240,230,0.5)', INK70: light ? 'rgba(20,18,15,0.7)' : 'rgba(245,240,230,0.7)',
  RULE: light ? '#d6cfc0' : '#2c2924', RUST: '#c0533b', inkRGB: light ? '20,18,15' : '245,240,230', isLight: light, padX: 18,
  uText: (s) => s, uMeasure: (v, u) => ({ value: v, unit: u }),
});
const LIGHT = paper(true);
const DARK = paper(false);
let theme = LIGHT;
W.useBS = () => theme;
W.BSPage = ({ children }) => React.createElement('div', { 'data-bs-page': '' }, children);
W.BSMastRow = ({ trailing }) => React.createElement('div', { 'data-mast-row': trailing ? 'corners' : 'bare' });
// The chrome's back row, as tests/coach-review-clean.test.mjs draws it: Back, the page's eyebrow on its right.
W.BSBackRow = ({ onBack, trailing }) => React.createElement('div', { 'data-bs-back-row': '' },
  React.createElement('button', { type: 'button', 'data-bs-back': '', onClick: onBack, style: { minHeight: 44 } }, '← Back'), trailing);

const M = await loadRealModule(MODULE, { registry: new Map([['react', React]]) });

// The data layer the page reads at call time.
function backend({ sessions = [], days = [], offline = false, addNote, samples } = {}) {
  const calls = [];
  W.ShapeWorkoutLogs = {
    listSessions: async () => { if (offline) throw new Error('offline'); return { stored: 'supabase', data: sessions }; },
    listSensorSamples: async (id) => (samples ? samples(id) : { data: [] }),
    addCoachReviewNote: async (args) => { calls.push(args); return addNote(args); },
  };
  W.ShapeNutritionLogs = { listClientDays: async () => ({ data: days }) };
  return calls;
}
const flush = () => React.act(async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); });

async function mount(role, { onBack = () => {}, paperTheme = LIGHT } = {}) {
  theme = paperTheme;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(React.createElement(M.default, { role, onBack })); });
  await flush();
  const q = (s) => host.querySelector(s);
  const qa = (s) => [...host.querySelectorAll(s)];
  return {
    host, q, qa,
    status: () => q('[data-review-status]').textContent,
    queue: () => qa('[data-review-queue] > button'),
    cells: () => qa('[data-review-hero] [data-review-cell]').map((c) => [c.getAttribute('data-review-cell'), c.querySelector('[data-review-figure]').textContent]),
    bars: () => Object.fromEntries(qa('[data-review-hero] [data-review-cell]').filter((c) => c.querySelector('[data-review-bar]')).map((c) => [c.getAttribute('data-review-cell'), c.querySelector('[data-review-bar] > div').style.width])),
    ratings: () => qa('[data-review-ratings] [data-review-rating]').map((r) => [r.getAttribute('data-review-rating'), r.textContent]),
    notes: () => qa('[data-review-note]').map((n) => n.textContent),
    click: async (el) => { await React.act(async () => { el.click(); }); await flush(); },
    type: (text) => React.act(async () => {
      const el = q('textarea');
      Object.getOwnPropertyDescriptor(W.HTMLTextAreaElement.prototype, 'value').set.call(el, text);
      el.dispatchEvent(new W.Event('input', { bubbles: true }));
    }),
    save: async () => { await React.act(async () => { q('[data-review-composer] button').click(); }); await flush(); },
    close: () => React.act(async () => { root.unmount(); host.remove(); }),
  };
}

test("a trainer's queue on glass rows: the selected one ringed in rust, and a pick moves the ring and the hero", async () => {
  backend();
  const m = await mount('trainer');
  try {
    assert.equal(m.q('h1').textContent, 'Workout review');
    assert.equal(m.status(), 'DEMO QUEUE · UNTIL CLIENT SESSIONS APPEAR');
    assert.match(m.q('[data-bs-back-row]').textContent, /THE QUEUE · 2 ITEMS$/, 'the queue line rides the back row');
    assert.equal(m.q('[data-mast-row]').getAttribute('data-mast-row'), 'bare', 'no corners over an unsaved note');
    const [first, second] = m.queue();
    assert.equal(m.queue().length, 2);
    assert.equal(first.getAttribute('aria-current'), 'true');
    assert.equal(second.getAttribute('aria-current'), null);
    assert.equal(first.getAttribute('aria-label'), 'Lower Pull - Peak, 10 sets, Completed');
    assert.match(first.style.border, /rgba\(192, ?83, ?59, ?0\.65\)/, 'the selected row is ringed in the trainer\'s rust');
    assert.match(first.style.boxShadow, /0 0 0 3px rgba\(192, ?83, ?59, ?0\.12\)/);
    assert.doesNotMatch(second.style.border, /192, ?83, ?59/);
    assert.match(first.textContent, /Completed · 52:0010 SETS$/, 'its status and length, its sets in the pill');
    // The hero: its section line, the session's name, the pair board.
    const hero = m.q('[data-review-hero]');
    assert.match(hero.textContent, /^SESSION DETAIL · Completed/);
    assert.match(hero.textContent, /Lower Pull - Peak/);
    assert.deepEqual(m.cells(), [['sets', '10'], ['avgSet', '50s'], ['avgRest', '1:11'], ['elapsed', '52:00']]);
    assert.deepEqual(m.bars(), {}, 'a session\'s figures read against nothing, so they carry no bars');
    // The sets on glass rows, each with its set and rest.
    const sets = m.qa('[data-review-row="set"]');
    assert.equal(sets.length, 3);
    assert.match(sets[0].textContent, /^Trap bar deadlift #15 · 245 lbSET 42sREST 0s$/);
    assert.equal(m.qa('[data-review-row="meal"]').length, 0);
    // The watch samples in their glass card; a demo session with no trace has no heart-rate section.
    assert.deepEqual(m.qa('[data-review-samples] > div').map((d) => d.textContent), ['avg hr132bpm', 'max hr166bpm', 'calories418kcal']);
    assert.equal(m.q('[data-review-hr]'), null);

    await m.click(second);
    assert.equal(second.getAttribute('aria-current'), 'true');
    assert.equal(first.getAttribute('aria-current'), null);
    assert.match(second.style.border, /rgba\(192, ?83, ?59, ?0\.65\)/);
    assert.match(m.q('[data-review-hero]').textContent, /Upper Push - Tempo/);
    assert.deepEqual(m.cells(), [['sets', '8'], ['avgSet', '41s'], ['avgRest', '41s'], ['elapsed', '48:00']]);
    assert.equal(m.qa('[data-review-row="set"]').length, 2);
  } finally { await m.close(); }
});

test("a nutritionist's day: Kcal | Target over Protein | Logged, slim bars against the targets, meals on glass rows, the flag", async () => {
  backend();
  const m = await mount('nutritionist');
  try {
    assert.equal(m.q('h1').textContent, 'Client review');
    assert.equal(m.status(), 'DEMO QUEUE · UNTIL CLIENTS LOG MEALS');
    const [tue, mon] = m.queue();
    assert.equal(tue.getAttribute('aria-current'), 'true');
    assert.match(tue.style.border, /rgba\(160, ?122, ?46, ?0\.65\)/, 'the selected day is ringed in the nutritionist\'s gold');
    assert.match(tue.textContent, /4\/4 MEALS$/);
    assert.match(m.q('[data-review-hero]').textContent, /^MEAL LOG · complete day/);
    assert.deepEqual(m.cells(), [['kcal', '1980'], ['target', '2100'], ['protein', '152'], ['logged', '4']]);
    const text = Object.fromEntries(m.qa('[data-review-cell]').map((c) => [c.getAttribute('data-review-cell'), c.textContent]));
    assert.deepEqual(text, { kcal: 'Kcal1980', target: 'Target2100', protein: 'Protein152/170G', logged: 'Logged4/4' });
    assert.deepEqual(m.bars(), { kcal: '94%', protein: '89%', logged: '100%' }, 'the target itself carries no bar');
    const meals = m.qa('[data-review-row="meal"]');
    assert.equal(meals.length, 4);
    assert.equal(meals[0].textContent, 'BreakfastGreek yogurt bowl420KCAL32P · 44C · 12F');
    // A day has no ratings, no heart rate and no watch samples.
    assert.equal(m.q('[data-review-ratings]'), null);
    assert.equal(m.q('[data-review-hr]'), null);
    assert.equal(m.q('[data-review-samples]'), null);
    assert.equal(m.q('[data-review-flag]'), null);

    await m.click(mon);
    assert.equal(mon.getAttribute('aria-current'), 'true');
    assert.equal(m.q('[data-review-flag]').textContent, 'PROTEIN 88G UNDER · DINNER UNLOGGED');
    assert.deepEqual(m.bars(), { kcal: '58%', protein: '48%', logged: '75%' });
    assert.equal(m.qa('[data-review-row="meal"]').length, 3);
  } finally { await m.close(); }
});

test("a live day is totals only and says so; its readings ride the hero; a blocked day hides the composer", async () => {
  backend({ days: [
    { id: 'snap-1', nutrition: true, clientId: 'c1', clientName: 'Ana Reyes', loggedOn: '2026-11-02', kcal: 1650, kcalTarget: null, proteinG: 120, proteinTargetG: 150, carbsG: 180, fatG: 55, hydrationL: 2.5, energy: 7, hunger: '' },
    { id: 'snap-2', nutrition: true, clientId: 'c2', clientName: 'Ben Ode', loggedOn: '2026-11-01', kcal: 2000, notesBlocked: true },
  ] });
  const m = await mount('nutritionist');
  try {
    assert.equal(m.status(), 'LIVE · CLIENT NUTRITION DAYS');
    const [ana, ben] = m.queue();
    assert.match(ana.textContent, /^Ana Reyes · Mon, Nov 2/);
    assert.match(ana.textContent, /1650 KCAL$/, 'a live day leads with the figure it has, never 0/0 meals');
    assert.ok(m.q('[data-pro-redact="PER-MEAL DETAIL NOT STORED · DAY TOTALS ONLY"]'), 'the day says its meals are not stored');
    assert.equal(m.qa('[data-review-row="meal"]').length, 0);
    const text = Object.fromEntries(m.qa('[data-review-cell]').map((c) => [c.getAttribute('data-review-cell'), c.textContent]));
    assert.deepEqual(text, { kcal: 'Kcal1650', target: 'Target—', protein: 'Protein120/150G', carbs: 'Carbs180G' });
    assert.deepEqual(m.bars(), { protein: '80%' }, 'no bar against a target the coach has not set');
    // The day's other readings, each only when logged: an empty hunger is not a 0.
    assert.equal(m.q('[data-review-meta]').textContent, 'FAT 55G · HYDRATION 2.5L · ENERGY 7/10');
    assert.ok(m.q('[data-review-composer] textarea'));

    await m.click(ben);
    assert.ok(m.q('[data-pro-redact="NOTES ATTACH TO A WORKOUT SESSION · NOT YET TO A NUTRITION DAY"]'));
    assert.equal(m.q('textarea'), null, 'no composer over a writer that would refuse');
    assert.equal(m.q('[data-review-meta]'), null);
  } finally { await m.close(); }
});

test("the client's ratings at the hero's foot: both when given, the RPE alone, and no row at all for neither", async () => {
  backend({ sessions: [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', workout_name: 'Both rated', status: 'completed', duration_seconds: 1800, session_rpe: 7.5, summary: { completedSets: 4, enjoyment: 4 }, workout_set_logs: [] },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', workout_name: 'RPE only', status: 'completed', duration_seconds: 1500, session_rpe: 6, summary: { completedSets: 3 }, workout_set_logs: [] },
    { id: 'aaaaaaaa-0000-4000-8000-000000000003', workout_name: 'Not rated', status: 'reviewed', duration_seconds: 1200, session_rpe: null, summary: { completedSets: 2, enjoyment: null }, workout_set_logs: [] },
    { id: 'aaaaaaaa-0000-4000-8000-000000000004', workout_name: 'Zeroes', status: 'completed', duration_seconds: 900, session_rpe: 0, summary: { completedSets: 1, enjoyment: 0 }, workout_set_logs: [] },
  ] });
  const m = await mount('trainer');
  try {
    assert.equal(m.status(), 'LIVE · SUPABASE SESSION LOGS');
    assert.deepEqual(m.ratings(), [['rpe', 'RPE 7.5/10'], ['enjoyment', '♡ 4/5']]);
    // A live session always shows its heart rate, with the line that says where the readings stand.
    assert.equal(m.q('[data-review-hr] h2').textContent, 'Heart rate');
    assert.equal(m.q('[data-review-hr] [role="status"]').textContent, 'No heart-rate readings were recorded.');
    assert.ok(m.q('[data-pro-redact="NO SETS LOGGED"]'));
    assert.deepEqual(m.qa('[data-review-samples] > div').map((d) => d.textContent), ['watch data—'], 'a pending sample is a dash, never a 0');

    await m.click(m.queue()[1]);
    assert.deepEqual(m.ratings(), [['rpe', 'RPE 6/10']], 'enjoyment not given: only the RPE');
    assert.equal(m.q('[data-review-rating="enjoyment"]'), null);

    for (const i of [2, 3]) {
      await m.click(m.queue()[i]);
      assert.equal(m.q('[data-review-ratings]'), null, `${m.queue()[i].getAttribute('aria-label')}: no ratings row`);
      assert.doesNotMatch(m.q('[data-review-hero]').textContent, /RPE|♡/, 'no placeholder for a rating not given');
    }
  } finally { await m.close(); }
});

test('reviewRatings reads session_rpe and summary.enjoyment, and nothing outside their scales', () => {
  const r = M.reviewRatings;
  assert.deepEqual(r({ session_rpe: 7, summary: { enjoyment: 4 } }), { rpe: 7, enjoyment: 4 });
  assert.deepEqual(r({ session_rpe: '8.5', summary: { enjoyment: '5' } }), { rpe: 8.5, enjoyment: 5 });
  assert.deepEqual(r({ session_rpe: 10, summary: { enjoyment: 1 } }), { rpe: 10, enjoyment: 1 });
  for (const s of [null, undefined, {}, { session_rpe: null, summary: null }, { session_rpe: 0, summary: { enjoyment: 0 } }, { session_rpe: '', summary: { enjoyment: '' } },
    { session_rpe: 11, summary: { enjoyment: 6 } }, { session_rpe: -1, summary: { enjoyment: 3.5 } }, { session_rpe: true, summary: { enjoyment: true } }, { session_rpe: 'hard', summary: 'x' },
    // Enjoyment lives in the summary; a stray top-level field is not it.
    { enjoyment: 4 }]) {
    assert.deepEqual(r(s), { rpe: null, enjoyment: null }, JSON.stringify(s));
  }
});

test('the note: Save sits in the glass composer beside the text; a demo note stays local and says so; an empty one does nothing', async () => {
  const calls = backend({ addNote: () => ({ stored: 'supabase', data: { id: 'x', body: 'x' } }) });
  const m = await mount('trainer');
  try {
    const composer = m.q('[data-review-composer]');
    assert.equal(composer.children.length, 2);
    assert.equal(composer.children[0].tagName, 'TEXTAREA');
    assert.equal(composer.children[1].textContent, 'Save review note');
    assert.equal(composer.style.display, 'flex', 'Save beside the text, not under it');
    assert.equal(m.q('textarea').style.fontSize, '16px', 'iOS zooms on a smaller box');
    assert.deepEqual(m.notes(), ['Rest timing is solid. Cue slower eccentric on set 2 next week.']);

    await m.save();
    assert.equal(m.status(), 'DEMO QUEUE · UNTIL CLIENT SESSIONS APPEAR', 'an empty note saves nothing');
    assert.equal(m.notes().length, 1);

    await m.type('Drive the hips through.');
    await m.save();
    assert.equal(m.status(), 'Saved locally for this demo session');
    assert.deepEqual(m.notes(), ['Rest timing is solid. Cue slower eccentric on set 2 next week.', 'Drive the hips through.']);
    assert.equal(m.q('textarea').value, '');
    assert.match(m.host.textContent, /COACH NOTES2 notes/);
    // A demo session's `demo-…` id is no session the database holds, so its note never reaches the writer.
    assert.deepEqual(calls, []);
  } finally { await m.close(); }
  // A demo day, the same.
  const n = await mount('nutritionist');
  try {
    await n.type('More protein at breakfast.');
    await n.save();
    assert.equal(n.status(), 'Saved locally for this demo session');
    assert.deepEqual(n.notes(), ['More protein at breakfast.']);
    assert.deepEqual(calls, []);
  } finally { await n.close(); }
});

test("a live session's note goes to the writer; a failed save keeps the draft and says so", async () => {
  const replies = [
    () => ({ stored: 'supabase', data: { id: 'n-remote', body: 'Good depth.' } }),
    () => { throw new Error('network'); },
    () => ({ stored: 'local', data: { id: 'n-local', body: 'Kept on the phone.' } }),
  ];
  const calls = backend({
    sessions: [{ id: 'bbbbbbbb-0000-4000-8000-000000000001', workout_name: 'Live lift', status: 'completed', duration_seconds: 600, summary: { completedSets: 1 }, workout_set_logs: [] }],
    addNote: () => replies.shift()(),
  });
  const m = await mount('trainer');
  try {
    await m.type('Good depth.');
    await m.save();
    assert.deepEqual(calls[0], { sessionId: 'bbbbbbbb-0000-4000-8000-000000000001', providerRole: 'trainer', body: 'Good depth.', visibility: 'client' });
    assert.equal(m.status(), 'Review note saved to Supabase');
    assert.deepEqual(m.notes(), ['Good depth.']);

    await m.type('Lost words.');
    await m.save();
    assert.equal(m.status(), "Couldn't save — your note is still here. Try again.");
    assert.equal(m.q('textarea').value, 'Lost words.', 'the draft is kept');
    assert.deepEqual(m.notes(), ['Good depth.'], 'nothing is appended for a write that landed nowhere');

    await m.type('Kept on the phone.');
    await m.save();
    assert.equal(m.status(), 'Review note saved locally');
    assert.equal(m.notes().length, 2);
  } finally { await m.close(); }
});

test('offline, the demo queue says so', async () => {
  backend({ offline: true });
  const m = await mount('trainer');
  try {
    assert.equal(m.status(), 'DEMO QUEUE · OFFLINE');
    assert.equal(m.queue().length, 2);
  } finally { await m.close(); }
});

test('on the dark paper the selected row lights its dot in the brighter heat, for both roles', async () => {
  backend();
  for (const [role, ring, lit] of [['trainer', /rgba\(192, ?83, ?59, ?0\.65\)/, 'rgb(224, 101, 75)'], ['nutritionist', /rgba\(216, ?178, ?90, ?0\.65\)/, 'rgb(216, 178, 90)']]) {
    const m = await mount(role, { paperTheme: DARK });
    try {
      const sel = m.queue()[0];
      assert.match(sel.style.border, ring, role);
      assert.match(sel.style.boxShadow, /0 0 0 3px rgba\([^)]*0\.16\)/, role + ': the ring is stronger on the dark paper');
      assert.equal(sel.querySelector('[aria-hidden="true"]').style.background, lit, role + ': the selected dot');
      assert.match(sel.querySelector('[aria-hidden="true"]').style.boxShadow, /0 0 8px/, role + ': and it glows');
      assert.ok(m.q('[data-review-hero]') && m.q('[data-review-composer]'), role);
    } finally { await m.close(); }
  }
  theme = LIGHT;
});

test('every target is 44px or more, and Back goes back', async () => {
  backend();
  for (const role of ['trainer', 'nutritionist']) {
    let backs = 0;
    const m = await mount(role, { onBack: () => { backs += 1; } });
    try {
      const targets = [...m.qa('button'), ...m.qa('textarea')];
      assert.ok(targets.length >= 4, role);
      for (const el of targets) {
        const h = Math.max(parseFloat(el.style.minHeight) || 0, parseFloat(el.style.height) || 0);
        assert.ok(h >= 44, `${role}: ${el.getAttribute('aria-label') || el.textContent || el.tagName} is ${h}px tall`);
      }
      await m.click(m.q('[data-bs-back]'));
      assert.equal(backs, 1, role);
    } finally { await m.close(); }
  }
});

test('the module stands alone: no import back, Pros imports it as it imports BSLiveWorkoutWatch, no look switch left', () => {
  const mod = readFileSync(MODULE, 'utf8');
  const code = stripComments(mod);
  const imports = [...mod.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((x) => x[1]);
  assert.deepEqual(imports, ['react', '../services/workoutExperience.mjs', '../services/coachWorkoutLibrary.mjs', './bsCleanType.jsx', './BSProInstrument.jsx']);
  assert.doesNotMatch(code, /iosAppBroadsheet(Pros|Client)/, 'a feature module never imports back');
  // Window globals are read at call time, never captured at module top.
  assert.doesNotMatch(code, /^const \{[^}]*\} = window;/m);
  assert.match(code, /^export default function BSWorkoutReviewPage\(\{ role = 'trainer', onBack \}\) \{\n {2}const \{ BSPage, BSBackRow, BSMastRow, BS_MAST_TOP_CSS = BS_MAST_TOP_FALLBACK \} = window;/m);
  assert.match(code, /^function useShapeTr\(\) \{/m, 'its own translator');
  assert.doesNotMatch(mod, /__reviewLook|BSReviewLook/, 'no look switch');
  assert.doesNotMatch(mod, /[\u{1F000}-\u{1FAFF}\u{FE0F}]/u, 'no coloured emoji');

  const pros = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
  assert.match(pros, /^import BSLiveWorkoutWatch from '\.\/BSLiveWorkoutWatch\.jsx';\nimport BSWorkoutReviewPage from '\.\/BSWorkoutReview\.jsx';$/m);
  assert.doesNotMatch(pros, /function (BSWorkoutReviewPage|demoWorkoutReviewSessions|formatReviewSeconds|BSReviewLook)\(/, 'the page left Pros whole');
  assert.doesNotMatch(pros, /__reviewLook/);
  assert.match(pros, /takeover\(<BSWorkoutReviewPage role="trainer" onBack=\{/);
  assert.match(pros, /takeover\(<BSWorkoutReviewPage role="nutritionist" onBack=\{/);
});

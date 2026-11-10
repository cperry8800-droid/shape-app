// Eat's Coming up and meal plan (BSEatPlan.jsx; owner, 2026-11-10: "add a 'Coming up' preview of the next days'
// meals to Eat, and a pop-up of the full week's meal plan, the same way Train now works"), MOUNTED in jsdom with
// the shipping module and real React and react-dom: the next three days as previews opening the plan on their
// day; the sheet on the phone surface with every day and meal in full, today framed, what the member did to a
// meal said, and its doors; no button in a button; 44px targets. Then the page's wiring (Eat hands it the week,
// its meals as the menu shows them, and its doors), and the nutritionist's playlists matched to the days and
// meals they play with ("have the music assigned … show 'For Sun prep' labels on Eat's playlists").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="bs-phone-surface"></div></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOM = require_('react-dom');
const ReactDOMClient = require_('react-dom/client');

const cats = Object.fromEntries(['session', 'home', 'common', 'nutrition'].map((ns) => [ns, JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/en/${ns}.json`), 'utf8'))]));
W.ShapeI18n = {
  t: (key, opts = {}) => { const [ns, k] = key.split(':'); const msg = cats[ns] ? cats[ns][k] : undefined; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); },
  intlLocale: () => 'en-US',
};
const THEME = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', HEAD: 'head', PAPER: '#141210', INK: '#f2ede4', INK70: 'rgba(242,237,228,0.7)', INK50: 'rgba(242,237,228,0.5)', HAIR: 'rgba(242,237,228,0.1)', RULE: 'rgba(242,237,228,0.2)', ACCENT: '#34d6c5', padX: 22, sectGap: 22, isLight: false, RUST: '#c0533b', GREEN: '#4fae5a', AMBER: '#d8a23a' };
W.useBS = () => THEME;

const E = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSEatPlan.jsx'), { registry: new Map([['react', React], ['react-dom', ReactDOM]]) });
const { bsEatPlaylistCards, bsEatPlaylistEntries, bsNodeText, bsPlaylistOf } = await import(pathToFileURL(join(ROOT, 'mobile-app/src/broadsheet/bsTrainPlaylists.mjs')).href);

const TODAY = (new Date().getDay() + 6) % 7;
const meal = (id, time, title, extra = {}) => ({ id, time, tag: 'LUNCH', title, kcal: 500, p: 40, c: 50, f: 15, sub: '500 kcal · 40P · 50C · 15F', ...extra });
function week() {
  const w = Array.from({ length: 7 }, (_, i) => ({ d: 'x', tag: 'TRAIN', title: `Day ${i}`, headline: `Day ${i}`, meta: '3 meals · 1900 kcal', copy: '', meals: [meal(`b${i}`, '7:00 AM', `Oats ${i}`), meal(`l${i}`, '12:30 PM', `Bowl ${i}`), meal(`d${i}`, '7:00 PM', `Salmon ${i}`)] }));
  w[TODAY].meals.push(meal('s', '4:00 PM', 'Yogurt'), meal('x', '9:00 PM', 'Tea'));
  w[(TODAY + 1) % 7] = { ...w[(TODAY + 1) % 7], headline: React.createElement(React.Fragment, null, 'Sunday', React.createElement('br'), 'simple.'), playlist: { id: 'p1', name: 'Meal prep, low-key', meta: '12 tracks' } };
  w[(TODAY + 2) % 7].meals[2] = meal('dd', '7:00 PM', 'Steak night', { playlist: { name: 'Dinner jazz' }, coachNote: 'Rest it five minutes.' });
  w[(TODAY + 4) % 7] = { d: 'x', tag: 'OPEN', title: 'Open day', headline: 'No menu', meta: 'No meals planned', copy: 'No meals planned for today.', meals: [] };
  return w;
}

async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  const scope = document;
  const q = (sel) => scope.querySelector(sel);
  const qa = (sel) => [...scope.querySelectorAll(sel)];
  const click = (node) => React.act(async () => { node.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); });
  return { q, qa, click, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}

test('Coming up: the next three days as previews, each opening the meal plan on its day; Plan opens it on today', async () => {
  const plan = [];
  const m = await mount(React.createElement(E.BSEatComingUp, { program: week(), onPlan: (i) => plan.push(i) }));
  try {
    const rows = m.qa('[data-eat-coming-day]');
    assert.equal(rows.length, 3);
    rows.forEach((row, i) => assert.equal(row.getAttribute('data-eat-coming-day'), String((TODAY + i + 1) % 7)));
    const [first, second] = rows;
    assert.match(first.textContent, /Tomorrow/);
    assert.match(first.textContent, /Sundaysimple\./, 'the day\'s own headline');
    assert.match(first.textContent, /3 meals · 1900 kcal/);
    assert.equal(first.querySelectorAll('[data-eat-coming-meals] > span').length, 3, 'its meals, at most three');
    assert.match(first.querySelector('[data-eat-coming-meals]').textContent, /7:00 AMOats/);
    assert.match(first.querySelector('[data-eat-playlist]').textContent, /♪ Meal prep, low-key/, 'the day\'s playlist');
    assert.match(second.querySelector('[data-eat-playlist]').textContent, /♪ Dinner jazz/, 'a meal\'s playlist');
    assert.ok(!m.qa('[data-eat-coming-dow]').some((n) => /\d/.test(n.textContent)), 'no date: past Sunday it reads this week\'s day again');
    await m.click(second);
    await m.click(m.q('[data-eat-plan-open]'));
    assert.deepEqual(plan, [(TODAY + 2) % 7, null]);
  } finally { await m.close(); }
});

test('Coming up counts the meals past its first three, and reads them as the page hands them', async () => {
  const w = week();
  const idx = (TODAY + 1) % 7;
  w[idx].meals.push(meal('e1', '4:00 PM', 'Shake'), meal('e2', '9:00 PM', 'Casein'));
  const seen = [];
  const m = await mount(React.createElement(E.BSEatComingUp, { program: w, mealsOf: (i, off) => { seen.push([i, off]); return i === idx ? [meal('own', '6:00 AM', 'Planned toast', { _own: true }), ...w[i].meals] : w[i].meals; }, onPlan() {} }));
  try {
    const row = m.q(`[data-eat-coming-day="${idx}"]`);
    assert.match(row.textContent, /\+3 more/);
    assert.match(row.textContent, /Planned toast/, 'the meals as the page hands them');
    assert.deepEqual(seen.map((s) => s[1]), [1, 2, 3], 'each day is asked for with how far ahead it is');
  } finally { await m.close(); }
});

test('the meal plan: a dialog on the phone surface with every day and meal in full, today framed, and its doors', async () => {
  const calls = { close: 0, month: 0 };
  const w = week();
  const mealsOf = (i) => (i === TODAY ? [{ ...w[i].meals[0], title: 'Eggs', _swapped: true }, ...w[i].meals.slice(1), meal('own', '8:00 PM', 'Planned pasta', { _own: true })] : w[i].meals);
  const m = await mount(React.createElement(E.BSEatPlanSheet, { program: w, focusIdx: (TODAY + 2) % 7, planName: 'Lean build', coach: 'Dr. Maya Patel', mealsOf, onClose: () => { calls.close += 1; }, onMonth: () => { calls.month += 1; } }));
  try {
    const dlg = m.q('[data-eat-plan]');
    assert.ok(dlg && dlg.closest('#bs-phone-surface'));
    assert.equal(dlg.getAttribute('role'), 'dialog');
    assert.equal(dlg.getAttribute('aria-label'), 'Meal plan');
    assert.match(dlg.textContent, /Lean build · Dr\. Maya Patel/);
    assert.ok(document.activeElement === dlg, 'focus moves into the sheet');
    assert.equal(m.qa('[data-eat-plan-day]').length, 7);
    assert.equal(m.q(`[data-eat-plan-jump="${(TODAY + 2) % 7}"]`).getAttribute('aria-current'), 'true', 'it opens on the day asked for');
    const today = m.q(`[data-eat-plan-day="${TODAY}"]`);
    assert.match(today.textContent, /Today/);
    assert.match(today.style.borderLeft, /3px solid/);
    assert.equal(today.querySelectorAll('[data-eat-plan-meal]').length, 6);
    assert.match(today.textContent, /7:00 AMEggs500 kcal/, 'its time, the meal, its macros');
    assert.match(today.textContent, /SWAPPED/);
    assert.match(today.textContent, /Planned by you/);
    const steak = m.q(`[data-eat-plan-day="${(TODAY + 2) % 7}"]`);
    assert.match(steak.textContent, /Rest it five minutes\./, 'the nutritionist\'s note');
    assert.match(steak.querySelector('[data-eat-playlist]').textContent, /Dinner jazz/);
    assert.match(m.q(`[data-eat-plan-day="${(TODAY + 1) % 7}"]`).querySelector('[data-eat-playlist]').textContent, /Meal prep, low-key/);
    const open = m.q(`[data-eat-plan-day="${(TODAY + 4) % 7}"]`);
    assert.match(open.textContent, /No meals planned/);
    assert.ok(!open.querySelector('[data-eat-plan-meals]'));
    await m.click(m.q(`[data-eat-plan-jump="${TODAY}"]`));
    assert.equal(m.q(`[data-eat-plan-jump="${TODAY}"]`).getAttribute('aria-current'), 'true');
    await m.click(m.q('[data-eat-plan-close]'));
    await m.click(dlg);
    await m.click(m.q('[data-eat-plan-scrim]'));
    await React.act(async () => { document.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape' })); });
    assert.equal(calls.close, 3, '×, the scrim and Escape close it; a tap inside does not');
    await m.click(m.q('[data-eat-plan-month]'));
    assert.equal(calls.month, 1);
  } finally { await m.close(); }
});

test('no button inside a button, and every button a 44px target', async () => {
  for (const el of [React.createElement(E.BSEatComingUp, { program: week(), onPlan() {} }), React.createElement(E.BSEatPlanSheet, { program: week(), onClose() {}, onMonth() {} })]) {
    const m = await mount(el);
    try {
      for (const b of m.qa('button')) {
        assert.ok(!b.parentElement.closest('button'), 'a button inside a button');
        const h = parseFloat(b.style.minHeight || '0');
        assert.ok(h >= 44, `${b.textContent || b.getAttribute('aria-label')} is ${h}px`);
      }
    } finally { await m.close(); }
  }
});

test('the module stands alone: no import of the client, globals read at call time', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSEatPlan.jsx'), 'utf8');
  assert.doesNotMatch(src, /from '\.\/iosAppBroadsheetClient/);
  assert.doesNotMatch(src.split('export function')[0], /window\.useBS\(\)/);
});

// ── The page's wiring ──
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
test('Eat hands Coming up and the meal plan its week, its meals as the menu shows them, and its doors', () => {
  assert.match(CLIENT, /<BSEatComingUp program=\{PROGRAM\} mealsOf=\{eatMealsOf\} onPlan=\{\(idx\) => setEatPlanAt\(Number\.isInteger\(idx\) \? idx : bsWeekdayIdx\(\)\)\} \/>/);
  assert.match(CLIENT, /label=\{tr\('nutrition:eat\.mealPlan', \{ defaultValue: 'Meal plan' \}\)\} tag=\{liveMealTitle \|\| ''\} onOpen=\{\(\) => setEatPlanAt\(bsWeekdayIdx\(\)\)\}/);
  assert.match(CLIENT, /<BSEatPlanSheet program=\{PROGRAM\} focusIdx=\{eatPlanAt\}[^>]*mealsOf=\{\(i\) => eatMealsOf\(i\)\} onClose=\{\(\) => setEatPlanAt\(null\)\} onMonth=\{\(\) => \{ setEatPlanAt\(null\); goCalendar\(\); \}\}/);
  // The meals as the menu shows them: the swap by title, then that date's own swap, then the member's planned meals.
  const fn = CLIENT.slice(CLIENT.indexOf('const eatMealsOf = '), CLIENT.indexOf('const _eatRows = '));
  assert.match(fn, /const ov = mealOverrides\[m\.title\];/);
  assert.match(fn, /const ds = md\.swap\[m\.id\];/);
  assert.match(fn, /md\.add\.map\(/);
  assert.match(fn, /bsMealDayOf\(myDays, bsYmdAdd\(bsLocalDay\(Date\.now\(\)\), off != null \? off : idx - bsWeekdayIdx\(\)\)\)/);
  // The sheet sits in the clean area (bsCleanSheet carries its type out), before it closes.
  const clean = CLIENT.indexOf('<BSEatPlanSheet');
  assert.ok(clean > 0 && CLIENT.indexOf('</BSCleanType>', clean) - clean < 600);
});

test('the plan carries the nutritionist\'s playlists on its days and meals into Eat', () => {
  assert.match(CLIENT, /playlist: bsPlaylistOf\(meal\.playlist\),/);
  assert.match(CLIENT, /playlist: bsPlaylistOf\(dy\.playlist\),/);
  assert.match(CLIENT, /<BSCoachPlaylists role="nutritionist" signedIn=\{bsEatSignedIn\} demo=\{\{ who, items \}\} program=\{PROGRAM\} todayIdx=\{bsWeekdayIdx\(\)\} planCoach=/);
  const eat = CLIENT.slice(CLIENT.indexOf("const lists = all.filter(p => p.role === 'Nutritionist');"));
  assert.doesNotMatch(eat.slice(0, 900), /p\.attached/, 'the sample\'s "Sun prep" still rides in its meta');
  assert.deepEqual(bsPlaylistOf({ id: 7, name: ' Jazz ', meta: null }), { id: '7', name: 'Jazz', meta: '' });
  assert.equal(bsPlaylistOf({ name: '  ' }), null);
  assert.equal(bsPlaylistOf(null), null);
});

// ── The nutritionist's playlists, matched to their days and meals ──
test('Eat\'s entries are its days\' and its meals\' playlists, a rest day\'s too, titled in words', () => {
  const w = week();
  w[(TODAY + 3) % 7] = { ...w[(TODAY + 3) % 7], tag: 'REST', playlist: { name: 'Slow Sunday' } };
  const entries = bsEatPlaylistEntries(w);
  assert.deepEqual(entries.map((e) => [e.idx, e.title, e.playlist.name]).sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])), [
    [(TODAY + 1) % 7, 'Sunday simple.', 'Meal prep, low-key'],
    [(TODAY + 2) % 7, 'Steak night', 'Dinner jazz'],
    [(TODAY + 3) % 7, `Day ${(TODAY + 3) % 7}`, 'Slow Sunday'],
  ].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])));
  assert.equal(bsNodeText(React.createElement(React.Fragment, null, 'Slow-roast', React.createElement('br'), 'chicken.')), 'Slow-roast chicken.');
});

test('Eat\'s cards: matched by id, then by name; a day\'s or a meal\'s playlist not in the list gets its own card', () => {
  const cards = bsEatPlaylistCards([{ id: 'p1', title: 'Renamed prep mix', k: 'list' }, { title: 'Unused' }], week(), TODAY);
  assert.deepEqual(cards.map((c) => [c.title, c.uses.map((u) => u.title), !!c.onlyOnDay]), [
    ['Renamed prep mix', ['Sunday simple.'], false],
    ['Dinner jazz', ['Steak night'], true],
    ['Unused', [], false],
  ]);
});

test('the meal plan keeps focus in (Tab wraps) and hands it back to what opened it', async () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  const m = await mount(React.createElement(E.BSEatPlanSheet, { program: week(), onClose() {}, onMonth() {} }));
  try {
    const dlg = m.q('[data-eat-plan]');
    assert.ok(document.activeElement === dlg);
    const buttons = [...dlg.querySelectorAll('button')];
    buttons[buttons.length - 1].focus();
    await React.act(async () => { document.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
    assert.ok(document.activeElement === buttons[0], 'Tab on the last control wraps to the first');
  } finally { await m.close(); }
  assert.ok(document.activeElement === opener, 'closing hands focus back');
  opener.remove();
});

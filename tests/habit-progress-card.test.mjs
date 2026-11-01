// The habits page's today block and Progress card (owner, 2026-10-24), MOUNTED in jsdom with the
// shipping module: the day's points and tick buttons, the week chart and the month calendar, a
// tapped day's detail, and paging that stops at today.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { hpAddDays, hpLocalYmd, hpDaysInMonth } from '../mobile-app/src/broadsheet/habitProgress.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

const cat = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/habits.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => { const [ns, k] = key.split(':'); const msg = ns === 'habits' ? cat[k] : undefined; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); },
  intlLocale: () => 'en-US',
};
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', RUST: '#c0533b', BLUE: '#4a7bd0', padX: 18, isLight: true };
W.useBS = () => theme;
globalThis.useBS = W.useBS;

const H = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetHabits.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSHabitProgress, BSHabitToday };',
});

const TODAY = hpLocalYmd(new Date());
const back = (n) => hpAddDays(TODAY, -n);
// Water every day for the last 20 days; vitamins every other day; smoking clean all along but
// not ticked yet today.
const HABITS = [
  { id: 'w', name: 'Water', type: 'do', history: Array.from({ length: 20 }, (_, i) => back(i)) },
  { id: 'v', name: 'Vitamins', type: 'do', history: Array.from({ length: 10 }, (_, i) => back(2 * i + 1)) },
  { id: 's', name: 'Smoking', type: 'avoid', history: Array.from({ length: 19 }, (_, i) => back(i + 1)) },
];

async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.getAttribute('aria-label') || '') || re.test(b.textContent));
  const click = async (re) => { const b = btn(re); assert.ok(b, `no button ${re} in: ${host.textContent.slice(0, 400)}`); await React.act(async () => { b.click(); }); };
  return { host, text: () => host.textContent, btn, click, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}

test('today: points banked against points on offer, what is left, and a button per habit', async () => {
  const m = await mount(React.createElement(H.BSHabitToday, { habits: HABITS, onToggle() {}, onRemove() {}, onAdd() {}, reminders: {} }));
  assert.match(m.text(), /\+3 of 9 pts today/);
  assert.match(m.text(), /2 to go/);
  const bar = m.host.querySelector('[role="progressbar"]');
  assert.equal(bar.getAttribute('aria-valuenow'), '1');
  assert.equal(bar.getAttribute('aria-valuemax'), '3');
  const ticks = [...m.host.querySelectorAll('button[aria-pressed]')];
  assert.deepEqual(ticks.map((b) => b.getAttribute('aria-pressed')), ['true', 'false', 'false'], 'to-dos first, then to-don’ts');
  assert.match(ticks[0].textContent, /Water.*Kept/);
  assert.match(ticks[2].textContent, /Smoking.*19 days clean/);
  assert.ok(m.btn(/Add a to-do/) && m.btn(/Add a to-don’t/));
  await m.close();
});

test('today with no habits asks for the first one', async () => {
  const m = await mount(React.createElement(H.BSHabitToday, { habits: [], onToggle() {}, onRemove() {}, onAdd() {}, reminders: {} }));
  assert.match(m.text(), /Add a habit — daily points live here\./);
  assert.ok(!m.host.querySelector('[role="progressbar"]'), 'no progress bar without habits');
  await m.close();
});

test('the week: a column a day, today’s open habits, a tapped day’s detail, no paging past today', async () => {
  const m = await mount(React.createElement(H.BSHabitProgress, { habits: HABITS }));
  assert.match(m.text(), /Your week\./);
  assert.match(m.text(), /kept so far/);
  const days = [...m.host.querySelectorAll('[aria-label="Habits kept each day"] button')];
  assert.equal(days.length, 7);
  assert.ok(m.btn(/Next week/).disabled, 'the week holding today is the last one');
  assert.ok(!m.btn(/Previous week/).disabled);
  assert.match(m.text(), /Tap a day to see it/);
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  await m.click(new RegExp(`^${todayLabel}: 1 of 3 kept$`));
  assert.match(m.text(), /1 of 3 kept/);
  assert.match(m.text(), /✓ Water/);
  assert.match(m.text(), /○ Vitamins/);
  assert.match(m.text(), /○ Smoking/);
  await m.click(/Previous week/);
  assert.ok(!m.btn(/Next week/).disabled);
  assert.doesNotMatch(m.text(), /so far/, 'a past week is complete');
  await m.close();
});

test('the month: a calendar of every day, its legend, rates by habit and the best run', async () => {
  const m = await mount(React.createElement(H.BSHabitProgress, { habits: HABITS }));
  await m.click(/^Month$/);
  assert.match(m.text(), /Your month\./);
  const cells = [...m.host.querySelectorAll('[aria-label="Habits kept each day this month"] button')];
  assert.equal(cells.length, hpDaysInMonth(TODAY));
  assert.match(m.text(), /Habits keptNoneSomeMostAll/);
  // On the 1st the month holds one day, so its best run is "1 day" (progress.bestRun's own plural).
  assert.match(m.text(), /Best run · (Water|Smoking), (1 day(?!s)|\d+ days)/);
  assert.match(m.text(), /By habit/);
  assert.ok(m.btn(/Next month/).disabled);
  await m.close();
});

// Codex P2 on #2437: the page left open past Sunday night (signed out, nothing remounts the card)
// moves the card on with today, but a week paged back to stays where it was.
test('the card follows today into the new week, and a week paged back to stays put', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 9, 25, 23, 59, 50).getTime() });
  const habits = [{ id: 'w', name: 'Water', type: 'do', history: ['2026-10-20', '2026-10-25'], createdOn: '2026-10-01' }];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const draw = () => React.act(async () => { root.render(React.createElement(H.BSHabitProgress, { habits })); });
  const btn = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.getAttribute('aria-label') || ''));
  const range = () => btn(/Previous week/).nextElementSibling.textContent; // the week between the arrows
  await draw();
  assert.match(range(), /^Oct 19\W+25$/);
  assert.match(host.textContent, /so far/, 'Sunday the 25th is in the current week');
  t.mock.timers.tick(20000);
  await draw(); // the page's midnight refresh draws it again
  assert.match(range(), /^Oct 26\W+Nov 1$/, 'Monday moves the card to the new week');
  assert.match(host.textContent, /so far/);
  assert.ok(btn(/Next week/).disabled, 'and the new week is the last one');
  await React.act(async () => { btn(/Previous week/).click(); });
  assert.match(range(), /^Oct 19\W+25$/);
  t.mock.timers.tick(7 * 864e5);
  await draw();
  assert.match(range(), /^Oct 19\W+25$/, 'a week paged back to is not moved');
  await React.act(async () => { btn(/Next week/).click(); });
  await React.act(async () => { btn(/Next week/).click(); });
  assert.match(range(), /^Nov 2\W+8$/, 'paging forward reaches the week holding today');
  assert.ok(btn(/Next week/).disabled);
  await React.act(async () => { root.unmount(); host.remove(); });
});

// Codex P2 on #2437: a habit deleted today still counts what it kept, and has its row this week.
test('a deleted habit still counts on the card', async () => {
  const live = { id: 'r', name: 'Read', type: 'do', createdOn: back(10), history: [TODAY] };
  const gone = { id: 'g', name: 'Water', type: 'do', createdOn: back(10), archivedOn: TODAY, history: [TODAY] };
  const without = await mount(React.createElement(H.BSHabitProgress, { habits: [live] }));
  assert.doesNotMatch(without.text(), /Water/);
  await without.close();
  const m = await mount(React.createElement(H.BSHabitProgress, { habits: [live], archived: [gone] }));
  assert.match(m.text(), /By habit.*Water/);
  const label = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
  assert.ok(m.btn(new RegExp(`^${label}: 2 of 2 kept$`)), 'today counts both');
  await m.close();
});

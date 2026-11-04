// tests/habits-dial.test.mjs
//
// The Habits page as option A. Owner, 2026-11-04: "new design ideas for habits page", then of three built
// in the app "go with A": today's points in a ring of one segment per habit (lit once kept), the two add
// keys beside it, every habit a glass row carrying this week, and Week | Month two quiet words.
// MOUNTED in jsdom with the shipping module.
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

const ROW = (m, name) => [...m.host.querySelectorAll('[data-habit-row]')].find((r) => r.textContent.includes(name));

test('the dial: a segment per habit in the list\'s order, lit only once kept, the points in its middle', async () => {
  const m = await mount(React.createElement(H.BSHabitToday, { habits: HABITS, onToggle() {}, onRemove() {}, onAdd() {}, reminders: {} }));
  const segs = [...m.host.querySelectorAll('[data-dial-seg]')].map((g) => g.getAttribute('data-dial-seg'));
  assert.deepEqual(segs, ['kept', 'open', 'open'], 'water kept, vitamins and the to-don\'t open');
  // The ring is the progress, and it reads as a sentence.
  const bar = m.host.querySelector('[role="progressbar"]');
  assert.ok(bar.querySelector('[data-dial-seg]'), 'the progress is not the ring');
  assert.match(bar.textContent, /^\+3 of 9 pts today$/);
  // The add keys stand beside it, with what is left above them.
  assert.ok(m.btn(/Add a to-do/) && m.btn(/Add a to-don’t/));
  assert.match(m.text(), /2 to go/);
  await m.close();
});

test('every habit is a glass row carrying this week, Monday first, from the history', async () => {
  const m = await mount(React.createElement(H.BSHabitToday, { habits: HABITS, onToggle() {}, onRemove() {}, onAdd() {}, reminders: {} }));
  const dow = (new Date().getDay() + 6) % 7; // today's place in a Monday-first week
  const week = (name) => [...ROW(m, name).querySelectorAll('[data-habit-week] [data-day]')].map((s) => s.getAttribute('data-day'));
  for (const name of ['Water', 'Vitamins', 'Smoking']) assert.equal(week(name).length, 7, `${name} carries no week`);
  // Water: every day kept up to today, nothing after it.
  assert.deepEqual(week('Water'), Array.from({ length: 7 }, (_, i) => (i <= dow ? 'kept' : 'future')));
  // Smoking: clean every day before today, today still open.
  assert.equal(week('Smoking')[dow], 'open');
  assert.ok(week('Smoking').slice(0, dow).every((s) => s === 'kept'));
  // A kept habit lights its row; the others stay open.
  assert.equal(ROW(m, 'Water').getAttribute('data-habit-row'), 'kept');
  assert.equal(ROW(m, 'Smoking').getAttribute('data-habit-row'), 'open');
  // Each row keeps its two controls: the tick and the 44px options key.
  const opts = ROW(m, 'Water').querySelector('button[aria-label^="Options for"]');
  assert.equal(opts.style.width, '44px');
  await m.close();
});

test('Week and Month are two quiet words, each a 44px tap, the lit one over the accent', async () => {
  const m = await mount(React.createElement(H.BSHabitProgress, { habits: HABITS }));
  const group = m.host.querySelector('[aria-label="Chart period"]');
  assert.ok(!group.style.border && !group.style.background, 'the switch is a box again');
  const [week, month] = [...group.querySelectorAll('button')];
  assert.equal(week.style.minHeight, '44px');
  assert.equal(week.getAttribute('aria-pressed'), 'true');
  assert.match(week.querySelector('span').style.borderBottom, /2px solid/);
  assert.match(month.querySelector('span').style.borderBottom, /transparent/);
  await m.close();
});

test('the add keys wrap a long translation rather than running out of the key (Codex P2 on #2598)', () => {
  const SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetHabits.jsx'), 'utf8');
  const key = SRC.slice(SRC.indexOf('const addKey = (type) => ('), SRC.indexOf('if (habits.length === 0) {'));
  assert.doesNotMatch(key, /whiteSpace: 'nowrap'/, 'the label cannot wrap');
  assert.match(key, /minHeight: 44, padding: '6px 16px 6px 14px'[^\n]*lineHeight: 1\.2, textAlign: 'left', overflowWrap: 'anywhere'/);
  assert.match(key, /<span aria-hidden style=\{\{ flex: 'none', color: tone\(type\)/, 'the ＋ gives way to the words');
});

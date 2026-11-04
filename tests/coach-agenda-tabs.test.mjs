// Coach Today's To do and Schedule as two tabs over one list (owner, 2026-11-04: "also figure out way to combine
// this to together that looks clean and easy to read", of the two sections, then "b" "for coach today"). MOUNTED:
// BSProAgendaTabs from the shipping iosAppBroadsheetPros.jsx in jsdom. The tab with something to do opens first,
// Schedule while the roster is still reading or nothing is flagged; a tab the coach picks stays picked; each tab is
// a 44px target in a tablist that says which is selected and which panel it shows; the row's end is the shown
// tab's door, and Schedule carries the day it shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.localStorage = W.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
W.ShapeI18n = { t: () => undefined, intlLocale: () => 'en' };
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', AMBER: '#d8b25a', RUST: '#c0533b', GREEN: '#5fa96e', BLUE: '#4a7bd0', padX: 18, isLight: true };
W.useBS = () => theme;

const PROS = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSProAgendaTabs };',
});
const SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');

async function mount(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const el = (p) => React.createElement(PROS.BSProAgendaTabs, {
    t: theme, heat: '#c0533b', todoLabel: 'To do', schedLabel: 'Schedule', date: 'Wed, Nov 4',
    todoLink: React.createElement('button', { type: 'button', 'data-link': 'clients' }, 'All clients →'),
    schedLink: React.createElement('button', { type: 'button', 'data-link': 'calendar' }, 'Calendar'),
    todo: React.createElement('div', { 'data-body': 'todo' }, 'the ledger'),
    sched: React.createElement('div', { 'data-body': 'sched' }, 'the day'),
    ...p,
  });
  await React.act(async () => { root.render(el(props)); });
  return {
    host,
    tab: (k) => host.querySelector(`[data-agenda-tab="${k}"]`),
    panel: () => host.querySelector('[role="tabpanel"]'),
    rerender: async (p) => { await React.act(async () => { root.render(el({ ...props, ...p })); }); },
    click: async (b) => { await React.act(async () => { b.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); }); },
    unmount: () => React.act(async () => { root.unmount(); host.remove(); }),
  };
}

test('To do opens first when there is something to do; its count and door ride the row', async () => {
  const m = await mount({ todoCount: 4, schedCount: 8 });
  try {
    const tablist = m.host.querySelector('[role="tablist"]');
    assert.ok(tablist, 'no tablist');
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    assert.deepEqual(tabs.map((b) => b.textContent), ['To do4', 'Schedule8']);
    assert.deepEqual(tabs.map((b) => b.getAttribute('aria-selected')), ['true', 'false']);
    assert.ok(tabs.every((b) => b.style.minHeight === '44px'), 'a tab is under 44px');
    assert.equal(m.panel().getAttribute('aria-labelledby'), m.tab('todo').id);
    assert.equal(m.tab('todo').getAttribute('aria-controls'), m.panel().id);
    assert.ok(m.host.querySelector('[data-body="todo"]') && !m.host.querySelector('[data-body="sched"]'));
    assert.ok(m.host.querySelector('[data-link="clients"]') && !m.host.querySelector('[data-link="calendar"]'), 'the door is not the shown tab\'s');
    assert.ok(!m.host.querySelector('[data-agenda-date]'), 'the day shows over To do');
    // The shown tab is underlined in the role's heat; the other is quiet.
    assert.match(m.tab('todo').firstElementChild.style.borderBottom, /2px solid (rgb\(192, 83, 59\)|#c0533b)/);
    assert.match(m.tab('sched').firstElementChild.style.borderBottom, /transparent/);
  } finally { await m.unmount(); }
});

test('Schedule opens first while the roster reads or nothing is flagged, with the day it shows and Calendar', async () => {
  for (const todoCount of [null, 0]) {
    const m = await mount({ todoCount, schedCount: 3 });
    try {
      assert.equal(m.tab('sched').getAttribute('aria-selected'), 'true', `todoCount ${todoCount}`);
      assert.ok(m.host.querySelector('[data-body="sched"]'));
      assert.equal(m.host.querySelector('[data-agenda-date]').textContent, 'Wed, Nov 4');
      assert.ok(m.host.querySelector('[data-link="calendar"]'));
      if (todoCount == null) assert.equal(m.tab('todo').textContent, 'To do', 'a count shows before the roster has read');
    } finally { await m.unmount(); }
  }
});

test('a tab the coach picks stays picked when the counts change', async () => {
  const m = await mount({ todoCount: null, schedCount: 3 });
  try {
    // The roster reads in with work to do: To do takes over, as nothing was picked yet.
    await m.rerender({ todoCount: 2 });
    assert.equal(m.tab('todo').getAttribute('aria-selected'), 'true');
    // The coach picks Schedule; a count changing after keeps it.
    await m.click(m.tab('sched'));
    assert.equal(m.tab('sched').getAttribute('aria-selected'), 'true');
    await m.rerender({ todoCount: 5 });
    assert.equal(m.tab('sched').getAttribute('aria-selected'), 'true', 'the coach\'s pick was undone');
    await m.click(m.tab('todo'));
    assert.ok(m.host.querySelector('[data-body="todo"]'));
  } finally { await m.unmount(); }
});

test('Today draws the tabs in place of the two sections, with the ledger and the day as their panels', () => {
  const today = SRC.slice(SRC.indexOf('function BSProToday('), SRC.indexOf('{/* SHORTCUTS — the doors'));
  assert.match(today, /<BSProAgendaTabs t=\{t\} heat=\{heat\}/);
  assert.match(today, /todoCount=\{rosterReady \? todoCount : null\}/);
  assert.match(today, /schedCount=\{bookings\.length\}/);
  assert.match(today, /todo=\{\(\s*<div data-todo-ledger=/);
  assert.match(today, /sched=\{\(\s*<div\s+onClick=\{\(e\) => \{ if \(e\.target && e\.target\.closest && e\.target\.closest\('button'\)\) return; goCalendar\(\); \}\}/);
  assert.doesNotMatch(today, /<section aria-label=\{tr\('coach:today\.todo'/, 'the To do section is back on its own');
  assert.doesNotMatch(today, /<section aria-label=\{tr\('coach:rail\.schedule'/, 'the Schedule section is back on its own');
});

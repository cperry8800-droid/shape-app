// tests/eat-day.test.mjs
//
// EAT'S DAY VIEW in the owner's pick for Eat (2026-11-04: "option C for eat but use this for fuel section and 2nd
// image for fuel left today"), restored the same day ("use this again"). BSEatDay.jsx draws the top of Eat's Day
// view under its head and tabs: the week as round days, Fuel left as a ring beside the macros, the next meal on a
// lit lead, and the menu. Eat hands it its figures and its doors (focus-layout.test.mjs drives Eat for that);
// this file MOUNTS the shipping module in jsdom and checks what it shows and what each tap does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app', 'src', 'broadsheet', 'BSEatDay.jsx');

// ⚠ THE MODULE READS NO WINDOW GLOBAL WHILE IT EVALUATES. The client imports it statically, so it evaluates
// before the client's body publishes its globals: a read at module top is React #130 on first open. Measured
// before jsdom exists, with a window that records every read.
test('evaluating BSEatDay.jsx reads no window global, and it never imports the client module', async () => {
  const reads = [];
  const recorder = new Proxy({}, {
    get: (_t, prop) => { reads.push(String(prop)); return undefined; },
    has: (_t, prop) => { reads.push(String(prop)); return false; },
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: recorder, configurable: true, writable: true });
  let mod;
  try {
    mod = await loadRealModule(SRC, { registry: new Map([['react', require_('react')]]) });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window;
  }
  assert.equal(typeof mod.BSEatDay, 'function');
  assert.deepEqual(reads, [], `the module read window.${reads.join(', window.')} while it was being evaluated`);
  const src = readFileSync(SRC, 'utf8');
  assert.doesNotMatch(src, /from '\.\/iosAppBroadsheetClient/, 'a feature module never imports back into the client');
});

// ── A real mount ─────────────────────────────────────────────────────────────────────────────────

const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const { act } = React;

// English off the real `en` catalog, formatted as ICU the way the app formats it.
const { IntlMessageFormat } = require_('intl-messageformat');
const CAT = new Map();
const catalog = (ns) => {
  if (!CAT.has(ns)) {
    const p = join(ROOT, 'mobile-app', 'src', 'i18n', 'catalogs', 'en', `${ns}.json`);
    CAT.set(ns, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);
  }
  return CAT.get(ns);
};
dom.window.ShapeI18n = {
  t(key, opts) {
    const i = String(key).indexOf(':');
    const raw = i < 0 ? null : (catalog(key.slice(0, i)) || {})[key.slice(i + 1)];
    if (raw == null) return undefined;
    return String(new IntlMessageFormat(raw, 'en').format(opts || {}));
  },
};

// The Black and the Cream papers' tokens (makePalette's dark and light), as useBS hands them.
const PAPERS = {
  dark: { isLight: false, PAPER: '#0f0e0c', PAPER2: '#181612', INK: '#f5f0e6', inkRGB: '245,240,230', ACCENT: '#34d6c5' },
  light: { isLight: true, PAPER: '#f5f0e6', PAPER2: '#ede6d6', INK: '#0f0e0c', inkRGB: '15,14,12', ACCENT: '#0a8f87' },
};
const theme = (paper) => {
  const P = PAPERS[paper];
  const a = (x) => `rgba(${P.inkRGB},${x})`;
  return { ...P, INK70: a(0.7), INK50: a(0.5), INK30: a(0.28), RULE: a(0.2), HAIR: a(0.1), MONO: 'mono', DISPLAY: 'display', BODY: 'body',
    RUST: '#e0654b', AMBER: '#e3a544', BLUE: '#5b8df9', GREEN: '#4fae5a', padX: 18, sectGap: 22, W: { display: 300 } };
};
let PAPER = 'dark';
dom.window.useBS = () => theme(PAPER);

const { BSEatDay } = await loadRealModule(SRC, { registry: new Map([['react', React]]) });

const fmt12 = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const minOf = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const TIMES = { m1: '07:30', m2: '12:30', m3: '19:00' };
const SLOTS = { BFAST: 'Breakfast', LUNCH: 'Lunch', DINR: 'Dinner' };
const todayIdx = (new Date().getDay() + 6) % 7;
const thisWeek = () => {
  const now = new Date();
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - todayIdx);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
};

function fixture(over = {}) {
  const calls = { day: [], month: 0, macro: [], log: [], swap: [], pick: 0, open: [] };
  const meals = [
    { id: 'm1', tag: 'BFAST', title: 'Oats and whey', kcal: 520, p: 38, c: 60, f: 9, state: 'done' },
    { id: 'm2', tag: 'LUNCH', title: 'Chicken bowl', kcal: 640, p: 46, c: 70, f: 14, state: 'next' },
    { id: 'm3', tag: 'DINR', title: 'Salmon rice', kcal: 610, p: 42, c: 55, f: 18 },
  ];
  const rows = meals.map((m) => ({
    key: m.id, time: fmt12(TIMES[m.id]), title: m.title, sub: `${m.kcal} kcal · ${m.p}P · ${m.c}C · ${m.f}F`,
    note: m.state === 'done' ? '✓' : m.state === 'next' ? 'NEXT' : '', state: m.state === 'done' ? 'done' : m.state === 'next' ? 'next' : '',
    // The menu's shop list rides under a row, outside its button.
    below: m.id === 'm3' ? React.createElement('button', { type: 'button', 'data-test-shop': '', style: { minHeight: 32 } }, '4 to get') : null,
    onOpen: () => calls.open.push(m.id), ariaLabel: `${fmt12(TIMES[m.id])} · ${m.title}`,
  }));
  const props = {
    tools: null, tabs: React.createElement('nav', { 'data-test-tabs': '' }),
    phase: 'Cut', weekN: 31, title: React.createElement(React.Fragment, null, 'Reset plate.'),
    day: todayIdx, todayIdx, onDay: (i) => calls.day.push(i), onMonth: () => { calls.month += 1; }, restFlags: [false, false, false, false, false, false, true],
    week: Array.from({ length: 7 }, (_, i) => ({ kcal: 1800 + i, kcalGoal: 2100, p: i % 2 ? 150 : 100, pGoal: 140, rest: false, planned: true })),
    fuel: {
      calLeft: 52, calTarget: 2100, calNow: 2048, calPct: 98, unread: false, calTargetKnown: false,
      macros: [
        { k: 'p', l: 'PROTEIN', v: 178, g: 180, c: '#e0654b', gKnown: false },
        { k: 'c', l: 'CARBS', v: 218, g: 220, c: '#e3a544', gKnown: false },
        { k: 'f', l: 'FAT', v: 70, g: 65, c: '#5b8df9', gKnown: false },
      ],
    },
    onMacro: (k) => calls.macro.push(k), notices: null, morning: null, empty: null,
    meals, rows, nowIdx: 1, nowText: '10:15 AM', nowMin: 615,
    next: meals[1], nextAt: minOf(TIMES.m2), ahead: true, until: { h: 2, m: 15 }, prev: { min: minOf(TIMES.m1), label: 'Breakfast', done: true }, arrivalPct: 54,
    slotOf: (m) => SLOTS[m.tag], timeOf: (m) => fmt12(TIMES[m.id]), minOf: (m) => (TIMES[m.id] ? minOf(TIMES[m.id]) : null), fmt12,
    macroRow: (m) => `${m.kcal} kcal · ${m.p}P · ${m.c}C · ${m.f}F`,
    onOpenMeal: (id) => calls.log.push(id), onSwapMeal: (id) => calls.swap.push(id), onSwapPick: () => { calls.pick += 1; },
    ...over,
  };
  return { props, calls };
}

async function mount(props, paper = 'dark') {
  PAPER = paper;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(React.createElement(BSEatDay, props)); });
  return {
    host,
    q: (sel) => host.querySelector(sel),
    qa: (sel) => [...host.querySelectorAll(sel)],
    click: async (el) => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); }); },
    rerender: async (next) => { await act(async () => { root.render(React.createElement(BSEatDay, next)); }); },
    unmount: async () => { await act(async () => { root.unmount(); }); host.remove(); },
  };
}

const follows = (a, b) => !!(a.compareDocumentPosition(b) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);

test('the page in order: the week, Fuel left, the next meal, the menu', async () => {
  const { props } = fixture();
  const m = await mount(props);
  try {
    const order = ['[data-week-strip="round"]', '[data-eat-fuel]', '[data-focus-link]', '[data-focus-lead="lit"]', '[data-eat-menu-head]', '[data-tour="hero-eat"]'].map((sel) => [sel, m.q(sel)]);
    for (const [sel, el] of order) assert.ok(el, `no ${sel}`);
    for (let i = 1; i < order.length; i += 1) assert.ok(follows(order[i - 1][1], order[i][1]), `${order[i][0]} is not after ${order[i - 1][0]}`);
  } finally { await m.unmount(); }
});

test('the week is seven round days: the picked one filled, today ringed, a rest day ticked; picking one asks the page', async () => {
  const { props, calls } = fixture();
  const m = await mount(props);
  try {
    const days = m.qa('[data-week-strip="round"] button[aria-pressed]');
    assert.equal(days.length, 7);
    assert.equal(days.filter((b) => b.getAttribute('aria-pressed') === 'true').length, 1);
    const picked = days[todayIdx].querySelector('[data-day-dot]');
    assert.match(picked.style.background, /#34d6c5|rgb\(52, 214, 197\)/, 'the picked day is filled in the accent');
    assert.equal(picked.style.borderRadius, '50%');
    assert.equal(days[todayIdx].querySelector('[data-day-dot]').textContent, String(thisWeek()[todayIdx].getDate()));
    const other = (todayIdx + 1) % 7;
    await m.click(days[other]);
    assert.deepEqual(calls.day, [other]);
    await m.click(m.qa('button').find((b) => /^Month view →$/.test(b.textContent)));
    assert.equal(calls.month, 1, 'Month view opens the calendar');
  } finally { await m.unmount(); }
});

test('Fuel left: a ring of the day with what is left inside, the plan, what was eaten, each macro a door to its own page', async () => {
  const { props, calls } = fixture();
  const m = await mount(props);
  try {
    const card = m.q('[data-eat-fuel]');
    const ring = card.querySelector('[data-eat-ring]');
    assert.match(ring.textContent, /^52kcal left$/);
    const arc = card.querySelector('[data-eat-ring-arc]');
    const C = 2 * Math.PI * 44;
    assert.ok(Math.abs(parseFloat(arc.getAttribute('stroke-dasharray')) - 0.98 * C) < 0.01, 'the ring fills to what was eaten');
    assert.match(m.host.textContent, /Fuel left today/);
    assert.match(m.host.textContent, /2,100 kcal plan/);
    assert.match(card.querySelector('[data-eat-eaten]').textContent, /2,048 eaten · 98%/);
    const doors = [...card.querySelectorAll('[data-eat-macros] button')];
    assert.deepEqual(doors.map((b) => b.textContent.replace(/\s+/g, ' ').trim()), ['PROTEIN2g left', 'CARBS2g left', 'FAT0g left']);
    for (const d of doors) await m.click(d);
    assert.deepEqual(calls.macro, ['p', 'c', 'f']);
  } finally { await m.unmount(); }
});

test('the next meal on a lit lead: its time and status, how long until it, the meal, where now sits, Log it and Swap', async () => {
  const { props, calls } = fixture();
  const m = await mount(props);
  try {
    const lead = m.q('[data-focus-lead="lit"]');
    assert.match(lead.textContent, /12:30 PM · Next stop/);
    assert.match(lead.textContent, /In 2 h 15 min/);
    assert.match(lead.textContent, /Lunch/);
    assert.match(lead.textContent, /Chicken bowl · 640 kcal/);
    assert.match(lead.textContent, /7:30 AM · Breakfast ✓/, 'the meal before it, on the arrival line');
    const log = m.q('[data-focus-primary="lit"]');
    assert.equal(log.textContent, 'Log it →');
    assert.equal(log.querySelector('[data-focus-pill]').style.borderRadius, '999px', 'the capsule is drawn inside the 44px button');
    await m.click(log);
    assert.deepEqual(calls.log, ['m2'], 'Log it opens the meal');
    await m.click([...lead.querySelectorAll('button')].find((b) => /^Swap →$/.test(b.textContent)));
    assert.deepEqual(calls.swap, ['m2'], 'Swap opens the swap sheet on it');
  } finally { await m.unmount(); }
});

test('the menu: today\'s meals, each one opening, NOW over the first ahead, Swap meal asking for the pick', async () => {
  const { props, calls } = fixture();
  const m = await mount(props);
  try {
    assert.match(m.q('[data-eat-menu-head]').textContent, /The menu.*Today’s meals|The menu.*Today's meals/);
    const menu = m.q('[data-tour="hero-eat"]');
    assert.match(menu.textContent, /Now · 10:15 AM/);
    const rows = [...menu.querySelectorAll('button')].filter((b) => !b.hasAttribute('data-test-shop'));
    for (const r of rows) await m.click(r);
    assert.deepEqual(calls.open, ['m1', 'm2', 'm3']);
    await m.click(m.qa('button').find((b) => /^Swap meal →$/.test(b.textContent)));
    assert.equal(calls.pick, 1);
  } finally { await m.unmount(); }
});

test('another day picked: Fuel names its day, the menu its weekday, no next meal and no NOW', async () => {
  const other = (todayIdx + 2) % 7;
  const { props } = fixture({ day: other, next: null, prev: null, nowIdx: -1, until: null });
  const m = await mount(props);
  try {
    const d = thisWeek()[other];
    const short = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
    const long = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(d);
    assert.match(m.host.textContent, new RegExp(`Fuel · ${short} ${d.getDate()}`));
    assert.doesNotMatch(m.host.textContent, /Fuel left today/);
    assert.match(m.q('[data-eat-menu-head]').textContent, new RegExp(long));
    assert.ok(!m.q('[data-focus-lead]'), 'the next meal is today\'s only');
    assert.doesNotMatch(m.q('[data-tour="hero-eat"]').textContent, /Now ·/);
  } finally { await m.unmount(); }
});

test('Fuel left reads "—", not 0, while the meal plan is unread, and its doors open nothing', async () => {
  const { props, calls } = fixture();
  const m = await mount({ ...props, fuel: { ...props.fuel, unread: true } });
  try {
    const card = m.q('[data-eat-fuel]');
    assert.ok(card.hasAttribute('data-eat-fuel-unread'));
    assert.match(card.querySelector('[data-eat-ring]').textContent, /^—kcal left$/);
    assert.ok(!card.querySelector('[data-eat-eaten]'));
    const doors = [...card.querySelectorAll('[data-eat-macros] button')];
    assert.ok(doors.every((b) => b.disabled));
    for (const d of doors) await m.click(d);
    assert.deepEqual(calls.macro, []);
  } finally { await m.unmount(); }
});

test('the glow is dark paper\'s, and every target is at least 44px tall on both papers', async () => {
  for (const paper of ['dark', 'light']) {
    const { props } = fixture();
    const m = await mount(props, paper);
    try {
      const dot = m.q('[data-week-strip="round"] button[aria-pressed="true"] [data-day-dot]');
      const log = m.q('[data-focus-primary="lit"] [data-focus-pill]');
      const spine = m.q('[data-focus-lead="lit"]').querySelector('span[aria-hidden]');
      if (paper === 'dark') {
        assert.match(dot.style.boxShadow, /0 0 16px -2px/);
        assert.match(log.style.boxShadow, /0 0 22px -6px/);
        assert.match(spine.style.boxShadow, /0 0 14px/);
      } else {
        assert.equal(dot.style.boxShadow, 'none');
        assert.equal(log.style.boxShadow, 'none');
        assert.equal(spine.style.boxShadow, 'none');
      }
      const px = (v) => (/^\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : null);
      // The fixture's own shop-list button stands in for the page's (BSFocusMealShop, its own test).
      for (const b of m.qa('button').filter((x) => !x.hasAttribute('data-test-shop'))) {
        const h = Math.max(px(b.style.minHeight) || 0, px(b.style.height) || 0);
        assert.ok(h >= 44, `${paper}: ${(b.getAttribute('aria-label') || b.textContent).slice(0, 40)} is ${h}px tall`);
      }
    } finally { await m.unmount(); }
  }
});

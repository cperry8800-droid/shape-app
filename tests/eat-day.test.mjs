// tests/eat-day.test.mjs
//
// EAT'S DAY VIEW (owner, 2026-11-04, of three designs drawn for it: "C for eat but these 2 boxes with a faint
// border similar to option A"). BSEatDay.jsx draws the top of Eat's Day view, from the head down to the
// day's meals: the week as ring gauges, the day as a 24-hour orbit with Fuel left inside it, the next meal,
// and the menu. Eat hands it its figures and its doors (focus-layout.test.mjs drives Eat for that); this file
// MOUNTS the shipping module in jsdom and checks what it shows and what each tap does.
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
    day: todayIdx, todayIdx, onDay: (i) => calls.day.push(i), onMonth: () => { calls.month += 1; },
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

test('the dial shows what is left of the day, with the plan and what was eaten', async () => {
  const { props } = fixture();
  const v = await mount(props);
  try {
    assert.match(v.q('[data-eat-left]').textContent, /^52kcal left$/);
    assert.equal(v.q('[data-eat-fuel-head]').textContent, 'Fuel left today');
    assert.equal(v.q('[data-eat-fuel-plan]').textContent, '2,100 kcal plan');
    assert.equal(v.q('[data-eat-eaten]').textContent, '2,048 eaten · 98%');
    assert.equal(v.q('[data-eat-fuel]').getAttribute('data-eat-fuel-unread'), null);
    // The head reads the day as it is, its full stop drawn once.
    assert.equal(v.q('h1').textContent, 'Reset plate.');
    assert.ok(v.q('[data-test-tabs]'), 'the Eat tabs are drawn');
  } finally { await v.unmount(); }
});

test('the macros are three lamp rings in the dial and three doors under it, each to its own page', async () => {
  const { props, calls } = fixture();
  const v = await mount(props);
  try {
    // Forty lamps a ring, lit to what was eaten; over the target is a full ring, never more.
    assert.deepEqual(v.qa('[data-eat-arc]').map((g) => [g.getAttribute('data-eat-arc'), g.getAttribute('data-lit')]), [['p', '40'], ['c', '40'], ['f', '40']]);
    const doors = v.qa('[data-eat-macro]');
    assert.deepEqual(doors.map((b) => b.getAttribute('aria-label')), ['PROTEIN 2g left 178 / 180', 'CARBS 2g left 218 / 220', 'FAT 0g left 70 / 65'], 'over the target reads 0 left, never negative');
    for (const b of doors) await v.click(b);
    assert.deepEqual(calls.macro, ['p', 'c', 'f']);
  } finally { await v.unmount(); }
  const half = fixture({ fuel: { ...fixture().props.fuel, macros: [{ k: 'p', l: 'PROTEIN', v: 70, g: 140, c: '#e0654b' }] } });
  const h = await mount(half.props);
  try {
    assert.equal(h.q('[data-eat-arc="p"]').getAttribute('data-lit'), '20', 'half the target lights half the lamps');
  } finally { await h.unmount(); }
});

test('the next meal: its time and status, how long until it, the meal, Log it and Swap', async () => {
  const { props, calls } = fixture();
  const v = await mount(props);
  try {
    const next = v.q('[data-eat-next]');
    assert.ok(next, 'no next meal');
    assert.match(next.textContent, /12:30 PM · Next stop/);
    assert.match(next.textContent, /Lunch\./);
    assert.match(next.textContent, /In 2 h 15 min/);
    assert.match(next.textContent, /Chicken bowl · 640 kcal · 46P · 70C · 14F/);
    assert.match(next.querySelector('[role="img"]').getAttribute('aria-label'), /Now 10:15 AM, between 7:30 AM and 12:30 PM/);
    await v.click(v.q('[data-eat-log]'));
    await v.click(v.q('[data-eat-swap]'));
    assert.deepEqual(calls.log, ['m2'], 'Log it opens the meal, where it is logged');
    assert.deepEqual(calls.swap, ['m2'], 'Swap opens the swap sheet on it');
    // On the orbit: a station a meal, at its state, and NOW.
    assert.deepEqual(v.qa('[data-eat-station]').map((g) => g.getAttribute('data-eat-station')), ['done', 'next', 'ahead']);
    assert.ok(v.q('[data-eat-now]'), 'NOW on the orbit, today');
  } finally { await v.unmount(); }
});

test('the menu: each meal opens, NOW sits over the first still ahead, its shop list sits outside its button', async () => {
  const { props, calls } = fixture();
  const v = await mount(props);
  try {
    const meals = v.qa('[data-eat-meal]');
    assert.deepEqual(meals.map((b) => b.getAttribute('aria-label')), ['7:30 AM · Oats and whey', '12:30 PM · Chicken bowl', '7:00 PM · Salmon rice']);
    assert.equal(v.q('[data-eat-menu-title]').textContent, "Today's meals");
    const now = v.q('[data-eat-now-row]');
    assert.equal(now.getAttribute('aria-label'), 'Now · 10:15 AM');
    assert.ok(now.nextElementSibling === meals[1], 'NOW stands over the first meal still ahead');
    for (const b of meals) await v.click(b);
    assert.deepEqual(calls.open, ['m1', 'm2', 'm3']);
    const shop = v.q('[data-test-shop]');
    assert.ok(!shop.closest('[data-eat-meal]'), 'a control inside a button is not a control');
    assert.ok(shop.closest('[data-eat-day-shop]'));
    await v.click(v.q('[data-eat-swap-pick]'));
    assert.equal(calls.pick, 1, 'Swap meal opens the picker');
    assert.ok(v.q('[data-tour="hero-eat"]'), "the tour's step on the menu");
  } finally { await v.unmount(); }
});

test('picking a day changes the page: its fuel head, its menu, no next meal and no NOW', async () => {
  const { props, calls } = fixture();
  const v = await mount(props);
  try {
    const days = v.qa('[data-eat-day-btn]');
    assert.equal(days.length, 7, 'Monday to Sunday');
    assert.equal(days[todayIdx].getAttribute('aria-pressed'), 'true');
    assert.equal(days[todayIdx].getAttribute('aria-current'), 'date');
    const other = (todayIdx + 1) % 7;
    await v.click(days[other]);
    assert.deepEqual(calls.day, [other], 'the day goes to Eat, which holds it');
    await v.click(v.q('[data-eat-month]'));
    assert.equal(calls.month, 1, 'Month view opens the calendar');
    // Eat answers with the picked day's figures and no next meal (that is today's).
    await v.rerender({ ...props, day: other, next: null, nowIdx: -1 });
    const d = thisWeek()[other];
    assert.equal(v.q('[data-eat-fuel-head]').textContent, `Fuel · ${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`,
      "the head names the picked day as the strip shows it, never the plan record's label");
    assert.equal(v.q('[data-eat-menu-title]').textContent, `${d.toLocaleDateString(undefined, { weekday: 'long' })}'s meals`);
    assert.ok(!v.q('[data-eat-next]'), 'no next meal on another day');
    assert.ok(!v.q('[data-eat-now]'), 'no NOW on another day');
    assert.ok(!v.q('[data-eat-now-row]'), 'no NOW row on another day');
    assert.equal(v.qa('[data-eat-day-btn]')[other].getAttribute('aria-pressed'), 'true');
    assert.match(v.qa('[data-eat-day-btn]')[other].getAttribute('aria-label'), /, selected$/);
  } finally { await v.unmount(); }
});

// Owner, 2026-11-04, of option B's week: "use this weekly calendar in C option for eat". Seven tiles on the
// raised box: a day gone holds what was eaten of its target as liquid, a day to come is a dashed outline,
// today has its ink dot, protein hit its own dot, and the picked tile is ringed in the accent and lifted.
test('the week is seven tiles: liquid for a day gone, dashed for one to come, its dots, the picked one lit', async () => {
  const { props } = fixture();
  const v = await mount(props);
  try {
    const tiles = v.qa('[data-eat-week] [data-eat-day-btn]');
    assert.equal(tiles.length, 7);
    tiles.forEach((b, i) => {
      assert.equal(b.getAttribute('data-eat-day-state'), i > todayIdx ? 'ahead' : 'gone', `day ${i}`);
      const fill = b.querySelector('[data-eat-day-fill]');
      if (i > todayIdx) assert.ok(!fill, 'a day to come holds nothing');
      else assert.equal(fill.getAttribute('data-eat-day-fill'), String(Math.round(((1800 + i) / 2100) * 100)), 'what was eaten of the target');
      assert.equal(!!b.querySelector('[data-eat-day-today]'), i === todayIdx, 'the ink dot is today\'s');
      assert.equal(!!b.querySelector('[data-eat-day-protein]'), i <= todayIdx && i % 2 === 1, 'protein\'s dot where it was hit');
      const on = i === todayIdx;
      assert.equal(b.style.transform, on ? 'translateY(-2px)' : 'none', 'the picked tile lifts');
      if (on) assert.match(b.style.border, /^1\.5px solid/, 'and is ringed in the accent');
      else assert.doesNotMatch(b.style.border, /^1\.5px solid/);
      assert.ok(parseFloat(b.style.minHeight) >= 44);
    });
  } finally { await v.unmount(); }
  // A week the plan could not read fills nothing, and says nothing about protein.
  const unread = fixture({ fuel: { ...fixture().props.fuel, unread: true } });
  const u = await mount(unread.props);
  try {
    const fills = u.qa('[data-eat-day-fill]').map((f) => f.getAttribute('data-eat-day-fill'));
    assert.ok(fills.every((x) => x === '0'));
    assert.ok(!u.q('[data-eat-day-protein]'), 'no protein dot on an unread week');
  } finally { await u.unmount(); }
});

// The owner, 2026-10-25: "fix the Eat Fuel left 0 kcal on a failed read". What was eaten comes from the meal
// plan, so while its read is out what is left reads "—", never 0 kcal, and the macros open nothing; a target
// Eat has from a coach's Adjust still reads, a 0 g one too (Codex P2 on #2453).
test('Fuel left reads "—", not 0, while the meal plan is unread, and its doors open nothing', async () => {
  const zero = [
    { k: 'p', l: 'PROTEIN', v: 0, g: 0, c: '#e0654b' },
    { k: 'c', l: 'CARBS', v: 0, g: 0, c: '#e3a544' },
    { k: 'f', l: 'FAT', v: 0, g: 0, c: '#5b8df9' },
  ];
  const { props, calls } = fixture({ fuel: { calLeft: 0, calTarget: 0, calNow: 0, calPct: 0, macros: zero, unread: true, calTargetKnown: false } });
  const v = await mount(props);
  try {
    assert.equal(v.q('[data-eat-fuel]').getAttribute('data-eat-fuel-unread'), '');
    assert.match(v.q('[data-eat-left]').textContent, /^—kcal left$/);
    assert.equal(v.q('[data-eat-fuel-plan]').textContent, '—', 'no "0 kcal plan"');
    assert.ok(!v.q('[data-eat-eaten]'), 'no eaten line');
    const doors = v.qa('[data-eat-macro]');
    assert.deepEqual(doors.map((b) => b.getAttribute('aria-label')), ['PROTEIN — — / —', 'CARBS — — / —', 'FAT — — / —']);
    assert.ok(doors.every((b) => b.disabled));
    for (const b of doors) await v.click(b);
    assert.deepEqual(calls.macro, [], 'a door opens no page of zeros');
    assert.deepEqual(v.qa('[data-eat-arc]').map((g) => g.getAttribute('data-lit')), ['0', '0', '0']);
  } finally { await v.unmount(); }
  const coached = fixture({ fuel: { calLeft: 2100, calTarget: 2100, calNow: 0, calPct: 0, unread: true, calTargetKnown: true,
    macros: [{ ...zero[0], g: 150, gKnown: true }, { ...zero[1], g: 0, gKnown: true }, { ...zero[2], g: 0, gKnown: false }] } });
  const c = await mount(coached.props);
  try {
    assert.equal(c.q('[data-eat-fuel-plan]').textContent, '2,100 kcal plan', "a coach's target still reads");
    assert.match(c.q('[data-eat-left]').textContent, /^—/, 'what is left is still unknown');
    assert.deepEqual(c.qa('[data-eat-macro]').map((b) => b.getAttribute('aria-label')), ['PROTEIN — — / 150', 'CARBS — — / 0', 'FAT — — / —']);
  } finally { await c.unmount(); }
});

test('every target is at least 44px, the shop list\'s too, and no motion runs for a reader who asked for less', async () => {
  for (const paper of ['dark', 'light']) {
    const { props } = fixture();
    const v = await mount(props, paper);
    try {
      const buttons = v.qa('button').filter((b) => !b.closest('[data-eat-day-shop]'));
      assert.ok(buttons.length >= 7 + 3 + 2 + 3 + 2, `${paper}: the days, macros, Log it and Swap, the meals, Month and Swap meal`);
      for (const b of buttons) {
        const h = parseFloat(b.style.minHeight || b.style.height || '0');
        assert.ok(h >= 44, `${paper}: "${b.getAttribute('aria-label') || b.textContent}" is ${h}px tall`);
      }
      const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
      assert.match(css, /\[data-eat-day-shop\] button \{ min-height: 44px !important; \}/, 'the shop list is lifted to 44px');
      assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-eat-day\] \*, \[data-eat-day\] \*::before, \[data-eat-day\] \*::after \{ animation: none !important; transition: none !important; \}/);
      // The two raised boxes take the Home deck's edge: its teal glass edge along the top.
      assert.equal(v.q('[data-eat-week]').querySelectorAll('[data-glass-edge]').length, 1);
      assert.equal(v.q('[data-eat-fuel]').querySelectorAll('[data-glass-edge]').length, 1);
      // On the Cream paper a glow is a soft tinted shadow, never a halo.
      const glow = v.q('[data-eat-log]').style.boxShadow;
      if (paper === 'light') assert.doesNotMatch(glow, /^0(px)? 0(px)? /, 'a halo on cream');
      else assert.match(glow, /^(rgba?\([^)]*\) )?0(px)? 0(px)? /, 'the Black paper glows');
    } finally { await v.unmount(); }
  }
});

// tests/water-line.test.mjs
//
// Water on Home: one line, all day (owner, 2026-10-19: water left the morning check-in, because it
// is drunk all day; docs/REVIEW-2026-10-19-morning-checkin.md §3.7). The day's amount and + Glass,
// progress only against a target the member set, and a picker to set one.
//
// The line is mounted on jsdom with the real English catalog behind the real ICU translator. The
// glass and read races carried over from the morning card's tests (Codex on #2398 and #2405).
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const registry = new Map([['react', React], ['react-dom', require_('react-dom')]]);
const CARD = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry });
registry.set('./BSCheckinCard.jsx', CARD);
const WATER = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSWaterLine.jsx'), { registry });

const appRequire = createRequire(join(ROOT, 'mobile-app/package.json'));
const i18next = appRequire('i18next');
const ICU = appRequire('i18next-icu');
const i18n = i18next.createInstance();
await i18n.use(ICU.default || ICU).init({
  lng: 'en', fallbackLng: 'en', ns: ['home'], defaultNS: 'home', keySeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: { home: JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/home.json'), 'utf8')) } },
});
dom.window.ShapeI18n = { t: (key, opts) => i18n.t(key, opts) };

const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', RULE: '#ccc', HAIR: '#ddd', RUST: '#9a3b1b', padX: 18, isLight: true, isMetric: false };
dom.window.useBS = () => theme;

const at = (h, m = 0) => new Date(2026, 9, 18, h, m).getTime();
mock.timers.enable({ apis: ['Date'], now: at(12) });

// `water` is the hydration route's answer; targetStoredL is the member's own target, targetL the
// display value that falls back to 3 L.
function env({ uid = 'member-1', water = { ok: true, hydrationL: 0.5, targetL: 3, targetStoredL: null } } = {}) {
  const calls = { add: [] };
  dom.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
  dom.window.ShapeHydration = {
    get: async () => water,
    add: async (deltaL) => { calls.add.push(deltaL); return { ok: true, hydrationL: water.hydrationL + deltaL, targetL: water.targetL, targetStoredL: water.targetStoredL }; },
  };
  return calls;
}

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await React.act(async () => { root.render(React.createElement(WATER.BSWaterLine)); });
  await flush();
  const buttons = (re) => [...document.body.querySelectorAll('button')].filter((b) => re.test(b.textContent.trim()) || re.test(b.getAttribute('aria-label') || ''));
  const click = async (re, nth = 0) => {
    const b = buttons(re)[nth];
    assert.ok(b, `no button matching ${re} in: ${document.body.textContent}`);
    await React.act(async () => { b.click(); });
    await flush();
  };
  return {
    flush,
    rerender: async () => { await React.act(async () => { root.render(React.createElement(WATER.BSWaterLine)); }); await flush(); },
    button: (re) => buttons(re)[0],
    text: () => document.body.textContent,
    click,
    sync: async () => { await React.act(async () => { dom.window.dispatchEvent(new dom.window.Event(CARD.BS_CI_HYDRATION_SYNCED)); await new Promise((r) => setTimeout(r, 0)); }); await flush(); },
    unmount() { React.act(() => root.unmount()); host.remove(); },
  };
}

// ── The rules ────────────────────────────────────────────────────────────────

test("a target is the member's own: never the route's 3 L stand-in", () => {
  assert.equal(WATER.bsWaterTargetOf({ targetL: 3, targetStoredL: null }), null, 'the 3 L default read as a target');
  assert.equal(WATER.bsWaterTargetOf({ targetL: 3 }), null);
  assert.equal(WATER.bsWaterTargetOf({ targetL: 2.5, targetStoredL: 2.5 }), 2.5);
  assert.equal(WATER.bsWaterTargetOf({ targetStoredL: 0 }), null);
  assert.equal(WATER.bsWaterTargetOf(null), null);
});

test('the target picker starts at the member\'s target or a sensible one, and saves litres', () => {
  assert.equal(WATER.bsWaterPickStart(null, true), 2.5);
  assert.equal(WATER.bsWaterPickStart(null, false), 80);
  assert.equal(WATER.bsWaterPickStart(2.6, true), 2.5, 'litres are picked by the quarter');
  assert.equal(WATER.bsWaterPickStart(2.6, false), 88, 'ounces are picked by the 8 oz glass');
  assert.equal(WATER.bsWaterPickStart(20, true), 6);
  assert.equal(WATER.bsWaterPickLitres(2.75, true), 2.75);
  assert.equal(WATER.bsWaterPickLitres(88, false), 2.6);
});

// ── The line ─────────────────────────────────────────────────────────────────

// Owner, 2026-10-21: "also make the water line smaller"; owner, 2026-10-22, Option A: the card and the
// water row "look analog and outdated"; owner, 2026-10-23, of the board's water row: "add the updated
// water to home page". One row in the morning panel, no box of its own: a target's progress is a pip a
// glass beside the total, and + Glass is a round button with a 44 px tap.
test('the line is one row in the morning panel: a pip a glass beside the total, and a round + Glass with a 44 px tap', async () => {
  env({ water: { ok: true, hydrationL: 0.5, targetL: 2.5, targetStoredL: 2.5 } });
  const m = await mount();
  try {
    const line = document.querySelector('[data-bs-water]');
    assert.equal(line.style.border, '', 'the line draws its own box again: the morning panel holds it');
    const pips = line.querySelector('[data-bs-water-bar]');
    assert.ok(pips, 'a member with a target sees no progress');
    // 2.5 L is about eleven 8 oz glasses; 0.5 L is two of them.
    assert.equal(pips.children.length, 11);
    const on = [...pips.children].filter((p) => p.style.background && p.style.background !== 'transparent').length;
    assert.equal(on, 2);
    // Beside the total in one wrapping row, so on a narrow phone, with large text or a long language
    // the glasses drop under the total rather than squeezing Water and + Glass (Codex P2 on #2426).
    const row = pips.parentElement;
    assert.match(row.textContent, /^Water17 oz of 85 oz/);
    assert.equal(row.style.flexWrap, 'wrap');
    assert.equal(pips.style.flexWrap, 'wrap');
    assert.ok(!row.contains(line.querySelector('[data-bs-water-add]')), '+ Glass sits beside the row, not in it');
    const add = line.querySelector('[data-bs-water-add]');
    assert.equal(add.style.minHeight, '44px', "+ Glass's tap shrank");
    assert.equal(add.style.width, '44px');
    assert.equal(add.style.borderRadius, '999px', '+ Glass is round');
    assert.equal(add.getAttribute('aria-label'), '+ Glass', 'the round button still says what it does');
  } finally { m.unmount(); }
  // No target: no pips, a total only.
  env();
  const n = await mount();
  try {
    assert.ok(!document.querySelector('[data-bs-water] [data-bs-water-bar]'), 'pips with no target to count against');
  } finally { n.unmount(); }
});

test('the line shows the day and + Glass, and progress only against a target the member set', async () => {
  let calls = env();
  let m = await mount();
  try {
    assert.match(m.text(), /Water17 oz/);
    assert.ok(m.button(/\+ Glass/), '+ Glass is on the line');
    assert.doesNotMatch(m.text(), / of /, 'progress was shown against a target the member never chose');
    assert.match(m.text(), /Set a daily target/);
    await m.click(/\+ Glass/);
    assert.deepEqual(calls.add, [0.2366]);
    assert.match(m.text(), /Water25 oz/);
  } finally { m.unmount(); }

  calls = env({ water: { ok: true, hydrationL: 0.5, targetL: 2.5, targetStoredL: 2.5 } });
  m = await mount();
  try {
    assert.match(m.text(), /17 oz of 85 oz/);
    assert.doesNotMatch(m.text(), /Set a daily target/, 'a member with a target was asked to set one');
  } finally { m.unmount(); }

  theme.isMetric = true;
  let metricLine = null;
  try {
    calls = env({ water: { ok: true, hydrationL: 0.5, targetL: 3, targetStoredL: 3 } });
    metricLine = await mount();
    await metricLine.click(/\+ Glass/);
    assert.deepEqual(calls.add, [0.25]);
    assert.match(metricLine.text(), /0\.75 L of 3 L/);
  } finally { metricLine?.unmount(); theme.isMetric = false; }   // a line left mounted would answer the later tests' clicks and syncs
});

test('a daily target is set from the line, saved where Settings keeps it', async () => {
  env();
  const saved = [];
  dom.window.shapeDb = {
    getUser: async () => ({ id: 'member-1' }),
    getUserGoals: async (kind) => (kind === 'client_nutrition_prefs' ? { diet: 'vegetarian' } : {}),
    saveUserGoals: async (kind, data, opts) => { saved.push({ kind, data, opts }); return { ok: true }; },
  };
  const m = await mount();
  try {
    await m.click(/Set a daily target/);
    assert.match(m.text(), /Your daily water target/);
    assert.match(m.text(), /80 oz/);
    await m.click(/More water/);
    assert.match(m.text(), /88 oz/);
    await m.click(/^SAVE$/);
    assert.deepEqual(saved, [{ kind: 'client_nutrition_prefs', data: { diet: 'vegetarian', hydration_target_l: '2.6' }, opts: { expectedUserId: 'member-1' } }],
      'the target was not saved as Settings saves it, or the other nutrition settings were dropped');
    assert.doesNotMatch(m.text(), /Your daily water target/, 'the picker stayed open after saving');
    assert.match(m.text(), /17 oz of 88 oz/);
    assert.doesNotMatch(m.text(), /Set a daily target/);
  } finally { m.unmount(); delete dom.window.shapeDb; }
});

test('a target that fails to save says so, and the picker can be closed without saving', async () => {
  env();
  dom.window.shapeDb = {
    getUser: async () => ({ id: 'member-1' }),
    getUserGoals: async () => ({}),
    saveUserGoals: async () => ({ error: { message: 'offline' } }),
  };
  const m = await mount();
  try {
    await m.click(/Set a daily target/);
    await m.click(/^SAVE$/);
    await m.flush();
    assert.match(m.text(), /Could not save your target — try again/);
    assert.match(m.text(), /Your daily water target/, 'the picker closed on a failed save');
    await m.click(/^CANCEL$/);
    assert.doesNotMatch(m.text(), /Your daily water target/);
    assert.match(m.text(), /Set a daily target/);
  } finally { m.unmount(); delete dom.window.shapeDb; }
});

test('signed out, the line counts glasses on screen and saves nothing', async () => {
  const calls = env({ uid: null });
  const m = await mount();
  try {
    assert.match(m.text(), /Water0 oz/);
    await m.click(/\+ Glass/);
    assert.deepEqual(calls.add, [], 'the preview wrote a glass');
    assert.match(m.text(), /Water8 oz/);
    assert.doesNotMatch(m.text(), /Set a daily target/, 'the preview offered to save a target');
  } finally { m.unmount(); }
});

test('two quick glasses save in order, and a failed one takes back only its own glass (Codex P2 on #2398)', async () => {
  let failFirst;
  const first = new Promise((_, reject) => { failFirst = reject; });
  env();
  let server = 0.5;
  const adds = [];
  dom.window.ShapeHydration = {
    get: async () => ({ ok: true, hydrationL: 0.5, targetL: 3, targetStoredL: 3 }),
    add: (d) => { adds.push(d); if (adds.length === 1) return first; server += d; return Promise.resolve({ ok: true, hydrationL: server }); },
  };
  const m = await mount();
  try {
    await m.click(/\+ Glass/);
    await m.click(/\+ Glass/);
    assert.equal(adds.length, 1, 'the second glass was sent while the first was still saving');
    assert.match(m.text(), /33 oz of 101 oz/);
    failFirst(new Error('500'));
    await m.flush();
    await m.flush();
    assert.equal(adds.length, 2);
    assert.match(m.text(), /25 oz of 101 oz/, 'the failed glass took back more than itself, or nothing');
    assert.match(m.text(), /Could not log water/);
  } finally { failFirst?.(new Error('cleanup')); m.unmount(); }   // a held glass would hold the shared queue for later tests
});

test('a glass that saves keeps the ones still on their way, and a failed last one takes back only itself', async () => {
  let releaseFirst;
  let failSecond;
  const first = new Promise((r) => { releaseFirst = r; });
  const second = new Promise((_, reject) => { failSecond = reject; });
  env();
  const adds = [];
  dom.window.ShapeHydration = {
    get: async () => ({ ok: true, hydrationL: 0.5, targetL: 3, targetStoredL: 3 }),
    add: (d) => { adds.push(d); return adds.length === 1 ? first : second; },
  };
  const m = await mount();
  try {
    await m.click(/\+ Glass/);
    await m.click(/\+ Glass/);
    assert.match(m.text(), /33 oz of 101 oz/);
    releaseFirst({ ok: true, hydrationL: 0.7366, targetStoredL: 3 });   // the server's total after the first glass
    await m.flush();
    await m.flush();
    assert.equal(adds.length, 2);
    assert.match(m.text(), /33 oz of 101 oz/, 'the first glass saving dropped the second, still on its way, from the screen');
    failSecond(new Error('500'));
    await m.flush();
    await m.flush();
    assert.match(m.text(), /25 oz of 101 oz/, 'the failed glass took back more than itself');
  } finally { releaseFirst?.({ ok: true }); failSecond?.(new Error('cleanup')); m.unmount(); }
});

test('a failed water read still lets a glass be logged, and the first save brings the total and the target (Codex P2 on #2398)', async () => {
  env();
  const adds = [];
  dom.window.ShapeHydration = {
    get: async () => { throw new Error('500'); },
    add: async (d) => { adds.push(d); return { ok: true, hydrationL: 1 + d, targetL: 2, targetStoredL: 2 }; },
  };
  const m = await mount();
  try {
    assert.match(m.text(), /Water— ?$/, 'a failed read shows a total it does not have');
    assert.doesNotMatch(m.text(), /Set a daily target/, 'a failed read was taken for no target');
    assert.equal(m.button(/\+ Glass/).disabled, false, 'a failed read left + Glass disabled');
    await m.click(/\+ Glass/);
    assert.deepEqual(adds, [0.2366]);
    assert.match(m.text(), /42 oz of 68 oz/, "the server's total and the member's own target did not replace the unknown ones");
  } finally { m.unmount(); }
});

test("a new local day reads that day's water (Codex P2 on #2398)", async () => {
  try {
    mock.timers.setTime(new Date(2026, 9, 18, 23, 59).getTime());
    let reads = 0;
    env();
    dom.window.ShapeHydration = { get: async () => { reads += 1; return { ok: true, hydrationL: reads === 1 ? 2 : 0.25, targetL: 3, targetStoredL: 3 }; }, add: async () => ({ ok: true }) };
    const m = await mount();
    try {
      assert.match(m.text(), /68 oz of 101 oz/);
      mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
      await m.rerender();
      assert.equal(reads, 2, "the new day's water was never read");
      assert.match(m.text(), /8 oz of 101 oz/, "yesterday's water is still on Home after midnight");
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test("a glass tapped on a line whose day is over saves nothing (Codex P2 on #2398)", async () => {
  try {
    mock.timers.setTime(new Date(2026, 9, 18, 23, 59).getTime());
    const calls = env();
    const m = await mount();
    try {
      mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
      await m.click(/\+ Glass/);
      assert.deepEqual(calls.add, [], "a 00:01 glass on the day before's line was saved into the new day");
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test("a failed water read on a new day never shows the day before's water (Codex P2 on #2398)", async () => {
  try {
    let reads = 0;
    env();
    dom.window.ShapeHydration = { get: async () => { reads += 1; if (reads > 1) throw new Error('500'); return { ok: true, hydrationL: 2, targetL: 3, targetStoredL: 3 }; }, add: async () => ({ ok: true }) };
    const m = await mount();
    try {
      assert.match(m.text(), /68 oz of 101 oz/);
      mock.timers.setTime(new Date(2026, 9, 19, 9, 0).getTime());
      await m.rerender();
      assert.equal(reads, 2);
      assert.doesNotMatch(m.text(), /68 oz/, "the day before's water shows on the new day");
      assert.match(m.text(), /Water—/);
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test('the water read waits for a glass on its way, so a line mounted meanwhile shows it', async () => {
  let server = 0.5;
  let land;
  env();
  dom.window.ShapeHydration = {
    get: async () => ({ ok: true, hydrationL: server, targetL: 3, targetStoredL: 3 }),
    add: (d) => new Promise((r) => { land = () => { server += d; r({ ok: true, hydrationL: server }); }; }),
  };
  let first = null;
  let m = null;
  try {
    first = await mount();
    await first.click(/\+ Glass/);
    first.unmount();
    first = null;
    m = await mount();
    land();
    await m.flush();
    await m.flush();
    assert.match(m.text(), /25 oz of 101 oz/, 'the new line read the total from before the glass landed');
  } finally { land?.(); first?.unmount(); m?.unmount(); }
});

// ── Apple Health's water (owner, 2026-10-18: added to the glasses logged here) ─

test("a watch sync on the morning card brings Apple Health's water to the line, and says its share", async () => {
  let water = { ok: true, hydrationL: 0.5, targetL: 3, targetStoredL: 3 };
  env();
  dom.window.ShapeHydration = { get: async () => water, add: async () => water };
  const m = await mount();
  try {
    assert.match(m.text(), /17 oz of 101 oz/);
    water = { ok: true, hydrationL: 1.7, targetL: 3, targetStoredL: 3, deviceL: 1.2 };
    await m.sync();
    assert.match(m.text(), /57 oz of 101 oz/, 'the water synced from Apple Health was not shown');
    assert.match(m.text(), /Includes 41 oz from Apple Health/);
  } finally { m.unmount(); }
});

test('a glass tapped while the water is read again after a sync is never dropped from the screen', async () => {
  // The server holds the synced water (1.2 L) when the read goes out; the glass is tapped and saved
  // while the read is out, and the read answers last with the total from before the glass.
  let server = 1.7;
  const releases = [];
  const release = () => releases.shift()?.();
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => {
      gets += 1;
      if (gets === 1) return { ok: true, hydrationL: 0.5, targetL: 3, targetStoredL: 3 };
      const total = server;   // what the server holds when this read is made
      await new Promise((r) => { releases.push(r); });
      return { ok: true, hydrationL: total, targetL: 3, targetStoredL: 3, deviceL: 1.2 };
    },
    add: async (d) => { server = Math.round((server + d) * 10000) / 10000; return { ok: true, hydrationL: server, targetL: 3, targetStoredL: 3 }; },
  };
  const m = await mount();
  try {
    await m.sync();
    assert.equal(gets, 2, 'the line did not read the water again after the sync');
    await m.click(/\+ Glass/);
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    // The read made before the glass is held back: the glass stays on the line, with no share yet,
    // while the read sent again is still out.
    assert.equal(gets, 3, 'the held-back read was not sent again');
    assert.doesNotMatch(m.text(), /57 oz of/, "the read sent before the glass replaced the glass's total");
    assert.match(m.text(), /65 oz of/, "the glass's own total was not shown");
    assert.doesNotMatch(m.text(), /from Apple Health/, "a held-back read said Apple Health's share");
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.match(m.text(), /65 oz of/);
    assert.match(m.text(), /Includes 41 oz from Apple Health/, "Apple Health's share never reached the line");
  } finally { while (releases.length) release(); m.unmount(); }
});

test('a first water read that answers after the read the sync sent never puts the older total back (Codex on #2405)', async () => {
  let release;
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => {
      gets += 1;
      if (gets === 1) { await new Promise((r) => { release = r; }); return { ok: true, hydrationL: 0.5, targetL: 3, targetStoredL: 3 }; }
      return { ok: true, hydrationL: 1.7, targetL: 3, targetStoredL: 3, deviceL: 1.2 };
    },
    add: async () => ({ ok: true }),
  };
  const m = await mount();
  try {
    await m.sync();
    assert.equal(gets, 2);
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.match(m.text(), /57 oz of/, 'the first read, answering last, put the total from before the sync back');
    assert.match(m.text(), /Includes 41 oz from Apple Health/, "the first read cleared Apple Health's share");
  } finally { m.unmount(); }
});

test('a sync read waits for a glass still saving, so the glass never drops off the line (review on this PR)', async () => {
  // The glass is on its way when the sync fires; the server's read may land before the glass
  // commits and answer after it. The read waits for the glass, so it reads a total with it.
  let server = 0.5;
  let land;
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => { gets += 1; return { ok: true, hydrationL: server, targetL: 3, targetStoredL: 3, deviceL: gets > 1 ? 0.2 : null }; },
    add: (d) => new Promise((r) => { land = () => { server = Math.round((server + d) * 10000) / 10000; r({ ok: true, hydrationL: server, targetStoredL: 3 }); }; }),
  };
  const m = await mount();
  try {
    await m.click(/\+ Glass/);
    await m.sync();
    assert.equal(gets, 1, 'the sync read went out while a glass was still saving');
    land();
    await m.flush();
    await m.flush();
    assert.equal(gets, 2);
    assert.match(m.text(), /25 oz of 101 oz/, 'the glass that landed dropped off the line');
    assert.match(m.text(), /Includes 7 oz from Apple Health/);
  } finally { land?.(); m.unmount(); }
});

test('a glass tapped while the sync read waits, and answering before it, stays on the line (review on this PR)', async () => {
  // Glass 1 is saving when the sync fires; glass 2 is tapped and queues behind it. Glass 1 lands, the
  // read goes out with glass 2 still out, glass 2 answers first and the read, which the server made
  // before glass 2 landed, answers last.
  let server = 0.5;
  const adds = [];
  let readRelease;
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => {
      gets += 1;
      if (gets === 1) return { ok: true, hydrationL: server, targetL: 3, targetStoredL: 3 };
      const before = server;   // read before glass 2 commits
      await new Promise((r) => { readRelease = r; });
      return { ok: true, hydrationL: before, targetL: 3, targetStoredL: 3, deviceL: 0.2 };
    },
    add: (d) => new Promise((r) => { adds.push(() => { server = Math.round((server + d) * 10000) / 10000; r({ ok: true, hydrationL: server, targetStoredL: 3 }); }); }),
  };
  const m = await mount();
  try {
    await m.click(/\+ Glass/);            // glass 1, held
    await m.sync();                         // the read waits for glass 1
    await m.click(/\+ Glass/);            // glass 2, queued behind glass 1
    await React.act(async () => { adds[0](); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.equal(gets, 2, 'the read did not go out once glass 1 landed');
    await React.act(async () => { adds[1](); await new Promise((r) => setTimeout(r, 0)); });   // glass 2 answers first
    await m.flush();
    assert.match(m.text(), /33 oz of 101 oz/);
    await React.act(async () => { readRelease(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.match(m.text(), /33 oz of 101 oz/, 'the read made before glass 2 landed dropped it from the line');
    assert.doesNotMatch(m.text(), /from Apple Health/, "a held-back read said Apple Health's share over a total that may not hold it");
    // No glass is out now, so the line reads again at once, and that read, with both glasses, stands.
    assert.equal(gets, 3, 'the held-back read was not sent again with no glass out (Codex P2 on #2407)');
    await React.act(async () => { readRelease(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.match(m.text(), /33 oz of 101 oz/);
    assert.match(m.text(), /Includes 7 oz from Apple Health/, "the read that stands did not bring Apple Health's share");
    assert.equal(gets, 3, 'a read that stands read again');
  } finally {
    // Glass 2 is sent only once glass 1 settles, so settle each in turn, letting the next one send.
    readRelease?.();
    for (let i = 0; i < adds.length; i++) { adds[i](); await m.flush(); }
    m.unmount();
  }
});

test('a glass the server saved before the sync, answering after the sync read, never hides the synced water (Codex P2 on #2407)', async () => {
  // The glass commits on the server, then the watch sync writes Apple Health's water, and the glass's
  // answer (its total from before the sync) is held past the read's 3 s wait. The sync read, made with
  // the glass still out, keeps the screen's total; once the glass answers, the line reads again.
  let server = 0.5;
  let answer;
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => { gets += 1; return { ok: true, hydrationL: server, targetL: 3, targetStoredL: 3, deviceL: gets > 1 ? 1.2 : null }; },
    add: (d) => { server = Math.round((server + d) * 10000) / 10000; const total = server; return new Promise((r) => { answer = () => r({ ok: true, hydrationL: total, targetStoredL: 3 }); }); },
  };
  const m = await mount();
  try {
    await m.click(/\+ Glass/);
    server = Math.round((server + 1.2) * 10000) / 10000;   // the sync's Apple Health water
    await m.sync();
    await React.act(async () => { await new Promise((r) => setTimeout(r, 3100)); });
    await m.flush();
    assert.equal(gets, 2, 'the sync read did not go out after its wait');
    assert.match(m.text(), /25 oz of 101 oz/, 'the read made with the glass still out replaced the total');
    assert.doesNotMatch(m.text(), /from Apple Health/, "Apple Health's share was said over a total that does not hold it (review on this PR)");
    // While the glass is still out, the line does not keep reading.
    await React.act(async () => { await new Promise((r) => setTimeout(r, 3100)); });
    assert.equal(gets, 2, 'the held-back read went out again with the glass still out');
    await React.act(async () => { answer(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    await m.flush();
    assert.equal(gets, 3, 'the line did not read again once the glass answered');
    assert.match(m.text(), /65 oz of 101 oz/, "the glass's older total hid the synced water");
    assert.match(m.text(), /Includes 41 oz from Apple Health/);
    // Nothing held back: no further read.
    await m.click(/\+ Glass/);
    await React.act(async () => { answer(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.equal(gets, 3, 'a glass with no sync held back read the water again');
  } finally { answer?.(); m.unmount(); }   // a held glass left pending would hold the shared queue for later tests
});

test('a glass that fails after the sync read was held back for it still reads the water again', async () => {
  let server = 0.5;
  let fail;
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => { gets += 1; return { ok: true, hydrationL: server, targetL: 3, targetStoredL: 3, deviceL: gets > 1 ? 1.2 : null }; },
    add: () => new Promise((_r, rej) => { fail = () => rej(new Error('offline')); }),
  };
  const m = await mount();
  try {
    await m.click(/\+ Glass/);
    server = Math.round((server + 1.2) * 10000) / 10000;
    await m.sync();
    await React.act(async () => { await new Promise((r) => setTimeout(r, 3100)); });
    await m.flush();
    assert.equal(gets, 2);
    await React.act(async () => { fail(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    await m.flush();
    assert.equal(gets, 3, 'a failed glass left the held-back read unsent');
    assert.match(m.text(), /57 oz of 101 oz/, 'the synced water never reached the line');
    assert.match(m.text(), /Could not log water/);
  } finally { fail?.(); m.unmount(); }
});

test('a glass tapped while the sync read is out, then failing, leaves the synced total (mutation round on #2407)', async () => {
  // The read answers with the glass still out, so it may not hold it: the line keeps its own total and
  // takes Apple Health's share. The glass then fails and takes back only itself, and the line reads
  // again, so it ends on the server's total: no glass, the synced water in.
  let server = 0.5;
  let readRelease;
  let fail;
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => {
      gets += 1;
      const total = server;
      if (gets === 2) await new Promise((r) => { readRelease = r; });
      return { ok: true, hydrationL: total, targetL: 3, targetStoredL: 3, deviceL: gets > 1 ? 1.2 : null };
    },
    add: () => new Promise((_r, rej) => { fail = () => rej(new Error('offline')); }),
  };
  const m = await mount();
  try {
    server = Math.round((server + 1.2) * 10000) / 10000;   // the sync's Apple Health water
    await m.sync();
    assert.equal(gets, 2);
    await m.click(/\+ Glass/);                             // tapped while the read is out, held
    await React.act(async () => { readRelease(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.match(m.text(), /25 oz of 101 oz/, 'the read answering with the glass still out dropped the glass from the line');
    await React.act(async () => { fail(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    await m.flush();
    assert.equal(gets, 3, 'the line did not read again once the glass failed');
    assert.match(m.text(), /57 oz of 101 oz/, 'the failed glass was taken back from a total that never held it');
    assert.match(m.text(), /Could not log water/);
  } finally { readRelease?.(); fail?.(); m.unmount(); }
});

test('a sync read that fails leaves the first read standing, and + Glass works (review on this PR)', async () => {
  let release;
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => {
      gets += 1;
      if (gets === 1) { await new Promise((r) => { release = r; }); return { ok: true, hydrationL: 0.5, targetL: 3, targetStoredL: 3 }; }
      return null;   // the data layer answers null for any failed read
    },
    add: async (d) => ({ ok: true, hydrationL: 0.5 + d, targetStoredL: 3 }),
  };
  const m = await mount();
  try {
    await m.sync();
    assert.equal(gets, 2);
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.match(m.text(), /17 oz of 101 oz/, 'a failed sync read threw away the first read');
    assert.equal(m.button(/\+ Glass/).disabled, false, '+ Glass stayed disabled behind a failed read');
  } finally { m.unmount(); }
});

test('a first read that fails after the sync read answered leaves the sync read standing', async () => {
  let release;
  let gets = 0;
  env();
  dom.window.ShapeHydration = {
    get: async () => {
      gets += 1;
      if (gets === 1) { await new Promise((r) => { release = r; }); return null; }
      return { ok: true, hydrationL: 1.7, targetL: 3, targetStoredL: 3, deviceL: 1.2 };
    },
    add: async () => ({ ok: true }),
  };
  const m = await mount();
  try {
    await m.sync();
    assert.match(m.text(), /57 oz of 101 oz/);
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.match(m.text(), /57 oz of 101 oz/, 'a failed first read put "—" over the total the sync read had shown');
  } finally { m.unmount(); }
});

test("Apple Health's share is never said as more than the day's total", async () => {
  env({ water: { ok: true, hydrationL: 0.3, targetL: 3, targetStoredL: null, deviceL: 1.2 } });
  const m = await mount();
  try {
    assert.match(m.text(), /Includes 10 oz from Apple Health/, 'the share was said as more than the total');
  } finally { m.unmount(); }
});

test("litres are said in the member's language", async () => {
  dom.window.ShapeI18n.intlLocale = () => 'de-DE';
  theme.isMetric = true;
  try {
    env({ water: { ok: true, hydrationL: 2.25, targetL: 3, targetStoredL: 3 } });
    const m = await mount();
    assert.match(m.text(), /2,25 L of 3 L/, 'a German member reads a decimal point');
    m.unmount();
  } finally { theme.isMetric = false; delete dom.window.ShapeI18n.intlLocale; }
});

// ── The hydration lead opens this line (part 2, §3.7) ───────────────────────
test("the hydration lead brings today's line to the middle of the screen and puts focus on + Glass", async () => {
  const proto = dom.window.HTMLElement.prototype;
  const had = Object.prototype.hasOwnProperty.call(proto, 'scrollIntoView') ? proto.scrollIntoView : undefined;
  const scrolled = [];
  assert.equal(WATER.bsWaterLineFocus(), false, 'a line that is not on screen was found');
  env();
  const m = await mount();
  try {
    const glass = m.button(/\+ Glass/);
    // Where the browser has no scrollIntoView (jsdom), focus still lands.
    delete proto.scrollIntoView;
    assert.equal(WATER.bsWaterLineFocus(), true);
    assert.ok(document.activeElement === glass, '+ Glass did not take focus');
    glass.blur();
    proto.scrollIntoView = function scrollIntoView(opts) { scrolled.push([this.hasAttribute('data-bs-water'), opts]); };
    assert.equal(WATER.bsWaterLineFocus(), true);
    assert.deepEqual(scrolled, [[true, { block: 'center', behavior: 'smooth' }]], 'the line was not brought to the middle of the screen');
    assert.ok(document.activeElement === glass, '+ Glass lost focus after the scroll');
    // With Reduce Motion on it jumps there: an explicit smooth scroll would override the setting.
    glass.blur();
    scrolled.length = 0;
    const asked = [];
    dom.window.matchMedia = (q) => { asked.push(q); return { matches: q === '(prefers-reduced-motion: reduce)' }; };
    try {
      assert.equal(WATER.bsWaterLineFocus(), true);
      assert.deepEqual(asked, ['(prefers-reduced-motion: reduce)']);
      assert.deepEqual(scrolled, [[true, { block: 'center', behavior: 'auto' }]], 'a member with Reduce Motion on got a smooth scroll');
      assert.ok(document.activeElement === glass);
      // Reduce Motion off is the smooth scroll; a matchMedia that throws still scrolls and focuses.
      scrolled.length = 0;
      dom.window.matchMedia = () => ({ matches: false });
      WATER.bsWaterLineFocus();
      assert.deepEqual(scrolled, [[true, { block: 'center', behavior: 'smooth' }]]);
      scrolled.length = 0;
      glass.blur();
      dom.window.matchMedia = () => { throw new Error('no media queries here'); };
      assert.equal(WATER.bsWaterLineFocus(), true);
      assert.deepEqual(scrolled, [[true, { block: 'center', behavior: 'smooth' }]], 'a matchMedia that throws stopped the scroll');
      assert.ok(document.activeElement === glass);
    } finally { delete dom.window.matchMedia; }
    // A scroll that throws still leaves the member one tap from a glass.
    glass.blur();
    proto.scrollIntoView = () => { throw new Error('no smooth scrolling here'); };
    assert.equal(WATER.bsWaterLineFocus(), true);
    assert.ok(document.activeElement === glass, 'a failed scroll left focus nowhere');
    // The focused + Glass is the real one: it adds a glass.
    await m.click(/\+ Glass/);
    assert.match(m.text(), /Water25 oz/);
  } finally {
    if (had) proto.scrollIntoView = had; else delete proto.scrollIntoView;
    m.unmount();
  }
  assert.equal(WATER.bsWaterLineFocus(), false, 'a line that left the screen was found');
});

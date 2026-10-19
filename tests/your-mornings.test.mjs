// tests/your-mornings.test.mjs
//
// Your mornings: the Morning check-in over time (docs/REVIEW-2026-10-19-morning-checkin.md §3.5 and
// §3.8, part 2). Readiness today, 7 days | 30 days, Sleep, Energy, How you woke up and, with a
// nutritionist, Hunger, each in words with a direction against the window before; last night from a
// watch; Who sees this.
//
// The rules are pure functions and run here as they ship. The page is mounted on jsdom with the real
// English catalog behind the real ICU translator, and with the ONE BSCheckinCard instance the page
// imports (the registry shares it, as tests/water-line.test.mjs does), so the page's wait for the
// card's saves is the card's own queue.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { morningReadinessForDay } from '../mobile-app/src/services/morningReadiness.mjs';

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
const PAGE = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSYourMornings.jsx'), { registry });

const appRequire = createRequire(join(ROOT, 'mobile-app/package.json'));
const i18next = appRequire('i18next');
const ICU = appRequire('i18next-icu');
const i18n = i18next.createInstance();
await i18n.use(ICU.default || ICU).init({
  lng: 'en', fallbackLng: 'en', ns: ['home'], defaultNS: 'home', keySeparator: false,
  interpolation: { escapeValue: false },
  resources: { en: { home: JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/home.json'), 'utf8')) } },
});
dom.window.ShapeI18n = { t: (key, opts) => i18n.t(key, opts), intlLocale: () => 'en-US' };

const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', INK: '#111', INK50: '#777', INK70: '#555', RULE: '#ccc', HAIR: '#ddd', RUST: '#9a3b1b', padX: 18, isLight: true, isMetric: false };
dom.window.useBS = () => theme;
// The client's chrome, stubbed: the page reads both off window when it renders.
dom.window.BSPage = ({ children }) => React.createElement('div', { 'data-test-page': '' }, children);
dom.window.BSDetailHeader = ({ onBack, eyebrow, title }) => React.createElement('header', null,
  React.createElement('button', { type: 'button', onClick: onBack, 'data-test-back': '' }, '←'), eyebrow, title);

// Local noon on 2026-10-18 (a Sunday) unless a test says otherwise.
const at = (h, m = 0) => new Date(2026, 9, 18, h, m).getTime();
mock.timers.enable({ apis: ['Date'], now: at(12) });
const TODAY = '2026-10-18';
const day = (k) => CARD.bsCiShift(TODAY, -k); // k days before today; -1 is tomorrow

// { 'YYYY-MM-DD': { energy, hunger, sleep, sleepQuality, hrv, … } } → the progress series shape.
function series(days) {
  const out = {};
  for (const [date, metrics] of Object.entries(days)) {
    for (const [k, value] of Object.entries(metrics)) (out[k] ||= []).push({ date, value });
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.date < b.date ? -1 : 1));
  return out;
}
// The same metric on consecutive days: from `k0` days back, one value per day towards today.
function run(metric, k0, values, into = {}) {
  values.forEach((v, i) => { if (v != null) (into[day(k0 - i)] ||= {})[metric] = v; });
  return into;
}

// `plan` is what the plan route answers; left out, there is no plan read at all.
function env({ uid = 'member-1', days = {}, progress, plan } = {}) {
  const calls = { progress: 0, plan: 0 };
  dom.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
  dom.window.ShapeProgress = { progress: async () => { calls.progress += 1; return progress ? progress() : { ok: true, series: series(days) }; } };
  if (plan === undefined) delete dom.window.ShapePlan;
  else dom.window.ShapePlan = { get: async () => { calls.plan += 1; return plan; } };
  return calls;
}
const NUTRITIONIST = { training: { coaching: null }, meals: { coaching: { name: 'Lee', coaches: [] } } };
const TRAINER = { training: { coaching: { name: 'Sam', coaches: [] } }, meals: { coaching: null } };
const BOTH = { training: { coaching: { name: 'Sam' } }, meals: { coaching: { name: 'Lee' } } };
const NONE = { training: { coaching: null }, meals: { coaching: null } };

async function mount(Component = PAGE.BSYourMornings, props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const el = () => React.createElement(Component, { onBack() {}, ...props });
  await React.act(async () => { root.render(el()); });
  await flush();
  await flush();
  const q = (sel) => host.querySelector(sel);
  const buttons = (re) => [...host.querySelectorAll('button')].filter((b) => re.test(b.textContent.trim()) || re.test(b.getAttribute('aria-label') || ''));
  return {
    host,
    flush,
    q,
    all: (sel) => [...host.querySelectorAll(sel)],
    text: () => host.textContent,
    section: (kind) => q(`[data-bs-mornings-section="${kind}"]`),
    headline: (kind) => q(`[data-bs-mornings-section="${kind}"] [data-bs-mornings-headline]`)?.textContent,
    dir: (kind) => q(`[data-bs-mornings-section="${kind}"] [data-bs-mornings-dir]`),
    cells: (kind) => [...host.querySelectorAll(`[data-bs-mornings-strip="${kind}"] [data-bs-mornings-day]`)],
    button: (re) => buttons(re)[0],
    click: async (re) => {
      const b = buttons(re)[0];
      assert.ok(b, `no button matching ${re} in: ${host.textContent}`);
      await React.act(async () => { b.click(); });
      await flush();
    },
    rerender: async () => { await React.act(async () => { root.render(el()); }); await flush(); await flush(); },
    unmount() { React.act(() => root.unmount()); host.remove(); },
  };
}

// ── The rules ────────────────────────────────────────────────────────────────

test('the signed-out example is 60 days ending today, oldest first, on the stored scale, with a skip and a gap', () => {
  const s = PAGE.bsMorningsSample(TODAY);
  assert.deepEqual(Object.keys(s).sort(), ['energy', 'sleep', 'sleepQuality', 'sleepSkipped']);
  const dates = [...s.energy, ...s.sleep, ...s.sleepQuality, ...s.sleepSkipped].map((p) => p.date);
  assert.ok(dates.every((d) => d >= day(59) && d <= TODAY), 'the example has a day outside the 60 ending today');
  assert.equal(s.energy[s.energy.length - 1].date, TODAY, 'the example has no morning today, so no readiness to show');
  for (const k of ['energy', 'sleep', 'sleepQuality', 'sleepSkipped']) {
    const ds = s[k].map((p) => p.date);
    assert.deepEqual(ds, [...ds].sort(), `${k} is not oldest first`);
  }
  assert.ok([...s.energy, ...s.sleepQuality].every((p) => CARD.BS_CI_STORED.includes(p.value)), 'a word was stored off the 2·4·6·8·10 grid');
  // A skipped night inside the week, with no hours on it, and a day nobody answered.
  const skips = s.sleepSkipped.map((p) => p.date);
  assert.ok(skips.some((d) => d >= day(6)), 'the week shows no skipped night');
  assert.ok(skips.every((d) => !s.sleep.some((p) => p.date === d)), 'a skipped night has hours');
  assert.ok(Array.from({ length: 60 }, (_, k) => day(k)).some((d) => !s.energy.some((p) => p.date === d) && !s.sleep.some((p) => p.date === d)), 'no day without an answer');
  assert.deepEqual(PAGE.bsMorningsSample(TODAY), s, 'the example changed between two calls on one day');
  assert.deepEqual(PAGE.bsMorningsSample('2026-10-18T00:00'), { energy: [], sleepQuality: [], sleep: [], sleepSkipped: [] });
  assert.deepEqual(PAGE.bsMorningsSample(null), { energy: [], sleepQuality: [], sleep: [], sleepSkipped: [] });
});

test('the example walks member-local days across a daylight-saving change, never repeating or skipping one', () => {
  // 2026-11-01 is the US fall-back day and 2026-03-29 Europe's spring-forward; whatever the TZ, every
  // one of the 60 dates is distinct and consecutive.
  for (const end of ['2026-11-08', '2026-04-05', '2027-01-02']) {
    const s = PAGE.bsMorningsSample(end);
    const days = [...new Set([...s.energy, ...s.sleep, ...s.sleepQuality, ...s.sleepSkipped].map((p) => p.date))].sort();
    for (let i = 1; i < days.length; i += 1) assert.ok(CARD.bsCiShift(days[i - 1], 1) <= days[i], `${days[i - 1]} → ${days[i]} repeats a day`);
    assert.equal(days[days.length - 1], end);
    assert.ok(days[0] >= CARD.bsCiShift(end, -59));
  }
});

test('a headline is the word most days had, else the range answered, else how many more it needs', () => {
  const H = PAGE.bsMorningsHeadline;
  const week = (vals) => vals.map((v, i) => ({ iso: day(6 - i), energy: v }));
  assert.deepEqual(H('energy', week([8, 8, 8, 2, 4, null, null])), { key: 'home:mornings.headMostlyWeek', vars: { word: 3 } });
  // An old 1-10 value reads as its word, by the card's one rule: 7 and 8 are both Good.
  assert.deepEqual(H('energy', week([7, 8, 9])), { key: 'home:mornings.headMostlyWeek', vars: { word: 3 } });
  assert.deepEqual(H('energy', week([2, 4, 6, 8, 10])), { key: 'home:mornings.headMixed', vars: { low: 0, high: 4 } });
  assert.deepEqual(H('energy', week([4, 8, 4, 8])), { key: 'home:mornings.headMixed', vars: { low: 1, high: 3 } }, 'a tie is a majority');
  assert.deepEqual(H('energy', week([8, null, 6])), { key: 'home:mornings.headMore', vars: { n: 1 } });
  assert.deepEqual(H('energy', week([])), { key: 'home:mornings.headMore', vars: { n: 3 } });
  assert.deepEqual(H('energy', week([0, -2, null, 8])), { key: 'home:mornings.headMore', vars: { n: 2 } }, 'a value that is no word counted as an answer');
  // Thirty days say "this month"; Rested and Hunger read their own fields.
  const month = Array.from({ length: 30 }, (_, i) => ({ iso: day(29 - i), rested: i % 3 ? 6 : null, hunger: 8 }));
  assert.deepEqual(H('rested', month), { key: 'home:mornings.headMostlyMonth', vars: { word: 2 } });
  assert.deepEqual(H('hunger', month), { key: 'home:mornings.headMostlyMonth', vars: { word: 3 } });
  assert.equal(H('mood', month), null);
});

test("sleep's headline is the average night and how many were short, by the card's short-night rule", () => {
  const H = PAGE.bsMorningsHeadline;
  const nights = [7.5, 5.5, 6.5, 8].map((sleep, i) => ({ iso: day(3 - i), sleep, usual: 7.5 }));
  // 5.5 is under 6h; 6.5 is an hour under the usual 7h 30.
  assert.deepEqual(H('sleep', nights), { key: 'home:mornings.sleepHead', vars: { hours: 6.875, short: 2 } });
  // With no usual night on the days, only the 6h line counts.
  assert.deepEqual(H('sleep', nights.map(({ usual, ...d }) => d)), { key: 'home:mornings.sleepHead', vars: { hours: 6.875, short: 1 } });
  assert.deepEqual(H('sleep', [{ sleep: 7 }, { sleep: null }, { sleep: 0 }, { skipped: true }]), { key: 'home:mornings.headMore', vars: { n: 2 } });
});

test("a direction needs 3 answers in both windows, and a move under half a word or 20 minutes is 'About the same'", () => {
  const D = PAGE.bsMorningsDirection;
  const days = (kind, vals) => vals.map((v) => ({ [kind]: v }));
  assert.equal(D('energy', days('energy', [8, 8, 8]), days('energy', [6, 6, 6])), 'up');
  assert.equal(D('energy', days('energy', [4, 4, 4]), days('energy', [6, 6, 6])), 'down');
  assert.equal(D('energy', days('energy', [6, 6, 8]), days('energy', [6, 6, 6])), 'same', 'two thirds of a point moved it');
  assert.equal(D('energy', days('energy', [8, 6, 7]), days('energy', [6, 6, 6])), 'up', 'exactly a point (half a word) is a move');
  // The means of whole values land a hair under 1 (0.9999999999999998): still a point.
  assert.equal(D('energy', [2, 2, 4], [1, 2, 2]), 'up', 'float noise read a one-point move as the same');
  assert.equal(D('rested', days('rested', [4, 4, 4, 4]), days('rested', [8, 8, 8])), 'down');
  assert.equal(D('hunger', days('hunger', [8, 8, 10]), days('hunger', [4, 6, 4])), 'up');
  // Three answers in each, or nothing to say; values that are no word are not answers.
  assert.equal(D('energy', days('energy', [8, 8, 8]), days('energy', [6, 6, null, 0])), null);
  assert.equal(D('energy', days('energy', [8, 8]), days('energy', [6, 6, 6])), null);
  assert.equal(D('energy', days('energy', [8, 8, 8, null, 'x']), days('energy', [4, 4, 4])), 'up');
  // An old value over 10 is Great, as its word is: never more than a 10.
  assert.equal(D('energy', [12, 12, 12], [10, 10, 10]), 'same', 'a value over 10 read as more than Great');
  // Sleep to the minute: 20 minutes is the smallest move, 19 is the same.
  assert.equal(D('sleep', [8, 8, 8], [7 + 40 / 60, 7 + 40 / 60, 7 + 40 / 60]), 'up');
  assert.equal(D('sleep', [8, 8, 8], [7 + 41 / 60, 7 + 41 / 60, 7 + 41 / 60]), 'same');
  assert.equal(D('sleep', [6, 6, 6], [7, 7, 7]), 'down');
  assert.equal(D('sleep', days('sleep', [7, 7, 7]), days('sleep', [7, 0, null, 7])), null, 'a night with no hours counted');
  assert.equal(D('mood', [8, 8, 8], [2, 2, 2]), null);
});

// ── The page ─────────────────────────────────────────────────────────────────

// Two weeks: this week (today and the six before) mostly Good, the week before mostly Low; tomorrow
// carries a row the page must never read.
function twoWeeks() {
  const d = {};
  run('energy', 6, [8, 8, 8, 6, 8, null, 8], d);
  run('energy', 13, [4, 4, 4, 4, 6, 4, 4], d);
  run('sleepQuality', 6, [8, 6, 8, 8, 4, 8, 8], d);
  run('sleepQuality', 13, [8, 8, 8, 8, 8, 8, 8], d);
  run('sleep', 6, [7.5, 7.5, 5.5, 7.5, 7.5, 7.5, 7.5], d);
  run('sleep', 13, [8, 8, 8, 8, 8, 8, 8], d);
  d[day(-1)] = { energy: 2, sleep: 3, sleepQuality: 2 };
  return d;
}

test('seven days are today and the six before it, in words, against the seven before them', async () => {
  const calls = env({ days: twoWeeks(), plan: NONE });
  const m = await mount();
  try {
    assert.equal(calls.progress, 1);
    const cells = m.cells('energy');
    assert.deepEqual(cells.map((c) => c.getAttribute('data-bs-mornings-day')), [6, 5, 4, 3, 2, 1, 0].map(day), 'the window is not today and the six before, oldest first');
    assert.ok(!m.q(`[data-bs-mornings-day="${day(-1)}"]`), "tomorrow's row was read");
    assert.equal(m.headline('energy'), 'Mostly good this week');
    assert.equal(m.dir('energy').getAttribute('data-bs-mornings-dir'), 'up');
    assert.match(m.dir('energy').textContent, /^Betterthan the 7 days before$/);
    // A day nobody answered is an empty cell that says so.
    assert.equal(cells[5].getAttribute('aria-label'), `${new Date(2026, 9, 17, 12).toLocaleDateString('en-US', { weekday: 'short' })} 17: No answer`);
    assert.match(cells[6].getAttribute('aria-label'), /18: Good$/);
    // How you woke up, in its own words; the week before was Rested every day.
    assert.equal(m.headline('rested'), 'Mostly rested this week');
    assert.equal(m.dir('rested').getAttribute('data-bs-mornings-dir'), 'same');
    assert.equal(m.dir('rested').textContent, 'About the same', '"About the same" was said against the window before');
    assert.match(m.cells('rested')[4].getAttribute('aria-label'), /: Tired$/);
    // Sleep: the average night and the short one, to the 5 minutes; 47 minutes under the 8h week before.
    assert.equal(m.headline('sleep'), '7h 15 a night on average · 1 short night', 'the average night (7h 13) is said to the 5 minutes, as the week line says it');
    assert.equal(m.dir('sleep').getAttribute('data-bs-mornings-dir'), 'down');
    assert.match(m.dir('sleep').textContent, /^Shorter/);
    assert.match(m.cells('sleep')[2].getAttribute('aria-label'), /: 5h 30$/);
    assert.equal(m.cells('readiness').length, 7);
  } finally { m.unmount(); }
});

test('thirty days are a month of thin bars, compared with the thirty before, and the switch says which is on', async () => {
  const d = {};
  run('energy', 59, Array.from({ length: 30 }, () => 4), d);
  run('energy', 29, Array.from({ length: 30 }, (_, i) => (i % 4 ? 8 : null)), d);
  run('sleep', 29, Array.from({ length: 30 }, () => 7), d);
  env({ days: d, plan: NONE });
  const m = await mount();
  try {
    const seven = m.button(/^7 days$/);
    const thirty = m.button(/^30 days$/);
    assert.equal(seven.getAttribute('aria-pressed'), 'true');
    assert.equal(thirty.getAttribute('aria-pressed'), 'false');
    assert.equal(m.q('[data-bs-mornings-range] [role="group"]').getAttribute('aria-label'), 'Show');
    await m.click(/^30 days$/);
    assert.equal(m.button(/^30 days$/).getAttribute('aria-pressed'), 'true');
    assert.equal(m.button(/^7 days$/).getAttribute('aria-pressed'), 'false');
    const cells = m.cells('energy');
    assert.equal(cells.length, 30);
    assert.equal(cells[0].getAttribute('data-bs-mornings-day'), day(29));
    assert.equal(cells[29].getAttribute('data-bs-mornings-day'), TODAY);
    // One label for the whole strip, none per bar.
    const strip = m.q('[data-bs-mornings-strip="energy"] [role="img"]');
    assert.equal(strip.getAttribute('aria-label'), 'Energy, the last 30 days');
    assert.ok(cells.every((c) => !c.hasAttribute('aria-label')));
    assert.equal(m.headline('energy'), 'Mostly good this month');
    assert.match(m.dir('energy').textContent, /^Betterthan the 30 days before$/);
    // Thirty nights of 7h against none before: a headline, and no direction.
    assert.equal(m.headline('sleep'), '7h a night on average');
    assert.equal(m.dir('sleep'), null);
    await m.click(/^7 days$/);
    assert.equal(m.cells('energy').length, 7);
  } finally { m.unmount(); }
});

test('the window before is the seven days before the window, sharing none of its days', async () => {
  // The oldest day of this week is answered, and the week before has only two answers: no direction.
  // A window before that reached into this week would find three, and say one.
  const d = run('energy', 6, [8, null, null, null, 8, 8, 8]);
  run('energy', 13, [null, null, null, null, null, 4, 4], d);
  env({ days: d, plan: NONE });
  const m = await mount();
  try {
    assert.equal(m.headline('energy'), 'Mostly good this week');
    assert.equal(m.dir('energy'), null, 'the window before counted a day of this week');
  } finally { m.unmount(); }
});

test('mixed and too few answers say so in words', async () => {
  const d = {};
  run('energy', 6, [2, 10, 6, 4, 8, null, null], d);
  run('sleepQuality', 6, [null, null, null, null, null, 8, null], d);
  env({ days: d, plan: NONE });
  const m = await mount();
  try {
    assert.equal(m.headline('energy'), 'Mixed, from drained to great');
    assert.equal(m.headline('rested'), '2 more answers and this fills in');
    assert.equal(m.headline('sleep'), '3 more answers and this fills in');
    assert.equal(m.dir('energy'), null, 'a direction without 3 answers the week before');
  } finally { m.unmount(); }
});

test('Hunger is a section only with a nutritionist: never for none, a trainer only, or a plan read that failed', async () => {
  const d = run('hunger', 6, [8, 8, 8, 8, 6, 8, 8], run('energy', 6, [8, 8, 8, 8, 8, 8, 8]));
  run('hunger', 13, [4, 4, 4, 4, 4, 4, 4], d);
  env({ days: d, plan: NUTRITIONIST });
  let m = await mount();
  try {
    assert.ok(m.section('hunger'), 'a member with a nutritionist has no Hunger section');
    assert.equal(m.q('[data-bs-mornings-section="hunger"] h2').textContent, 'Hunger between meals');
    assert.equal(m.headline('hunger'), 'Mostly hungry this week');
    assert.equal(m.dir('hunger').getAttribute('data-bs-mornings-dir'), 'up');
    assert.match(m.dir('hunger').textContent, /^Hungrier/);
    assert.deepEqual(m.all('[data-bs-mornings-section]').map((s) => s.getAttribute('data-bs-mornings-section')), ['readiness', 'sleep', 'energy', 'rested', 'hunger']);
  } finally { m.unmount(); }

  for (const [label, plan] of [['none', NONE], ['a trainer only', TRAINER], ['a failed read', null], ['a read with no coaching key', { training: {}, meals: {} }], ['no plan service', undefined]]) {
    env({ days: d, plan });
    m = await mount();
    try {
      assert.ok(m.section('energy'), `${label}: the page did not render`);
      assert.equal(m.section('hunger'), null, `${label}: the Hunger section showed`);
      assert.doesNotMatch(m.text(), /Hungry|Hunger/, `${label}: hunger history was shown`);
    } finally { m.unmount(); }
  }

  // Less hungry is said for a fall.
  const less = run('hunger', 6, [4, 4, 4, 4, 4, 4, 4], run('hunger', 13, [10, 8, 8, 8, 8, 8, 8]));
  env({ days: less, plan: BOTH });
  m = await mount();
  try { assert.match(m.dir('hunger').textContent, /^Less hungry/); } finally { m.unmount(); }
});

test("the watch's tiles are last night's only, and a watch that hasn't sent it yet says so", async () => {
  const d = {
    [TODAY]: { sleep: 7.2, sleepFromDevice: 1, sleepEfficiency: 91.4, restingHr: 52, hrv: 61, recovery: 74, energy: 8 },
    [day(1)]: { sleep: 6, sleepFromDevice: 1, sleepEfficiency: 80, restingHr: 60, hrv: 40, recovery: 30 },
  };
  env({ days: d, plan: NONE });
  let m = await mount();
  try {
    const w = m.q('[data-bs-mornings-watch]');
    assert.equal(w.getAttribute('data-bs-mornings-watch'), 'on');
    assert.match(w.textContent, /^Last night from your watch/);
    const tiles = Object.fromEntries(m.all('[data-bs-mornings-tile]').map((el) => [el.getAttribute('data-bs-mornings-tile'), el.textContent]));
    assert.deepEqual(tiles, { hours: 'Slept7h 12', efficiency: 'Efficiency91%', rhr: 'Resting HR52 bpm', hrv: 'HRV61 ms', recovery: 'Watch recovery74' });
    // The watch's night is marked on the sleep strip.
    const tonight = m.cells('sleep')[6];
    assert.equal(tonight.getAttribute('data-bs-mornings-mark'), 'watch');
    assert.match(tonight.getAttribute('aria-label'), /18: 7h 12 · From your watch$/);
  } finally { m.unmount(); }

  // Yesterday's readings only: the watch is known, last night is not in.
  env({ days: { [day(1)]: d[day(1)], [TODAY]: { energy: 8, sleep: 7 } }, plan: NONE });
  m = await mount();
  try {
    assert.equal(m.q('[data-bs-mornings-watch]').getAttribute('data-bs-mornings-watch'), 'on');
    assert.deepEqual(m.all('[data-bs-mornings-tile]'), [], "yesterday's readings were shown as last night's");
    assert.equal(m.q('[data-bs-mornings-watchnone]').textContent, "Your watch hasn't sent last night yet.");
    assert.doesNotMatch(m.text(), /Slept|Efficiency|Resting HR/);
    // Typed hours today are not a watch's.
    assert.equal(m.cells('sleep')[6].getAttribute('data-bs-mornings-mark'), null);
  } finally { m.unmount(); }

  // A resting heart rate alone today, from a watch that wrote a recovery reading this month.
  env({ days: { [day(20)]: { recovery: 60 }, [TODAY]: { restingHr: 55 } }, plan: NONE });
  m = await mount();
  try {
    assert.deepEqual(m.all('[data-bs-mornings-tile]').map((el) => el.getAttribute('data-bs-mornings-tile')), ['rhr']);
  } finally { m.unmount(); }
});

test('without a watch in the last 30 days, the page says where the readings come from and opens Integrations', async () => {
  env({ days: { [day(40)]: { sleep: 7, sleepFromDevice: 1, hrv: 50, recovery: 70 }, [TODAY]: { energy: 8, sleep: 7 } }, plan: NONE });
  const m = await mount();
  const opened = [];
  const onOpen = (e) => opened.push(e.type);
  dom.window.addEventListener('shape:openIntegrations', onOpen);
  try {
    const w = m.q('[data-bs-mornings-watch]');
    assert.equal(w.getAttribute('data-bs-mornings-watch'), 'connect', 'a watch 40 days ago read as a watch now');
    assert.match(w.textContent, /Sleep and recovery readings come from a watch\./);
    await m.click(/^Connect a watch/);
    assert.deepEqual(opened, ['shape:openIntegrations']);
  } finally { dom.window.removeEventListener('shape:openIntegrations', onOpen); m.unmount(); }
});

test('a skipped night is marked as skipped, never as no answer, and its key says what the marks mean', async () => {
  const d = { [day(1)]: { energy: 8 }, [day(2)]: { sleep: 7, sleepFromDevice: 1, energy: 8 }, [TODAY]: { sleep: 7.5, energy: 8 } };
  const s = series(d);
  s.sleepSkipped = [{ date: day(1), value: 1 }];
  env({ progress: async () => ({ ok: true, series: s }), plan: NONE });
  const m = await mount();
  try {
    const cells = m.cells('sleep');
    assert.equal(cells[5].getAttribute('data-bs-mornings-mark'), 'skipped');
    assert.match(cells[5].getAttribute('aria-label'), /17: Skipped$/);
    assert.match(cells[5].textContent, /Skipped$/);
    assert.equal(cells[4].getAttribute('data-bs-mornings-mark'), 'watch');
    assert.match(cells[3].getAttribute('aria-label'), /: No answer$/);
    assert.match(m.section('sleep').textContent, /From your watchSkipped$/, 'the marks have no key');
  } finally { m.unmount(); }
});

test("readiness today is morningReadinessForDay's, with what it was built from, and the window's average", async () => {
  const d = {};
  // Thirty days of watch history for the baselines, then a morning with the watch's night.
  for (let k = 1; k <= 12; k += 1) d[day(k)] = { hrv: 50, restingHr: 55, sleep: 7.5, energy: 6, sleepQuality: 6 };
  d[TODAY] = { energy: 8, sleepQuality: 8, sleep: 7, sleepFromDevice: 1, recovery: 80, hrv: 60, restingHr: 54 };
  const s = series(d);
  env({ progress: async () => ({ ok: true, series: s }), plan: NONE });
  const m = await mount();
  try {
    const want = morningReadinessForDay(s, TODAY, { usualNight: CARD.bsCiUsualNight(s, TODAY) });
    assert.ok(want && want.usesWatch, 'the fixture does not exercise the watch parts');
    assert.equal(m.q('[data-bs-mornings-score]').textContent, String(want.score));
    assert.equal(m.q('[data-bs-mornings-band]').getAttribute('data-bs-mornings-band'), want.band);
    const hero = m.q('[data-bs-mornings-hero]').textContent;
    assert.match(hero, /^Readiness today/);
    assert.match(hero, /Built from your energy, your sleep, how you woke up and your watch's readings\./);
    assert.match(hero, /A guide from your own answers, not a medical reading\./);
    // Each answered morning's readiness on the strip, and the average of the window's.
    const week = [6, 5, 4, 3, 2, 1, 0].map((k) => morningReadinessForDay(s, day(k), { usualNight: CARD.bsCiUsualNight(s, day(k)) }));
    const avg = Math.round(week.reduce((a, r) => a + r.score, 0) / week.length);
    assert.equal(m.q('[data-bs-mornings-avg]').textContent, `Averaging ${avg} over 7 mornings`);
    assert.deepEqual(m.cells('readiness').map((c) => c.getAttribute('aria-label').replace(/^.*: /, '')), week.map((r) => `Readiness ${r.score} · ${{ ready: 'Ready', steady: 'Steady', easy: 'Take it easy', low: 'Run down' }[r.band]}`));
  } finally { m.unmount(); }
});

test("the page's readiness is the number on Home's done line", async () => {
  const d = {};
  for (let k = 1; k <= 10; k += 1) d[day(k)] = { hrv: 48, restingHr: 56, sleep: 8 };
  d[TODAY] = { energy: 4, sleepQuality: 6, sleep: 6.5, recovery: 41, hrv: 44, restingHr: 59 };
  env({ days: d, plan: NONE });
  const page = await mount();
  const card = await mount(CARD.BSCheckinCard, { onOpen() {} });
  try {
    const line = card.q('[data-bs-checkin-readiness]');
    assert.ok(line, `the card has no readiness line: ${card.text()}`);
    const score = page.q('[data-bs-mornings-score]').textContent;
    assert.match(line.textContent, new RegExp(`^Readiness ${score} · `));
  } finally { card.unmount(); page.unmount(); }
});

test('an unanswered morning asks for the check-in, unless check-ins are off, which the page says instead', async () => {
  env({ days: { [day(1)]: { energy: 8, sleep: 7 } }, plan: NONE });
  let m = await mount();
  try {
    assert.equal(m.q('[data-bs-mornings-score]'), null);
    assert.equal(m.q('[data-bs-mornings-open]').textContent, "Answer this morning's check-in to see today's readiness.");
    assert.equal(m.q('[data-bs-mornings-off]'), null);
    // Yesterday: Good (85) and 7h against the usual 7h 30 (85).
    assert.equal(m.q('[data-bs-mornings-avg]').textContent, 'Averaging 85 over 1 morning');
  } finally { m.unmount(); }

  m = await mount(PAGE.BSYourMornings, { checkinsOn: false });
  try {
    assert.equal(m.q('[data-bs-mornings-open]'), null, 'check-ins off, and the page still asked for one');
    assert.equal(m.q('[data-bs-mornings-off]').textContent, 'Morning check-ins are off, so nothing new is asked. You can turn them on in Settings.');
    assert.ok(m.section('energy'), 'the history is hidden with check-ins off');
  } finally { m.unmount(); }

  env({ days: { [TODAY]: { energy: 8, sleep: 7.5 } }, plan: NONE });
  m = await mount(PAGE.BSYourMornings, { checkinsOn: false });
  try {
    assert.ok(m.q('[data-bs-mornings-score]'), 'a morning already answered lost its readiness with check-ins off');
    const hero = m.q('[data-bs-mornings-hero]');
    assert.equal(hero.nextElementSibling, m.q('[data-bs-mornings-off]'), 'the check-ins line is not under the hero');
    assert.match(hero.textContent, /Built from your energy, your sleep and how you woke up\./);
  } finally { m.unmount(); }
});

test('signed out, the page shows example mornings, says so, and reads nothing', async () => {
  const calls = env({ uid: null, plan: BOTH });
  const m = await mount();
  try {
    assert.equal(calls.progress, 0, 'the signed-out page read progress');
    assert.equal(calls.plan, 0, 'the signed-out page read the plan');
    assert.equal(m.q('[data-bs-mornings-sample]').textContent, 'Example mornings. Join Shape to see your own.');
    const s = PAGE.bsMorningsSample(TODAY);
    const want = morningReadinessForDay(s, TODAY, { usualNight: CARD.bsCiUsualNight(s, TODAY) });
    assert.equal(m.q('[data-bs-mornings-score]').textContent, String(want.score));
    assert.equal(m.q('[data-bs-mornings-watch]'), null, 'the example has a watch block');
    assert.equal(m.q('[data-bs-mornings-who]'), null);
    assert.equal(m.section('hunger'), null);
    assert.equal(m.headline('energy'), 'Mostly good this week');
    assert.ok(m.cells('sleep').some((c) => c.getAttribute('data-bs-mornings-mark') === 'skipped'), "the example's week has no skipped night");
  } finally { m.unmount(); }
});

test("a read that fails says so, and draws no one's mornings", async () => {
  for (const progress of [async () => null, async () => ({ ok: false }), async () => { throw new Error('offline'); }]) {
    env({ progress, plan: NONE });
    const m = await mount();
    try {
      assert.equal(m.q('[data-bs-mornings-failed]').textContent, "Couldn't load your mornings. Try again in a minute.");
      assert.equal(m.q('[data-bs-mornings-hero]'), null);
      assert.equal(m.q('[data-bs-mornings-section]'), null);
      assert.equal(m.q('[data-bs-mornings-sample]'), null, 'a failed read showed the example as the member\'s');
    } finally { m.unmount(); }
  }
});

test("a read that lands after the account changed is dropped, and the next account's is drawn", async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  env({ uid: 'member-a', progress: () => slow, plan: NONE });
  const m = await mount();
  try {
    assert.equal(m.q('[data-bs-mornings-hero]'), null);
    // Another account signs in on this device before the first read answers.
    env({ uid: 'member-b', days: { [TODAY]: { energy: 10, sleep: 8, sleepQuality: 10 } }, plan: NONE });
    release({ ok: true, series: series({ [TODAY]: { energy: 2, sleep: 4, sleepQuality: 2 } }) });
    await m.flush();
    assert.equal(m.q('[data-bs-mornings-score]'), null, "the first account's mornings were drawn after it signed out");
    await m.rerender();
    const b = morningReadinessForDay(series({ [TODAY]: { energy: 10, sleep: 8, sleepQuality: 10 } }), TODAY, { usualNight: 7.5 });
    assert.equal(m.q('[data-bs-mornings-score]').textContent, String(b.score));
  } finally { m.unmount(); }
});

test("a page already drawn for one account is not drawn for the next while the next one's read is out", async () => {
  env({ uid: 'member-a', days: { [TODAY]: { energy: 2, sleep: 4, sleepQuality: 2 } }, plan: BOTH });
  const m = await mount();
  try {
    assert.ok(m.q('[data-bs-mornings-score]'));
    assert.ok(m.q('[data-bs-mornings-who]'));
    let release;
    const slow = new Promise((r) => { release = r; });
    env({ uid: 'member-b', progress: () => slow, plan: undefined });
    await m.rerender();
    assert.equal(m.q('[data-bs-mornings-score]'), null, "the first account's mornings stayed up for the next");
    assert.equal(m.q('[data-bs-mornings-section]'), null);
    assert.equal(m.q('[data-bs-mornings-who]'), null, "the first account's coaches were said to the next");
    release({ ok: true, series: series({ [TODAY]: { energy: 10, sleep: 8, sleepQuality: 10 } }) });
    await m.flush();
    await m.flush();
    assert.equal(m.q('[data-bs-mornings-score]').textContent, '100');
  } finally { m.unmount(); }
});

test("a watch's night the card's sync brings while the page is open is read again; a read again that fails keeps the page", async () => {
  let answer = { ok: true, series: series({ [TODAY]: { energy: 8, sleep: 7 } }) };
  const calls = env({ progress: async () => answer, plan: NONE });
  const m = await mount();
  const sync = async () => { await React.act(async () => { dom.window.dispatchEvent(new dom.window.Event(CARD.BS_CI_HYDRATION_SYNCED)); }); await m.flush(); await m.flush(); };
  try {
    assert.equal(m.q('[data-bs-mornings-watch]').getAttribute('data-bs-mornings-watch'), 'connect');
    answer = { ok: true, series: series({ [TODAY]: { energy: 8, sleep: 7.75, sleepFromDevice: 1, hrv: 58 } }) };
    await sync();
    assert.equal(calls.progress, 2);
    assert.equal(m.q('[data-bs-mornings-watch]').getAttribute('data-bs-mornings-watch'), 'on');
    assert.match(m.q('[data-bs-mornings-tile="hours"]').textContent, /7h 45$/);
    answer = null;
    await sync();
    assert.equal(calls.progress, 3);
    assert.equal(m.q('[data-bs-mornings-failed]'), null, 'a read again that failed replaced the page');
    assert.ok(m.q('[data-bs-mornings-tile="hours"]'));
  } finally { m.unmount(); }
});

test("the read waits for the card's saves on their way, through the card's own queue", async () => {
  const calls = env({ days: { [TODAY]: { energy: 8, sleep: 7 } }, plan: NONE });
  let land;
  const save = CARD.bsCiEnqueue('checkin', 'member-1', () => new Promise((r) => { land = r; }));
  const m = await mount();
  try {
    assert.equal(calls.progress, 0, 'the page read before a save on its way had landed');
    land({ ok: true });
    await save;
    await m.flush();
    await m.flush();
    assert.equal(calls.progress, 1);
    assert.ok(m.q('[data-bs-mornings-score]'));
  } finally { m.unmount(); }
});

test('Who sees this is the card\'s, and the cycle chip is drawn as Home hands it', async () => {
  env({ days: { [TODAY]: { energy: 8 } }, plan: BOTH });
  const chip = React.createElement('button', { type: 'button', 'data-test-chip': '' }, 'Period started? Log it →');
  const m = await mount(PAGE.BSYourMornings, { cycleChip: chip });
  try {
    assert.equal(m.q('[data-bs-mornings-who]').textContent, 'Your trainer and nutritionist see your 7-day averages.');
    const c = m.q('[data-test-chip]');
    assert.ok(c, 'the cycle chip was not drawn');
    // Under readiness today, above the range switch.
    assert.ok(m.q('[data-bs-mornings-hero]').compareDocumentPosition(c) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.ok(c.compareDocumentPosition(m.q('[data-bs-mornings-range]')) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  } finally { m.unmount(); }
  env({ days: { [TODAY]: { energy: 8 } }, plan: NONE });
  const solo = await mount();
  try { assert.equal(solo.q('[data-bs-mornings-who]').textContent, 'Only you see these.'); } finally { solo.unmount(); }
});

test('no /10 anywhere: every value is a word, an hour or a score', async () => {
  const d = twoWeeks();
  d[TODAY] = { ...d[TODAY], hunger: 7, sleepFromDevice: 1, sleepEfficiency: 90, restingHr: 50, hrv: 70, recovery: 66 };
  env({ days: d, plan: BOTH });
  const m = await mount();
  try {
    for (const range of [/^7 days$/, /^30 days$/]) {
      await m.click(range);
      const said = [m.text(), ...m.all('[aria-label]').map((el) => el.getAttribute('aria-label'))].join('\n');
      assert.doesNotMatch(said, /\/\s*10\b/);
      assert.doesNotMatch(said, /\bof 10\b/);
    }
  } finally { m.unmount(); }
});

test('Back goes back, and the range switch sticks below the condensed masthead', async () => {
  const mast = document.createElement('div');
  mast.setAttribute('data-bs-pinned-mast', '');
  Object.defineProperty(mast, 'offsetHeight', { value: 52 });
  document.body.appendChild(mast);
  env({ days: { [TODAY]: { energy: 8 } }, plan: NONE });
  let backs = 0;
  const m = await mount(PAGE.BSYourMornings, { onBack: () => { backs += 1; } });
  try {
    const sw = m.q('[data-bs-mornings-range]');
    assert.equal(sw.style.position, 'sticky');
    assert.equal(sw.style.top, '52px');
    assert.match(m.text(), /Morning check-in · history/);
    assert.match(m.text(), /Your mornings\./);
    m.q('[data-test-back]').click();
    assert.equal(backs, 1);
  } finally { m.unmount(); mast.remove(); }
});

test("Progress's door names the page and opens it", async () => {
  let opened = 0;
  const m = await mount(PAGE.BSMorningsDoor, { onOpen: () => { opened += 1; } });
  try {
    const b = m.q('[data-bs-mornings-door]');
    assert.equal(b.tagName, 'BUTTON');
    assert.equal(b.textContent, 'Your morningsSleep, energy and how you woke up, day by day→');
    await m.click(/^Your mornings/);
    assert.equal(opened, 1);
  } finally { m.unmount(); }
  // A door Progress renders without an opener does nothing, and throws nothing.
  const errors = [];
  const onError = (e) => { errors.push(e.error || e.message); e.preventDefault(); };
  dom.window.addEventListener('error', onError);
  const bare = await mount(PAGE.BSMorningsDoor, {});
  try {
    await bare.click(/^Your mornings/);
    assert.deepEqual(errors, []);
  } finally { dom.window.removeEventListener('error', onError); bare.unmount(); }
});

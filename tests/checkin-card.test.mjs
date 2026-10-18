// tests/checkin-card.test.mjs
//
// The daily check-in: a card on Home and the walkthrough it opens (owner, 2026-10-18: "make it
// easier to update each day and less effort for user each day", then "have it be a step by step,
// almost like a tutorial that walks through each check", with the member's own last days under
// every step; rulings in docs/REVIEW-2026-10-18-daily-checkin.md §5). Every tap saves.
//
// The rules are pure functions and run here as they ship. The card is mounted on jsdom with the
// real English catalog behind the real ICU translator, so the copy and the plurals are what a
// member reads. The walkthrough portals into the page, so the mount reads the whole document.
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
const CARD = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry: new Map([['react', React], ['react-dom', require_('react-dom')]]) });
const { THRESHOLDS } = require_('../public/newdesign/dashSignals.js');

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

// Local noon on 2026-10-18 unless a test says otherwise.
const at = (h, m = 0) => new Date(2026, 9, 18, h, m).getTime();
mock.timers.enable({ apis: ['Date'], now: at(12) });
const TODAY = '2026-10-18';
const YDAY = '2026-10-17';

// { 'YYYY-MM-DD': { energy, hunger, sleep, sleepQuality, hrv, … } } → the progress series shape.
function series(days) {
  const out = {};
  for (const [date, metrics] of Object.entries(days)) {
    for (const [k, value] of Object.entries(metrics)) (out[k] ||= []).push({ date, value });
  }
  return out;
}

function env({ uid = 'member-1', days = {}, progress, log, water = { ok: true, hydrationL: 0.5, targetL: 3 } } = {}) {
  const calls = { log: [], add: [] };
  dom.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
  dom.window.ShapeProgress = { progress: progress || (async () => ({ series: series(days) })) };
  dom.window.ShapeCheckin = { log: async (patch) => { calls.log.push(patch); return log ? log(patch) : { ok: true }; } };
  dom.window.ShapeHydration = {
    get: async () => water,
    add: async (deltaL) => { calls.add.push(deltaL); return { ok: true, hydrationL: water.hydrationL + deltaL }; },
  };
  return calls;
}

async function mount(props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await React.act(async () => { root.render(React.createElement(CARD.BSCheckinCard, props)); });
  await flush();
  const buttons = (re) => [...document.body.querySelectorAll('button')].filter((b) => re.test(b.textContent.trim()) || re.test(b.getAttribute('aria-label') || ''));
  const click = async (re, nth = 0) => {
    const b = buttons(re)[nth];
    assert.ok(b, `no button matching ${re} in: ${document.body.textContent}`);
    await React.act(async () => { b.click(); });
    await flush();
  };
  return {
    host,
    flush,
    rerender: async () => { await React.act(async () => { root.render(React.createElement(CARD.BSCheckinCard, props)); }); await flush(); },
    button: (re) => buttons(re)[0],
    text: () => document.body.textContent,
    walk: () => document.querySelector('[data-bs-checkin-walk]'),
    pressed: () => [...document.body.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent.trim()),
    click,
    unmount() { React.act(() => root.unmount()); host.remove(); },
  };
}

// ── The rules ────────────────────────────────────────────────────────────────

test('five words are stored as 2·4·6·8·10, and an old 1-10 value reads back as its nearest word', () => {
  assert.deepEqual(CARD.BS_CI_STORED, [2, 4, 6, 8, 10]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(CARD.bsCiWordIndex), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  for (const v of [null, undefined, 0, -1, 'x', NaN]) assert.equal(CARD.bsCiWordIndex(v), null, `${v} read as a word`);
});

test("the stored values sit on the engine's side of its thresholds where the words do", () => {
  // energy_low flags an average at or under 4: Drained and Low, never OK.
  assert.deepEqual(CARD.BS_CI_STORED.map((v) => v <= THRESHOLDS.ENERGY_LOW_AVG), [true, true, false, false, false]);
  // hunger_high flags an average at or over 8: Hungry and Starving, never Normal.
  assert.deepEqual(CARD.BS_CI_STORED.map((v) => v >= THRESHOLDS.HUNGER_HIGH_AVG), [false, false, false, true, true]);
});

test('one question at a time: energy, hunger, then sleep unless a wearable reported the night', () => {
  assert.equal(CARD.bsCiStep(null), 'energy');
  assert.equal(CARD.bsCiStep({ energy: 6 }), 'hunger');
  assert.equal(CARD.bsCiStep({ energy: 6, hunger: 4 }), 'sleep');
  assert.equal(CARD.bsCiStep({ energy: 6, hunger: 4, sleep: 7 }), 'done');
  const worn = CARD.bsCiDay(series({ [TODAY]: { sleep: 7.2, hrv: 55 } }), TODAY);
  assert.equal(worn.device, true);
  assert.equal(CARD.bsCiStep({ ...worn, energy: 6, hunger: 4 }), 'done', 'a night the wearable reported was asked again');
  // A watch that reported a resting heart rate but no night: the night is still the member's to give.
  const pulse = CARD.bsCiDay(series({ [TODAY]: { restingHr: 58 } }), TODAY);
  assert.equal(pulse.device, true);
  assert.equal(CARD.bsCiWornNight(pulse), false);
  assert.equal(CARD.bsCiStep({ ...pulse, energy: 6, hunger: 4 }), 'sleep', 'a heart rate alone stopped the sleep question');
  assert.equal(CARD.bsCiStep({ energy: 6, hunger: 4 }, true), 'done', 'a night the member skipped was asked again');
  assert.equal(CARD.bsCiStep({ hunger: 4 }, true), 'energy', 'a skipped night skipped the other questions');
});

test('a day counts as checked in from a manual answer only; a wearable night alone is not one', () => {
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [TODAY]: { sleep: 7.2, hrv: 55 } }), TODAY)), false);
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [TODAY]: { sleep: 7 } }), TODAY)), true);
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [TODAY]: { sleepQuality: 6 } }), TODAY)), true);
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [YDAY]: { energy: 6 } }), TODAY)), false, 'yesterday was read as today');
});

test('the streak runs back from today, or from yesterday while today is still open', () => {
  const run = { '2026-10-15': { energy: 6 }, '2026-10-16': { hunger: 4 }, [YDAY]: { sleep: 7 } };
  assert.equal(CARD.bsCiStreak(series(run), TODAY), 3, 'an open today broke the run');
  assert.equal(CARD.bsCiStreak(series({ ...run, [TODAY]: { energy: 8 } }), TODAY), 4);
  assert.equal(CARD.bsCiStreak(series({ '2026-10-15': { energy: 6 }, [YDAY]: { energy: 6 } }), TODAY), 1, 'a missed day did not end it');
  assert.equal(CARD.bsCiStreak(series({ '2026-10-15': { energy: 6 }, '2026-10-16': { sleep: 7, hrv: 50 }, [YDAY]: { energy: 6 } }), TODAY), 1, 'a wearable night kept a run going');
  assert.equal(CARD.bsCiStreak(series({ '2026-10-30': { energy: 6 }, '2026-10-31': { energy: 6 } }), '2026-11-01'), 2, 'the run stopped at a month');
  assert.equal(CARD.bsCiStreak({}, TODAY), 0);
});

test('the sleep stepper starts at the usual night: the median of the last 14, to the half hour, 3h to 12h', () => {
  assert.equal(CARD.bsCiUsualNight({}, TODAY), 7.5);
  const nights = (hours) => series(Object.fromEntries(hours.map((h, i) => [`2026-10-${String(17 - i).padStart(2, '0')}`, { sleep: h }])));
  assert.equal(CARD.bsCiUsualNight(nights([6, 7, 8.2]), TODAY), 7);
  assert.equal(CARD.bsCiUsualNight(nights([6, 7, 8, 9]), TODAY), 7.5);
  assert.equal(CARD.bsCiUsualNight(nights([6.8]), TODAY), 7);
  assert.equal(CARD.bsCiUsualNight(nights([14]), TODAY), 12);
  assert.equal(CARD.bsCiUsualNight(nights([2]), TODAY), 3);
  // Tonight is not one of the nights, and the window is 14 nights back.
  assert.equal(CARD.bsCiUsualNight(series({ [TODAY]: { sleep: 4 }, '2026-10-03': { sleep: 4 } }), TODAY), 7.5);
});

test("Same as yesterday copies yesterday's own values, keeps today's, and never types a wearable's night", () => {
  const y = { energy: 7, hunger: 5, sleep: 6.5, rested: 3, device: false };
  const empty = { energy: null, hunger: null, sleep: null, rested: null, device: false };
  assert.deepEqual(CARD.bsCiSamePatch(y, empty), { energy: 7, hunger: 5, sleepHours: 6.5, sleepQuality: 3 }, 'a 7 was rounded to its word');
  assert.deepEqual(CARD.bsCiSamePatch(y, { ...empty, energy: 2 }), { hunger: 5, sleepHours: 6.5, sleepQuality: 3 }, "today's answer was overwritten");
  assert.deepEqual(CARD.bsCiSamePatch({ ...y, device: true }, empty), { energy: 7, hunger: 5 }, "a wearable's night was copied as typed");
  assert.deepEqual(CARD.bsCiSamePatch(y, { ...empty, sleep: 7.4, device: true }), { energy: 7, hunger: 5 }, "today's wearable night was overwritten");
  assert.deepEqual(CARD.bsCiSamePatch(y, { ...empty, device: true }), { energy: 7, hunger: 5, sleepHours: 6.5, sleepQuality: 3 }, 'a heart rate today kept the night from being copied');
  assert.equal(CARD.bsCiSamePatch({ ...y, hunger: null }, empty), null, 'offered with half a day to copy');
  assert.equal(CARD.bsCiSamePatch(null, empty), null);
  assert.equal(CARD.bsCiSamePatch(y, { energy: 7, hunger: 5, sleep: 6.5, rested: 3, device: false }), null);
});

test('the strip under each step is the seven days before today, oldest first, with each day\'s water', () => {
  const week = CARD.bsCiWeek(series({ '2026-10-11': { energy: 6 }, [YDAY]: { energy: 8, hydration: 2.5 }, [TODAY]: { energy: 2 }, '2026-10-10': { energy: 10 } }), TODAY);
  assert.deepEqual(week.map((d) => d.iso), ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
  assert.equal(week[0].energy, 6);
  assert.equal(week[6].energy, 8, 'yesterday is not the last day of the strip');
  assert.equal(week[6].water, 2.5);
  assert.equal(week[1].water, null, 'a day with no water reads as a number');
  assert.ok(!week.some((d) => d.iso === TODAY), 'today is in its own strip');
});

test('"Mostly" is said only for a real majority of at least three answered days', () => {
  assert.equal(CARD.bsCiMostly([8, 8, 7, 4, null, null, 6]), 3, 'Good on 3 of 5');
  assert.equal(CARD.bsCiMostly([8, 8, 4, 4]), null, 'a tie is a trend');
  assert.equal(CARD.bsCiMostly([8, 8]), null, 'two days are a trend');
  assert.equal(CARD.bsCiMostly([8, 8, 4, 6, 10, 2]), null, 'two of six is "mostly"');
  assert.equal(CARD.bsCiMostly([]), null);
});

test('hours read as hours and minutes, and a wearable\'s 7.999h reads 8h, never "7h 60"', () => {
  assert.equal(CARD.bsCiHM(7.5), '7h 30');
  assert.equal(CARD.bsCiHM(7), '7h');
  assert.equal(CARD.bsCiHM(7.1667), '7h 10');
  assert.equal(CARD.bsCiHM(7.999), '8h');
  assert.equal(CARD.bsCiHM(null), '—');
});

// ── The card and its walkthrough ─────────────────────────────────────────────

test('the card is the door: Start walks one check per screen, every tap saves, and Home ends on one line', async () => {
  const calls = env();
  const m = await mount();
  try {
    assert.match(m.text(), /Four quick checks\./);
    assert.equal(m.walk(), null, 'the walkthrough opened by itself');
    await m.click(/Start check-in/);
    assert.match(m.text(), /Step 1 of 4 · Energy/);
    assert.match(m.text(), /How's your energy\?/);
    assert.match(m.text(), /How much you have in the tank/, 'the step no longer says what it asks');
    await m.click(/^Good$/);
    assert.deepEqual(calls.log, [{ energy: 8 }], 'the energy tap was not saved on its own');
    assert.match(m.text(), /Step 2 of 4 · Hunger/);
    await m.click(/^Normal$/);
    assert.deepEqual(calls.log[1], { hunger: 6 });
    assert.match(m.text(), /Step 3 of 4 · Sleep/);
    assert.match(m.text(), /7h 30/);
    assert.match(m.text(), /Your usual night/);
    await m.click(/Thirty minutes less/);
    assert.doesNotMatch(m.text(), /Your usual night/, 'a night the member changed still claims to be their usual one');
    await m.click(/^Rested$/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log[2], { sleepHours: 7, sleepQuality: 8 });
    assert.match(m.text(), /Step 4 of 4 · Water/);
    await m.click(/\+ 1 glass/);
    assert.deepEqual(calls.add, [0.2366]);
    await m.click(/^Finish/);
    assert.match(m.text(), /You're checked in ✓/);
    await m.click(/^Done$/);
    assert.equal(m.walk(), null, 'Done left the walkthrough open');
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /Energy Good · Hunger Normal · Sleep 7h · Rested/);
    assert.equal(calls.log.length, 3);
  } finally { m.unmount(); }
});

test('every step shows the last 7 days, and a tap on a day reuses its answer', async () => {
  const calls = env({ days: {
    '2026-10-12': { energy: 8, hunger: 6, sleep: 7.5 },
    '2026-10-13': { energy: 8, hunger: 6 },
    '2026-10-14': { energy: 4, hunger: 4, sleep: 5.83 },
    '2026-10-15': { energy: 7, hunger: 6 },
    '2026-10-16': { energy: 8, hydration: 3.1 },
    [YDAY]: { energy: 7, hunger: 8, sleep: 6.5, sleepQuality: 8, hydration: 2.5 },
  } });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    const strip = () => document.querySelector('[data-bs-checkin-week]');
    assert.equal(strip().getAttribute('data-bs-checkin-week'), 'energy');
    const cells = [...strip().querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));
    assert.equal(cells.length, 7);
    assert.match(cells[0], /11: No answer$/, 'a day with no answer is not read out as one');
    assert.match(cells[6], /17: Good$/, 'yesterday is not the last day');
    assert.match(m.text(), /Mostly good this week\./);
    // A tap on yesterday reuses its own value: a 7 stays a 7.
    await m.click(/17: Good/);
    assert.deepEqual(calls.log, [{ energy: 7 }]);
    assert.match(m.text(), /Step 2 of 4 · Hunger/);
    assert.equal(strip().getAttribute('data-bs-checkin-week'), 'hunger');
    assert.match(m.text(), /Mostly normal this week\./);
    await m.click(/^Normal$/);
    // Sleep: a tap on a day fills the stepper and its Rested; Next saves them.
    await m.click(/17: 6h 30/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log[2], { sleepHours: 6.5, sleepQuality: 8 });
    // Water: the week against the target.
    assert.equal(strip().getAttribute('data-bs-checkin-week'), 'water');
    assert.match(m.text(), /Target reached once this week\./);
  } finally { m.unmount(); }
});

test('Same as yesterday on the card logs the whole day in one tap', async () => {
  const calls = env({ days: { [YDAY]: { energy: 7, hunger: 5, sleep: 6.5, sleepQuality: 9 }, '2026-10-16': { energy: 6 } } });
  const m = await mount();
  try {
    assert.match(m.text(), /Same as yesterday/);
    assert.match(m.text(), /Good · Normal · 6h 30/);
    await m.click(/Same as yesterday/);
    assert.deepEqual(calls.log, [{ energy: 7, hunger: 5, sleepHours: 6.5, sleepQuality: 9 }]);
    assert.equal(m.walk(), null);
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /3 days running/);
  } finally { m.unmount(); }
});

test('a day already checked in counts once in the streak', async () => {
  env({ days: { '2026-10-16': { energy: 6 }, [YDAY]: { energy: 8 }, [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  const m = await mount();
  try {
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /3 days running/, 'today was counted twice, or not at all');
  } finally { m.unmount(); }
});

test("a wearable's night is not asked, and Same as yesterday leaves it alone", async () => {
  const calls = env({ days: { [TODAY]: { sleep: 7.2, hrv: 50 }, [YDAY]: { energy: 7, hunger: 5, sleep: 7, hrv: 48 } } });
  const m = await mount();
  try {
    assert.match(m.text(), /Good · Normal/);
    assert.doesNotMatch(m.text(), /Good · Normal · 7h/, "yesterday's wearable night is offered as the member's own");
    await m.click(/Same as yesterday/);
    assert.deepEqual(calls.log, [{ energy: 7, hunger: 5 }]);
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /Sleep 7h 12/);
    // In the walkthrough the night reads as the watch's, and Next writes nothing over it.
    await m.click(/^Edit$/);
    await m.click(/^Change$/, 2);
    assert.match(m.text(), /From your watch/);
    assert.equal(m.button(/^Skip$/), undefined, 'a wearable night can be skipped');
    await m.click(/^Next/);
    assert.equal(calls.log.length, 1, "Next wrote over the wearable's night");
    assert.match(m.text(), /You're checked in/);
    // Rested is the member's own check, and a wearable's night still takes it, on its own.
    await m.click(/^Change$/, 2);
    await m.click(/^Rested$/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log[1], { sleepQuality: 8 }, "a wearable member's Rested was not saved, or the watch's hours were re-typed with it");
    assert.match(m.text(), /7h 12 · Rested/);
  } finally { m.unmount(); }
});

test('a member who does not track sleep can skip the night, for the rest of the day', async () => {
  dom.window.localStorage.clear();
  const calls = env({ days: { [TODAY]: { energy: 8, hunger: 6 } } });
  let m = await mount();
  try {
    await m.click(/^Continue/);
    assert.match(m.text(), /Step 3 of 4 · Sleep/, 'Continue did not open the first open check');
    await m.click(/^Skip$/);
    assert.deepEqual(calls.log, [], 'skipping wrote a night');
    assert.match(m.text(), /Step 4 of 4 · Water/);
    await m.click(/^Finish/);
    assert.match(m.text(), /You're checked in ✓/);
    assert.match(m.text(), /Skipped/);
    await m.click(/^Done$/);
    assert.match(m.text(), /Checked in ✓/);
    assert.doesNotMatch(m.text(), /Sleep \d/, 'the done line names a night that was skipped');
  } finally { m.unmount(); }
  // Still skipped when Home comes back today…
  env({ days: { [TODAY]: { energy: 8, hunger: 6 } } });
  m = await mount();
  try { assert.match(m.text(), /Checked in ✓/, 'the skip did not survive leaving Home'); } finally { m.unmount(); }
  // …but tomorrow asks again.
  try {
    mock.timers.setTime(new Date(2026, 9, 19, 12).getTime());
    env({ days: { '2026-10-19': { energy: 8, hunger: 6 } } });
    m = await mount();
    assert.match(m.text(), /Four quick checks/, "yesterday's skip held today");
    m.unmount();
  } finally { mock.timers.setTime(at(12)); dom.window.localStorage.clear(); }
});

test('a failed save puts the answer back and says so on screen', async () => {
  // Toasts are a no-op app-wide (BSToastHost), so the screen is the only place to say it.
  let fail = true;
  const calls = env({ log: async () => { if (fail) throw new Error('500'); return { ok: true }; } });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Good$/);
    assert.match(m.text(), /Could not save check-in — try again/);
    await m.click(/Back/);
    assert.match(m.text(), /Step 1 of 4 · Energy/);
    assert.deepEqual(m.pressed(), [], 'a failed answer still shows as given');
    // The next tap still goes through: one failure must not wedge the save queue.
    fail = false;
    await m.click(/^Good$/);
    assert.equal(calls.log.length, 2, 'the retry was never written');
    assert.match(m.text(), /Step 2 of 4 · Hunger/);
    assert.doesNotMatch(m.text(), /Could not save/, 'the error outlived the answer that fixed it');
  } finally { m.unmount(); }
});

test('a failed save puts back only its own answer, not one given after it (Codex P2 on #2398)', async () => {
  // Energy is still saving when hunger is answered; then the energy save fails and the hunger
  // save, queued behind it, succeeds. The screen must still hold the hunger answer.
  let failEnergy;
  const energy = new Promise((_, reject) => { failEnergy = reject; });
  let n = 0;
  const calls = env({ log: () => (++n === 1 ? energy : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Good$/);
    await m.click(/^Normal$/);
    failEnergy(new Error('500'));
    await m.flush();
    await m.flush();
    assert.deepEqual(calls.log, [{ energy: 8 }, { hunger: 6 }]);
    assert.match(m.text(), /Could not save check-in/);
    await m.click(/Back/);
    assert.deepEqual(m.pressed(), ['Normal'], 'the stored hunger answer was put back with the failed energy one');
    await m.click(/Back/);
    assert.deepEqual(m.pressed(), [], 'the failed energy answer still shows as given');
  } finally { m.unmount(); }
});

test('an older save that fails never undoes a newer answer to the same question', async () => {
  let failFirst;
  const first = new Promise((_, reject) => { failFirst = reject; });
  let n = 0;
  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } }, log: () => (++n === 1 ? first : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/^Edit$/);
    await m.click(/^Change$/, 0);
    await m.click(/^Great$/);      // its save hangs, then fails
    await m.click(/^Change$/, 0);
    await m.click(/^Drained$/);
    failFirst(new Error('500'));
    await m.flush();
    await m.flush();
    assert.match(m.text(), /Drained/, "the failed Great put back the energy over the member's newer Drained");
    assert.doesNotMatch(m.text(), /EnergyGood/);
  } finally { m.unmount(); }
});

test("a queued answer is dropped when the account changes, never saved to the next member's day (Codex P1 on #2398)", async () => {
  let release;
  const first = new Promise((r) => { release = r; });
  const calls = env({ uid: 'member-a', log: (p) => (p.energy != null ? first : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Good$/);       // on its way, under member A
    await m.click(/^Normal$/);     // queued behind it
    // Member A signs out and member B signs in before the first save answers.
    dom.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-b' } }) };
    release({ ok: true });
    await m.flush();
    await m.flush();
    assert.deepEqual(calls.log, [{ energy: 8 }], "member A's queued answer was sent under member B's session");
  } finally { m.unmount(); }
});

test('two quick glasses save in order, and a failed one takes back only its own glass (Codex P2 on #2398)', async () => {
  let failFirst;
  const first = new Promise((_, reject) => { failFirst = reject; });
  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  let server = 0.5;
  const adds = [];
  dom.window.ShapeHydration = {
    get: async () => ({ ok: true, hydrationL: 0.5, targetL: 3 }),
    add: (d) => { adds.push(d); if (adds.length === 1) return first; server += d; return Promise.resolve({ ok: true, hydrationL: server }); },
  };
  const m = await mount();
  try {
    await m.click(/\+ Glass/);
    await m.click(/\+ Glass/);
    assert.equal(adds.length, 1, 'the second glass was sent while the first was still saving');
    assert.match(m.text(), /33 oz \/ 101 oz/);
    failFirst(new Error('500'));
    await m.flush();
    await m.flush();
    assert.equal(adds.length, 2);
    assert.match(m.text(), /25 oz \/ 101 oz/, 'the failed glass took back more than itself, or nothing');
    assert.match(m.text(), /Could not log water/);
  } finally { m.unmount(); }
});

test('a glass that saves keeps the ones still on their way, and a failed last one takes back only itself', async () => {
  let releaseFirst;
  let failSecond;
  const first = new Promise((r) => { releaseFirst = r; });
  const second = new Promise((_, reject) => { failSecond = reject; });
  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  const adds = [];
  dom.window.ShapeHydration = {
    get: async () => ({ ok: true, hydrationL: 0.5, targetL: 3 }),
    add: (d) => { adds.push(d); return adds.length === 1 ? first : second; },
  };
  const m = await mount();
  try {
    await m.click(/\+ Glass/);
    await m.click(/\+ Glass/);
    assert.match(m.text(), /33 oz \/ 101 oz/);
    releaseFirst({ ok: true, hydrationL: 0.7366 });   // the server's total after the first glass
    await m.flush();
    await m.flush();
    assert.equal(adds.length, 2);
    assert.match(m.text(), /33 oz \/ 101 oz/, 'the first glass saving dropped the second, still on its way, from the screen');
    failSecond(new Error('500'));
    await m.flush();
    await m.flush();
    assert.match(m.text(), /25 oz \/ 101 oz/, 'the failed glass took back more than itself');
  } finally { m.unmount(); }
});

test('a failed water read still lets a glass be logged, and the first save brings the total (Codex P2 on #2398)', async () => {
  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  const adds = [];
  dom.window.ShapeHydration = {
    get: async () => { throw new Error('500'); },
    add: async (d) => { adds.push(d); return { ok: true, hydrationL: 1 + d }; },
  };
  const m = await mount();
  try {
    assert.match(m.text(), /Water— ?\+ Glass/, 'a failed read shows a total it does not have');
    assert.equal(m.button(/\+ Glass/).disabled, false, 'a failed read left + Glass disabled');
    await m.click(/\+ Glass/);
    assert.deepEqual(adds, [0.2366]);
    assert.match(m.text(), /42 oz \/ 101 oz/, "the server's total did not replace the unknown one");
  } finally { m.unmount(); }
});

test("a new local day reads that day's water (Codex P2 on #2398)", async () => {
  try {
    mock.timers.setTime(new Date(2026, 9, 18, 23, 59).getTime());
    let reads = 0;
    env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 }, '2026-10-19': { energy: 8, hunger: 6, sleep: 7 } } });
    dom.window.ShapeHydration = { get: async () => { reads += 1; return { ok: true, hydrationL: reads === 1 ? 2 : 0.25, targetL: 3 }; }, add: async () => ({ ok: true }) };
    const m = await mount();
    try {
      assert.match(m.text(), /68 oz \/ 101 oz/);
      mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
      await m.rerender();
      assert.equal(reads, 2, "the new day's water was never read");
      assert.match(m.text(), /8 oz \/ 101 oz/, "yesterday's water is still on Home after midnight");
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test('an answer queued across midnight is dropped, never filed under the next day (Codex P2 on #2398)', async () => {
  try {
    mock.timers.setTime(new Date(2026, 9, 18, 23, 59).getTime());
    let release;
    const first = new Promise((r) => { release = r; });
    const calls = env({ log: (p) => (p.energy != null ? first : { ok: true }) });
    const m = await mount();
    try {
      await m.click(/Start check-in/);
      await m.click(/^Good$/);       // on its way at 23:59
      await m.click(/^Normal$/);     // queued behind it
      mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
      release({ ok: true });
      await m.flush();
      await m.flush();
      assert.deepEqual(calls.log, [{ energy: 8 }], "a 23:59 answer was sent after midnight, and dated the next day");
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test("a new day closes the card until that day is read, and a failed read never shows the day before's (Codex P2 on #2398)", async () => {
  try {
    let reads = 0;
    let failSecond;
    const second = new Promise((_, reject) => { failSecond = reject; });
    env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
    const firstRead = { series: series({ [TODAY]: { energy: 8, hunger: 6, sleep: 7 } }) };
    dom.window.ShapeProgress = { progress: () => { reads += 1; return reads === 1 ? Promise.resolve(firstRead) : second; } };
    const m = await mount();
    try {
      assert.match(m.text(), /Checked in ✓/);
      mock.timers.setTime(new Date(2026, 9, 19, 9, 0).getTime());
      await m.rerender();
      assert.equal(reads, 2);
      assert.doesNotMatch(m.text(), /Checked in/, "the day before's check-in shows as today's while the new day loads");
      failSecond(new Error('500'));
      await m.flush();
      await m.flush();
      assert.match(m.text(), /Four quick checks/, "a failed read left the day before's answers standing as today's");
      assert.doesNotMatch(m.text(), /Checked in/);
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test('a walkthrough open at midnight closes, and a tap after midnight saves nothing (Codex P2 on #2398)', async () => {
  try {
    mock.timers.setTime(new Date(2026, 9, 18, 23, 59).getTime());
    const calls = env();
    const m = await mount();
    try {
      await m.click(/Start check-in/);
      await m.click(/^Good$/);
      assert.match(m.text(), /Step 2 of 4 · Hunger/);
      mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
      // Before Home re-renders, a tap on the old day's sheet is not saved into the new day.
      await m.click(/^Normal$/);
      assert.deepEqual(calls.log, [{ energy: 8 }], 'a 00:01 tap on the 23:59 walkthrough was saved into the new day');
      assert.equal(m.walk(), null, "the day before's walkthrough is still open");
      // Home's next render mounts the new day's card, with no walkthrough carried over.
      await m.rerender();
      assert.equal(m.walk(), null);
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test("a glass tapped on a card whose day is over saves nothing (Codex P2 on #2398)", async () => {
  try {
    mock.timers.setTime(new Date(2026, 9, 18, 23, 59).getTime());
    const calls = env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
    const m = await mount();
    try {
      assert.match(m.text(), /Checked in ✓/);
      mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
      await m.click(/\+ Glass/);
      assert.deepEqual(calls.add, [], "a 00:01 glass on the day before's card was saved into the new day");
      assert.doesNotMatch(m.text(), /Checked in/, "the day before's card still shows after its day ended");
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test("a save from the day before that fails after midnight changes nothing on the new day (Codex P2 on #2398)", async () => {
  try {
    let failEdit;
    const edit = new Promise((_, reject) => { failEdit = reject; });
    env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } }, log: () => edit });
    const m = await mount();
    try {
      await m.click(/^Edit$/);
      await m.click(/^Change$/, 0);
      await m.click(/^Great$/);       // its save is in flight at the turn of the day
      mock.timers.setTime(new Date(2026, 9, 19, 9, 0).getTime());
      dom.window.ShapeProgress = { progress: async () => ({ series: series({}) }) };
      await m.rerender();
      // The new day's card reads once the save on its way has settled.
      failEdit(new Error('500'));
      await m.flush();
      await m.flush();
      assert.match(m.text(), /Four quick checks/);
      assert.doesNotMatch(m.text(), /✓ Energy/, "the failed save from the day before put its energy into the new day");
      assert.doesNotMatch(m.text(), /Could not save/, "the day before's failure shows on the new day");
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test("a failed water read on a new day never shows the day before's water (Codex P2 on #2398)", async () => {
  try {
    let reads = 0;
    env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
    dom.window.ShapeHydration = { get: async () => { reads += 1; if (reads > 1) throw new Error('500'); return { ok: true, hydrationL: 2, targetL: 3 }; }, add: async () => ({ ok: true }) };
    const m = await mount();
    try {
      assert.match(m.text(), /68 oz \/ 101 oz/);
      mock.timers.setTime(new Date(2026, 9, 19, 9, 0).getTime());
      dom.window.ShapeProgress = { progress: async () => ({ series: series({}) }) };
      await m.rerender();
      assert.equal(reads, 2);
      assert.match(m.text(), /Four quick checks/);
      assert.doesNotMatch(m.text(), /✓ Water/, "the day before's water marks the new day's water done");
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test('answers save one at a time, so two quick taps cannot both insert a row for today', async () => {
  let release;
  const first = new Promise((r) => { release = r; });
  const calls = env({ log: (p) => (p.energy != null ? first : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Good$/);
    await m.click(/^Normal$/);
    assert.equal(calls.log.length, 1, 'the hunger write started while the energy write was still open');
    release({ ok: true });
    await m.flush();
    assert.deepEqual(calls.log, [{ energy: 8 }, { hunger: 6 }]);
  } finally { m.unmount(); }
});

test("nothing is asked until today's answers are read", async () => {
  let answer;
  env({ progress: () => new Promise((r) => { answer = r; }) });
  const m = await mount();
  try {
    assert.equal(m.text(), '', 'the card asked before it knew what today already has');
    answer({ series: series({ [TODAY]: { energy: 8, hunger: 6, sleep: 7 } }) });
    await m.flush();
    assert.match(m.text(), /Checked in ✓/);
  } finally { m.unmount(); }
});

test("it asks from 4 a.m., but a day's done line shows before it", async () => {
  try {
    mock.timers.setTime(at(3, 30));
    env();
    let m = await mount();
    assert.equal(m.text(), '', 'it asked about last night at 3:30 a.m.');
    m.unmount();
    env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
    m = await mount();
    assert.match(m.text(), /Checked in ✓/);
    m.unmount();
    mock.timers.setTime(at(4));
    env();
    m = await mount();
    assert.match(m.text(), /Four quick checks/);
    m.unmount();
  } finally { mock.timers.setTime(at(12)); }
});

test('Edit opens the summary, and a Change goes back to it', async () => {
  const calls = env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  const m = await mount();
  try {
    await m.click(/^Edit$/);
    assert.match(m.text(), /You're checked in ✓/);
    await m.click(/^Change$/, 1);
    assert.match(m.text(), /Step 2 of 4 · Hunger/);
    assert.deepEqual(m.pressed(), ['Normal'], "the step did not show today's answer");
    await m.click(/^Hungry$/);
    assert.deepEqual(calls.log, [{ hunger: 8 }]);
    assert.match(m.text(), /You're checked in ✓/, 'a Change walked on to the next check instead of back to the summary');
    assert.match(m.text(), /Hungry/);
    await m.click(/^Change$/, 2);
    assert.match(m.text(), /7h(?! 30)/, "the stepper did not start at today's own hours");
    await m.click(/Close/);
    assert.equal(m.walk(), null);
  } finally { m.unmount(); }
});

test('Details waits for saves on their way, and stays on Home if one fails (Codex P2 on #2398)', async () => {
  let release;
  let opened = 0;
  const gate = new Promise((r) => { release = r; });
  env({ days: { [YDAY]: { energy: 7, hunger: 5, sleep: 6.5 } }, log: () => gate });
  let m = await mount({ onOpen: () => { opened += 1; } });
  try {
    await m.click(/Same as yesterday/);
    await m.click(/Details/);
    assert.equal(opened, 0, 'Details left while the check-in was still saving');
    release({ ok: true });
    await m.flush();
    assert.equal(opened, 1, 'Details never opened once the save landed');
  } finally { m.unmount(); }

  opened = 0;
  let fail;
  const failing = new Promise((_, reject) => { fail = reject; });
  env({ days: { [YDAY]: { energy: 7, hunger: 5, sleep: 6.5 } }, log: () => failing });
  m = await mount({ onOpen: () => { opened += 1; } });
  try {
    await m.click(/Same as yesterday/);
    await m.click(/Details/);
    fail(new Error('500'));
    await m.flush();
    await m.flush();
    assert.equal(opened, 0, 'Details left after the save failed, so the member never saw it');
    assert.match(m.text(), /Could not save check-in/);
  } finally { m.unmount(); }
});

test('Details waits for a glass on its way too, and stays on Home if it fails (Codex P2 on #2398)', async () => {
  let opened = 0;
  let land;
  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  dom.window.ShapeHydration.add = () => new Promise((r) => { land = r; });
  let m = await mount({ onOpen: () => { opened += 1; } });
  try {
    await m.click(/\+ Glass/);
    await m.click(/Details/);
    await m.flush();
    assert.equal(opened, 0, 'Details left while the glass was still saving');
    land({ ok: true, hydrationL: 0.7366 });
    await m.flush();
    assert.equal(opened, 1, 'Details never opened once the glass landed');
  } finally { m.unmount(); }

  opened = 0;
  let fail;
  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  dom.window.ShapeHydration.add = () => new Promise((_, reject) => { fail = reject; });
  m = await mount({ onOpen: () => { opened += 1; } });
  try {
    await m.click(/\+ Glass/);
    await m.click(/Details/);
    fail(new Error('500'));
    await m.flush();
    await m.flush();
    assert.equal(opened, 0, 'Details left after the glass failed, so the member never saw it');
    assert.match(m.text(), /Could not log water/);
  } finally { m.unmount(); }
});

test('Details opens the check-in page, and a glass of water is one tap in the member\'s units', async () => {
  let opened = 0;
  let calls = env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  let m = await mount({ onOpen: () => { opened += 1; } });
  try {
    await m.click(/Details/);
    await m.flush();
    assert.equal(opened, 1);
    assert.match(m.text(), /17 oz \/ 101 oz/);
    await m.click(/\+ Glass/);
    assert.deepEqual(calls.add, [0.2366]);
    assert.match(m.text(), /25 oz \/ 101 oz/);
  } finally { m.unmount(); }

  theme.isMetric = true;
  try {
    calls = env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
    m = await mount();
    await m.click(/\+ Glass/);
    assert.deepEqual(calls.add, [0.25]);
    assert.match(m.text(), /0\.75 L \/ 3 L/);
    m.unmount();
  } finally { theme.isMetric = false; }
});

test('signed out, the card previews the flow and saves nothing', async () => {
  const calls = env({ uid: null });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    assert.match(m.text(), /Mostly good this week\./, 'the preview has no sample week');
    await m.click(/^Good$/);
    await m.click(/^Normal$/);
    await m.click(/^Next/);
    await m.click(/\+ 1 glass/);
    await m.click(/^Finish/);
    assert.deepEqual(calls.log, []);
    assert.deepEqual(calls.add, [], 'the preview wrote a glass');
    assert.match(m.text(), /Join Shape to save your check-in/);
    assert.doesNotMatch(m.text(), /checked in/i, 'the preview claimed a check-in it never saved');
    assert.doesNotMatch(m.text(), /days running/);
    await m.click(/^Done$/);
    assert.match(m.text(), /8 oz \/ 101 oz/, 'the preview did not count its glass');
  } finally { m.unmount(); }
});

// ── The second review round on #2398 ─────────────────────────────────────────

test("a night a watch wrote is known from the server's sources, not from a resting heart rate", async () => {
  const s = (days, device) => ({ ...series(days), sleepFromDevice: device.map((date) => ({ date, value: 1 })) });
  // A watch worn by day reports a resting heart rate; the night was typed.
  assert.equal(CARD.bsCiDay(s({ [TODAY]: { sleep: 7, restingHr: 58 } }, []), TODAY).device, false);
  assert.equal(CARD.bsCiDay(s({ [TODAY]: { sleep: 7 } }, [TODAY]), TODAY).device, true);
  // A server without the series keeps the old sign.
  assert.equal(CARD.bsCiDay(series({ [TODAY]: { sleep: 7, restingHr: 58 } }), TODAY).device, true);

  const calls = env({ days: {} });
  dom.window.ShapeProgress = { progress: async () => ({ series: s({ [TODAY]: { energy: 8, hunger: 6, sleep: 7, restingHr: 58 }, [YDAY]: { energy: 6, hunger: 6, sleep: 6.5, restingHr: 57 } }, []) }) };
  const m = await mount();
  try {
    await m.click(/^Edit$/);
    await m.click(/^Change$/, 2);
    assert.doesNotMatch(m.text(), /From your watch/, "the member's typed hours read as the watch's, so they cannot correct them");
    assert.ok(m.button(/^Skip$/), 'a typed night lost its stepper');
    assert.match(m.text(), /^(?!.*Your usual night).*7h(?! \d)/s, "the stepper did not start at today's own hours");
  } finally { m.unmount(); }
  assert.deepEqual(calls.log, []);
});

test("typed hours on a day with a watch's heart rate stay the member's own after they are saved", async () => {
  // An older server: no sleepFromDevice, so the heart rate still marks the day.
  const calls = env({ days: { [TODAY]: { energy: 8, hunger: 6, restingHr: 58 } } });
  const m = await mount();
  try {
    await m.click(/^Continue/);
    assert.match(m.text(), /Step 3 of 4 · Sleep/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log, [{ sleepHours: 7.5 }]);
    await m.click(/^Finish/);
    await m.click(/^Change$/, 2);
    assert.doesNotMatch(m.text(), /From your watch/, 'the hours just typed now read as the watch\'s');
    assert.ok(m.button(/^Skip$/));
  } finally { m.unmount(); }
});

test('a card mounted while a save is on its way reads after it, so Same as yesterday never writes over it', async () => {
  let stored = { energy: null };
  let land;
  const gate = new Promise((r) => { land = r; });
  const calls = env({ days: {}, log: (p) => gate.then(() => { stored = { ...stored, ...p }; return { ok: true }; }) });
  // The progress read answers from its cache until the save lands and clears it.
  let cache = null;
  dom.window.ShapeProgress = { progress: async () => (cache ||= { series: series({ [YDAY]: { energy: 6, hunger: 6 }, ...(stored.energy != null ? { [TODAY]: { energy: stored.energy } } : {}) }) }) };
  let m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Low$/);
    await m.click(/Close/);
  } finally { m.unmount(); }
  m = await mount();             // Home again, the save still out
  try {
    assert.doesNotMatch(m.text(), /Same as yesterday/, 'the new card asked from the cache before the save landed');
    cache = null;
    land();
    await m.flush();
    await m.flush();
    assert.match(m.text(), /Continue/, "the new card did not read the answer that landed");
    assert.match(m.text(), /✓ Energy/);
  } finally { m.unmount(); land(); }
  assert.deepEqual(calls.log, [{ energy: 4 }]);
});

test('a save the network holds keeps the next card waiting 3 seconds at most', async () => {
  let land;
  const gate = new Promise((r) => { land = r; });
  env({ days: {}, log: () => gate });
  let m = await mount();
  await m.click(/Start check-in/);
  await m.click(/^Good$/);
  m.unmount();
  m = await mount();
  try {
    assert.doesNotMatch(m.text(), /Four quick checks/);
    await React.act(async () => { await new Promise((r) => setTimeout(r, 3100)); });
    await m.flush();
    assert.match(m.text(), /Four quick checks/, 'a held save kept the card off Home');
  } finally { m.unmount(); land({ ok: true }); }
});

test('two failed answers to one question put back what is stored, not the first unsaved answer', async () => {
  let failFirst;
  const first = new Promise((_, reject) => { failFirst = reject; });
  const calls = env({ days: {}, log: (p) => (p.energy === 8 ? first : Promise.reject(new Error('500'))) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Good$/);           // saving
    await m.click(/Back/);
    await m.click(/^Low$/);            // queued behind it
    failFirst(new Error('500'));
    await m.flush();
    await m.flush();
    await m.click(/Back/);
    assert.deepEqual(m.pressed(), [], 'an answer that never saved shows as given');
    await m.click(/Close/);
    assert.doesNotMatch(m.text(), /✓ Energy/, 'Home shows an energy answer that is not stored');
  } finally { m.unmount(); }
  assert.deepEqual(calls.log, [{ energy: 8 }, { energy: 4 }]);
});

test('one failed answer after one that saved puts back the one that saved', async () => {
  const calls = env({ days: {}, log: (p) => (p.energy === 4 ? Promise.reject(new Error('500')) : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Good$/);
    await m.click(/Back/);
    await m.click(/^Low$/);
    await m.flush();
    await m.click(/Back/);
    assert.deepEqual(m.pressed(), ['Good'], 'the answer that saved was taken back with the one that failed');
  } finally { m.unmount(); }
  assert.deepEqual(calls.log, [{ energy: 8 }, { energy: 4 }]);
});

test('a Details tap still waiting does not leave once the member has moved on', async () => {
  let release;
  let opened = 0;
  const gate = new Promise((r) => { release = r; });
  env({ days: { [YDAY]: { energy: 7, hunger: 5, sleep: 6.5 } }, log: () => gate });
  const m = await mount({ onOpen: () => { opened += 1; } });
  try {
    await m.click(/Same as yesterday/);
    await m.click(/Details/);
    await m.click(/^Edit$/);
    release({ ok: true });
    await m.flush();
    await m.flush();
    assert.equal(opened, 0, 'Details left from under the walkthrough the member had opened');
    assert.ok(m.walk());
  } finally { m.unmount(); }
});

test('the water read waits for a glass on its way, so a card mounted meanwhile shows it', async () => {
  let server = 0.5;
  let land;
  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  dom.window.ShapeHydration = {
    get: async () => ({ ok: true, hydrationL: server, targetL: 3 }),
    add: (d) => new Promise((r) => { land = () => { server += d; r({ ok: true, hydrationL: server }); }; }),
  };
  let m = await mount();
  await m.click(/\+ Glass/);
  m.unmount();
  m = await mount();
  try {
    land();
    await m.flush();
    await m.flush();
    assert.match(m.text(), /25 oz \/ 101 oz/, 'the new card read the total from before the glass landed');
  } finally { m.unmount(); }
});

test('a Details tap still waiting does not leave once the member adds a glass', async () => {
  let release;
  let opened = 0;
  const gate = new Promise((r) => { release = r; });
  const calls = env({ days: { [YDAY]: { energy: 7, hunger: 5, sleep: 6.5 } }, log: () => gate });
  const m = await mount({ onOpen: () => { opened += 1; } });
  try {
    await m.click(/Same as yesterday/);
    await m.click(/Details/);
    await m.click(/\+ Glass/);
    release({ ok: true });
    await m.flush();
    await m.flush();
    assert.equal(calls.add.length, 1);
    assert.equal(opened, 0, 'Details left while the member was adding water');
  } finally { m.unmount(); }
});

test("the sheet owns its touches in the native app, and each step's question takes focus", async () => {
  env({ days: {} });
  const m = await mount();
  try {
    const start = m.button(/Start check-in/);
    start.focus();
    await m.click(/Start check-in/);
    const sheet = m.walk();
    assert.ok(sheet.closest('.bs-scroll, .bsck-scroll') === sheet, "the native touch router scrolls Home behind the sheet");
    assert.ok(sheet.hasAttribute('data-bs-layer'), 'a drag on the sheet can fall through to the page');
    assert.equal(document.activeElement.tagName, 'H1');
    assert.match(document.activeElement.textContent, /How's your energy\?/);
    Object.defineProperty(sheet, 'scrollTop', { value: 240, writable: true, configurable: true });
    await m.click(/^Good$/);
    assert.equal(sheet.scrollTop, 0, 'the next step opened scrolled to where the last one was');
    assert.match(document.activeElement.textContent, /How hungry are you\?/, 'focus fell to the page when the tapped tile went away');
    await React.act(async () => { m.walk().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await m.flush();
    assert.equal(m.walk(), null, 'Escape did not close the walkthrough');
    assert.ok(document.activeElement === m.button(/Continue/), 'focus did not come back to the card');
  } finally { m.unmount(); }
});

test('the preview never says it saves, and a failed save is not told "saved as you went"', async () => {
  env({ uid: null });
  let m = await mount();
  try {
    assert.doesNotMatch(m.text(), /Saved as you go/, 'the signed-out card promises a save');
    await m.click(/Start check-in/);
    await m.click(/^Good$/);
    await m.click(/^Normal$/);
    await m.click(/^Next/);
    await m.click(/^Finish/);
    assert.doesNotMatch(m.text(), /Saved as you went/, 'the preview summary says its answers were saved');
  } finally { m.unmount(); }

  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } }, log: () => Promise.reject(new Error('500')) });
  m = await mount();
  try {
    await m.click(/^Edit$/);
    assert.match(m.text(), /Saved as you went/);
    await m.click(/^Change$/, 0);
    await m.click(/^Great$/);         // back on the summary, and the save fails
    await m.flush();
    assert.match(m.text(), /You're checked in/);
    assert.match(m.text(), /Could not save check-in/);
    assert.doesNotMatch(m.text(), /Saved as you went/, 'the summary says saved beside the failure');
  } finally { m.unmount(); }
});

test("hours and litres are said in the member's language", async () => {
  assert.equal(CARD.bsCiHM(7.5, (h, mm) => `${h} ч ${mm}`), '7 ч 30');
  assert.equal(CARD.bsCiHM(7, (h, mm) => (mm == null ? `${h} ч` : 'x')), '7 ч');
  dom.window.ShapeI18n.intlLocale = () => 'de-DE';
  theme.isMetric = true;
  try {
    env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } }, water: { ok: true, hydrationL: 2.25, targetL: 3 } });
    const m = await mount();
    assert.match(m.text(), /2,25 L \/ 3 L/, 'a German member reads a decimal point');
    m.unmount();
  } finally { theme.isMetric = false; delete dom.window.ShapeI18n.intlLocale; }
  const t = dom.window.ShapeI18n.t;
  dom.window.ShapeI18n.t = (key, opts) => (key === 'home:checkin.hm' ? `${opts.h} ч ${opts.m}` : t(key, opts));
  try {
    env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7.5 } } });
    const m = await mount();
    assert.match(m.text(), /7 ч 30/, "the card's hours are not put through the member's catalog");
    m.unmount();
  } finally { dom.window.ShapeI18n.t = t; }
});

test('the stepper says its hours as they change', async () => {
  env({ days: { [TODAY]: { energy: 8, hunger: 6 } } });
  const m = await mount();
  try {
    await m.click(/^Continue/);
    const live = document.querySelector('[aria-live="polite"]');
    assert.ok(live && /7h 30/.test(live.textContent), 'the hours are not announced');
    await m.click(/Thirty minutes more/);
    assert.match(document.querySelector('[aria-live="polite"]').textContent, /8h/);
  } finally { m.unmount(); }
});

test('a failed save leaves alone an answer whose own save is still on its way', async () => {
  // The rollback reads what is stored when React renders. Here the newer answer has not landed
  // by then, so a rollback of the whole day, or of a field it does not own, would wipe it.
  let failEnergy;
  let landHunger;
  const energySave = new Promise((_, reject) => { failEnergy = reject; });
  const hungerSave = new Promise((r) => { landHunger = r; });
  const calls = env({ days: {}, log: (p) => (p.energy != null ? energySave : hungerSave) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Good$/);           // saving
    await m.click(/^Normal$/);         // queued, and on its way once energy fails
    failEnergy(new Error('500'));
    await m.flush();
    await m.flush();
    assert.match(m.text(), /✓ Hunger/, 'the failed energy save took back the hunger answer still on its way');
    assert.doesNotMatch(m.text(), /✓ Energy/);
    landHunger({ ok: true });
    await m.flush();
    assert.match(m.text(), /✓ Hunger/);
  } finally { m.unmount(); }
  assert.deepEqual(calls.log, [{ energy: 8 }, { hunger: 6 }]);
});

test('an older failed save leaves alone a newer answer to the same question still on its way', async () => {
  let failGood;
  let landLow;
  const good = new Promise((_, reject) => { failGood = reject; });
  const low = new Promise((r) => { landLow = r; });
  const calls = env({ days: {}, log: (p) => (p.energy === 8 ? good : low) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Good$/);           // saving
    await m.click(/Back/);
    await m.click(/^Low$/);            // queued, and on its way once Good fails
    failGood(new Error('500'));
    await m.flush();
    await m.flush();
    await m.click(/Back/);
    assert.deepEqual(m.pressed(), ['Low'], 'the older failure took back the newer answer still on its way');
    landLow({ ok: true });
    await m.flush();
  } finally { m.unmount(); }
  assert.deepEqual(calls.log, [{ energy: 8 }, { energy: 4 }]);
});

test("a glass after a failed water read brings back the member's own target (Codex P2 on #2398)", async () => {
  theme.isMetric = true;
  try {
    env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
    dom.window.ShapeHydration = {
      get: async () => { throw new Error('500'); },
      add: async (d) => ({ ok: true, hydrationL: 1 + d, targetL: 2 }),
    };
    const m = await mount();
    try {
      await m.click(/\+ Glass/);
      assert.match(m.text(), /1\.25 L \/ 2 L/, 'the card kept the 3 L fallback after the add brought the real target');
    } finally { m.unmount(); }
  } finally { theme.isMetric = false; }
});

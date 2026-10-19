// tests/checkin-card.test.mjs
//
// The Morning check-in: a card on Home and the walkthrough it opens (owner, 2026-10-19: "i like the
// walk through tutorial style, but again the purpose and where you can see the data over time, and
// what it means to the member"; rulings in docs/REVIEW-2026-10-19-morning-checkin.md §6). Two
// morning steps, last night then this morning, a summary that says what the answers mean, and an
// evening hunger question for members with a nutritionist. Every tap saves.
//
// The rules are pure functions and run here as they ship. The card is mounted on jsdom with the
// real English catalog behind the real ICU translator, so the copy and the plurals are what a
// member reads. The walkthrough portals into the page, so the mount reads the whole document.
// Water is its own Home line now (tests/water-line.test.mjs).
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

// `plan` is what the plan route answers (its coaching decides the evening question and Who sees
// this); left out, there is no plan read at all.
function env({ uid = 'member-1', days = {}, progress, log, plan } = {}) {
  const calls = { log: [] };
  dom.window.ShapeAuth = { getCachedState: () => ({ user: uid ? { id: uid } : null }) };
  dom.window.ShapeProgress = { progress: progress || (async () => ({ series: series(days) })) };
  dom.window.ShapeCheckin = { log: async (patch) => { calls.log.push(patch); return log ? log(patch) : { ok: true }; } };
  if (plan === undefined) delete dom.window.ShapePlan;
  else dom.window.ShapePlan = { get: async () => plan };
  return calls;
}
const NUTRITIONIST = { training: { coaching: null }, meals: { coaching: { name: 'Lee', coaches: [] } } };
const TRAINER = { training: { coaching: { name: 'Sam', coaches: [] } }, meals: { coaching: null } };
const BOTH = { training: { coaching: { name: 'Sam' } }, meals: { coaching: { name: 'Lee' } } };
const NONE = { training: { coaching: null }, meals: { coaching: null } };

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
// The summary's rows are whole buttons: "Sleep 7h · Rested  Change ›".
const row = (name) => new RegExp(`^${name}.*Change`);

// ── The rules ────────────────────────────────────────────────────────────────

test('five words are stored as 2·4·6·8·10, and an old 1-10 value reads back as its nearest word', () => {
  assert.deepEqual(CARD.BS_CI_STORED, [2, 4, 6, 8, 10]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(CARD.bsCiWordIndex), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  for (const v of [null, undefined, 0, -1, 'x', NaN]) assert.equal(CARD.bsCiWordIndex(v), null, `${v} read as a word`);
});

test("the stored values sit on the engine's side of its thresholds where the words do, and the card's lines are the engine's", () => {
  // energy_low flags an average at or under 4: Drained and Low, never OK.
  assert.deepEqual(CARD.BS_CI_STORED.map((v) => v <= THRESHOLDS.ENERGY_LOW_AVG), [true, true, false, false, false]);
  // hunger_high flags an average at or over 8: Hungry and Starving, never Normal.
  assert.deepEqual(CARD.BS_CI_STORED.map((v) => v >= THRESHOLDS.HUNGER_HIGH_AVG), [false, false, false, true, true]);
  // The week line says the engine's own lines: energy_low, and sleep_low at the default 7.5h target.
  assert.equal(CARD.BS_CI_ENERGY_LOW_AVG, THRESHOLDS.ENERGY_LOW_AVG);
  assert.equal(CARD.BS_CI_SHORT_NIGHT_H, 7.5 - THRESHOLDS.SLEEP_DEFICIT_H);
  assert.equal(THRESHOLDS.ENERGY_MIN_DAYS, 3);
  assert.equal(THRESHOLDS.SLEEP_MIN_NIGHTS, 3);
});

test('the morning asks the night first, then energy; a watch night or a skip needs no night, and hunger is never a morning question', () => {
  assert.equal(CARD.bsCiStep(null), 'sleep');
  assert.equal(CARD.bsCiStep({ sleep: 7 }), 'energy');
  assert.equal(CARD.bsCiStep({ sleep: 7, energy: 6 }), 'done');
  assert.equal(CARD.bsCiStep({ energy: 6 }), 'sleep', 'energy alone skipped the night');
  assert.equal(CARD.bsCiStep({ energy: 6 }, true), 'done', 'a night the member skipped was asked again');
  assert.equal(CARD.bsCiStep({}, true), 'energy');
  assert.equal(CARD.bsCiStep({ sleep: 7, energy: 6, hunger: null }), 'done', 'the morning waited for the evening question');
  const worn = CARD.bsCiDay(series({ [TODAY]: { sleep: 7.2, hrv: 55 } }), TODAY);
  assert.equal(worn.device, true);
  assert.equal(CARD.bsCiStep({ ...worn, energy: 6 }), 'done', 'a night the wearable reported was asked again');
  // A watch that reported a resting heart rate but no night: the night is still the member's to give.
  const pulse = CARD.bsCiDay(series({ [TODAY]: { restingHr: 58 } }), TODAY);
  assert.equal(pulse.device, true);
  assert.equal(CARD.bsCiWornNight(pulse), false);
  assert.equal(CARD.bsCiStep({ ...pulse, energy: 6 }), 'sleep', 'a heart rate alone stopped the sleep question');
  assert.deepEqual(CARD.BS_CI_STEPS, ['sleep', 'energy']);
  assert.equal(CARD.BS_CI_SUMMARY, 2);
});

test('a day counts as checked in from a morning answer only: never a wearable night, never the evening hunger', () => {
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [TODAY]: { sleep: 7.2, hrv: 55 } }), TODAY)), false);
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [TODAY]: { sleep: 7 } }), TODAY)), true);
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [TODAY]: { sleepQuality: 6 } }), TODAY)), true);
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [TODAY]: { energy: 6 } }), TODAY)), true);
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [TODAY]: { hunger: 6 } }), TODAY)), false, 'the evening hunger made a check-in');
  assert.equal(CARD.bsCiAnswered(CARD.bsCiDay(series({ [YDAY]: { energy: 6 } }), TODAY)), false, 'yesterday was read as today');
});

test('the streak runs back from today, or from yesterday while today is still open, and hunger alone breaks it', () => {
  const run = { '2026-10-15': { energy: 6 }, '2026-10-16': { sleepQuality: 4 }, [YDAY]: { sleep: 7 } };
  assert.equal(CARD.bsCiStreak(series(run), TODAY), 3, 'an open today broke the run');
  assert.equal(CARD.bsCiStreak(series({ ...run, [TODAY]: { energy: 8 } }), TODAY), 4);
  assert.equal(CARD.bsCiStreak(series({ ...run, '2026-10-16': { hunger: 4 } }), TODAY), 1, 'an evening hunger answer kept the morning run going');
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

test("Same as yesterday copies yesterday's own morning values, keeps today's, never types a wearable's night, and never copies hunger", () => {
  const y = { energy: 7, hunger: 5, sleep: 6.5, rested: 3, device: false };
  const empty = { energy: null, hunger: null, sleep: null, rested: null, device: false };
  assert.deepEqual(CARD.bsCiSamePatch(y, empty), { energy: 7, sleepHours: 6.5, sleepQuality: 3 }, 'a 7 was rounded to its word, or hunger was copied');
  assert.deepEqual(CARD.bsCiSamePatch(y, { ...empty, energy: 2 }), { sleepHours: 6.5, sleepQuality: 3 }, "today's answer was overwritten");
  assert.deepEqual(CARD.bsCiSamePatch({ ...y, device: true }, empty), { energy: 7, sleepQuality: 3 }, "a wearable's night was copied as typed, or the member's own Rested was dropped with it");
  assert.deepEqual(CARD.bsCiSamePatch(y, { ...empty, sleep: 7.4, device: true }), { energy: 7, sleepQuality: 3 }, "today's wearable night was overwritten, or yesterday's Rested was not copied onto it (Codex P2 on #2398)");
  assert.deepEqual(CARD.bsCiSamePatch(y, { ...empty, sleep: 7.4, rested: 8, device: true }), { energy: 7 }, "today's own Rested was overwritten");
  assert.deepEqual(CARD.bsCiSamePatch(y, { ...empty, device: true }), { energy: 7, sleepHours: 6.5, sleepQuality: 3 }, 'a heart rate today kept the night from being copied');
  assert.deepEqual(CARD.bsCiSamePatch({ ...y, hunger: null }, empty), { energy: 7, sleepHours: 6.5, sleepQuality: 3 }, 'a yesterday with no hunger was not offered');
  assert.equal(CARD.bsCiSamePatch({ ...y, energy: null }, empty), null, 'offered with no morning to copy');
  assert.equal(CARD.bsCiSamePatch(null, empty), null);
  assert.equal(CARD.bsCiSamePatch(y, { energy: 7, hunger: null, sleep: 6.5, rested: 3, device: false }), null, 'an answered morning was offered again for its hunger');
});

test('the strip under each step is the seven days before today, oldest first', () => {
  const week = CARD.bsCiWeek(series({ '2026-10-11': { energy: 6 }, [YDAY]: { energy: 8, hunger: 4 }, [TODAY]: { energy: 2 }, '2026-10-10': { energy: 10 } }), TODAY);
  assert.deepEqual(week.map((d) => d.iso), ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
  assert.equal(week[0].energy, 6);
  assert.equal(week[6].energy, 8, 'yesterday is not the last day of the strip');
  assert.equal(week[6].hunger, 4);
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

// ── What the answers mean (§3.4) ─────────────────────────────────────────────

test('a short night is under 6h, or an hour or more under the usual night', () => {
  assert.equal(CARD.bsCiShortNight(5.5, 5.5), true, 'under 6h was a full night because it is the usual');
  assert.equal(CARD.bsCiShortNight(6.5, 7.5), true);
  assert.equal(CARD.bsCiShortNight(6.6, 7.5), false);
  assert.equal(CARD.bsCiShortNight(7, 7.5), false);
  assert.equal(CARD.bsCiShortNight(6, null), false);
  assert.equal(CARD.bsCiShortNight(null, 7.5), null, 'no hours read as a full night');
});

test("today's read: short and low, low after a full night, low with no night, short but fine, ready", () => {
  assert.equal(CARD.bsCiTodayRead({ energy: 4, sleep: 5 }, 7.5), 'shortLow');
  assert.equal(CARD.bsCiTodayRead({ energy: 2, sleep: 8 }, 7.5), 'fullLow');
  assert.equal(CARD.bsCiTodayRead({ energy: 4, sleep: null }, 7.5), 'low');
  assert.equal(CARD.bsCiTodayRead({ energy: 6, sleep: 5 }, 7.5), 'shortOk', 'OK is not low');
  assert.equal(CARD.bsCiTodayRead({ energy: 10, sleep: 7.5 }, 7.5), 'ready');
  assert.equal(CARD.bsCiTodayRead({ energy: 8, sleep: null }, 7.5), 'ready');
  assert.equal(CARD.bsCiTodayRead({ energy: null, sleep: 5 }, 7.5), null, 'a read before energy is in');
  assert.equal(CARD.bsCiTodayRead(null, 7.5), null);
  // An old 1-10 value reads by its word: a 3 is Low.
  assert.equal(CARD.bsCiTodayRead({ energy: 3, sleep: 8 }, 7.5), 'fullLow');
});

test("the week line is the engine's lines in the member's words, then the word most mornings had, then how many more it needs", () => {
  const d = (energy, sleep) => ({ energy, sleep });
  assert.deepEqual(CARD.bsCiWeekLine([d(8, 5), d(8, 5.5)], d(8, 5)), { kind: 'sleepShort', hours: 5.166666666666667 });
  assert.equal(CARD.bsCiWeekLine([d(8, 5), d(8, 5.5)], d(8, null)).kind, 'mostly', 'two nights were a short week');
  assert.deepEqual(CARD.bsCiWeekLine([d(4, 7), d(2, 7)], d(4, 7)), { kind: 'energyLow', word: 1 });
  assert.deepEqual(CARD.bsCiWeekLine([d(4, 7), d(4, 7)], d(4, 7)), { kind: 'energyLow', word: 1 }, 'an average of exactly 4 (the engine flags at or under it) was not a low week');
  assert.equal(CARD.bsCiWeekLine([d(4, 7), d(6, 7)], d(6, 7)).kind, 'mostly', 'an average over 4 read as a low week');
  assert.deepEqual(CARD.bsCiWeekLine([d(8, 7), d(7, 7), d(4, 7)], d(8, null)), { kind: 'mostly', word: 3 });
  assert.equal(CARD.bsCiWeekLine([d(8, 7), d(4, 7), d(6, 7), d(10, 7)], d(2, null)), null, 'no majority was a trend');
  assert.deepEqual(CARD.bsCiWeekLine([], d(8, 7)), { kind: 'more', n: 2 });
  assert.deepEqual(CARD.bsCiWeekLine([d(null, 7)], d(null, 7)), { kind: 'more', n: 3 });
  // Sleep speaks first: a short week with low energy says the sleep.
  assert.equal(CARD.bsCiWeekLine([d(2, 5), d(2, 5)], d(2, 5)).kind, 'sleepShort');
});

test('coaching reads as three states per role, and who sees the morning follows it', () => {
  assert.deepEqual(CARD.bsCiCoachingOf(NUTRITIONIST), { trainer: false, nutritionist: true });
  assert.deepEqual(CARD.bsCiCoachingOf(BOTH), { trainer: true, nutritionist: true });
  assert.deepEqual(CARD.bsCiCoachingOf({ training: {}, meals: {} }), { trainer: null, nutritionist: null }, 'a failed subscriptions read was read as no coach');
  assert.deepEqual(CARD.bsCiCoachingOf(null), { trainer: null, nutritionist: null });
  assert.equal(CARD.bsCiWhoSees({ trainer: true, nutritionist: true }), 'both');
  assert.equal(CARD.bsCiWhoSees({ trainer: true, nutritionist: false }), 'trainer');
  assert.equal(CARD.bsCiWhoSees({ trainer: false, nutritionist: true }), 'nutritionist');
  assert.equal(CARD.bsCiWhoSees({ trainer: false, nutritionist: false }), 'you');
  assert.equal(CARD.bsCiWhoSees({ trainer: null, nutritionist: null }), null);
  // The plan object is shared by every reader of it: reading it changes nothing.
  const plan = JSON.parse(JSON.stringify(BOTH));
  CARD.bsCiCoachingOf(plan);
  assert.deepEqual(plan, BOTH);
});

// ── The card and its walkthrough ─────────────────────────────────────────────

test('the card is the door: Start walks last night then this morning, every tap saves, and the summary says what it means', async () => {
  const calls = env();
  const m = await mount();
  try {
    assert.match(m.text(), /Morning check-in/);
    assert.match(m.text(), /Two quick checks\./);
    assert.match(m.text(), /2 checks · 15 sec/);
    assert.equal(m.walk(), null, 'the walkthrough opened by itself');
    assert.equal(m.button(/Details/), undefined, 'the old Details door is still on the card');
    assert.equal(m.button(/Glass/), undefined, 'water is still on the card');
    await m.click(/Start check-in/);
    assert.match(m.text(), /Step 1 of 2 · Last night/);
    assert.match(m.text(), /How did you sleep\?/);
    assert.match(m.text(), /the biggest lever on recovery/, 'the step no longer says what it asks');
    assert.match(m.text(), /7h 30/);
    assert.match(m.text(), /Your usual night/);
    await m.click(/Thirty minutes less/);
    assert.match(m.text(), /30 min under your usual/, 'the stepper did not say how far the night is from the usual one');
    assert.match(m.text(), /How did you wake up\? · optional/);
    await m.click(/^Rested$/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log, [{ sleepHours: 7, sleepQuality: 8 }], 'the night was not saved on its own');
    assert.match(m.text(), /Step 2 of 2 · This morning/);
    assert.match(m.text(), /How's your energy this morning\?/);
    assert.match(m.text(), /After low mornings Home suggests lighter days/);
    await m.click(/^Good$/);
    assert.deepEqual(calls.log[1], { energy: 8 });
    assert.match(m.text(), /You're checked in ✓/);
    assert.match(m.text(), /Ready for today's plan\./, "the summary did not say what today's answers mean");
    assert.match(m.text(), /2 more mornings and your week shows here\./);
    await m.click(/^Done$/);
    assert.equal(m.walk(), null, 'Done left the walkthrough open');
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /Sleep 7h · Rested · Energy Good/);
    assert.match(m.text(), /Ready for today's plan\./, "Home's done line does not say what the morning means");
    assert.equal(calls.log.length, 2);
  } finally { m.unmount(); }
});

test('every step shows the last 7 days, and a tap on a day reuses its answer', async () => {
  const calls = env({ days: {
    '2026-10-12': { energy: 8, hunger: 6, sleep: 7.5 },
    '2026-10-13': { energy: 8, hunger: 6 },
    '2026-10-14': { energy: 4, hunger: 4, sleep: 5.83 },
    '2026-10-15': { energy: 7, hunger: 6 },
    '2026-10-16': { energy: 8 },
    [YDAY]: { energy: 7, hunger: 8, sleep: 6.5, sleepQuality: 8 },
  } });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    const strip = () => document.querySelector('[data-bs-checkin-week]');
    assert.equal(strip().getAttribute('data-bs-checkin-week'), 'sleep');
    // Sleep: a tap on a day fills the stepper and its Rested; Next saves them.
    await m.click(/17: 6h 30/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log, [{ sleepHours: 6.5, sleepQuality: 8 }]);
    assert.equal(strip().getAttribute('data-bs-checkin-week'), 'energy');
    const cells = [...strip().querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));
    assert.equal(cells.length, 7);
    assert.match(cells[0], /11: No answer$/, 'a day with no answer is not read out as one');
    assert.match(cells[6], /17: Good$/, 'yesterday is not the last day');
    assert.match(m.text(), /Mostly good this week\./);
    // A tap on yesterday reuses its own value: a 7 stays a 7.
    await m.click(/17: Good/);
    assert.deepEqual(calls.log[1], { energy: 7 });
    assert.match(m.text(), /You're checked in/);
    assert.match(m.text(), /Mostly good mornings this week\./);
  } finally { m.unmount(); }
});

test('Same as yesterday on the card logs the morning in one tap, never the hunger', async () => {
  const calls = env({ days: { [YDAY]: { energy: 7, hunger: 5, sleep: 6.5, sleepQuality: 9 }, '2026-10-16': { energy: 6 } } });
  const m = await mount();
  try {
    assert.match(m.text(), /Same as yesterday/);
    assert.match(m.text(), /Good · 6h 30 · Fresh/);
    await m.click(/Same as yesterday/);
    assert.deepEqual(calls.log, [{ energy: 7, sleepHours: 6.5, sleepQuality: 9 }]);
    assert.equal(m.walk(), null);
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /3 days running/);
  } finally { m.unmount(); }
});

test('a day already checked in counts once in the streak', async () => {
  env({ days: { '2026-10-16': { energy: 6 }, [YDAY]: { energy: 8 }, [TODAY]: { energy: 8, sleep: 7 } } });
  const m = await mount();
  try {
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /3 days running/, 'today was counted twice, or not at all');
  } finally { m.unmount(); }
});

test("a wearable's night is shown on step 1, never asked or typed over, and Same as yesterday leaves it alone", async () => {
  const calls = env({ days: { [TODAY]: { sleep: 7.2, hrv: 50 }, [YDAY]: { energy: 7, hunger: 5, sleep: 7, hrv: 48 } } });
  const m = await mount();
  try {
    assert.match(m.text(), /Start check-in/, "a watch's night alone counted as the member's own answer");
    assert.doesNotMatch(m.text(), /Good · 7h/, "yesterday's wearable night is offered as the member's own");
    // Start opens the night, the watch's included: its hours and How did you wake up? are there.
    await m.click(/Start check-in/);
    assert.match(m.text(), /Step 1 of 2 · Last night/);
    assert.match(m.text(), /From your watch/);
    assert.match(m.text(), /7h 12/);
    assert.equal(m.button(/^Skip$/), undefined, 'a wearable night can be skipped');
    await m.click(/^Next/);
    assert.deepEqual(calls.log, [], "Next wrote over the wearable's night");
    await m.click(/^Close$/);
    await m.click(/Same as yesterday/);
    assert.deepEqual(calls.log, [{ energy: 7 }]);
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /Sleep 7h 12/);
    // Rested is the member's own check, and a wearable's night still takes it, on its own.
    await m.click(/^Edit$/);
    await m.click(/^Rested$/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log[1], { sleepQuality: 8 }, "a wearable member's Rested was not saved, or the watch's hours were re-typed with it");
    await m.click(/^Finish/);
    assert.match(m.text(), /7h 12 · Rested/);
  } finally { m.unmount(); }
});

test('a member who does not track sleep can skip the night, for the rest of the day', async () => {
  dom.window.localStorage.clear();
  const calls = env({ days: { [TODAY]: { energy: 8 } } });
  let m = await mount();
  try {
    await m.click(/^Continue/);
    assert.match(m.text(), /Step 1 of 2 · Last night/, 'Continue did not open the first open question');
    await m.click(/^Skip$/);
    assert.deepEqual(calls.log, [], 'skipping wrote a night');
    assert.match(m.text(), /Step 2 of 2 · This morning/);
    await m.click(/^Finish/);
    assert.match(m.text(), /You're checked in ✓/);
    assert.match(m.text(), /Skipped/);
    await m.click(/^Done$/);
    assert.match(m.text(), /Checked in ✓/);
    assert.doesNotMatch(m.text(), /Sleep \d/, 'the done line names a night that was skipped');
  } finally { m.unmount(); }
  // Still skipped when Home comes back today…
  env({ days: { [TODAY]: { energy: 8 } } });
  m = await mount();
  try { assert.match(m.text(), /Checked in ✓/, 'the skip did not survive leaving Home'); } finally { m.unmount(); }
  // …but tomorrow asks again.
  try {
    mock.timers.setTime(new Date(2026, 9, 19, 12).getTime());
    env({ days: { '2026-10-19': { energy: 8 } } });
    m = await mount();
    assert.match(m.text(), /Two quick checks/, "yesterday's skip held today");
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
    await m.click(/^Next/);
    assert.match(m.text(), /Could not save check-in — try again/);
    await m.click(/Back/);
    assert.match(m.text(), /Step 1 of 2 · Last night/);
    assert.match(m.text(), /Your usual night/, 'a night that failed to save still shows as given');
    // The next tap still goes through: one failure must not wedge the save queue.
    fail = false;
    await m.click(/^Next/);
    assert.equal(calls.log.length, 2, 'the retry was never written');
    assert.match(m.text(), /Step 2 of 2 · This morning/);
    assert.doesNotMatch(m.text(), /Could not save/, 'the error outlived the answer that fixed it');
  } finally { m.unmount(); }
});

test('a failed save puts back only its own answer, not one given after it (Codex P2 on #2398)', async () => {
  // The night is still saving when energy is answered; then the night's save fails and the energy
  // save, queued behind it, succeeds. The screen must still hold the energy answer.
  let failNight;
  const night = new Promise((_, reject) => { failNight = reject; });
  let n = 0;
  const calls = env({ log: () => (++n === 1 ? night : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Next/);
    await m.click(/^Good$/);
    failNight(new Error('500'));
    await m.flush();
    await m.flush();
    assert.deepEqual(calls.log, [{ sleepHours: 7.5 }, { energy: 8 }]);
    assert.match(m.text(), /Could not save check-in/);
    await m.click(/Back/);
    assert.deepEqual(m.pressed(), ['Good'], 'the stored energy answer was put back with the failed night');
    await m.click(/Back/);
    assert.match(m.text(), /Your usual night/, 'the failed night still shows as given');
  } finally { m.unmount(); }
});

test('an older save that fails never undoes a newer answer to the same question', async () => {
  let failFirst;
  const first = new Promise((_, reject) => { failFirst = reject; });
  let n = 0;
  env({ days: { [TODAY]: { energy: 8, sleep: 7 } }, log: () => (++n === 1 ? first : { ok: true }) });
  const m = await mount({ openRequest: 1 });   // a done day opens at the summary
  try {
    await m.click(row('Energy'));
    await m.click(/^Great$/);      // its save hangs, then fails
    await m.click(row('Energy'));
    await m.click(/^Drained$/);
    failFirst(new Error('500'));
    await m.flush();
    await m.flush();
    assert.match(m.text(), /EnergyDrained/, "the failed Great put back the energy over the member's newer Drained");
    assert.doesNotMatch(m.text(), /EnergyGood/);
  } finally { m.unmount(); }
});

test("a queued answer is dropped when the account changes, never saved to the next member's day (Codex P1 on #2398)", async () => {
  let release;
  const first = new Promise((r) => { release = r; });
  const calls = env({ uid: 'member-a', log: (p) => (p.sleepHours != null ? first : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Next/);        // on its way, under member A
    await m.click(/^Good$/);       // queued behind it
    // Member A signs out and member B signs in before the first save answers.
    dom.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-b' } }) };
    release({ ok: true });
    await m.flush();
    await m.flush();
    assert.deepEqual(calls.log, [{ sleepHours: 7.5 }], "member A's queued answer was sent under member B's session");
  } finally { m.unmount(); }
});

test('an answer queued across midnight is dropped, never filed under the next day (Codex P2 on #2398)', async () => {
  try {
    mock.timers.setTime(new Date(2026, 9, 18, 23, 59).getTime());
    let release;
    const first = new Promise((r) => { release = r; });
    const calls = env({ log: (p) => (p.sleepHours != null ? first : { ok: true }) });
    const m = await mount();
    try {
      await m.click(/Start check-in/);
      await m.click(/^Next/);        // on its way at 23:59
      await m.click(/^Good$/);       // queued behind it
      mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
      release({ ok: true });
      await m.flush();
      await m.flush();
      assert.deepEqual(calls.log, [{ sleepHours: 7.5 }], 'a 23:59 answer was sent after midnight, and dated the next day');
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test("a new day closes the card until that day is read, and a failed read never shows the day before's (Codex P2 on #2398)", async () => {
  try {
    let reads = 0;
    let failSecond;
    const second = new Promise((_, reject) => { failSecond = reject; });
    env({ days: { [TODAY]: { energy: 8, sleep: 7 } } });
    const firstRead = { series: series({ [TODAY]: { energy: 8, sleep: 7 } }) };
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
      assert.match(m.text(), /Two quick checks/, "a failed read left the day before's answers standing as today's");
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
      await m.click(/^Next/);
      assert.match(m.text(), /Step 2 of 2 · This morning/);
      mock.timers.setTime(new Date(2026, 9, 19, 0, 1).getTime());
      // Before Home re-renders, a tap on the old day's sheet is not saved into the new day.
      await m.click(/^Good$/);
      assert.deepEqual(calls.log, [{ sleepHours: 7.5 }], 'a 00:01 tap on the 23:59 walkthrough was saved into the new day');
      assert.equal(m.walk(), null, "the day before's walkthrough is still open");
      // Home's next render mounts the new day's card, with no walkthrough carried over.
      await m.rerender();
      assert.equal(m.walk(), null);
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test("a save from the day before that fails after midnight changes nothing on the new day (Codex P2 on #2398)", async () => {
  try {
    let failEdit;
    const edit = new Promise((_, reject) => { failEdit = reject; });
    env({ days: { [TODAY]: { energy: 8, sleep: 7 } }, log: () => edit });
    const m = await mount();
    try {
      await m.click(/^Edit$/);
      await m.click(/^Next/);
      await m.click(/^Great$/);       // its save is in flight at the turn of the day
      mock.timers.setTime(new Date(2026, 9, 19, 9, 0).getTime());
      dom.window.ShapeProgress = { progress: async () => ({ series: series({}) }) };
      await m.rerender();
      // The new day's card reads once the save on its way has settled.
      failEdit(new Error('500'));
      await m.flush();
      await m.flush();
      assert.match(m.text(), /Two quick checks/);
      assert.doesNotMatch(m.text(), /✓ Energy/, "the failed save from the day before put its energy into the new day");
      assert.doesNotMatch(m.text(), /Could not save/, "the day before's failure shows on the new day");
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test('answers save one at a time, so two quick taps cannot both insert a row for today', async () => {
  let release;
  const first = new Promise((r) => { release = r; });
  const calls = env({ log: (p) => (p.sleepHours != null ? first : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Next/);
    await m.click(/^Good$/);
    assert.equal(calls.log.length, 1, 'the energy write started while the night write was still open');
    release({ ok: true });
    await m.flush();
    assert.deepEqual(calls.log, [{ sleepHours: 7.5 }, { energy: 8 }]);
  } finally { m.unmount(); }
});

test("nothing is asked until today's answers are read", async () => {
  let answer;
  env({ progress: () => new Promise((r) => { answer = r; }) });
  const m = await mount();
  try {
    assert.equal(m.text(), '', 'the card asked before it knew what today already has');
    answer({ series: series({ [TODAY]: { energy: 8, sleep: 7 } }) });
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
    env({ days: { [TODAY]: { energy: 8, sleep: 7 } } });
    m = await mount();
    assert.match(m.text(), /Checked in ✓/);
    m.unmount();
    mock.timers.setTime(at(4));
    env();
    m = await mount();
    assert.match(m.text(), /Two quick checks/);
    m.unmount();
  } finally { mock.timers.setTime(at(12)); }
});

test("Edit opens step 1 with the morning's answers, Back reaches every answer, and a Change returns to the summary", async () => {
  // Owner, 2026-10-19: "when i click edit, i cant go back and change any of my entries".
  const calls = env({ days: { [TODAY]: { energy: 8, sleep: 7, sleepQuality: 6 } } });
  const m = await mount();
  try {
    await m.click(/^Edit$/);
    assert.match(m.text(), /Step 1 of 2 · Last night/, 'Edit did not open the first answer');
    assert.match(document.querySelector('[aria-live="polite"]').textContent, /^7h$/, "the stepper did not start at today's own hours");
    assert.match(m.text(), /30 min under your usual/);
    assert.deepEqual(m.pressed(), ['OK'], "today's Rested was not shown");
    assert.equal(m.button(/Back/).style.visibility, 'hidden', 'step 1 offered a Back to nowhere');
    await m.click(/^Next/);
    assert.deepEqual(calls.log, [], 'walking through an unchanged night wrote it again');
    assert.match(m.text(), /Step 2 of 2 · This morning/);
    assert.deepEqual(m.pressed(), ['Good']);
    await m.click(/^Finish/);
    assert.match(m.text(), /You're checked in ✓/);
    // Back shows on the summary, and walks back through the answers.
    assert.equal(m.button(/Back/).style.visibility, 'visible', 'the summary hid Back');
    await m.click(/Back/);
    assert.match(m.text(), /Step 2 of 2 · This morning/);
    await m.click(/^Finish/);
    // Each answer on the summary is one whole button.
    await m.click(row('Energy'));
    assert.match(m.text(), /Step 2 of 2 · This morning/);
    await m.click(/^Great$/);
    assert.deepEqual(calls.log, [{ energy: 10 }]);
    assert.match(m.text(), /You're checked in ✓/, 'a Change walked on instead of back to the summary');
    await m.click(row('Sleep'));
    await m.click(/Thirty minutes more/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log[1], { sleepHours: 7.5, sleepQuality: 6 });
    assert.match(m.text(), /You're checked in ✓/);
    await m.click(/^Close$/);
    assert.equal(m.walk(), null);
  } finally { m.unmount(); }
});

test("a changed How did you wake up? on a night already typed is saved with it", async () => {
  const calls = env({ days: { [TODAY]: { energy: 8, sleep: 7, sleepQuality: 6 } } });
  const m = await mount();
  try {
    await m.click(/^Edit$/);
    await m.click(/^Fresh$/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log, [{ sleepHours: 7, sleepQuality: 10 }], 'a new Rested on an unchanged night was dropped');
  } finally { m.unmount(); }
});

test('signed out, the card previews the flow and saves nothing', async () => {
  const calls = env({ uid: null, plan: NUTRITIONIST });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Next/);
    assert.match(m.text(), /Mostly good this week\./, 'the preview has no sample week');
    await m.click(/^Good$/);
    assert.deepEqual(calls.log, []);
    assert.match(m.text(), /Join Shape to save your check-in/);
    assert.doesNotMatch(m.text(), /checked in/i, 'the preview claimed a check-in it never saved');
    assert.doesNotMatch(m.text(), /days running/);
    assert.doesNotMatch(m.text(), /see your 7-day averages|Only you see/, 'the preview said who sees answers it never saved');
    await m.click(/^Done$/);
    assert.match(m.text(), /Join Shape to save your check-in/);
  } finally { m.unmount(); }
});

// ── What it means, and who sees it ────────────────────────────────────────────

test("today's read: a short night and a low morning, said on the summary and on Home", async () => {
  const usual = { '2026-10-15': { sleep: 7.5 }, '2026-10-16': { sleep: 7.5 }, [YDAY]: { sleep: 7.5 } };
  env({ days: { ...usual, [TODAY]: { energy: 4, sleep: 5 } } });
  let m = await mount();
  try {
    assert.match(m.text(), /Short night, low morning\. Keep training easy and aim for bed earlier\./);
  } finally { m.unmount(); }
  // Low after a full night: with a coach, tell them; without, keep an eye on it.
  env({ days: { ...usual, [TODAY]: { energy: 2, sleep: 8 } }, plan: TRAINER });
  m = await mount();
  try { assert.match(m.text(), /Low after a full night\. If it keeps happening, tell your coach\./); } finally { m.unmount(); }
  env({ days: { ...usual, [TODAY]: { energy: 2, sleep: 8 } }, plan: NONE });
  m = await mount();
  try {
    assert.match(m.text(), /If it keeps happening, take it easy and keep an eye on it\./);
    assert.doesNotMatch(m.text(), /tell your coach/, 'a member with no coach was told to tell their coach');
  } finally { m.unmount(); }
  env({ days: { ...usual, [TODAY]: { energy: 6, sleep: 5 } } });
  m = await mount();
  try { assert.match(m.text(), /Short night, but you feel fine\. Go by how the warm-up feels\./); } finally { m.unmount(); }
});

test('the summary says the week in words: short on sleep, mostly low, mostly good', async () => {
  env({ days: { '2026-10-15': { energy: 8, sleep: 5 }, '2026-10-16': { energy: 8, sleep: 5.5 }, [YDAY]: { energy: 8, sleep: 5 }, [TODAY]: { energy: 8, sleep: 5 } } });
  let m = await mount({ openRequest: 1 });
  try { assert.match(m.text(), /Short on sleep this week: 5h 10 a night\./); } finally { m.unmount(); }
  env({ days: { '2026-10-15': { energy: 4, sleep: 7 }, '2026-10-16': { energy: 2, sleep: 7 }, [YDAY]: { energy: 4, sleep: 7 }, [TODAY]: { energy: 4, sleep: 7 } } });
  m = await mount({ openRequest: 1 });
  try { assert.match(m.text(), /Your energy has been mostly low this week\. A lighter session still counts\./); } finally { m.unmount(); }
  env({ days: { '2026-10-15': { energy: 8, sleep: 7 }, '2026-10-16': { energy: 8, sleep: 7 }, [TODAY]: { energy: 8, sleep: 7 } } });
  m = await mount({ openRequest: 1 });
  try { assert.match(m.text(), /Mostly good mornings this week\./); } finally { m.unmount(); }
});

test("who sees the morning: the member's coaches by role, or only them, and nothing while unknown", async () => {
  const done = { [TODAY]: { energy: 8, sleep: 7 } };
  const who = async (plan) => {
    env({ days: done, plan });
    const m = await mount({ openRequest: 1 });
    try { return document.querySelector('[data-bs-checkin-who]')?.textContent || null; } finally { m.unmount(); }
  };
  assert.equal(await who(BOTH), 'Your trainer and nutritionist see your 7-day averages.');
  assert.equal(await who(TRAINER), 'Your trainer sees your 7-day averages.');
  assert.equal(await who(NUTRITIONIST), 'Your nutritionist sees your 7-day averages.');
  assert.equal(await who(NONE), 'Only you see these.');
  assert.equal(await who({ training: {}, meals: {} }), null, 'a failed coaching read said who sees the answers');
  assert.equal(await who(undefined), null);
  assert.equal(await who(null), null, 'a failed plan read said only the member sees them');
});

test('the energy step says the trainer sees it, when there is one', async () => {
  env({ days: { [TODAY]: { sleep: 7 } }, plan: TRAINER });
  let m = await mount();
  try {
    await m.click(/^Continue/);
    assert.match(m.text(), /Your trainer sees this before your session/);
  } finally { m.unmount(); }
  env({ days: { [TODAY]: { sleep: 7 } }, plan: NUTRITIONIST });
  m = await mount();
  try {
    await m.click(/^Continue/);
    assert.doesNotMatch(m.text(), /Your trainer sees this/);
    assert.match(m.text(), /After low mornings Home suggests lighter days/);
  } finally { m.unmount(); }
});

// ── The evening question: hunger, with a nutritionist (owner, 2026-10-19) ─────

test('the evening hunger question asks only a member with a nutritionist, and only from 6 p.m.', async () => {
  const evening = async (plan, h = 19) => {
    mock.timers.setTime(at(h));
    try {
      env({ days: { [TODAY]: { energy: 8, sleep: 7 } }, plan });
      const m = await mount();
      try { return !!document.querySelector('[data-bs-checkin-evening]'); } finally { m.unmount(); }
    } finally { mock.timers.setTime(at(12)); }
  };
  assert.equal(await evening(NUTRITIONIST), true, 'a member with a nutritionist was not asked in the evening');
  assert.equal(await evening(NUTRITIONIST, 17), false, 'hunger was asked before the evening');
  assert.equal(await evening(TRAINER), false, 'a trainer-only member was asked about hunger');
  assert.equal(await evening(NONE), false);
  assert.equal(await evening({ training: {}, meals: {} }), false, 'a failed coaching read asked anyway');
  assert.equal(await evening(undefined), false);
});

test('the evening question saves today\'s hunger in one tap, then leaves Home', async () => {
  mock.timers.setTime(at(19));
  try {
    const calls = env({ days: { [TODAY]: { energy: 8, sleep: 7 }, [YDAY]: { hunger: 6 }, '2026-10-16': { hunger: 6 }, '2026-10-15': { hunger: 6 } }, plan: NUTRITIONIST });
    const m = await mount();
    try {
      assert.match(m.text(), /Tonight/);
      assert.match(m.text(), /How hungry did you get today\?/);
      await m.click(/^Answer/);
      assert.equal(m.walk().getAttribute('data-bs-checkin-walk'), 'evening');
      assert.match(m.text(), /Tonight · Hunger/);
      assert.match(m.text(), /How hungry did you get between meals today\?/);
      assert.match(m.text(), /Your nutritionist reads this beside what you ate/);
      assert.match(m.text(), /Mostly normal this week\./, 'the evening step has no week under it');
      await m.click(/^Hungry$/);
      assert.deepEqual(calls.log, [{ hunger: 8 }]);
      assert.equal(m.walk(), null, 'the evening question stayed open after its one answer');
      assert.equal(document.querySelector('[data-bs-checkin-evening]'), null, 'Home still asks a question already answered');
      assert.match(m.text(), /Energy Good · Hunger Hungry/);
      assert.match(m.text(), /Checked in ✓/);
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
});

test('in the evening the summary has a hunger row for a member with a nutritionist, and a Change comes back to it', async () => {
  mock.timers.setTime(at(20));
  try {
    const calls = env({ days: { [TODAY]: { energy: 8, sleep: 7, hunger: 6 } }, plan: NUTRITIONIST });
    const m = await mount({ openRequest: 1 });
    try {
      assert.match(m.text(), /HungerNormal/);
      await m.click(row('Hunger'));
      assert.match(m.text(), /Tonight · Hunger/);
      await m.click(/^Starving$/);
      assert.deepEqual(calls.log, [{ hunger: 10 }]);
      assert.match(m.text(), /You're checked in ✓/, 'a Change to hunger did not come back to the summary');
      assert.match(m.text(), /HungerStarving/);
    } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
  // A morning summary has no hunger row, and nor does a member without a nutritionist.
  env({ days: { [TODAY]: { energy: 8, sleep: 7 } }, plan: NUTRITIONIST });
  let m = await mount({ openRequest: 2 });
  try { assert.equal(m.button(row('Hunger')), undefined, 'hunger was offered in the morning'); } finally { m.unmount(); }
  mock.timers.setTime(at(20));
  try {
    env({ days: { [TODAY]: { energy: 8, sleep: 7 } }, plan: TRAINER });
    m = await mount({ openRequest: 3 });
    try { assert.equal(m.button(row('Hunger')), undefined, 'a trainer-only member was offered hunger'); } finally { m.unmount(); }
  } finally { mock.timers.setTime(at(12)); }
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
  dom.window.ShapeProgress = { progress: async () => ({ series: s({ [TODAY]: { energy: 8, sleep: 7, restingHr: 58 }, [YDAY]: { energy: 6, sleep: 6.5, restingHr: 57 } }, []) }) };
  const m = await mount();
  try {
    await m.click(/^Edit$/);
    assert.doesNotMatch(m.text(), /From your watch/, "the member's typed hours read as the watch's, so they cannot correct them");
    assert.ok(m.button(/^Skip$/), 'a typed night lost its stepper');
    assert.match(document.querySelector('[aria-live="polite"]').textContent, /^7h$/, "the stepper did not start at today's own hours");
  } finally { m.unmount(); }
  assert.deepEqual(calls.log, []);
});

test("typed hours on a day with a watch's heart rate stay the member's own after they are saved", async () => {
  // An older server: no sleepFromDevice, so the heart rate still marks the day. The save answers
  // as the route does for hours it kept.
  const calls = env({ days: { [TODAY]: { energy: 8, restingHr: 58 } }, log: (patch) => ({ ok: true, sleepHours: patch.sleepHours ?? null, sleepFromDevice: false }) });
  const m = await mount();
  try {
    await m.click(/^Continue/);
    assert.match(m.text(), /Step 1 of 2 · Last night/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log, [{ sleepHours: 7.5 }]);
    await m.click(/^Finish/);
    await m.click(row('Sleep'));
    assert.doesNotMatch(m.text(), /From your watch/, 'the hours just typed now read as the watch\'s');
    assert.ok(m.button(/^Skip$/));
  } finally { m.unmount(); }
});

// ── A watch's night comes first (owner, 2026-10-18) ───────────────────────────
// `connected` is the providers the status read reports; `syncs` records each sync asked for.
function devices({ connected = [], healthKit = false, fail = [], onSync } = {}) {
  const syncs = [];
  let statusReads = 0;
  const run = (id, arg) => async () => {
    syncs.push(arg === undefined ? id : [id, arg]);
    if (fail.includes(id)) throw new Error(`${id} sync failed`);
    if (onSync) onSync(id);
    return { ok: true };
  };
  dom.window.ShapeIntegrations = {
    getStatus: async () => { statusReads += 1; return { providers: ['whoop', 'oura', 'garmin', 'apple_health'].map((id) => ({ id, connected: connected.includes(id) })) }; },
    syncWhoop: (o) => run('whoop', o)(),
    syncOura: (o) => run('oura', o)(),
    syncAppleHealth: (o) => run('apple_health', o)(),
    appleHealthAvailable: () => healthKit,
  };
  return { syncs, reads: () => statusReads };
}

test('opening the card asks each connected watch for its night, at most every 30 minutes', async () => {
  try {
    let d = devices({ connected: ['whoop', 'apple_health'] });
    assert.equal(await CARD.bsCiSyncDevices('sync-a', at(12)), true);
    assert.deepEqual(d.syncs, ['whoop'], "Apple Health was read outside the iPhone app, or a provider that is not connected was synced");
    assert.equal(await CARD.bsCiSyncDevices('sync-a', at(12, 29)), false);
    assert.equal(d.reads(), 1, 'a second open within 30 minutes asked again');
    assert.equal(await CARD.bsCiSyncDevices('sync-a', at(12, 30)), true, 'the watches were never asked again');
    assert.equal(await CARD.bsCiSyncDevices('sync-b', at(12, 31)), true, "one account's sync held back another's");

    d = devices({ connected: ['oura', 'garmin', 'apple_health'], healthKit: true });
    assert.equal(await CARD.bsCiSyncDevices('sync-c', at(12)), true);
    assert.deepEqual(d.syncs, ['oura', ['apple_health', { importWorkouts: false, prompt: false, days: 2 }]],
      'Garmin sends its own nights; the check-in imports no workouts, never asks for Health permission, and reads today and yesterday');

    d = devices({ connected: ['garmin'] });
    assert.equal(await CARD.bsCiSyncDevices('sync-d', at(12)), false, 'nothing to ask still read as a sync');
    d = devices({ connected: ['whoop', 'oura'], fail: ['whoop', 'oura'] });
    assert.equal(await CARD.bsCiSyncDevices('sync-e', at(12)), false, 'syncs that all failed read as one that answered');
    d = devices({ connected: ['whoop'] });
    assert.equal(await CARD.bsCiSyncDevices('sync-e', at(12, 1)), true, 'syncs that all failed held the watches back for 30 minutes (Codex on #2404)');
    d = devices({ connected: ['whoop', 'oura'], fail: ['whoop'] });
    assert.equal(await CARD.bsCiSyncDevices('sync-f', at(12)), true);
    assert.equal(await CARD.bsCiSyncDevices(null, at(12)), false);

    // The time is kept on the device, so an app reopened within 30 minutes does not ask again…
    assert.equal(dom.window.localStorage.getItem('shape.checkin.deviceSync.sync-f'), String(at(12)), 'the sync time was not kept for the next open');
    dom.window.localStorage.setItem('shape.checkin.deviceSync.sync-g', String(at(12)));
    d = devices({ connected: ['whoop'] });
    assert.equal(await CARD.bsCiSyncDevices('sync-g', at(12, 10)), false, 'a sync from before the app reopened was forgotten');
    assert.equal(d.reads(), 0);
    // …and with no storage at all (a private window), the module's own time still holds.
    const real = Object.getOwnPropertyDescriptor(dom.window, 'localStorage');
    Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
    try {
      assert.equal(await CARD.bsCiSyncDevices('sync-h', at(12)), true);
      assert.equal(await CARD.bsCiSyncDevices('sync-h', at(12, 5)), false, 'without storage every open asked the watches again');
    } finally { Object.defineProperty(dom.window, 'localStorage', real); }

    // A status read that fails does not use up the 30 minutes.
    d = devices({ connected: ['whoop'] });
    const status = dom.window.ShapeIntegrations.getStatus;
    dom.window.ShapeIntegrations.getStatus = async () => { throw new Error('offline'); };
    await assert.rejects(CARD.bsCiSyncDevices('sync-i', at(12)));
    dom.window.ShapeIntegrations.getStatus = status;
    assert.equal(await CARD.bsCiSyncDevices('sync-i', at(12, 1)), true, 'a failed status read held the watches back for 30 minutes');
  } finally { delete dom.window.ShapeIntegrations; }
});

test("a card that closes while the watches answer still clears the cache, claims the night's points, and tells the water line", async () => {
  let cleared = 0;
  let claimed = 0;
  let told = 0;
  let release;
  const held = new Promise((r) => { release = r; });
  const onSync = () => { told += 1; };
  dom.window.addEventListener(CARD.BS_CI_HYDRATION_SYNCED, onSync);
  env({ uid: 'sync-card-7', days: { [TODAY]: { energy: 8 } } });
  dom.window.ShapeMetrics = { invalidate: () => { cleared += 1; } };
  dom.window.ShapeSleepPoints = { check: async () => { claimed += 1; return []; } };
  dom.window.ShapeIntegrations = {
    getStatus: async () => ({ providers: [{ id: 'oura', connected: true }] }),
    syncOura: async () => { await held; return { ok: true }; },
    appleHealthAvailable: () => false,
  };
  const m = await mount();
  try {
    m.unmount();
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    assert.equal(cleared, 1, 'the next card read the night from the cache from before the sync');
    assert.equal(claimed, 1, "the night's points waited for the next app open");
    assert.equal(told, 1, 'the water line was not told a sync may have moved the water');
  } finally {
    dom.window.removeEventListener(CARD.BS_CI_HYDRATION_SYNCED, onSync);
    delete dom.window.ShapeIntegrations; delete dom.window.ShapeMetrics; delete dom.window.ShapeSleepPoints;
  }
});

test("a watch's night that syncs when the card opens is shown, not asked", async () => {
  const days = { [TODAY]: { energy: 8 } };
  let cleared = 0;
  let claimed = 0;
  env({ uid: 'sync-card-1', days });
  dom.window.ShapeMetrics = { invalidate: () => { cleared += 1; } };
  dom.window.ShapeSleepPoints = { check: async () => { claimed += 1; return []; } };
  const d = devices({ connected: ['oura'], onSync: () => { days[TODAY].sleep = 6.5; } });
  dom.window.ShapeProgress = { progress: async () => ({ series: { ...series(days), sleepFromDevice: days[TODAY].sleep ? [{ date: TODAY, value: 1 }] : [] } }) };
  const m = await mount();
  try {
    assert.deepEqual(d.syncs, ['oura']);
    assert.ok(cleared >= 1, 'the read after the sync answered from the cache from before it');
    assert.equal(claimed, 1, "the good night's points waited for the next app open");
    assert.match(m.text(), /Checked in/, 'the night the watch sent was still asked');
    assert.match(m.text(), /Sleep 6h 30/);
    await m.click(/^Edit$/);
    assert.match(m.text(), /From your watch/);
    assert.equal(m.button(/^Skip$/), undefined, "the watch's night could be typed over");
  } finally { m.unmount(); delete dom.window.ShapeIntegrations; delete dom.window.ShapeMetrics; delete dom.window.ShapeSleepPoints; }
});

test("a sync that brings no watch night leaves the member's typed night their own", async () => {
  env({ uid: 'sync-card-4', days: { [TODAY]: { energy: 8, sleep: 7 } } });
  dom.window.ShapeProgress = { progress: async () => ({ series: { ...series({ [TODAY]: { energy: 8, sleep: 7 } }), sleepFromDevice: [] } }) };
  const d = devices({ connected: ['whoop'] });
  const m = await mount();
  try {
    assert.deepEqual(d.syncs, ['whoop']);
    await m.click(/^Edit$/);
    assert.doesNotMatch(m.text(), /From your watch/, 'a sync with no night marked the typed one as the watch\'s');
    assert.ok(m.button(/^Skip$/));
  } finally { m.unmount(); delete dom.window.ShapeIntegrations; }
});

test("a watch's night that syncs while typed hours are held is kept when they fail", async () => {
  // The typed save is held past the read's 3-second wait, so the watch's night comes in first;
  // the typed save then fails, and what is put back is the watch's night, not the empty read.
  const days = { [TODAY]: { energy: 8 } };
  let fail;
  env({ uid: 'sync-card-5', days, log: () => new Promise((_, reject) => { fail = reject; }) });
  let release;
  const held = new Promise((r) => { release = r; });
  dom.window.ShapeIntegrations = {
    getStatus: async () => ({ providers: [{ id: 'oura', connected: true }] }),
    syncOura: async () => { await held; days[TODAY].sleep = 6.5; return { ok: true }; },
    appleHealthAvailable: () => false,
  };
  dom.window.ShapeProgress = { progress: async () => ({ series: { ...series(days), sleepFromDevice: days[TODAY].sleep ? [{ date: TODAY, value: 1 }] : [] } }) };
  const m = await mount();
  try {
    await m.click(/^Continue/);
    await m.click(/^Next/);
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 3100)); });
    await m.flush();
    await React.act(async () => { fail(new Error('network')); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    await m.click(/^Finish/);
    assert.match(m.text(), /6h 30/, "the failed typed save put back the empty night over the watch's");
  } finally { m.unmount(); delete dom.window.ShapeIntegrations; }
});

test("hours typed again before the server's answer are put back to the watch's when they fail", async () => {
  // Two typed saves queued; the first answers that a watch's night stands, the second fails.
  const pending = [];
  const calls = env({ uid: 'sync-card-6', days: { [TODAY]: { energy: 8 } }, log: () => new Promise((resolve, reject) => { pending.push({ resolve, reject }); }) });
  const m = await mount();
  try {
    await m.click(/^Continue/);
    await m.click(/^Next/);                  // 7h 30, held
    await m.click(/Back/);
    await m.click(/Thirty minutes more/);
    await m.click(/^Next/);                  // 8h, queued behind it
    assert.equal(calls.log.length, 1);
    await React.act(async () => { pending[0].resolve({ ok: true, sleepHours: 6.9, sleepFromDevice: true }); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    await React.act(async () => { pending[1].reject(new Error('network')); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    await m.click(/^Finish/);
    assert.match(m.text(), /6h 54/, "the failed second save put back the first typed hours, not the watch's");
  } finally { m.unmount(); }
});

test("a day that already has a watch's night asks again, and the finished night replaces the part synced before waking", async () => {
  // A night synced while the member was still asleep is part of one (Codex on #2404).
  const days = { [TODAY]: { energy: 8, sleep: 3.5 } };
  env({ uid: 'sync-card-2' });
  dom.window.ShapeProgress = { progress: async () => ({ series: { ...series(days), sleepFromDevice: [{ date: TODAY, value: 1 }] } }) };
  const d = devices({ connected: ['whoop'], onSync: () => { days[TODAY].sleep = 7.5; } });
  const m = await mount();
  try {
    assert.equal(d.reads(), 1, "a day with part of a watch's night never asked for the rest");
    assert.match(m.text(), /Sleep 7h 30/, 'the finished night did not replace the part synced before waking');
  } finally { m.unmount(); delete dom.window.ShapeIntegrations; }
});

test("typed hours the server keeps a watch's night over show the watch's hours", async () => {
  const calls = env({ uid: 'sync-card-3', days: { [TODAY]: { energy: 8 } }, log: (patch) => (patch.sleepHours != null ? { ok: true, sleepHours: 6.9, sleepFromDevice: true } : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/^Continue/);
    await m.click(/^Next/);
    assert.deepEqual(calls.log, [{ sleepHours: 7.5 }]);
    await m.click(/^Finish/);
    assert.match(m.text(), /6h 54/, "the summary kept the typed hours the server did not keep");
    await m.click(row('Sleep'));
    assert.match(m.text(), /From your watch/);
  } finally { m.unmount(); }
});

test('a card mounted while a save is on its way reads after it, so Same as yesterday never writes over it', async () => {
  let stored = {};
  let land;
  const gate = new Promise((r) => { land = r; });
  const calls = env({ days: {}, log: (p) => gate.then(() => { stored = { ...stored, ...p }; return { ok: true }; }) });
  // The progress read answers from its cache until the save lands and clears it.
  let cache = null;
  dom.window.ShapeProgress = { progress: async () => (cache ||= { series: series({ [YDAY]: { energy: 6, sleep: 6 }, ...(stored.energy != null ? { [TODAY]: { energy: stored.energy } } : {}) }) }) };
  let m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Skip$/);
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
    assert.doesNotMatch(m.text(), /Same as yesterday/, 'Same as yesterday was offered over an answer that landed');
    // The night was skipped on the first card, so the energy that landed finishes the morning.
    assert.match(m.text(), /Checked in ✓/, 'the new card did not read the answer that landed');
    assert.match(m.text(), /Energy Low/);
  } finally { m.unmount(); land(); dom.window.localStorage.clear(); }
  assert.deepEqual(calls.log, [{ energy: 4 }]);
});

test('a save the network holds keeps the next card waiting 3 seconds at most', async () => {
  let land;
  const gate = new Promise((r) => { land = r; });
  env({ days: {}, log: () => gate });
  let m = await mount();
  await m.click(/Start check-in/);
  await m.click(/^Next/);
  m.unmount();
  m = await mount();
  try {
    assert.doesNotMatch(m.text(), /Two quick checks/);
    await React.act(async () => { await new Promise((r) => setTimeout(r, 3100)); });
    await m.flush();
    assert.match(m.text(), /Two quick checks/, 'a held save kept the card off Home');
  } finally { m.unmount(); land({ ok: true }); }
});

test('two failed answers to one question put back what is stored, not the first unsaved answer', async () => {
  let failFirst;
  const first = new Promise((_, reject) => { failFirst = reject; });
  const calls = env({ days: { [TODAY]: { sleep: 7 } }, log: (p) => (p.energy === 8 ? first : Promise.reject(new Error('500'))) });
  const m = await mount();
  try {
    await m.click(/^Continue/);
    assert.match(m.text(), /Step 2 of 2 · This morning/);
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
  const calls = env({ days: { [TODAY]: { sleep: 7 } }, log: (p) => (p.energy === 4 ? Promise.reject(new Error('500')) : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/^Continue/);
    await m.click(/^Good$/);
    await m.click(/Back/);
    await m.click(/^Low$/);
    await m.flush();
    await m.click(/Back/);
    assert.deepEqual(m.pressed(), ['Good'], 'the answer that saved was taken back with the one that failed');
  } finally { m.unmount(); }
  assert.deepEqual(calls.log, [{ energy: 8 }, { energy: 4 }]);
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
    assert.match(document.activeElement.textContent, /How did you sleep\?/);
    Object.defineProperty(sheet, 'scrollTop', { value: 240, writable: true, configurable: true });
    await m.click(/^Next/);
    assert.equal(sheet.scrollTop, 0, 'the next step opened scrolled to where the last one was');
    assert.match(document.activeElement.textContent, /How's your energy this morning\?/, 'focus fell to the page when the step changed');
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
    await m.click(/^Next/);
    await m.click(/^Good$/);
    assert.doesNotMatch(m.text(), /Saved as you went/, 'the preview summary says its answers were saved');
  } finally { m.unmount(); }

  env({ days: { [TODAY]: { energy: 8, sleep: 7 } }, log: () => Promise.reject(new Error('500')) });
  m = await mount({ openRequest: 1 });
  try {
    assert.match(m.text(), /Saved as you went/);
    await m.click(row('Energy'));
    await m.click(/^Great$/);         // back on the summary, and the save fails
    await m.flush();
    assert.match(m.text(), /You're checked in/);
    assert.match(m.text(), /Could not save check-in/);
    assert.doesNotMatch(m.text(), /Saved as you went/, 'the summary says saved beside the failure');
  } finally { m.unmount(); }
});

test("hours are said in the member's language", async () => {
  assert.equal(CARD.bsCiHM(7.5, (h, mm) => `${h} ч ${mm}`), '7 ч 30');
  assert.equal(CARD.bsCiHM(7, (h, mm) => (mm == null ? `${h} ч` : 'x')), '7 ч');
  const t = dom.window.ShapeI18n.t;
  dom.window.ShapeI18n.t = (key, opts) => (key === 'home:checkin.hm' ? `${opts.h} ч ${opts.m}` : t(key, opts));
  try {
    env({ days: { [TODAY]: { energy: 8, sleep: 7.5 } } });
    const m = await mount();
    assert.match(m.text(), /7 ч 30/, "the card's hours are not put through the member's catalog");
    m.unmount();
  } finally { dom.window.ShapeI18n.t = t; }
});

test('the stepper says its hours, and how far they are from the usual night, as they change', async () => {
  env({ days: { [TODAY]: { energy: 8 } } });
  const m = await mount();
  try {
    await m.click(/^Continue/);
    const live = document.querySelector('[aria-live="polite"]');
    assert.ok(live && /7h 30/.test(live.textContent), 'the hours are not announced');
    await m.click(/Thirty minutes more/);
    assert.match(document.querySelector('[aria-live="polite"]').textContent, /8h/);
    assert.match(m.text(), /30 min over your usual/);
    await m.click(/Thirty minutes more/);
    assert.match(m.text(), /1h over your usual/, 'an hour or more was said in minutes');
  } finally { m.unmount(); }
});

test('a failed save leaves alone an answer whose own save is still on its way', async () => {
  // The rollback reads what is stored when React renders. Here the newer answer has not landed
  // by then, so a rollback of the whole day, or of a field it does not own, would wipe it.
  let failNight;
  let landEnergy;
  const nightSave = new Promise((_, reject) => { failNight = reject; });
  const energySave = new Promise((r) => { landEnergy = r; });
  const calls = env({ days: {}, log: (p) => (p.sleepHours != null ? nightSave : energySave) });
  const m = await mount();
  try {
    await m.click(/Start check-in/);
    await m.click(/^Next/);            // the night, saving
    await m.click(/^Good$/);           // queued, and on its way once the night fails
    failNight(new Error('500'));
    await m.flush();
    await m.flush();
    assert.match(m.text(), /✓ Energy/, 'the failed night took back the energy answer still on its way');
    assert.doesNotMatch(m.text(), /✓ Sleep/);
    landEnergy({ ok: true });
    await m.flush();
    assert.match(m.text(), /✓ Energy/);
  } finally { m.unmount(); }
  assert.deepEqual(calls.log, [{ sleepHours: 7.5 }, { energy: 8 }]);
});

test('an older failed save leaves alone a newer answer to the same question still on its way', async () => {
  let failGood;
  let landLow;
  const good = new Promise((_, reject) => { failGood = reject; });
  const low = new Promise((r) => { landLow = r; });
  const calls = env({ days: { [TODAY]: { sleep: 7 } }, log: (p) => (p.energy === 8 ? good : low) });
  const m = await mount();
  try {
    await m.click(/^Continue/);
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

// ── A Daily check-in reminder opens the walkthrough (owner, 2026-10-18) ──────
test('a reminder opens the walkthrough at the first morning question not yet answered, and says the request is used', async () => {
  env({ uid: 'remind-1', days: { [TODAY]: { sleep: 7 } } });
  let used = 0;
  const props = { openRequest: 1, onOpenRequestConsumed: () => { used += 1; } };
  let m = await mount(props);
  try {
    assert.ok(m.walk(), 'the reminder opened nothing');
    assert.match(m.text(), /Step 2 of 2 · This morning/, 'the walkthrough did not open at the first open question');
    assert.equal(used, 1, 'Home was not told the request is used, so a card mounted again opens it again');
    await m.click(/^Close$/);
    await m.rerender();
    assert.equal(m.walk(), null, 'the walkthrough opened again on its own');
    assert.equal(used, 1);
    // A second reminder tapped later is a new request, and opens it again.
    props.openRequest = 2;
    await m.rerender();
    assert.ok(m.walk(), 'a second reminder opened nothing');
    assert.equal(used, 2);
  } finally { m.unmount(); }

  env({ uid: 'remind-2', days: { [TODAY]: { energy: 8, sleep: 7 } } });
  m = await mount({ openRequest: 2 });
  try {
    assert.match(m.text(), /You're checked in/, 'a day already done did not open at the summary');
  } finally { m.unmount(); }
});

test('a reminder before 4 a.m. still opens the walkthrough, and waits for the day to be read', async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  env({ uid: 'remind-3' });
  dom.window.ShapeProgress = { progress: async () => { await held; return { series: series({ [TODAY]: { energy: 8 } }) }; } };
  mock.timers.setTime(at(2));
  let m;
  try {
    m = await mount({ openRequest: 3 });
    assert.equal(m.walk(), null, 'the walkthrough opened before today was read');
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await m.flush();
    assert.match(m.text(), /Step 1 of 2 · Last night/, 'the reminder did not open the walkthrough at night, at the first open question');
  } finally { if (m) m.unmount(); mock.timers.setTime(at(12)); }
});

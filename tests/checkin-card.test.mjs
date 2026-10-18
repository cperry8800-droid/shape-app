// tests/checkin-card.test.mjs
//
// The daily check-in as one card on Home (owner, 2026-10-18: "make it easier to update each
// day and less effort for user each day"; design A of the preview, rulings in
// docs/REVIEW-2026-10-18-daily-checkin.md §5). One question at a time, and every tap saves.
//
// The rules are pure functions and run here as they ship. The card is mounted on jsdom with the
// real English catalog behind the real ICU translator, so the copy and the streak's plural are
// what a member reads.
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
const CARD = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry: new Map([['react', React]]) });
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
  const button = (re) => [...host.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()) || re.test(b.getAttribute('aria-label') || ''));
  return {
    host,
    flush,
    button,
    text: () => host.textContent,
    pressed: () => [...host.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent.trim()),
    async click(re) {
      const b = button(re);
      assert.ok(b, `no button matching ${re} in: ${host.textContent}`);
      await React.act(async () => { b.click(); });
      await flush();
    },
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

// ── The card ─────────────────────────────────────────────────────────────────

test('every tap saves, one question at a time, and the card ends on one line', async () => {
  const calls = env();
  const m = await mount();
  try {
    assert.match(m.text(), /How's your energy\?/);
    assert.match(m.text(), /1 of 3/);
    await m.click(/^Good$/);
    assert.deepEqual(calls.log, [{ energy: 8 }], 'the energy tap was not saved on its own');
    assert.match(m.text(), /How hungry are you\?/);
    assert.match(m.text(), /2 of 3/);
    await m.click(/^Normal$/);
    assert.deepEqual(calls.log[1], { hunger: 6 });
    assert.match(m.text(), /How did you sleep\?/);
    assert.match(m.text(), /7h 30/);
    assert.match(m.text(), /Your usual night/);
    await m.click(/Thirty minutes less/);
    assert.match(m.text(), /7h(?! 30)/);
    assert.doesNotMatch(m.text(), /Your usual night/, 'a night the member changed still claims to be their usual one');
    await m.click(/^Rested$/);
    await m.click(/That's right/);
    assert.deepEqual(calls.log[2], { sleepHours: 7, sleepQuality: 8 });
    assert.equal(calls.log.length, 3);
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /Energy Good · Hunger Normal · Sleep 7h · Rested/);
  } finally { m.unmount(); }
});

test('Same as yesterday logs the whole day in one tap', async () => {
  const calls = env({ days: { [YDAY]: { energy: 7, hunger: 5, sleep: 6.5, sleepQuality: 9 }, '2026-10-16': { energy: 6 } } });
  const m = await mount();
  try {
    assert.match(m.text(), /Same as yesterday/);
    assert.match(m.text(), /Good · Normal · 6h 30/);
    await m.click(/Same as yesterday/);
    assert.deepEqual(calls.log, [{ energy: 7, hunger: 5, sleepHours: 6.5, sleepQuality: 9 }]);
    assert.match(m.text(), /Checked in ✓/);
    assert.match(m.text(), /3 days running/);
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
  } finally { m.unmount(); }
});

test('a member who does not track sleep can skip the night, for the rest of the day', async () => {
  dom.window.localStorage.clear();
  const calls = env({ days: { [TODAY]: { energy: 8, hunger: 6 } } });
  let m = await mount();
  try {
    assert.match(m.text(), /How did you sleep\?/);
    await m.click(/^Skip$/);
    assert.deepEqual(calls.log, [], 'skipping wrote a night');
    assert.match(m.text(), /Checked in ✓/);
    assert.doesNotMatch(m.text(), /Sleep/, 'the done line names a night that was skipped');
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
    assert.match(m.text(), /How did you sleep\?/, "yesterday's skip held today");
    m.unmount();
  } finally { mock.timers.setTime(at(12)); dom.window.localStorage.clear(); }
});

test('a failed save puts the answer back and says so in the card', async () => {
  // Toasts are a no-op app-wide (BSToastHost), so the card is the only place to say it.
  let fail = true;
  const calls = env({ log: async () => { if (fail) throw new Error('500'); return { ok: true }; } });
  const m = await mount();
  try {
    await m.click(/^Good$/);
    assert.match(m.text(), /How's your energy\?/, 'a failed save moved on to the next question');
    assert.deepEqual(m.pressed(), [], 'a failed answer still shows as given');
    assert.match(m.text(), /Could not save check-in — try again/);
    // The next tap still goes through: one failure must not wedge the save queue.
    fail = false;
    await m.click(/^Good$/);
    assert.equal(calls.log.length, 2, 'the retry was never written');
    assert.match(m.text(), /How hungry are you\?/);
    assert.doesNotMatch(m.text(), /Could not save/, 'the error outlived the answer that fixed it');
  } finally { m.unmount(); }
});

test('a failed save puts back only its own answer, not one given after it (Codex P2 on #2398)', async () => {
  // Energy is still saving when hunger is answered; then the energy save fails and the hunger
  // save, queued behind it, succeeds. The card must still hold the hunger answer.
  let failEnergy;
  const energy = new Promise((_, reject) => { failEnergy = reject; });
  let n = 0;
  const calls = env({ log: () => (++n === 1 ? energy : { ok: true }) });
  const m = await mount();
  try {
    await m.click(/^Good$/);
    await m.click(/^Normal$/);
    failEnergy(new Error('500'));
    await m.flush();
    await m.flush();
    assert.deepEqual(calls.log, [{ energy: 8 }, { hunger: 6 }]);
    assert.match(m.text(), /How's your energy\?/);
    assert.match(m.text(), /Could not save check-in/);
    await m.click(/^Great$/);
    assert.match(m.text(), /How did you sleep\?/, 'the stored hunger answer was put back with the failed energy one');
  } finally { m.unmount(); }
});

test('an older save that fails never undoes a newer answer to the same question', async () => {
  let failFirst;
  const first = new Promise((_, reject) => { failFirst = reject; });
  let n = 0;
  env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } }, log: () => (++n === 1 ? first : { ok: true }) });
  const m = await mount();
  try {
    // Edit: Great (its save hangs), Hungry, keep the night; then Edit again and Drained.
    await m.click(/^Edit$/);
    await m.click(/^Great$/);
    await m.click(/^Hungry$/);
    await m.click(/That's right/);
    await m.click(/^Edit$/);
    await m.click(/^Drained$/);
    failFirst(new Error('500'));
    await m.flush();
    await m.flush();
    assert.match(m.text(), /Energy Drained/, "the failed Great put back the energy over the member's newer Drained");
    assert.match(m.text(), /Hunger Hungry/);
  } finally { m.unmount(); }
});

test('answers save one at a time, so two quick taps cannot both insert a row for today', async () => {
  let release;
  const first = new Promise((r) => { release = r; });
  const calls = env({ log: (p) => (p.energy != null ? first : { ok: true }) });
  const m = await mount();
  try {
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

test('it asks from 4 a.m., but a done line stays all night', async () => {
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
    assert.match(m.text(), /How's your energy\?/);
    m.unmount();
  } finally { mock.timers.setTime(at(12)); }
});

test('Edit walks the questions again, and skips a night the wearable reported', async () => {
  let calls = env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  let m = await mount();
  try {
    await m.click(/^Edit$/);
    assert.deepEqual(m.pressed(), ['Good'], "Edit did not show today's answer");
    await m.click(/^Great$/);
    await m.click(/^Hungry$/);
    assert.match(m.text(), /How did you sleep\?/);
    assert.match(m.text(), /7h(?! 30)/, "the stepper did not start at today's own hours");
    await m.click(/That's right/);
    assert.deepEqual(calls.log, [{ energy: 10 }, { hunger: 8 }, { sleepHours: 7 }]);
    assert.match(m.text(), /Energy Great · Hunger Hungry · Sleep 7h/);
  } finally { m.unmount(); }

  calls = env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7.2, hrv: 50 } } });
  m = await mount();
  try {
    await m.click(/^Edit$/);
    await m.click(/^Great$/);
    await m.click(/^Hungry$/);
    assert.match(m.text(), /Checked in ✓/, "Edit asked about the wearable's night");
    assert.deepEqual(calls.log, [{ energy: 10 }, { hunger: 8 }]);
  } finally { m.unmount(); }
});

test('Details opens the check-in page, and a glass of water is one tap in the member\'s units', async () => {
  let opened = 0;
  let calls = env({ days: { [TODAY]: { energy: 8, hunger: 6, sleep: 7 } } });
  let m = await mount({ onOpen: () => { opened += 1; } });
  try {
    await m.click(/Details/);
    assert.equal(opened, 1);
    assert.match(m.text(), /17 \/ 101 oz/);
    await m.click(/\+ Glass/);
    assert.deepEqual(calls.add, [0.2366]);
    assert.match(m.text(), /25 \/ 101 oz/);
  } finally { m.unmount(); }

  theme.isMetric = true;
  try {
    calls = env();
    m = await mount();
    await m.click(/\+ Glass/);
    assert.deepEqual(calls.add, [0.25]);
    assert.match(m.text(), /0\.75 \/ 3 L/);
    m.unmount();
  } finally { theme.isMetric = false; }
});

test('signed out, the card previews the flow and saves nothing', async () => {
  const calls = env({ uid: null });
  const m = await mount();
  try {
    await m.click(/Same as yesterday/);
    assert.deepEqual(calls.log, []);
    assert.match(m.text(), /Join Shape to save your check-in/);
    assert.doesNotMatch(m.text(), /Checked in/, 'the preview claimed a check-in it never saved');
    assert.doesNotMatch(m.text(), /days running/);
    // Water counts in the preview too, and is not written either.
    assert.match(m.text(), /42 \/ 101 oz/);
    await m.click(/\+ Glass/);
    assert.deepEqual(calls.add, [], 'the preview wrote a glass');
    assert.match(m.text(), /50 \/ 101 oz/);
  } finally { m.unmount(); }
});

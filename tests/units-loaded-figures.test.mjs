// tests/units-loaded-figures.test.mjs
//
// THE FIGURES A PAGE LOADS FOLLOW SETTINGS → UNITS TOO, NOT ONLY THE ONES IT IS
// HANDED. #2215 left two of them in the unit they arrived in: the profile's
// strength ridge printed the top PR as `${best} ${unit}` as stored, and the goal
// page's "7d volume" printed /api/client/train's pounds as a bare "9k" whatever the
// setting. And a PR item on the member's own profile feed carried its best as
// "Best: 100 kg × 3" beside a stat the card does convert.
//
// ⚠ ALL THREE ARRIVE THROUGH AN EFFECT, so these mount the shipped components with
// a react impl whose effects run (the weekly-readout-surface pattern): the fetch →
// state → render path is the one production takes. And each is converted at
// RENDER, not in the effect: the effects run once per load, so a conversion there
// would hold the old unit after a Settings flip until a remount. The flip tests
// resolve the fetch ONCE, so a second render can only read the state it left.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBroadsheet, drive, THEME, SHIM } from './helpers/broadsheet-mount.mjs';
import { bsSdUnitizeText, bsSdUnitizeStat, bsSdUnitizeLabel, bsSdMeasure } from '../mobile-app/src/services/sessionLedger.mjs';

const KG = { weight: 'kg', distance: 'km', length: 'cm' };
const LB = { weight: 'lb', distance: 'mi', length: 'in' };
const themeFor = (prefs) => new Proxy({}, {
  get: (_, k) => (k === 'uText' ? (x, o) => bsSdUnitizeText(x, prefs, o)
    : k === 'uStat' ? (l, x, o) => bsSdUnitizeStat(l, x, prefs, o)
    : k === 'uLabel' ? (u) => bsSdUnitizeLabel(u, prefs)
    : k === 'uMeasure' ? (v, u) => bsSdMeasure(v, u, prefs)
    : k === 'unitPrefs' ? prefs
    : THEME[k]),
  has: () => true,
});
let CURRENT = THEME;
globalThis.useBS = () => CURRENT;

// The profile's other effects listen for resizes and schedule frames; give them
// the no-op browser surface they need rather than swallowing their errors.
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const RUN_EFFECTS = { ...SHIM, useEffect(fn) { fn(); } };
const { BSClientGoals, BSTerrainProfile } = await loadBroadsheet(['BSClientGoals', 'BSTerrainProfile'], RUN_EFFECTS);

const settle = () => new Promise((r) => setTimeout(r, 0));
// Answers every call with `value` until frozen, then leaves each later call
// pending, so a re-render after the freeze cannot refetch: whatever it shows comes
// from the state the load left. (Several effects on one page call the same
// endpoint, so "answer only the first call" would starve all but one of them.)
const feed = (value) => {
  let n = 0, frozen = false;
  const f = async () => { n++; return frozen ? new Promise(() => {}) : value; };
  f.freeze = () => { frozen = true; return n; };
  f.calls = () => n;
  return f;
};

const signIn = () => { globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-a' } }) }; };

async function goalWeek(prefs, volume7dLb) {
  signIn();
  globalThis.window.ShapeProgress = { train: feed({ stats: { volume7dLb, thisWeekCount: 1 } }), nutrition: async () => null, progress: async () => null };
  CURRENT = themeFor(prefs);
  const d = drive(BSClientGoals, { onBack() {} });
  await settle();
  d.render();
  const contract = () => d.nodes().find((n) => n.type && n.type.name === 'BSGoalsContract');
  assert.ok(contract(), 'the goal page no longer renders BSGoalsContract');
  const volume = () => (contract().props.weekTargets || []).find((w) => /volume/i.test(w.l));
  return { d, volume };
}

test('the goal page\'s 7d volume reads in the member\'s unit, with the unit shown', async () => {
  // 9,120 lb is 4,137 kg.
  const km = await goalWeek(KG, 9120);
  assert.equal(km.volume().v, '4.1k kg');
  const mi = await goalWeek(LB, 9120);
  assert.equal(mi.volume().v, '9.1k lb', 'pounds stay pounds, now labelled');
  const none = await goalWeek(KG, 0);
  assert.equal(none.volume().v, '—', 'no volume is a dash, not "0.0k kg"');
  CURRENT = THEME;
});

test('the goal page converts the volume at render, so a Settings flip reaches it without a reload', async () => {
  const { d, volume } = await goalWeek(LB, 9120);
  assert.equal(volume().v, '9.1k lb');
  const before = globalThis.window.ShapeProgress.train.freeze();
  CURRENT = themeFor(KG);
  d.render();
  assert.ok(globalThis.window.ShapeProgress.train.calls() > before, 'the re-render asked again and got nothing back');
  assert.equal(volume().v, '4.1k kg', 'the same loaded figure, now in kilograms');
  CURRENT = THEME;
});

const PERSON = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' };
// The profile's sections are tabs: the climb box is on Climb, the feed on Activity.
const openTab = (d, key) => {
  const tabs = d.nodes().find((n) => n.type && n.type.name === 'BSTerrainTabs');
  assert.ok(tabs, 'the profile no longer has its tabs');
  tabs.props.onPick(key);
  d.render();
};
async function profile(prefs, { prs = [], trainPrs = [] } = {}) {
  signIn();
  globalThis.window.ShapeProgress = {
    progress: feed({ ok: true, prs }),
    train: feed({ prs: trainPrs }),
  };
  CURRENT = themeFor(prefs);
  const d = drive(BSTerrainProfile, { person: PERSON, isSelf: true, onBack() {}, onMessage() {} });
  await settle();
  d.render();
  return d;
}

test('the profile\'s strength ridge reads the top PR in the member\'s unit, at render', async () => {
  // The progress route returns a PR in its set's own unit (#2215): 102.5 kg.
  const prs = [{ move: 'back squat', best: 102.5, bestReps: 5, unit: 'kg' }];
  const mi = await profile(LB, { prs });
  openTab(mi, 'climb');
  mi.clickKey('strength');
  // 102.5 kg is 226 lb; the target is 10% above it, 249 lb.
  assert.match(mi.text, /226 lb × 5/, 'an imperial member reads the kilogram PR in pounds');
  assert.match(mi.text, /249 lb/);
  assert.doesNotMatch(mi.text, /\bkg\b/, 'a kilogram figure on an imperial ridge');
  const km = await profile(KG, { prs });
  openTab(km, 'climb');
  km.clickKey('strength');
  assert.match(km.text, /103 kg × 5/, 'a metric member reads it as recorded (the ridge reads whole numbers)');
  assert.match(km.text, /113 kg/);
  // Flip the setting with the PR already loaded: the ridge follows without a refetch.
  const before = globalThis.window.ShapeProgress.progress.freeze();
  CURRENT = themeFor(LB);
  km.render();
  assert.ok(globalThis.window.ShapeProgress.progress.calls() > before, 'the re-render asked again and got nothing back');
  assert.match(km.text, /226 lb × 5/);
  CURRENT = THEME;
});

test('a PR on the member\'s own profile feed states its best in the member\'s unit', async () => {
  const trainPrs = [{ move: 'Squat', best: 100, bestReps: 3, unit: 'kg', bestAt: new Date().toISOString() }];
  const bodies = (d) => d.nodes().filter((n) => n.type && n.type.name === 'BSActivityCard').map((n) => n.props.a && n.props.a.body);
  const mi = await profile(LB, { trainPrs });
  openTab(mi, 'activity');
  // The text converter writes pounds whole, the same rule the card applies to the
  // stat beside it ("100 kg" → "220 lb"), so the line and the stat agree.
  assert.ok(bodies(mi).includes('Best: 220 lb × 3'), `imperial: ${JSON.stringify(bodies(mi))}`);
  const km = await profile(KG, { trainPrs });
  openTab(km, 'activity');
  assert.ok(bodies(km).includes('Best: 100 kg × 3'), `metric: ${JSON.stringify(bodies(km))}`);
  CURRENT = THEME;
});

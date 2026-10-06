// tests/units-everywhere.test.mjs
//
// EVERY FIGURE A MEMBER READS IS IN THEIR OWN UNITS, NOT ONLY THE FEED'S.
//
// ⚠ #2205/#2206/#2210 made the feed and the session page follow Settings → Units.
// An audit after them (owner: "so are the metrics all properly wired on app and
// website?" — no) found the app's Progress page printing a fixed "lb" beside a
// trend chart already in kg, the profile's trajectory in "lb", and the Home
// widgets written in pounds and inches. These render the real components under
// both settings and read what they draw.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadBroadsheet, drive, THEME, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsSdUnitizeText, bsSdUnitizeStat, bsSdUnitizeLabel, bsSdMeasure } from '../mobile-app/src/services/sessionLedger.mjs';

const KG = { weight: 'kg', distance: 'km', length: 'cm' };
const LB = { weight: 'lb', distance: 'mi', length: 'in' };
// The harness THEME is imperial; a member's theme differs only in its converters.
const themeFor = (prefs) => new Proxy({}, {
  get: (_, k) => (k === 'uText' ? (x, o) => bsSdUnitizeText(x, prefs, o)
    : k === 'uStat' ? (l, x, o) => bsSdUnitizeStat(l, x, prefs, o)
    : k === 'uLabel' ? (u) => bsSdUnitizeLabel(u, prefs)
    : k === 'uMeasure' ? (v, u) => bsSdMeasure(v, u, prefs)
    : k === 'unitPrefs' ? prefs
    : k === 'isMetric' ? prefs === KG
    : THEME[k]),
  has: () => true,
});
let CURRENT = THEME;
globalThis.useBS = () => CURRENT;
const { BSClientProgress, BSTerrainProfile } = await loadBroadsheet(['BSClientProgress', 'BSTerrainProfile']);
const W = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetWidgets.jsx'), {
  registry: new Map([['react', SHIM]]),
  appendExports: 'export { WWeight, WBody, WMeasurements, WPR };',
});

// Every element's own text, and the strings a nested component is handed (this
// harness does not render nested components; what they would draw is in props).
const leaves = (node, out = []) => {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) { for (const n of node) leaves(n, out); return out; }
  if (typeof node !== 'object' || !node.props) return out;
  const kids = [].concat(node.props.children == null ? [] : node.props.children).flat(Infinity);
  const own = kids.filter((k) => typeof k === 'string' || typeof k === 'number').join('');
  if (own.trim()) out.push(own.trim());
  for (const k of kids) if (k && typeof k === 'object') leaves(k, out);
  return out;
};
const PROPS = { BSTLedgerStat: ['value', 'label'] };
const drawn = (Comp, props, prefs, act) => {
  CURRENT = themeFor(prefs);
  try {
    const d = drive(Comp, props);
    if (act) act(d);
    const nodes = d.nodes();
    const out = leaves(nodes[0]);
    for (const n of nodes) if (n.type && PROPS[n.type.name]) for (const k of PROPS[n.type.name]) if (typeof n.props[k] === 'string') out.push(n.props[k]);
    return out;
  } finally { CURRENT = THEME; }
};
const IMPERIAL = /\d\s*k?\s*(?:lb|lbs|mi|ft|mph|in)\b|^(?:lb|lbs|mi|ft|in)$/i;
const METRIC = /\d\s*k?\s*(?:kg|km|cm)\b|^(?:kg|km|cm)$/i;

test('the Progress page reads in the member\'s units on every tab', () => {
  for (const tab of ['overall', 'training']) {
    const km = drawn(BSClientProgress, { onBack() {}, initialTab: tab }, KG);
    assert.deepEqual(km.filter((s) => IMPERIAL.test(s)), [], `${tab}: a pound figure for a metric member`);
    const mi = drawn(BSClientProgress, { onBack() {}, initialTab: tab }, LB);
    assert.deepEqual(mi.filter((s) => METRIC.test(s)), [], `${tab}: a kilo figure for an imperial member`);
  }
  const overall = drawn(BSClientProgress, { onBack() {}, initialTab: 'overall' }, KG);
  // 171 lb is 77.6 kg; a 13 lb loss is 5.9 kg.
  assert.ok(overall.includes('Now 77.6 kg'), `bodyweight: ${overall.filter((s) => /Now/.test(s))}`);
  assert.ok(overall.includes('−5.9 kg'), `bodyweight change: ${overall.filter((s) => /kg|lb/.test(s))}`);
  const lbOverall = drawn(BSClientProgress, { onBack() {}, initialTab: 'overall' }, LB);
  assert.ok(lbOverall.includes('Now 171 lb') && lbOverall.includes('−13 lb'), 'an imperial member sees the pounds as stored');
  const training = drawn(BSClientProgress, { onBack() {}, initialTab: 'training' }, KG);
  // 9,120 lb of volume is 4,137 kg; 38,450 lb is 17,441 kg.
  assert.ok(training.includes('4.1k kg') && training.includes('17.4k kg'), `volume: ${training.filter((s) => /k (kg|lb)/.test(s))}`);
  assert.ok(training.some((s) => /^was \d+(\.\d)?kg$/.test(s)), `a PR's previous best: ${training.filter((s) => /^was/.test(s))}`);
});

test('the profile\'s trajectory reads in the member\'s unit', () => {
  const person = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' };
  // The trajectory is on the profile's Signals tab.
  const signals = (d) => {
    const tabs = d.nodes().find((n) => n.type && n.type.name === 'BSTerrainTabs');
    assert.ok(tabs, 'the profile no longer has its tabs');
    tabs.props.onPick('signals');
    d.render();
  };
  const km = drawn(BSTerrainProfile, { person, onBack() {}, onMessage() {} }, KG, signals);
  const mi = drawn(BSTerrainProfile, { person, onBack() {}, onMessage() {} }, LB, signals);
  // The demo trajectory runs 176 → 171 lb: −5 lb, −2.3 kg.
  assert.ok(km.includes('−2.3') && km.includes('kg'), `metric trajectory: ${km.filter((s) => /^[−+]?\d|^(kg|lb)$/.test(s)).slice(0, 12)}`);
  assert.ok(!km.includes('lb'), 'a bare "lb" label on a metric profile');
  assert.ok(mi.includes('−5') && mi.includes('lb'), 'an imperial trajectory reads pounds');
});

test('every Home widget with a weight or a length reads in the member\'s units', () => {
  const text = (Comp, prefs) => { CURRENT = themeFor(prefs); try { return leaves(drive(Comp, {}).nodes()[0]).join(' | '); } finally { CURRENT = THEME; } };
  // Weight: 182.4 lb is 82.7 kg, a 1.8 lb drop 0.8 kg.
  assert.match(text(W.WWeight, KG), /82\.7 \| kg/);
  assert.match(text(W.WWeight, KG), /0\.8 KG · 7D/);
  assert.match(text(W.WWeight, LB), /182\.4 \| lb/);
  // Body comp: muscle 154 lb is 69.9 kg (+0.5), weight 182 lb is 82.6 kg (−0.8).
  assert.match(text(W.WBody, KG), /69\.9 \| kg/);
  assert.match(text(W.WBody, KG), /82\.6 \| kg/);
  assert.match(text(W.WBody, KG), /\+0\.5/);
  assert.match(text(W.WBody, KG), /▼ -0\.8/);
  assert.match(text(W.WBody, LB), /154 \| lb/);
  // An imperial member's cells read exactly as they did before.
  assert.match(text(W.WBody, LB), /▲ \+1\.1/);
  assert.match(text(W.WBody, LB), /▼ -1\.8/);
  // Measurements: a 32.0 in waist is 81.3 cm, and the −0.8 in change is −2.0 cm
  // (the cell prints its minus as a hyphen).
  assert.match(text(W.WMeasurements, KG), /81\.3 \| cm/);
  assert.match(text(W.WMeasurements, KG), /▼ -2\.0/);
  assert.match(text(W.WMeasurements, LB), /32\.0 \| in/);
  assert.match(text(W.WMeasurements, LB), /▼ -0\.8/);
  // PRs print no unit; the figure is the member's: a 405 lb deadlift is 184 kg.
  assert.match(text(W.WPR, KG), /184/);
  assert.match(text(W.WPR, LB), /405/);
  for (const C of [W.WWeight, W.WBody, W.WMeasurements]) {
    assert.doesNotMatch(text(C, KG), /\b(lb|in|LB)\b/, `${C.name} keeps an imperial unit for a metric member`);
  }
});

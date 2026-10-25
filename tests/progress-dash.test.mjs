// tests/progress-dash.test.mjs
//
// Progress in B, the dashboard look (owner, 2026-10-25, of Progress: "this needs to look more visually
// appealing also, very boring, monotone"; then "I like B", following the paper). Pill tabs; every
// station a card under its name in its colour; the figures in tiles, each in its metric's colour with
// a sparkline of its series; the trend drawn in the series' colour. The colours are bsDash's: a
// metric's TEXT shade for its words, its MARK shade for lines and bars (tests/dash-look.test.mjs holds
// the text shades to 4.5:1 on every paper).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { loadBroadsheet, drive, THEME, ROOT, SRC } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

globalThis.useBS = () => THEME;
const { BSClientProgress } = await loadBroadsheet(['BSClientProgress']);
const React = createRequire(import.meta.url)('react');
const DASH = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSDash.jsx'), { registry: new Map([['react', React]]) });
const D = DASH.bsDash(THEME);
const src = readFileSync(SRC, 'utf8');

const named = (nodes, name) => nodes.filter((n) => n.type && n.type.name === name);

test('the tabs are pills: Overall, Training, Nutrition as tabs, the one shown filled', () => {
  const d = drive(BSClientProgress, { onBack() {}, initialTab: 'overall' });
  const [seg] = named(d.nodes(), 'BSDashSegment');
  assert.ok(seg, 'the tabs are not BSDashSegment');
  assert.equal(seg.props.role, 'tab');
  assert.deepEqual(seg.props.options.map(([k]) => k), ['overall', 'training', 'nutrition']);
  assert.equal(seg.props.value, 'overall');
  seg.props.onChange('nutrition');
  d.render();
  assert.equal(named(d.nodes(), 'BSDashSegment')[0].props.value, 'nutrition');
});

test('every station is a card opening on its name in a text shade of the palette', () => {
  const texts = new Set(Object.values(D.text));
  for (const tab of ['overall', 'training', 'nutrition']) {
    const d = drive(BSClientProgress, { onBack() {}, initialTab: tab });
    const nodes = d.nodes();
    const cards = named(nodes, 'BSDashCard').filter((n) => n.props.as === 'section');
    // Signed out, Overall draws The trend and Personal records (the lower cards are components).
    assert.ok(cards.length >= 2, `${tab}: ${cards.length} station cards`);
    for (const card of cards) {
      const kids = [].concat(card.props.children).flat(Infinity);
      const head = kids.find((k) => k && k.type && k.type.name === 'BSTStationHead');
      assert.ok(head, `${tab}: a card with no head`);
      assert.equal(head.props.dash, true, `${tab}: ${head.props.label} is not B's head`);
      assert.ok(texts.has(head.props.heat), `${tab}: ${head.props.label}'s colour ${head.props.heat} is not a text shade`);
    }
  }
});

test("the figures are tiles in their metric's colour, the label in its text shade, a sparkline in its mark", () => {
  const d = drive(BSClientProgress, { onBack() {}, initialTab: 'overall' });
  const nodes = d.nodes();
  const tiles = nodes.filter((n) => n.props && n.props['data-bs-prog-tile']);
  // Bodyweight teal, body fat amber, resting HR coral, sleep violet (signed out: no weekly points).
  assert.deepEqual(tiles.map((n) => n.props['data-bs-prog-tile']), ['teal', 'amber', 'coral', 'violet']);
  const stats = named(nodes, 'BSTLedgerStat').filter((n) => n.props.labelColor);
  assert.deepEqual(stats.map((n) => n.props.labelColor), [D.text.teal, D.text.amber, D.text.coral, D.text.violet]);
  const sparks = named(nodes, 'BSDashSpark');
  assert.deepEqual(sparks.map((n) => n.props.color), [D.mark.teal, D.mark.amber, D.mark.coral, D.mark.violet]);
  assert.ok(sparks.every((n) => n.props.values.length >= 2), 'a sparkline with nothing to draw');
  // Training's and Nutrition's tiles have colours of their own.
  const tr = drive(BSClientProgress, { onBack() {}, initialTab: 'training' }).nodes();
  assert.deepEqual(tr.filter((n) => n.props && n.props['data-bs-prog-tile']).map((n) => n.props['data-bs-prog-tile']), ['teal', 'violet', 'amber', 'coral']);
  const nu = drive(BSClientProgress, { onBack() {}, initialTab: 'nutrition' }).nodes();
  assert.deepEqual(nu.filter((n) => n.props && n.props['data-bs-prog-tile']).map((n) => n.props['data-bs-prog-tile']), ['amber', 'coral', 'teal', 'lime']);
});

test("the trend is drawn in the series' colour, and its head and change follow the pick", () => {
  const d = drive(BSClientProgress, { onBack() {}, initialTab: 'overall' });
  const chart = () => named(d.nodes(), 'BSProgChart')[0];
  const trendHead = () => named(d.nodes(), 'BSTStationHead').find((n) => n.props.label === 'The trend');
  assert.equal(chart().props.color, D.mark.teal, 'weight is teal');
  assert.equal(trendHead().props.heat, D.text.teal);
  const select = d.nodes().find((n) => n.type === 'select');
  select.props.onChange({ target: { value: 'sleep' } });
  d.render();
  assert.equal(chart().props.color, D.mark.violet, 'sleep is violet');
  assert.equal(trendHead().props.heat, D.text.violet);
  // Every series names a colour of the palette.
  const tabs = src.slice(src.indexOf('const BSPROG_TREND_TABS = ['), src.indexOf('];', src.indexOf('const BSPROG_TREND_TABS = [')));
  const rows = [...tabs.matchAll(/\{ k: '(\w+)'.*?\}/g)];
  assert.equal(rows.length, 9);
  for (const [row, k] of rows) assert.match(row, /c: '(teal|violet|amber|coral|lime)'/, `${k} has no colour`);
});

test("the hero's ring is the headline goal's share done, drawn only for a goal with a start", () => {
  const plate = src.slice(src.indexOf('function BSClientNextPlate('), src.indexOf('function BSWeekendsCard('));
  assert.match(plate, /const g = E\.visibleGoals\(record\.goals\)\[0\]; const p = g && E\.projectGoal\(g\); if \(p && Number\.isFinite\(p\.pct\)\) ring = /);
  assert.match(plate, /if \(headline\) \{ try \{ const g = E\.visibleGoals/, 'a ring without the goal headline it measures');
  assert.match(plate, /\{ring \? \(\s*<BSDashRing /);
  assert.match(plate, /`\$\{Math\.round\(ring\.pct \* 100\)\}%`/);
});

test("a card's name is a heading, so it is in Saira, never the mono face of the figures' labels", () => {
  // Codex on #2456: the station heads were h2s in the mono face; the WORKLOG says every heading is Saira.
  const head = src.slice(src.indexOf('if (dash) return ('), src.indexOf('if (mag) return ('));
  assert.match(head, /<h2 style=\{\{ margin: 0, fontFamily: BST_SERIF,/);
  assert.doesNotMatch(head, /BST_MONO, fontSize: 9\.5/);
  // The Strength card's name and What's next, which head their cards the same way.
  assert.match(src, /fontFamily: t\.DISPLAY, fontSize: 11\.5, fontWeight: 700, letterSpacing: '0\.1em', textTransform: 'uppercase', color: D\.text\.coral \}\}>Strength · Estimated 1RM</);
  assert.match(src, /fontFamily: t\.DISPLAY, fontSize: 11\.5, fontWeight: 700, letterSpacing: '0\.1em', textTransform: 'uppercase', color: D\.text\.teal \}\}>\{d\.eyebrow\}</);
});

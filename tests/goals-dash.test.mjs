// tests/goals-dash.test.mjs
//
// Goals in B, the dashboard look (owner, 2026-10-25: "make Goals match the new look too", then of the
// mock, "Yes go with goals"), as Progress and Your mornings are (tests/progress-dash.test.mjs). The
// cover's read is the goal's ring beside the verdict; every station door is a card in its colour; a
// station's targets sit in a card with a rounded bar where the bar is honest; This week is a ring per
// figure where the figure has a target; the terms are a milestone track. A card's name is a heading in
// Saira in its colour's text shade (bsDash), never the mono face.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, loadCarved, drive, textOf, THEME, ROOT, GOALS_SRC } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

globalThis.useBS = () => THEME;
// The client module publishes the window globals Goals reads at call time; Goals is its own module.
await loadBroadsheet(['BSClientGoals']);
const { BSGoalsContract } = await loadCarved('BSGoals.jsx');
const React = createRequire(import.meta.url)('react');
const DASH = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSDash.jsx'), { registry: new Map([['react', React]]) });
const D = DASH.bsDash(THEME);
const src = readFileSync(GOALS_SRC, 'utf8');

// The member reads kilograms here, as in tests/custom-goal.
Object.assign(THEME, { weightUnit: 'kg', kgToDisplay: (kg) => (kg == null ? null : Number(kg)) });
// Fills a default's {name}s and its one plural shape ({count, plural, one {# x} other {# xs}}).
const fill = (s, o) => s
  .replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (m, k, one, other) => (k in o ? (Number(o[k]) === 1 ? one : other).replace('#', String(o[k])) : m))
  .replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
const fillingTr = { t: (key, o) => (o && typeof o.defaultValue === 'string' ? fill(o.defaultValue, o) : key) };
const noop = () => {};
const GOAL = { title: 'Lean', start: 80.4, now: 79.2, target: 76, unit: 'kg', by: '2026-07-01', why: 'For the bike', weighIns: [{ d: '2026-02-15', kg: 80.4 }, { d: '2026-06-13', kg: 79.2 }] };
const DATA = {
  primaryGoal: 'fat_loss',
  training: [{ t: 'Squat 1.5× bodyweight', cur: 135, tgt: 175 }, { t: 'Body fat to 18%', cur: 22, tgt: 18 }],
  nutrition: [], work: [], trainingMeta: { title: 'Hold the line' },
};
function contract({ view = 'cover', data = DATA, overall = GOAL, signedIn = false, weekTargets = null } = {}) {
  globalThis.window.ShapeAuth = signedIn ? { getCachedState: () => ({ user: { id: 'member-a' } }) } : undefined;
  globalThis.window.ShapeI18n = fillingTr;
  return drive(BSGoalsContract, { overall, data, heat: '#c0533b', view, weekTargets, onOpenView: noop, onBack: noop, onLog: noop, onEditTargets: noop, onOpenProgress: noop, onAddGoal: noop, onEditGoal: noop, onEditHeadline: noop });
}
const named = (nodes, name) => nodes.filter((n) => n.type && n.type.name === name);
const prop = (nodes, key) => nodes.filter((n) => n.props && n.props[key] !== undefined);

test("the cover's read is the goal's ring: one role=img named for its share done, in a teal card", () => {
  const d = contract();
  const nodes = d.nodes();
  const imgs = nodes.filter((n) => n.props && n.props.role === 'img');
  assert.equal(imgs.length, 1, 'one weight read');
  assert.match(imgs[0].props['aria-label'], /^\d+%$/);
  const read = prop(nodes, 'data-goal-read')[0];
  assert.ok(read && read.type.name === 'BSDashCard', 'the read is not a card');
  assert.equal(read.props.tint, D.mark.teal);
  assert.ok(named(nodes, 'BSDashRing').some((r) => r.props.id === 'goal-read'), 'the read has no ring');
  assert.match(d.text, /Current/); assert.match(d.text, /To go/); assert.match(d.text, /Pace/);
});

test('every station door is a card in its colour, its name in the text shade', () => {
  const d = contract();
  const doors = prop(d.nodes(), 'data-goal-door');
  assert.deepEqual(doors.map((n) => n.props['data-goal-door']), ['training', 'nutrition', 'work', 'week', 'terms']);
  const want = { training: 'coral', nutrition: 'amber', work: 'violet', week: 'teal', terms: 'lime' };
  for (const door of doors) {
    assert.equal(door.type.name, 'BSDashCard');
    assert.equal(door.props.as, 'button');
    const kids = [].concat(door.props.children).flat(Infinity);
    const flat = []; const walk = (n) => { if (!n || typeof n !== 'object') return; flat.push(n); [].concat(n.props && n.props.children).flat(Infinity).forEach(walk); };
    kids.forEach(walk);
    const c = want[door.props['data-goal-door']];
    assert.ok(flat.some((n) => n.props && n.props.style && n.props.style.color === D.text[c] && n.props.style.fontFamily === THEME.DISPLAY), `${door.props['data-goal-door']}'s name is not in ${c}`);
  }
  // The training door's figure is its count; the next milestone is a card that opens the terms.
  assert.match(textOf(doors[0]), /2 targets/);
  const next = prop(d.nodes(), 'data-goal-next')[0];
  assert.equal(next.type.name, 'BSDashCard');
});

test("a target climbing to its mark has a bar; one coming down to it has none (no start to measure from)", () => {
  const d = contract({ view: 'training' });
  const nodes = d.nodes();
  const rows = prop(nodes, 'data-goal-target');
  assert.equal(rows.length, 2);
  const barOf = (row) => { let hit = false; const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.props && n.props['data-goal-target-bar'] !== undefined) hit = true; [].concat(n.props && n.props.children).flat(Infinity).forEach(walk); }; walk(row); return hit; };
  assert.equal(barOf(rows[0]), true, '135 → 175 has its bar');
  assert.equal(barOf(rows[1]), false, '22 → 18 has no bar');
  // The targets card opens on its name, a Saira heading in training's coral.
  const card = prop(nodes, 'data-goal-targets')[0];
  assert.equal(card.type.name, 'BSDashCard');
  const h2 = nodes.find((n) => n.type === 'h2');
  assert.equal(h2.props.style.fontFamily, THEME.DISPLAY);
  assert.equal(h2.props.style.color, D.text.coral);
  // The page's heading is upright, the station's colour on its stop.
  const h1 = nodes.find((n) => n.type === 'h1');
  assert.equal(textOf(h1), 'Training.');
  assert.ok(!JSON.stringify(h1.props.style).includes('italic'));
});

test("a target's bar is its share exactly: none done is an empty bar, a sliver is a sliver", () => {
  const data = { ...DATA, training: [{ t: 'New target', cur: 0, tgt: 10 }, { t: 'Barely begun', cur: 1, tgt: 100 }] };
  const rows = prop(contract({ view: 'training', data }).nodes(), 'data-goal-target');
  const fillOf = (row) => { let w = null; const walk = (n) => { if (!n || typeof n !== 'object') return; if (n.props && n.props['data-goal-target-bar'] !== undefined) w = [].concat(n.props.children)[0].props.style.width; [].concat(n.props && n.props.children).flat(Infinity).forEach(walk); }; walk(row); return w; };
  assert.equal(fillOf(rows[0]), '0%');
  assert.equal(fillOf(rows[1]), '1%');
});

test("This week: a ring for each figure with a target, the figure alone without one", () => {
  const week = [
    { l: 'Sessions', v: '3/4', sub: 'one to go', c: 'coral', pct: 0.75 },
    { l: '7d volume', v: '9.1k lb', sub: 'load lifted', c: 'teal', pct: null },
  ];
  const d = contract({ view: 'week', signedIn: true, weekTargets: week });
  const nodes = d.nodes();
  const cards = prop(nodes, 'data-goal-week');
  assert.equal(cards.length, 2);
  const rings = named(nodes, 'BSDashRing');
  assert.deepEqual(rings.map((r) => [r.props.pct, r.props.from]), [[0.75, D.mark.coral]], 'one ring, the sessions');
  assert.match(textOf(cards[1]), /9\.1k lb/, 'the volume reads as its figure');
  const heads = nodes.filter((n) => n.type === 'h2');
  assert.deepEqual(heads.map((h) => h.props.style.color), [D.text.coral, D.text.teal]);
  // The live builder gives each row its colour and share; the demo and empty sets do too.
  assert.match(src, /c: 'coral', pct: sessTarget \? Math\.min\(1, thisWk \/ sessTarget\) : null/);
  assert.match(src, /c: 'violet', pct: sleep \? Math\.min\(1, sleep \/ 7\) : null/);
});

test('the terms: a milestone track, the next one marked, and your why in its own card', () => {
  const d = contract({ view: 'terms' });
  const nodes = d.nodes();
  const ms = prop(nodes, 'data-goal-milestone').map((n) => n.props['data-goal-milestone']);
  assert.equal(ms.length, 5);
  assert.equal(ms.filter((s) => s === 'next').length, 1);
  assert.equal(ms[0], 'done');
  assert.ok(prop(nodes, 'data-goal-milestones')[0].type.name === 'BSDashCard');
  const why = prop(nodes, 'data-goal-why')[0];
  assert.equal(why.props.tint, D.mark.violet);
  assert.match(textOf(why), /For the bike/);
  for (const h of nodes.filter((n) => n.type === 'h2')) assert.equal(h.props.style.fontFamily, THEME.DISPLAY);
});

test("Goals' quiet actions are B's small pills, each a 44px target", () => {
  const act = src.slice(src.indexOf('function BSOLAct('), src.indexOf('function BSOLRow('));
  assert.match(act, /minHeight: 44/);
  assert.match(act, /height: 34, padding: '0 15px', borderRadius: 999, background: D\.track/);
  assert.doesNotMatch(act, /borderBottom: `2px solid \$\{heat\}`/, 'the underline is back');
});

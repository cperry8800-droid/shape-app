// ── The Rewards page says whose figures it shows ─────────────────────────────
//
// ⚠ EVERY PERSONAL FIGURE ON Score.html IS A CONSTANT. The ring's 1,284, the
// "+36 this week", the 14-day streak, "You're Tempo. 716 to Form.", the activity
// heatmap and the 940 balance are the same example member for every reader, and
// they rendered in the second person with nothing saying so — to members too,
// once #2158 put Rewards in the signed-in nav (CodeRabbit, on that PR). The page
// now marks each group as an example member's; the member's own live score is on
// their dashboard. These render the SHIPPED sections (score.jsx compiled, minus
// its own mount) and read what a reader would see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/Score.html' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require('react');
const ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const act = React.act;

const SRC = readFileSync(new URL('../public/newdesign/score.jsx', import.meta.url), 'utf8');
// Everything but the page's own mount, which would render into #root on import.
const mountAt = SRC.lastIndexOf('ReactDOM.createRoot(');
assert.ok(mountAt > 0 && /\.render\(<ScorePage \/>\);\s*$/.test(SRC.slice(mountAt)),
  'score.jsx no longer ends in its own mount — this harness would render the whole page on import');
const OPTS = { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script' };
const code = babel.transformSync(SRC.slice(0, mountAt), OPTS).code;

// The shell globals the page reads, stubbed. A 401 is what the score route
// answers a visitor who is not signed in.
let fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
const S = new Function('React', 'ReactDOM', 'window', 'document', 'location', 'fetch', 'matchMedia', 'IntersectionObserver', 'localStorage',
  'mono', 'sans', 'serif', 'INK', 'INK_DEEP', 'PAPER', 'RUST', 'TEAL', 'TEAL_BRIGHT', 'Ph', 'Header', 'Footer',
  code + '\nreturn { ScoreHero, ScoreTiers, ScoreActivity, ScoreLedger, ScoreRewards, ScorePage, scView, REWARDS };')(
  React, ReactDOM, dom.window, dom.window.document, dom.window.location, (...a) => fetchImpl(...a),
  () => ({ matches: false }), class { observe() {} disconnect() {} }, dom.window.localStorage,
  'monospace', 'sans-serif', 'serif', '#f2ede4', '#0b0e0c', '#1a1612', '#c0533b', '#0ac5a8', '#2ee0c4',
  ({ label }) => React.createElement('div', null, label), () => null, () => null,
);

async function render(Component, props = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Component, props)); });
  // Two more ticks: a fetch resolves, then its .json(), then the state lands.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, close: () => act(async () => { root.unmount(); el.remove(); }) };
}
const marks = (el) => el.querySelectorAll('[data-sc-example]').length;

test('every group of the example member\'s figures carries its label', async () => {
  const hero = await render(S.ScoreHero);
  assert.match(hero.el.textContent, /1284/, 'the hero no longer shows the example score — this is reading the wrong thing');
  // Two groups on the hero: the ring, and the row of four figures under it.
  assert.ok(marks(hero.el) >= 2, 'the hero labels ' + marks(hero.el) + ' of its two figure groups (the ring, the row of four)');
  assert.match(hero.el.textContent, /Example member/i);
  await hero.close();

  const tiers = await render(S.ScoreTiers);
  assert.match(tiers.el.textContent, /You're Tempo/, 'the tiers headline changed — re-check what it claims');
  assert.match(tiers.el.textContent, /example member/i, 'the tier standing ("You\'re Tempo. 716 to Form.") is unlabelled');
  await tiers.close();

  const activity = await render(S.ScoreActivity);
  assert.ok(marks(activity.el) >= 1, 'the activity card (streak, heatmap, momentum) is unlabelled');
  await activity.close();

  const rewards = await render(S.ScoreRewards);
  assert.ok(marks(rewards.el) >= 1, 'the 940 balance is unlabelled');
  const h2 = rewards.el.querySelector('h2');
  assert.ok(h2, 'the rewards headline is gone — this is reading the wrong thing');
  assert.doesNotMatch(h2.textContent, /\d/, 'the rewards headline claims a balance ("' + h2.textContent.trim() + '") outside the labelled block');
  await rewards.close();
});

test('the ledger is labelled an example for a visitor; a member\'s own rows carry no label', async () => {
  // The page reads the Standing once (ScorePage) and hands the ledger its rows as props.v.
  const out = await render(S.ScoreLedger, { onOpenRecord: () => {} });
  assert.match(out.el.textContent, /example entries/i, 'a visitor sees the demo ledger with nothing saying it is an example');
  await out.close();

  const v = S.scView({ points_total: 10, recent: [
    { category: 'workouts', delta: 10, note: 'Tempo run logged', earned_at: '2026-09-22T15:00:00Z' },
    { category: 'adherence', delta: -7, note: 'Missed check-in', earned_at: '2026-09-21T15:00:00Z' },
  ] }, null, Date.parse('2026-09-23T12:00:00Z'));
  const live = await render(S.ScoreLedger, { v, onOpenRecord: () => {} });
  assert.match(live.el.textContent, /Tempo run logged/, 'the member\'s own row never reached the ledger — this is reading nothing');
  assert.doesNotMatch(live.el.textContent, /example entries/i, 'a member\'s own ledger is still labelled an example');
  assert.doesNotMatch(live.el.textContent, /\+-/, 'a lost point reads "+-7"');
  assert.match(live.el.textContent, /−7/, 'a lost point is not shown as a minus');
  await live.close();

  const empty = await render(S.ScoreLedger, { v: S.scView({ points_total: 0, recent: [] }, null, Date.now()), onOpenRecord: () => {} });
  assert.doesNotMatch(empty.el.textContent, /Session kept · Maya Okafor|example entries/i, 'a member with no points is shown the example\'s ledger');
  await empty.close();

  const loading = await render(S.ScoreLedger, { loading: true, onOpenRecord: () => {} });
  assert.doesNotMatch(loading.el.textContent, /Session kept · Maya Okafor|example entries/i, 'a member loading is shown the example\'s ledger');
  await loading.close();
});

// The Standing and The Record a signed-in member's reads answer with (/api/client/score,
// /api/client/score-record), for a member at 2,340: Form, 2,660 to Peak.
const NOW = Date.parse('2026-11-11T15:00:00Z');
const STANDING = {
  points_total: 2340, week_gain: 57, spendable_balance: 1180,
  current_tier: { name: 'Form', threshold: 2000 }, next_tier: { name: 'Peak', threshold: 5000 }, points_to_next: 2660,
  momentum: { value: 64, bonusThisWeek: false, streakWeeks: 2, points: 0 },
  recent: [{ category: 'workouts', delta: 10, note: 'Upper pull logged', earned_at: '2026-11-11T09:00:00Z' }],
};
const dayAt = (base, ago, rows) => ({ date: new Date(Math.floor(base / 86400000) * 86400000 - ago * 86400000).toISOString().slice(0, 10), rows });
const day = (ago, rows) => dayAt(NOW, ago, rows);
// The Record as of `base`. ⚠ THE RENDERED PAGE COUNTS THE STREAK FROM THE REAL CLOCK, not NOW, so the
// record its read answers with is built around Date.now(): a record pinned to Nov 11 read as a broken
// streak from 2026-11-13 on, and failed main with no change to the page (found on #2730).
const recordAt = (base) => ({ history: [
  dayAt(base, 0, [{ delta: 10, source_kind: 'workout' }]),
  dayAt(base, 1, [{ delta: 12, source_kind: 'session' }, { delta: -7, source_kind: 'penalty' }]),
  dayAt(base, 2, [{ delta: 30, source_kind: 'workout' }]),
  dayAt(base, 4, [{ delta: 500, source_kind: 'tier_bonus' }]),
  dayAt(base, 8, [{ delta: 9, source_kind: 'habit' }]), dayAt(base, 9, [{ delta: 9, source_kind: 'habit' }]),
  dayAt(base, 10, [{ delta: 9, source_kind: 'habit' }]), dayAt(base, 11, [{ delta: 9, source_kind: 'habit' }]),
] });
const RECORD = recordAt(NOW);

test("scView counts the member's own days in their zone, and the week before stays on week_gain's UTC days (Codex on #2701)", () => {
  // 4:30 PM on Nov 9 and 3:30 PM on Nov 10 in Los Angeles: one UTC day (Nov 10), two of the member's.
  const rec = { history: [{ date: '2026-11-10', rows: [
    { delta: 10, source_kind: 'workout', earned_at: '2026-11-10T00:30:00Z' },
    { delta: 12, source_kind: 'workout', earned_at: '2026-11-10T23:30:00Z' },
  ] }] };
  const now = Date.parse('2026-11-11T02:00:00Z'); // 6 PM on Nov 10 in Los Angeles
  const la = S.scView(STANDING, rec, now, 'America/Los_Angeles');
  assert.equal(la.streak, 2, 'two evenings in Los Angeles counted as one day');
  assert.equal(la.active, 2);
  assert.equal(la.heat[83], 2, "today's 12 points, on the member's today");
  assert.equal(la.heat[82], 2, "yesterday's 10 points");
  assert.equal(la.heat[81], 0);
  const utc = S.scView(STANDING, rec, now, 'UTC');
  assert.equal(utc.streak, 1);
  assert.equal(utc.active, 1);
  // The page reads the viewer's zone (the account's, through shapeZone.mjs), which Score.html loads.
  assert.match(SRC, /scView\(live\.score, live\.record, Date\.now\(\), zone\)/);
  assert.match(readFileSync(new URL('../public/newdesign/Score.html', import.meta.url), 'utf8'), /import \* as TZ from "\/newdesign\/shapeZone\.mjs[^"]*"; window\.ShapeZone = TZ;/);
  // The week before is UTC days 8-15, whatever the zone: week_gain's window is UTC midnight.
  const wk = { history: [{ date: '2026-11-02', rows: [{ delta: 9, source_kind: 'habit', earned_at: '2026-11-02T03:00:00Z' }] }] };
  assert.equal(S.scView(STANDING, wk, Date.parse('2026-11-11T15:00:00Z'), 'America/Los_Angeles').lastWeek, 9);
});

test("scView: the member's streak, best run, heatmap and last week, from The Record", () => {
  const v = S.scView(STANDING, RECORD, NOW);
  assert.equal(v.total, 2340);
  assert.equal(v.tier, 'Form');
  assert.equal(v.next, 'Peak');
  assert.equal(v.toNext, 2660);
  assert.equal(v.goal, 5000, 'the ring is not measured against the next tier');
  assert.equal(v.balance, 1180);
  assert.equal(v.momentum, 64);
  assert.equal(v.streak, 3, 'today, yesterday and the day before');
  assert.equal(v.best, 4, 'days 8-11 ago are the longest run');
  // A tier bonus is credit, not activity: day 4 is quiet.
  assert.equal(v.active, 7);
  assert.equal(v.heat.length, 84);
  assert.equal(v.heat[83], 2, "today's 10 points");
  assert.equal(v.heat[81], 3, 'two days ago, 30 points');
  assert.equal(v.heat[79], 0, 'a tier bonus counted as activity');
  assert.equal(v.lastWeek, 36, 'days 8-15 ago, the window before week_gain\'s');
  // Net on week_gain's basis, and disjoint from it (Codex on #2701): week_gain runs from midnight
  // seven days ago, so day 7 is this week's; a penalty counts; a tier bonus and a Store buy do not.
  const edge = S.scView(STANDING, { history: [
    day(7, [{ delta: 20, source_kind: 'workout' }]),
    day(9, [{ delta: 15, source_kind: 'workout' }, { delta: -5, source_kind: 'penalty' }]),
    day(12, [{ delta: 300, source_kind: 'tier_bonus' }, { delta: -900, source_kind: 'store_redeem' }]),
    day(15, [{ delta: 4, source_kind: 'habit' }]),
    day(16, [{ delta: 100, source_kind: 'workout' }]),
  ] }, NOW);
  assert.equal(edge.lastWeek, 14);
  const down = S.scView(STANDING, { history: [day(10, [{ delta: -12, source_kind: 'penalty' }])] }, NOW);
  assert.equal(down.lastWeek, -12, 'a week of penalties reads as a gain');
  // A streak waits for today to close: with nothing today it runs to yesterday.
  const noToday = S.scView(STANDING, { history: RECORD.history.slice(1) }, NOW);
  assert.equal(noToday.streak, 2);
  // At the top tier the ring is the member's own score, never a smaller goal.
  const top = S.scView({ ...STANDING, points_total: 16000, current_tier: { name: 'Legend', threshold: 15000 }, next_tier: null, points_to_next: 0 }, null, NOW);
  assert.equal(top.next, null);
  assert.ok(top.goal >= 16000);
  assert.equal(top.streak, null, 'a streak claimed before The Record answered');
});

async function renderPage() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(React.createElement(S.ScorePage)); });
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, close: () => act(async () => { root.unmount(); el.remove(); }) };
}

test("a signed-in member sees their own standing on every section, with no example label", async () => {
  dom.window.localStorage.setItem('shape.auth', '{"access_token":"x"}');
  fetchImpl = async (url) => {
    const u = String(url);
    if (u.endsWith('/api/client/score')) return { ok: true, status: 200, json: async () => STANDING };
    if (u.endsWith('/api/client/score-record')) return { ok: true, status: 200, json: async () => recordAt(Date.now()) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const page = await renderPage();
  const text = page.el.textContent;
  assert.equal(marks(page.el), 0, 'a member\'s own page still carries ' + marks(page.el) + ' example labels');
  assert.match(text, /2340/, "the ring is not the member's score");
  assert.match(text, /You're Form\. 2,660 to Peak\./, "the tier headline is not the member's");
  assert.match(text, /Tiers · your standing/);
  assert.match(text, /1,180 pts/, "the rewards balance is not the member's");
  assert.match(text, /\+57/, "this week's points are not the member's");
  assert.match(text, /3d/, "the streak is not the member's");
  assert.match(text, /Upper pull logged/);
  for (const ex of ['1284', '940 pts', '716 to Form', 'Session kept · Maya Okafor', '344 reserved']) {
    assert.ok(!text.includes(ex), 'a member is shown the example member\'s "' + ex + '"');
  }
  await page.close();
  dom.window.localStorage.removeItem('shape.auth');
  fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
});

test('a member whose reads are still out sees dashes, never the example; a visitor sees the labelled example', async () => {
  dom.window.localStorage.setItem('shape.auth', '{"access_token":"x"}');
  fetchImpl = () => new Promise(() => {});
  const waiting = await renderPage();
  for (const ex of ['1284', '940', '716 to Form', 'Session kept · Maya Okafor']) {
    assert.ok(!waiting.el.textContent.includes(ex), 'a member waiting on their reads is shown the example\'s "' + ex + '"');
  }
  assert.equal(marks(waiting.el), 0);
  await waiting.close();

  // The session was stale: the route answers 401, and the page falls back to the labelled example.
  fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const stale = await renderPage();
  assert.match(stale.el.textContent, /1284/);
  assert.ok(marks(stale.el) >= 4, 'the fallback example is not labelled');
  await stale.close();
  dom.window.localStorage.removeItem('shape.auth');

  const visitor = await renderPage();
  assert.match(visitor.el.textContent, /1284/);
  assert.ok(marks(visitor.el) >= 4, "a visitor's example is not labelled");
  await visitor.close();
});

test('a member signed in by cookie only waits on dashes, then sees their own; never the example (Codex on #2701)', async () => {
  // Signed in through the Next.js login: the session is in cookies, nothing in localStorage.
  dom.window.localStorage.removeItem('shape.auth');
  let answer;
  fetchImpl = (url) => (String(url).endsWith('/api/client/score') ? new Promise((r) => { answer = r; }) : new Promise(() => {}));
  const page = await renderPage();
  for (const ex of ['1284', '940', '716 to Form', 'Session kept · Maya Okafor']) {
    assert.ok(!page.el.textContent.includes(ex), 'a cookie-only member waiting on the read is shown the example\'s "' + ex + '"');
  }
  assert.equal(marks(page.el), 0, 'a cookie-only member waiting on the read is shown the labelled example');
  await act(async () => { answer({ ok: true, status: 200, json: async () => STANDING }); await new Promise((r) => setTimeout(r, 0)); });
  assert.match(page.el.textContent, /2340/, "the member's own score did not land");
  assert.equal(marks(page.el), 0);
  await page.close();
  fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
});

test('no component shows the example member\'s figures without a label, itself or from the section that renders it', () => {
  // A net under the renders above: derived from the source, so a NEW section
  // that reads these constants fails here until it carries a label. The names
  // are the member-figure constants — the tiers and the rewards catalogue are
  // the program's own data and need no label.
  const FIGURES = ['SCORE_TOTAL', 'SCORE_GOAL', 'STREAK', 'TIER', 'NEXT_TIER', 'POINTS_TO_NEXT', 'HEATMAP', 'LEDGER'];
  const ast = babel.parseSync(SRC, OPTS);
  const top = new Map();
  for (const n of ast.program.body) {
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) top.set(d.id.name, d);
    if (n.type === 'FunctionDeclaration') top.set(n.id.name, n);
  }
  for (const f of FIGURES) assert.ok(top.has(f), 'score.jsx no longer declares ' + f + ' — update this list, do not delete the guard');
  const info = new Map();
  babel.traverse(ast, {
    FunctionDeclaration(p) {
      if (p.parentPath.type !== 'Program') return;
      const name = p.node.id.name;
      const rec = { uses: false, labelled: false, renders: new Set() };
      p.traverse({
        Identifier(q) { if (FIGURES.includes(q.node.name) && !q.scope.hasOwnBinding(q.node.name) && q.isReferencedIdentifier()) rec.uses = true; },
        NumericLiteral(q) { if (q.node.value === 940) rec.uses = true; },
        StringLiteral(q) { if (/\b940\b/.test(q.node.value)) rec.uses = true; if (/example/i.test(q.node.value)) rec.labelled = true; },
        JSXText(q) { if (/\b940\b/.test(q.node.value)) rec.uses = true; if (/example/i.test(q.node.value)) rec.labelled = true; },
        JSXOpeningElement(q) {
          const n = q.node.name.name;
          if (n === 'ScExample') rec.labelled = true;
          else if (/^[A-Z]/.test(n || '')) rec.renders.add(n);
        },
      });
      info.set(name, rec);
    },
  });
  const users = [...info].filter(([, r]) => r.uses).map(([n]) => n);
  assert.ok(users.length >= 5, 'only ' + users.length + ' components read the example figures — the scan stopped matching');
  const unlabelled = users.filter((n) => {
    if (info.get(n).labelled) return false;
    const parents = [...info].filter(([, r]) => r.renders.has(n)).map(([p]) => p);
    return !(parents.length && parents.every((p) => info.get(p).labelled));
  });
  assert.deepEqual(unlabelled, [], 'these show the example member\'s figures with no label: ' + unlabelled.join(', '));
});

test('a tier-locked reward stays locked for a Legend member who can afford it (Codex on #2701)', async () => {
  // The Store shows it "Tier locked" and /api/store/redeem refuses it with 403, so a Redeem
  // button here would send the member to a reward they cannot take.
  const v = S.scView({ ...STANDING, points_total: 16000, spendable_balance: 40000, current_tier: { name: 'Legend', threshold: 15000 }, next_tier: null, points_to_next: 0 }, null, NOW);
  const out = await render(S.ScoreRewards, { v });
  const locked = S.REWARDS.filter((r) => r.locked);
  assert.ok(locked.length >= 1, 'no tier-locked reward to check');
  for (const r of locked) {
    const card = [...out.el.querySelectorAll('article')].find((a) => a.textContent.includes(r.title));
    assert.ok(card, `"${r.title}" is not on the page`);
    const btn = card.querySelector('button');
    assert.equal(btn.disabled, true, `"${r.title}" offers a Redeem the Store refuses`);
    assert.doesNotMatch(btn.textContent, /Redeem/);
  }
  const open = S.REWARDS.find((r) => !r.locked);
  const openCard = [...out.el.querySelectorAll('article')].find((a) => a.textContent.includes(open.title));
  assert.equal(openCard.querySelector('button').disabled, false, 'an affordable reward is not redeemable');
  await out.close();
});

test("the Rewards cards are the Store's own items at the Store's own prices", () => {
  // src/lib/store-catalogue.ts is the price list the redeem route charges: 150 points a dollar,
  // 300 for a credit. The page had its own ("$25 session credit · 500", a "$200" credit sold at $60).
  const CAT = readFileSync(new URL('../src/lib/store-catalogue.ts', import.meta.url), 'utf8');
  const rate = Number(/SHAPE_PTS_PER_USD = (\d+)/.exec(CAT)[1]);
  const creditRate = Number(/SHAPE_PTS_PER_USD_CREDIT = (\d+)/.exec(CAT)[1]);
  assert.ok(S.REWARDS.length >= 4);
  for (const r of S.REWARDS) {
    const m = new RegExp(`\\{ id: '${r.id}', name: '([^']+)', cat: '[^']+', retail: (\\d+)(?:, kind: '(\\w+)')?`).exec(CAT);
    assert.ok(m, `"${r.title}" (${r.id}) is not in the Store's catalogue`);
    const retail = Number(m[2]);
    const want = Math.round(retail * (m[3] === 'credit' ? creditRate : rate));
    assert.equal(r.cost, want, `"${r.title}" says ${r.cost} points; the Store charges ${want}`);
    if (/locked: true/.test(CAT.slice(m.index, CAT.indexOf('\n', m.index)))) assert.equal(r.locked, true, `"${r.title}" is tier-locked in the Store`);
  }
});

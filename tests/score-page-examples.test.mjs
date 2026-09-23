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
const S = new Function('React', 'ReactDOM', 'window', 'document', 'location', 'fetch', 'matchMedia', 'IntersectionObserver',
  'mono', 'sans', 'serif', 'INK', 'INK_DEEP', 'PAPER', 'RUST', 'TEAL', 'TEAL_BRIGHT', 'Ph', 'Header', 'Footer',
  code + '\nreturn { ScoreHero, ScoreTiers, ScoreActivity, ScoreLedger, ScoreRewards };')(
  React, ReactDOM, dom.window, dom.window.document, dom.window.location, (...a) => fetchImpl(...a),
  () => ({ matches: false }), class { observe() {} disconnect() {} },
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

test('the ledger is labelled an example until a member\'s own rows load, then the label comes off', async () => {
  fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const out = await render(S.ScoreLedger, { onOpenRecord: () => {} });
  assert.match(out.el.textContent, /example entries/i, 'a visitor sees the demo ledger with nothing saying it is an example');
  await out.close();

  fetchImpl = async (url) => (String(url).includes('/api/client/score')
    ? { ok: true, status: 200, json: async () => ({ recent: [{ category: 'workouts', delta: 10, note: 'Tempo run logged', earned_at: '2026-09-22T15:00:00Z' }] }) }
    : { ok: false, status: 404, json: async () => ({}) });
  const live = await render(S.ScoreLedger, { onOpenRecord: () => {} });
  assert.match(live.el.textContent, /Tempo run logged/, 'the member\'s own row never reached the ledger — this is reading nothing');
  assert.doesNotMatch(live.el.textContent, /example entries/i, 'a member\'s own ledger is still labelled an example');
  await live.close();
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

// tests/dash-intro-hide.test.mjs
//
// Every dashboard page's description can be hidden (owner, 2026-11-11, with the Schedule's: "make these
// descriptions on each dashboard page hideable so the schedule sits higher on page as well as other
// dashboard sections"). DashPage (trainerDashboard.jsx) is mounted for real: Hide folds the description
// away, an ⓘ brings it back, and the choice is remembered per page on this browser, read before the first
// paint. Codex P2 on #2700: a page that becomes another without remounting ("Loading…", then the client's
// name) reads the choice saved for the page it became; the client's page keeps one choice for every client.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require_ = createRequire(import.meta.url);
const ND = (f) => fileURLToPath(new URL('../public/newdesign/' + f, import.meta.url));
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://shape.test/newdesign/TrainerClient.html?id=c1', pretendToBeVisual: true });
const { window } = dom;
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
const React = require_('react');
const { createRoot } = require_('react-dom/client');
const babel = require_('next/dist/compiled/babel/core');
const preset = require_('next/dist/compiled/babel/preset-react');

const SHELL = readFileSync(ND('trainerDashboard.jsx'), 'utf8');
const part = SHELL.slice(SHELL.indexOf('function DashPage('), SHELL.indexOf('// Small helpers available to every inner page'));
const code = babel.transformSync(part, { presets: [preset], babelrc: false, configFile: false }).code;
const DashFrame = ({ children }) => React.createElement('div', { 'data-frame': '' }, children);
const DashPage = new Function('React', 'window', 'DashFrame', 'mono', 'serif', code + ';return DashPage;')(React, window, DashFrame, 'monospace', 'serif');

const $ = (s) => window.document.querySelector(s);
async function mount() {
  const root = createRoot($('#root'));
  const render = (props) => React.act(async () => root.render(React.createElement(DashPage, { navItems: [], ...props }, React.createElement('section', { 'data-content': '' }))));
  return { render, unmount: () => React.act(async () => root.unmount()) };
}
// What showed on each commit, read as the page draws (a hidden description must never show, then go).
function watch() {
  const seen = [];
  const mo = new window.MutationObserver(() => seen.push(!!$('[data-dash-intro]')));
  mo.observe($('#root'), { childList: true, subtree: true });
  return { seen, stop: () => mo.disconnect() };
}

test('Hide folds the description away, the ⓘ brings it back, and the page remembers', async () => {
  window.localStorage.clear();
  const m = await mount();
  await m.render({ title: 'Schedule', subtitle: 'Your week, your hours and your rules.' });
  assert.match($('[data-dash-intro]').textContent, /Your week/);
  assert.ok(!$('[data-dash-intro-show]'));
  await React.act(async () => $('[data-dash-intro-hide]').click());
  assert.ok(!$('[data-dash-intro]'), 'hidden');
  assert.ok($('[data-dash-intro-show]'), 'the ⓘ beside the title');
  assert.ok($('[data-content]'), 'the page itself stays');
  assert.equal(window.localStorage.getItem('shape.dash.intro:/newdesign/TrainerClient.html:Schedule'), 'hidden');
  await m.unmount();
  // The next visit: hidden from the first paint.
  const w = watch();
  const n = await mount();
  await n.render({ title: 'Schedule', subtitle: 'Your week, your hours and your rules.' });
  w.stop();
  assert.ok(w.seen.length > 0 && !w.seen.includes(true), 'never shown, then hidden');
  await React.act(async () => $('[data-dash-intro-show]').click());
  assert.ok($('[data-dash-intro]'), 'shown again');
  assert.equal(window.localStorage.getItem('shape.dash.intro:/newdesign/TrainerClient.html:Schedule'), null);
  await n.unmount();
});

test('a page that becomes another without remounting reads the choice of the page it became', async () => {
  window.localStorage.clear();
  window.localStorage.setItem('shape.dash.intro:/newdesign/TrainerClient.html:client', 'hidden');
  const m = await mount();
  // The client's page draws "Loading…" first, then the client, in the same DashPage.
  await m.render({ title: 'Loading…', subtitle: '' });
  const w = watch();
  await m.render({ title: 'Ana Ruiz', introId: 'client', subtitle: 'Care team of 2' });
  w.stop();
  assert.ok(!w.seen.includes(true), 'the client\'s hidden description never shows');
  assert.ok($('[data-dash-intro-show]'));
  // Another client: the same choice, not one per name.
  await m.render({ title: 'Ben Ode', introId: 'client', subtitle: 'Care team of 1' });
  assert.ok(!$('[data-dash-intro]'));
  // A different page in the same frame keeps its own choice.
  await m.render({ title: 'Couldn\'t load', introId: 'client-unread', subtitle: 'Couldn\'t load this client\'s care team.' });
  assert.ok($('[data-dash-intro]'), 'the warning is its own, so hiding the care team never hides it');
  await m.render({ title: 'Ana Ruiz', introId: 'client', subtitle: 'Care team of 2' });
  assert.ok(!$('[data-dash-intro]'));
  await React.act(async () => $('[data-dash-intro-show]').click());
  assert.equal(window.localStorage.getItem('shape.dash.intro:/newdesign/TrainerClient.html:client'), null);
  await m.unmount();
});

test('the client\'s page keeps one choice for every client, and a failed care-team read its own', () => {
  const src = readFileSync(ND('coachClientDetail.jsx'), 'utf8');
  assert.match(src, /title=\{data\.client\.name\}[\s\S]{0,300}introId=\{careTeamPartial \? "client-unread" : "client"\}/);
});

// Codex P2 on #2700: a title that is data (the score, the week's date) keyed the choice to that data, so
// a nightly score or a new week brought back a description the reader had hidden. Every DashPage on the
// website whose title is not one fixed string passes a stable introId.
test('every DashPage whose title is data passes a stable introId', () => {
  const { parse } = require_('@babel/parser');
  const dir = fileURLToPath(new URL('../public/newdesign/', import.meta.url));
  const sources = [];
  for (const f of readdirSync(dir).filter((x) => /\.(jsx|html)$/.test(x))) {
    const src = readFileSync(dir + f, 'utf8');
    if (!src.includes('<DashPage')) continue;
    if (f.endsWith('.jsx')) sources.push([f, src]);
    else if (f.endsWith('.html')) for (const m of src.matchAll(/<script[^>]*type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g)) if (m[1].includes('<DashPage')) sources.push([f, m[1]]);
  }
  const sites = [];
  const walk = (n, f) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'JSXOpeningElement' && n.name && n.name.name === 'DashPage') {
      const attr = (k) => n.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === k);
      const t = attr('title');
      const v = t && t.value;
      const fixed = !t || (v && v.type === 'StringLiteral') || (v && v.type === 'JSXExpressionContainer' && v.expression.type === 'StringLiteral');
      sites.push({ at: `${f}:${n.loc.start.line}`, fixed, introId: !!attr('introId') });
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue;
      const c = n[k];
      if (Array.isArray(c)) c.forEach((x) => walk(x, f)); else if (c && typeof c === 'object') walk(c, f);
    }
  };
  for (const [f, src] of sources) walk(parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }).program, f);
  assert.ok(sites.length >= 30, `the call sites were found (${sites.length})`);
  const loose = sites.filter((s) => !s.fixed && !s.introId).map((s) => s.at);
  assert.deepEqual(loose, [], 'a DashPage whose title is data, with no introId');
  for (const [f, id] of [['clientScore.jsx', 'introId={unread ? "score-unread" : "score"}'], ['coachGoalScore.jsx', 'introId="score"'], ['dashWeek.jsx', 'introId="week"']]) {
    assert.ok(readFileSync(ND(f), 'utf8').includes(id), f + ' ' + id);
  }
});

// tests/home-score-count.test.mjs
//
// The score line's count up (BSHomeScoreQuote.jsx), MOUNTED with the real React in jsdom: it starts before
// the first paint, so the finished figure never shows and then jumps back to zero (Codex P2 on #2649).
// Reduced motion prints the figure as it is; the count runs once a session.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');
const h = React.createElement;

window.useBS = () => ({ isLight: true, INK: '#0f0e0c', inkRGB: '15,14,12', padX: 16 });
window.bsTierColor = () => '#d8a23a';
// Frames are held: the test reads what the commit left before any frame runs.
const frames = [];
window.requestAnimationFrame = globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
window.cancelAnimationFrame = globalThis.cancelAnimationFrame = () => {};
let reduce = false;
window.matchMedia = () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} });

const TIERS = [{ name: 'Raw', range: '0+' }, { name: 'Tempo', range: '750+' }, { name: 'Form', range: '2,000+' }];
const load = () => loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeScoreQuote.jsx'), { registry: new Map([['react', React]]) });
const mount = async (Q, score) => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(h(Q.BSHomeScoreQuote, { score, tiers: TIERS, signedIn: true, locale: 'en-US', onOpen() {} })); });
  return { total: () => host.querySelector('[data-bs-score-total]').textContent, unmount: () => act(async () => root.unmount()) };
};

test('the count starts at zero before the first paint, and ends on the figure', async () => {
  reduce = false;
  frames.length = 0;
  const Q = await load();
  const m = await mount(Q, { live: true, total: 1284, week: '+36', tier: 'Tempo' });
  // The commit is what paints: by then the figure already reads 0, never 1,284 first.
  assert.equal(m.total(), '0', 'the finished figure painted before the count began');
  assert.equal(frames.length, 1, 'the count did not start');
  // Run the frames to the end: it lands on the figure.
  for (let i = 0; i < 200 && frames.length; i++) { const fn = frames.shift(); fn(performance.now() + 10000); }
  assert.equal(m.total(), '1,284');
  await m.unmount();
  // Once a session: the next mount prints the figure as it is.
  const again = await mount(Q, { live: true, total: 1290, week: '+42', tier: 'Tempo' });
  assert.equal(again.total(), '1,290');
  await again.unmount();
});

test('reduced motion prints the figure as it is', async () => {
  reduce = true;
  frames.length = 0;
  // A fresh copy of the module: a session that has not counted yet.
  const Q = await load();
  const m = await mount(Q, { live: true, total: 1284, week: '+36', tier: 'Tempo' });
  assert.equal(m.total(), '1,284');
  assert.equal(frames.length, 0);
  await m.unmount();
});

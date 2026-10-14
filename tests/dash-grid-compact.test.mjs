import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Owner, 2026-10-14, on a coach Today with a 300px hole under the top row: "not sure why
// the dashboard starts with everything so spaced out. Can these be closer together so I
// dont have to drag to start for all accounts". The grid ran with float:true, so the
// ordered pack ran once on first paint and every later fit only RESIZED: a card that
// rendered tall and then shrank to its live contents left its old height behind as empty
// rows, and a saved layout kept whatever holes it was saved with. float:false lets the
// cards below a shrinking card rise, on every account, saved layout or not.
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const source = readFileSync(new URL('../public/newdesign/dashGrid.jsx', import.meta.url), 'utf8');

test('the dashboard grid is initialised with float:false', () => {
  const raw = source.slice(source.indexOf('window.GridStack.init({'), source.indexOf('}, elRef.current);'));
  assert.ok(raw.length > 0, 'the GridStack.init call is where this test expects it');
  // Options only: the comment above the option names both settings on purpose.
  const init = raw.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.match(init, /\bfloat:\s*false\b/);
  assert.doesNotMatch(init, /\bfloat:\s*true\b/);
});

// The behaviour the setting is for, on the real vendored engine: a half-width pair, then a
// full-width card under it. Both of the pair shrink (the live account whose cards were
// tall while loading); the card below must follow them up.
function packAfterShrink(float) {
  const dom = new JSDOM('<div class="grid-stack"></div>', { url: 'https://shape.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  window.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
  window.eval(readFileSync(new URL('../public/vendor/gridstack/gridstack-all.js', import.meta.url), 'utf8'));
  const grid = window.GridStack.init({ column: 12, cellHeight: 2, margin: 8, float, animate: false }, window.document.querySelector('.grid-stack'));
  const a = grid.addWidget({ id: 'a', x: 0, y: 0, w: 6, h: 300 });
  const b = grid.addWidget({ id: 'b', x: 6, y: 0, w: 6, h: 200 });
  const c = grid.addWidget({ id: 'c', x: 0, y: 300, w: 12, h: 50 });
  grid.update(a, { h: 40 });
  grid.update(b, { h: 80 });
  return c.gridstackNode.y;
}

test('a card under a shrinking pair rises to meet it', () => {
  assert.equal(packAfterShrink(false), 80, 'the full-width card sits under the taller of the shrunk pair');
});

test('…which is exactly what float:true does not do (the defect, kept as the control)', () => {
  assert.equal(packAfterShrink(true), 300, 'with float:true the card stays where the tall pair left it');
});

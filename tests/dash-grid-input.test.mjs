import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/', pretendToBeVisual: true, runScripts: 'outside-only' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
const React = require('react');
const ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
const babel = require('next/dist/compiled/babel/core');
const preset = require('next/dist/compiled/babel/preset-react');
const source = readFileSync(new URL('../public/newdesign/dashGrid.jsx', import.meta.url), 'utf8');
const compiled = babel.transformSync(source, { presets: [preset], configFile: false, babelrc: false }).code;
const queries = new Map();
window.matchMedia = (query) => {
  if (!queries.has(query)) queries.set(query, {
    matches: query.includes('pointer: fine'), listeners: new Set(),
    addEventListener(type, listener) { this.listeners.add(listener); },
    removeEventListener(type, listener) { this.listeners.delete(listener); },
  });
  return queries.get(query);
};
window.ResizeObserver = globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.eval(readFileSync(new URL('../public/vendor/gridstack/gridstack-all.js', import.meta.url), 'utf8'));
const store = { read: () => ({ doc: {}, loaded: true, status: 'saved' }), flush() {}, change() {} };
// Use the real component and GridStack; only account I/O and device media are controlled.
const DashGrid = new Function('React', 'ReactDOM', 'store', compiled + '\nuseDgLayoutStore = () => ({ store }); return DashGrid;')(React, ReactDOM, store);

test('desktop dragging, tablet/hybrid scrolling, Customize, and pointer changes use the live input capabilities', async () => {
  const root = createRoot(document.getElementById('root'));
  const disabled = () => {
    const card = document.querySelector('.grid-stack-item');
    assert.ok(card, 'real GridStack card mounted');
    return card.classList.contains('ui-draggable-disabled');
  };
  const media = async (fine, coarse) => React.act(async () => {
    for (const [query, m] of queries) {
      m.matches = query.includes('pointer: fine') ? fine : coarse;
      for (const listener of m.listeners) listener();
    }
  });
  const customize = () => React.act(async () => document.querySelector('[data-dg-customize]').click());
  try {
    await React.act(async () => {
      root.render(React.createElement(DashGrid, { role: 'trainer', widgets: [{ key: 'one', title: 'One', size: 'half', render: () => React.createElement('p', null, 'Card text') }] }));
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    assert.equal(disabled(), false, 'mouse desktop can drag without Customize');
    await media(false, true);
    assert.equal(disabled(), true, 'wide touch tablet keeps native scrolling');
    assert.match(document.body.textContent, /Customize dashboard to arrange cards/);
    await customize();
    assert.equal(disabled(), false, 'tablet can opt into arranging');
    await customize();
    assert.equal(disabled(), true, 'Done restores native scrolling');
    await media(true, true);
    assert.equal(disabled(), true, 'hybrid device preserves touch scrolling too');
    await media(true, false);
    assert.equal(disabled(), false, 'switching to mouse-only input restores direct dragging');
  } finally {
    await React.act(async () => root.unmount());
  }
  assert.ok([...queries.values()].every(m => m.listeners.size === 0), 'media listeners are removed on unmount');
});

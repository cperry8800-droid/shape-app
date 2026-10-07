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
// ⚠ IN THE WINDOW'S REALM, AS IN A BROWSER. GridStack is evaluated by `window.eval`, and its
// `load()` clones its input through `instanceof Array` — so an array built in Node's realm
// reads as a plain object there and `load` throws. A page has one realm; this harness had
// two, which made `arrange` (keyboard moves) look broken when only the harness was.
const DashGrid = new window.Function('React', 'ReactDOM', 'store', compiled + '\nuseDgLayoutStore = () => ({ store }); return DashGrid;')(React, ReactDOM, store);

// Owner, 2026-10-07: "remove this arrange box and have all of these customization and
// edits done by dragging click etc. a more free feel with the boxes and widgets". So there
// is no edit mode and no Arrange menu: a card moves by dragging, resizes from its right
// edge, hides from its ×, and the ⠿ grip carries the keyboard's version of all of it.
// What a touch screen must keep is its scrolling, and that is now the HANDLE's job: the
// card is a handle only for a mouse; on touch only the grip is.
const items = () => [...document.querySelectorAll('.grid-stack-item')];
const item = (title) => items().find((el) => el.querySelector('.dg-grip')?.getAttribute('aria-label') === 'Move ' + title);
const dragEls = (el) => el.ddElement?.ddDraggable?.dragEls || [];
const settle = () => React.act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
const media = async (fine, coarse) => React.act(async () => {
  for (const [query, m] of queries) {
    m.matches = query.includes('pointer: fine') ? fine : coarse;
    for (const listener of m.listeners) listener();
  }
  await new Promise((resolve) => setTimeout(resolve, 60));
});
const widget = (key, title) => ({ key, title, size: 'half', render: () => React.createElement('p', null, title + ' text') });

test('there is no edit mode: a mouse drags the whole card, a touch screen only the grip', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await media(true, false);
    // The handle is chosen when the grid boots, so the pointer has to be known on the FIRST
    // render: a first frame that guessed "touch" boots a mouse user's grid twice, and the
    // end state is identical, so only counting the boots can tell.
    const init = window.GridStack.init; let boots = 0;
    window.GridStack.init = function (...args) { boots += 1; return init.apply(this, args); };
    try {
      await React.act(async () => {
        root.render(React.createElement(DashGrid, { role: 'trainer', widgets: [widget('one', 'One')] }));
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
    } finally { window.GridStack.init = init; }
    assert.equal(boots, 1, 'a mouse user\'s grid boots once, with the mouse handle');
    assert.ok(!document.querySelector('[data-dg-customize]'), 'the Customize toggle is gone');
    assert.doesNotMatch(document.body.textContent, /Arrange|Customize/, 'nothing still sends the member to a mode or a menu');
    const card = item('One');
    assert.ok(card, 'the card carries its grip from the first frame');
    assert.equal(card.classList.contains('ui-draggable-disabled'), false, 'a mouse can drag without entering a mode');
    assert.equal(card.classList.contains('ui-resizable-disabled'), false, 'and resize from the right edge');
    const grip = card.querySelector('.dg-grip');
    assert.ok(dragEls(card).includes(card.querySelector('.grid-stack-item-content')), 'for a mouse the whole card is a handle');
    assert.ok(dragEls(card).includes(grip), 'and so is the grip');

    await media(false, true);
    const tablet = item('One');
    assert.ok(tablet !== card, 'a pointer change re-boots the grid with the other handle');
    assert.equal(tablet.classList.contains('ui-draggable-disabled'), false, 'a tablet can move cards too, with no mode');
    assert.ok(dragEls(tablet).length === 1 && dragEls(tablet)[0] === tablet.querySelector('.dg-grip'), 'on touch only the grip is a handle, so a swipe on the card scrolls');
    assert.match(document.body.textContent, /Drag ⠿ to move a card/);

    await media(true, true);
    assert.ok(dragEls(item('One')).length === 1 && dragEls(item('One'))[0] === item('One').querySelector('.dg-grip'), 'a hybrid keeps its touch scrolling');
    await media(true, false);
    assert.ok(dragEls(item('One')).includes(item('One').querySelector('.grid-stack-item-content')), 'mouse-only input gets the whole card back');
  } finally {
    await React.act(async () => root.unmount());
  }
  assert.ok([...queries.values()].every(m => m.listeners.size === 0), 'media listeners are removed on unmount');
});

test('× hides a card from the card itself and hands focus to its neighbour', async () => {
  const root = createRoot(document.getElementById('root'));
  try {
    await media(true, false);
    await React.act(async () => {
      root.render(React.createElement(DashGrid, { role: 'trainer', widgets: [widget('one', 'One'), widget('two', 'Two')] }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const x = item('One').querySelector('.dg-chrome .dg-x');
    assert.ok(x, 'the × sits in the card pill');
    assert.equal(x.getAttribute('aria-label'), 'Hide One');
    await React.act(async () => { x.click(); });
    await settle();
    assert.ok(!item('One'), 'the card left the board');
    assert.ok(item('Two'), 'its neighbour stayed');
    assert.ok(document.activeElement === item('Two').querySelector('.dg-grip'), 'focus moved to the neighbour, not to <body>');
    assert.match(document.body.textContent, /\+ One/, 'the hidden-cards bar offers it back');
    assert.match(document.querySelector('.dg-sr-only').textContent, /One hidden/);
  } finally {
    await React.act(async () => root.unmount());
  }
});

test('the grip moves and resizes a card from the keyboard', async () => {
  const root = createRoot(document.getElementById('root'));
  const key = (el, k, shiftKey = false) => React.act(async () => {
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
  });
  const node = (title) => item(title).gridstackNode;
  try {
    await media(true, false);
    await React.act(async () => {
      root.render(React.createElement(DashGrid, { role: 'trainer', widgets: [widget('one', 'One'), widget('two', 'Two')] }));
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    assert.ok(node('One').x < node('Two').x, 'One starts first');
    await key(item('One').querySelector('.dg-grip'), 'ArrowRight');
    assert.ok(node('One').x > node('Two').x, 'an arrow moves it one place along the reading order');
    assert.match(document.querySelector('.dg-sr-only').textContent, /One moved to position 2 of 2/);
    await key(item('One').querySelector('.dg-grip'), 'Home');
    assert.ok(node('One').x < node('Two').x, 'Home sends it to the start');
    const w0 = node('Two').w;
    await key(item('Two').querySelector('.dg-grip'), 'ArrowRight', true);
    assert.ok(node('Two').w > w0, 'Shift + Right widens it to the next size');
    assert.match(document.querySelector('.dg-sr-only').textContent, /Two is now Wide/);
    await key(item('Two').querySelector('.dg-grip'), 'ArrowLeft', true);
    assert.equal(node('Two').w, w0, 'Shift + Left steps it back');
  } finally {
    await React.act(async () => root.unmount());
  }
});

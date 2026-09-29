// Focus for the cook screen and the sheets over it (Copilot, two rounds on #2179).
//
// The rules live in mobile-app/src/services/cookFocus.mjs and are driven here in jsdom:
// focus moves into a dialog when it opens, Tab wraps at its edges and everything beside it is
// inert while it is open, and focus goes back when it closes. The second half mounts the
// SHIPPED hook, shell and sheets from iosAppBroadsheetClient.jsx with real React, so the
// attributes the rules depend on are the ones the screens actually render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadBroadsheet, SRC, THEME } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import {
  bsCkTabbables, bsCkTabKey, bsCkHold, bsCkFocusInto, bsCkFocusOwner, bsCkGiveBack, bsCkModalSync,
} from '../mobile-app/src/services/cookFocus.mjs';

const { useBSCkFocus, bsCkShell, bsCkExitSheet, bsCkStepsSheet } = await loadBroadsheet(
  ['useBSCkFocus', 'bsCkShell', 'bsCkExitSheet', 'bsCkStepsSheet'], React);

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://shape.test/m/' });
const { document: doc } = dom.window;
globalThis.document = doc;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const KeyboardEvent = dom.window.KeyboardEvent;

// A focused window. jsdom answers hasFocus() from its own record of the focused element and drops
// that record when the focused node is removed; a browser keeps focus on the window. Each test says
// which it is.
const windowFocused = (on) => { doc.hasFocus = () => on; };

const tab = (shift = false, target = doc.activeElement || doc.body) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
const reset = (html) => { doc.body.innerHTML = html; windowFocused(true); };
const $ = (sel) => doc.querySelector(sel);

// The app as the cook screen finds it: the phone surface holding the app, and the cook screen
// portalled in beside it.
const SURFACE = `
  <div id="surface">
    <div id="app"><button id="door" data-bsck-door="cook">Cook this</button><a id="tabbar" href="#eat">Eat</a></div>
    <div id="notch"></div>
  </div>`;
const addCook = (parent = $('#surface')) => {
  const root = doc.createElement('div');
  root.className = 'bsck';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.tabIndex = -1;
  root.innerHTML = '<div class="app"><button id="leave">Leave</button><button id="ready">Ready around</button><button id="next">Next</button></div>';
  parent.appendChild(root);
  return root;
};
const addSheet = (root, { initial = false } = {}) => {
  const app = root.querySelector('.app');
  const scrim = doc.createElement('div');
  scrim.setAttribute('data-bsck-scrim', '');
  const sheet = doc.createElement('div');
  sheet.setAttribute('data-bsck-sheet', '');
  sheet.tabIndex = -1;
  sheet.innerHTML = `<button id="stay"${initial ? ' data-bsck-initial=""' : ''}>Keep cooking</button><button id="go">Leave</button>`;
  const toast = doc.createElement('div');
  toast.setAttribute('role', 'status');
  toast.innerHTML = '<button id="dismiss">Dismiss</button>';
  app.append(scrim, sheet, toast);
  return sheet;
};

test('tabbables: what Tab can reach, in document order', () => {
  reset(`<div id="c">
    <button id="a">a</button><button id="b" disabled>b</button><div id="d" tabindex="-1">d</div>
    <div id="e" tabindex="0">e</div><input id="h" type="hidden"><span inert><button id="f">f</button></span>
    <span hidden><a id="g" href="#g">g</a></span><a id="i" href="#i">i</a><a id="j">no href</a></div>`);
  assert.deepEqual(bsCkTabbables($('#c')).map((el) => el.id), ['a', 'e', 'i']);
  assert.deepEqual(bsCkTabbables(null), []);
});

test('holding a dialog makes what is beside it inert, and letting go restores it', () => {
  reset(SURFACE);
  const root = addCook();
  const release = bsCkHold(root);
  assert.equal($('#app').hasAttribute('inert'), true, 'the app under the cook screen');
  assert.equal($('#notch').hasAttribute('inert'), true);
  assert.equal(root.hasAttribute('inert'), false, 'never the dialog itself');
  release();
  release();
  assert.equal($('#app').hasAttribute('inert'), false);
  assert.equal($('#notch').hasAttribute('inert'), false);
});

test('inert is counted: a hand-over keeps the app inert, and inert that was already there stays', () => {
  reset(SURFACE);
  $('#notch').setAttribute('inert', '');
  const dish1 = addCook();
  const r1 = bsCkHold(dish1);
  // The next dish's screen holds the app before the previous one lets go.
  const dish2 = addCook();
  const r2 = bsCkHold(dish2);
  dish1.remove();
  r1();
  assert.equal($('#app').hasAttribute('inert'), true, 'the app must stay inert through the hand-over');
  r2();
  assert.equal($('#app').hasAttribute('inert'), false);
  assert.equal($('#notch').hasAttribute('inert'), true, 'inert set by someone else is left alone');
});

test('a sheet keeps its scrim and the live regions beside it out of the inert background', () => {
  reset(SURFACE);
  const root = addCook();
  const sheet = addSheet(root);
  const release = bsCkHold(sheet, { always: true });
  assert.ok($('#leave').closest('[inert]') != null, 'the cook screen under the sheet');
  assert.equal($('[data-bsck-scrim]').hasAttribute('inert'), false, 'a tap on the scrim still closes the sheet');
  assert.equal($('[role="status"]').hasAttribute('inert'), false, 'a timer that ran out is still announced');
  release();
  assert.ok($('#leave').closest('[inert]') === null, 'the cook screen is live again once the sheet lets go');
});

test('Tab wraps at the edges of the cook screen and comes back when focus was lost', () => {
  reset(SURFACE);
  const root = addCook();
  const release = bsCkHold(root);
  $('#next').focus();
  let e = tab();
  assert.equal(e.defaultPrevented, true);
  assert.equal(doc.activeElement.id, 'leave', 'Tab on the last control goes round to the first');
  e = tab(true);
  assert.equal(doc.activeElement.id, 'next', 'Shift+Tab on the first goes round to the last');
  $('#ready').focus();
  e = tab();
  assert.equal(e.defaultPrevented, false, 'in the middle the browser moves focus itself');
  $('#ready').blur();
  assert.ok(doc.activeElement === doc.body, 'focus is on <body>');
  tab();
  assert.equal(doc.activeElement.id, 'leave', 'from <body>, Tab comes back into the cook screen');
  release();
  $('#next').focus();
  assert.equal(tab().defaultPrevented, false, 'released: nothing is held');
});

test('Tab leaves focus alone in something the app put on top of the cook screen', () => {
  reset(SURFACE);
  const root = addCook();
  const release = bsCkHold(root);
  const prompt = doc.createElement('div');
  prompt.innerHTML = '<button id="ok">OK</button>';
  $('#surface').appendChild(prompt);
  $('#ok').focus();
  assert.equal(tab().defaultPrevented, false);
  assert.equal(doc.activeElement.id, 'ok');
  release();
});

test('the website: a cook screen with nothing under it does not trap Tab in its iframe', () => {
  reset('<div id="surface"></div>');
  const root = addCook();
  const release = bsCkHold(root);
  $('#next').focus();
  const e = tab();
  assert.equal(e.defaultPrevented, false, 'Tab must be free to leave the iframe for the page around it');
  assert.equal(doc.activeElement.id, 'next');
  // A sheet over it still holds Tab: it can always be closed from inside.
  const sheet = addSheet(root);
  const releaseSheet = bsCkHold(sheet, { always: true });
  $('#go').focus();
  assert.equal(tab().defaultPrevented, true);
  assert.equal(doc.activeElement.id, 'stay');
  releaseSheet();
  release();
});

test('Tab inside a sheet wraps within the sheet and never reaches the screen behind it', () => {
  reset(SURFACE);
  const root = addCook();
  const r = bsCkHold(root);
  const sheet = addSheet(root);
  const rs = bsCkHold(sheet, { always: true });
  $('#go').focus();
  tab();
  assert.equal(doc.activeElement.id, 'stay');
  tab(true);
  assert.equal(doc.activeElement.id, 'go');
  $('#leave').focus();   // behind the sheet (jsdom ignores inert for focus)
  tab();
  assert.equal(doc.activeElement.id, 'stay', 'from behind the sheet, Tab comes back into it');
  rs();
  r();
});

test('a tabindex -1 element inside: Tab goes round only when nothing lies ahead', () => {
  reset('<div id="surface"><div id="bg"><button>bg</button></div><div id="c" tabindex="-1"><button id="x">x</button><p id="note" tabindex="-1">note</p></div></div>');
  const release = bsCkHold($('#c'));
  $('#note').focus();
  assert.equal(tab().defaultPrevented, true);
  assert.equal(doc.activeElement.id, 'x', 'nothing after the note: round to the first');
  $('#note').focus();
  assert.equal(tab(true).defaultPrevented, false, 'the button lies before it: the browser moves back');
  release();
  assert.ok(bsCkTabKey({ key: 'Enter' }, $('#c')) === null, 'only Tab is handled');
  assert.ok(bsCkTabKey({ key: 'Tab', ctrlKey: true }, $('#c')) === null, 'Ctrl+Tab belongs to the browser');
});

test('opening moves focus in: to the control the dialog names, else the dialog itself', () => {
  reset(SURFACE);
  const root = addCook();
  $('#door').focus();
  assert.ok(bsCkFocusInto(root) === root, 'focus moved into the cook screen');
  assert.ok(doc.activeElement === root, 'the dialog announces its own label');
  const sheet = addSheet(root, { initial: true });
  assert.equal(bsCkFocusInto(sheet).id, 'stay');
  assert.equal(bsCkFocusInto(sheet).id, 'stay', 'already inside: left where it is');
});

test('opening does not pull focus into a document that does not have it (the website iframe on load)', () => {
  reset('<div id="surface"></div>');
  windowFocused(false);
  const root = addCook();
  assert.ok(bsCkFocusInto(root) === null, 'no focus taken');
  assert.ok(doc.activeElement === doc.body, 'focus is on <body>');
});

test('closing gives focus back: to the opener, else the door standing where it stood', () => {
  reset(SURFACE);
  $('#door').focus();
  const owner = bsCkFocusOwner(doc);
  assert.equal(owner.el.id, 'door');
  assert.equal(owner.door, 'cook');
  // The cook screen replaced the page: the button that opened it is gone, a new one drawn later.
  $('#door').remove();
  assert.ok(doc.activeElement === doc.body, 'focus is on <body>');
  const fresh = doc.createElement('button');
  fresh.setAttribute('data-bsck-door', 'cook');
  $('#app').prepend(fresh);
  assert.ok(bsCkGiveBack(owner, { doc }) === fresh, 'focus went to the new door');
  assert.ok(doc.activeElement === fresh, 'the new door has focus');
  { const o = bsCkFocusOwner(doc); assert.ok(o.el === fresh && o.door === 'cook', 'owner is fresh / cook'); }
  fresh.blur();
  { const o = bsCkFocusOwner(doc); assert.ok(o.el === null && o.door === null, '<body> is not an opener'); }
});

test('closing never steals focus that has somewhere better to be, or lands on something inert', () => {
  reset(SURFACE);
  const owner = { el: $('#door'), door: 'cook' };
  $('#tabbar').focus();
  assert.ok(bsCkGiveBack(owner, { doc }) === null, 'focus already on a live control stays there');
  $('#tabbar').blur();
  $('#app').setAttribute('inert', '');
  assert.ok(bsCkGiveBack(owner, { doc }) === null, 'never into something still inert');
  $('#app').removeAttribute('inert');
  windowFocused(false);
  assert.ok(bsCkGiveBack(owner, { doc }) === null, 'not while the document has no focus');
  windowFocused(true);
  assert.equal(bsCkGiveBack(owner, { doc }).id, 'door');
  assert.ok(bsCkGiveBack({ el: null, door: '"]x' }, { doc }) === null, 'a door name that is not a plain token is never put into a selector');
  assert.ok(bsCkFocusOwner(null).el === null, 'no document, no opener');
});

test('the cook screen across renders: open, a sheet over it, the sheet closed, the node replaced, closed', () => {
  reset(SURFACE);
  const s = { root: null };
  $('#door').focus();
  const first = addCook();
  bsCkModalSync(s, first);
  assert.ok(doc.activeElement === first, 'focus is in the cook screen');
  assert.equal($('#app').hasAttribute('inert'), true);
  // A sheet opens from "Ready around".
  $('#ready').focus();
  const sheet = addSheet(first);
  bsCkModalSync(s, first);
  assert.ok(doc.activeElement === sheet, 'no named control: the sheet itself');
  assert.ok($('#ready').closest('[inert]') != null, 'the cook screen behind the sheet is inert');
  // Escape closes it: the node goes, then the screen re-renders.
  sheet.remove();
  bsCkModalSync(s, first);
  assert.equal(doc.activeElement.id, 'ready', 'back to what opened the sheet');
  assert.ok($('#ready').closest('[inert]') === null, 'the cook screen is live again');
  // A tap on the scrim focuses the cook screen itself on its way to closing the sheet: that is
  // not somewhere better to be, so focus still goes back to the opener.
  $('#ready').focus();
  const scrimmed = addSheet(first);
  bsCkModalSync(s, first);
  first.focus();
  scrimmed.remove();
  bsCkModalSync(s, first);
  assert.equal(doc.activeElement.id, 'ready', 'closed from the scrim: back to what opened it');
  // An opener that is gone: back into the cook screen, never out to <body>.
  $('#leave').focus();
  const sheet2 = addSheet(first, { initial: true });
  bsCkModalSync(s, first);
  assert.equal(doc.activeElement.id, 'stay');
  $('#leave').remove();
  sheet2.remove();
  bsCkModalSync(s, first);
  assert.ok(doc.activeElement === first, 'focus is in the cook screen');
  // The website's second render moves the node; the inert moves with it.
  const elsewhere = doc.createElement('div');
  elsewhere.innerHTML = '<div id="page"></div>';
  doc.body.appendChild(elsewhere);
  first.remove();
  const second = addCook(elsewhere);
  bsCkModalSync(s, second);
  assert.equal($('#app').hasAttribute('inert'), false, 'the old place is let go');
  assert.equal($('#page').hasAttribute('inert'), true, 'the new place is held');
  assert.ok(doc.activeElement === second, 'focus followed the moved cook screen');
  second.remove();
  bsCkModalSync(s, null);
  assert.equal($('#page').hasAttribute('inert'), false);
});

// ── The shipped screens, mounted ──
const tr = (key, o = {}) => String(o.defaultValue || key).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? String(o[k]) : m));
const layout = { cls: 'dev' };
const rows = [{ id: 'a', step: 1, text: 'Chop the onion.', state: 'done', min: 3 }, { id: 'b', step: 2, text: 'Fry it.', state: 'active', current: true, min: 5 }];

const h = React.createElement;
// One cook screen, as BSCookMode draws it: the shipped shell, the shipped sheets, the shipped hook.
function Screen({ onLeave }) {
  const rootRef = React.useRef(null);
  useBSCkFocus(rootRef);
  const [sheet, setSheet] = React.useState(null);
  return bsCkShell({
    t: THEME, rootRef, layout, label: 'Cook mode',
    children: h(React.Fragment, null,
      h('button', { id: 'leave', onClick: () => setSheet('exit') }, 'Leave'),
      h('button', { id: 'ready', onClick: () => setSheet('steps') }, 'Ready around'),
      sheet === 'exit' ? bsCkExitSheet({ tr, message: 'Your place is saved.', onStay: () => setSheet(null), onLeave: () => { setSheet(null); onLeave(); } }) : null,
      sheet === 'steps' ? bsCkStepsSheet({ tr, rows, pct: 40, multi: false, colorOf: () => '#000', leftMin: 5, finishAt: null, elapsed: null, onClose: () => setSheet(null) }) : null),
  });
}
// A prep session: its own screen, which it hands to a dish's screen for the cooking itself.
function Prep({ stage, setStage, onLeave }) {
  const rootRef = React.useRef(null);
  useBSCkFocus(rootRef);
  if (stage === 'cook') return h(Screen, { onLeave });
  return bsCkShell({ t: THEME, rootRef, layout, label: 'Prep session', children: h('button', { id: 'start', onClick: () => setStage('cook') }, 'Start cooking') });
}
// The page it opens from: the app's tab tree, whose page is replaced while cooking.
function Host({ prep = false }) {
  const [open, setOpen] = React.useState(false);
  const [stage, setStage] = React.useState('plan');
  const leave = () => setOpen(false);
  return h('div', { id: 'app-surface' },
    h('div', { id: 'app' },
      open ? null : h('button', { id: 'door', 'data-bsck-door': prep ? 'prep' : 'cook', onClick: () => setOpen(true) }, prep ? 'Prep the week' : 'Cook this'),
      h('a', { id: 'tabbar', href: '#eat' }, 'Eat')),
    open ? (prep ? h(Prep, { stage, setStage, onLeave: leave }) : h(Screen, { onLeave: leave })) : null);
}

const press = async (sel) => {
  const el = $(sel);
  assert.ok(el, `no ${sel}`);
  el.focus();   // a keyboard press: the control has focus when it is activated
  await React.act(async () => el.click());
};
const escape = async (el) => React.act(async () => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
});

test('mounted: Cook opens with focus inside, the sheets hold it, and closing gives it back to the door', async () => {
  reset('<div id="host"></div>');
  const root = createRoot($('#host'));
  await React.act(async () => root.render(h(Host)));
  await press('#door');
  const layer = $('.bsck');
  assert.ok(layer);
  assert.equal(layer.getAttribute('tabindex'), '-1');
  assert.ok(doc.activeElement === layer, 'focus is inside Cook although the button that opened it is gone');
  assert.equal($('#app').hasAttribute('inert'), true, 'the app underneath is inert');
  $('#ready').focus();
  tab();
  assert.equal(doc.activeElement.id, 'leave', 'Tab stays inside Cook');

  // Every step: no named control, so the sheet itself; Escape reaches it at once.
  await press('#ready');
  const steps = $('[data-bsck-sheet]');
  assert.ok(doc.activeElement === steps, 'focus is on the steps sheet');
  assert.ok($('#leave').closest('[inert]') != null, 'the cook screen behind the sheet is inert');
  assert.equal($('[data-bsck-scrim]').hasAttribute('inert'), false);
  await escape(steps);
  assert.ok($('[data-bsck-sheet]') === null, 'Escape closed the sheet');
  assert.equal(doc.activeElement.id, 'ready', 'focus went back to what opened it');
  assert.ok($('#leave').closest('[inert]') === null, 'the cook screen is live again once the sheet lets go');

  // Leave the cook?: its first control is named, and it is where focus lands.
  await press('#leave');
  assert.equal(doc.activeElement.textContent, 'Keep cooking');
  await React.act(async () => doc.activeElement.click());
  assert.equal(doc.activeElement.id, 'leave');

  // Leaving: the page comes back with a new door, and focus goes to it.
  await press('#leave');
  const leaveBtn = [...doc.querySelectorAll('[data-bsck-sheet] button')].find((b) => b.textContent === 'Leave');
  await React.act(async () => leaveBtn.click());
  await React.act(async () => { await Promise.resolve(); });
  assert.ok($('.bsck') === null, 'the cook screen is gone');
  assert.equal($('#app').hasAttribute('inert'), false);
  assert.equal(doc.activeElement.id, 'door', 'focus is back on the door');
  await React.act(async () => root.unmount());
});

test('mounted: a prep session handing its screen to a dish keeps the app inert, and focus returns to its door', async () => {
  reset('<div id="host"></div>');
  const root = createRoot($('#host'));
  await React.act(async () => root.render(h(Host, { prep: true })));
  await press('#door');
  assert.ok(doc.activeElement === $('.bsck'), 'focus is in the prep screen');
  await press('#start');
  const dish = $('.bsck');
  assert.ok($('#start') === null, 'the prep screen gave way to the dish screen');
  assert.equal($('#app').hasAttribute('inert'), true, 'the app stays inert through the hand-over');
  assert.ok(doc.activeElement === dish, 'focus is in the dish screen');
  // Leaving from the dish screen closes the session: both screens go in one commit.
  await press('#leave');
  const leaveBtn = [...doc.querySelectorAll('[data-bsck-sheet] button')].find((b) => b.textContent === 'Leave');
  await React.act(async () => leaveBtn.click());
  await React.act(async () => { await Promise.resolve(); });
  assert.equal($('#app').hasAttribute('inert'), false);
  assert.equal(doc.activeElement.id, 'door', 'focus is back on "Prep the week"');
  await React.act(async () => root.unmount());
});

test('mounted: the website iframe loading a cook screen does not take focus from the page around it', async () => {
  reset('<div id="host"></div>');
  windowFocused(false);
  const root = createRoot($('#host'));
  function Iframe() {
    const rootRef = React.useRef(null);
    useBSCkFocus(rootRef);
    return h('div', { id: 'surface' }, bsCkShell({ t: THEME, rootRef, layout, label: 'Cook mode', children: h('button', { id: 'next' }, 'Next') }));
  }
  await React.act(async () => root.render(h(Iframe)));
  assert.ok(doc.activeElement === doc.body, 'focus is on <body>');
  $('#next').focus();
  assert.equal(tab().defaultPrevented, false, 'nothing under it: Tab is free to leave the iframe');
  await React.act(async () => root.unmount());
});

// ── The wiring, read from the source ──
const CLIENT = stripComments(readFileSync(SRC, 'utf8'));

// The function each `return bsCkShell(` sits in: the nearest declaration above it. A signature can
// hold `() => {}` defaults, so the name is read from `function NAME(` alone, never its parameters.
const enclosing = (src, at) => {
  const decl = [...src.slice(0, at).matchAll(/\nfunction (\w+)\(/g)].pop();
  return decl ? { name: decl[1], at: decl.index } : null;
};
test('every cook screen holds focus: each one that draws the shell calls the hook on its root', () => {
  const sites = [...CLIENT.matchAll(/return bsCkShell\(/g)].map((m) => enclosing(CLIENT, m.index));
  const names = [...new Set(sites.map((x) => x.name))].sort();
  assert.deepEqual(names, ['BSCookMode', 'BSPrepCook', 'BSPrepSession'], 'the screens that draw the cook shell');
  for (const { name, at } of sites) {
    const body = CLIENT.slice(at, CLIENT.indexOf('return bsCkShell(', at));
    assert.match(body, /useBSCkMore\(rootRef\);\s*useBSCkFocus\(rootRef\);/, `${name} must hold focus on its root`);
  }
});

test('the shell, the sheet and its scrim carry what the rules read', () => {
  const shell = CLIENT.slice(CLIENT.indexOf('function bsCkShell('), CLIENT.indexOf('function bsCkTop('));
  assert.match(shell, /role="dialog" aria-modal="true" aria-label=\{label\} tabIndex=\{-1\}/);
  const sheet = CLIENT.slice(CLIENT.indexOf('function bsCkSheet('), CLIENT.indexOf('function bsCkExitSheet('));
  assert.match(sheet, /className="sheet-scrim" data-bsck-scrim=""/);
  assert.match(sheet, /className="sheet" data-bsck-sheet="" role="dialog" aria-modal="true" aria-label=\{title\} tabIndex=\{-1\}/);
  const exit = CLIENT.slice(CLIENT.indexOf('function bsCkExitSheet('), CLIENT.indexOf('function bsCkStepsSheet('));
  assert.doesNotMatch(exit, /autoFocus/, 'autoFocus would move focus before the sheet reads its opener');
  assert.match(exit, /data-bsck-initial=""/);
  assert.match(CLIENT, /\.bsck:focus,\.bsck \.sheet:focus\{outline:none\}/, 'no focus ring round the whole screen');
});

// Every `<button ...>` opening tag in the source, brace-aware: a handler's `=>` holds a `>`.
function buttonTags(src) {
  const out = [];
  let i = src.indexOf('<button');
  while (i >= 0) {
    let depth = 0;
    let quote = null;
    let j = i + 7;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === quote && src[j - 1] !== '\\') quote = null; continue; }
      if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    out.push(src.slice(i, j + 1));
    i = src.indexOf('<button', j);
  }
  return out;
}
test('every door into cooking is tagged, so focus can come back to it', () => {
  const opens = /setCooking\(true\)|openPrep\(|onClick=\{onPrep\}|'shape:cookWith'/;
  const doors = buttonTags(CLIENT).filter((tag) => opens.test(tag));
  assert.equal(doors.length, 6, 'three "Cook this", "Cook with something else", two "Prep the week"');
  for (const tag of doors) assert.match(tag, /data-bsck-door="(?:cook|with|prep)"/, `untagged door: ${tag.slice(0, 120)}`);
  const tokens = doors.map((tag) => tag.match(/data-bsck-door="([a-z-]+)"/)[1]).sort();
  assert.deepEqual(tokens, ['cook', 'cook', 'cook', 'prep', 'prep', 'with']);
});

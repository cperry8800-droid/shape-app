// ── The shared phone drawer is a modal, and a keyboard can use it ────────────
//
// ⚠ THE PORTAL THAT FIXED THE DRAWER'S CLIP BROKE ITS TAB ORDER. `MobileDrawer`
// used to render inside <header>, right after the burger, so the next Tab from
// the burger landed on the drawer's first link. Portaled to the END of <body>
// (so a backdrop-filter on the header can no longer clip it to 72px), it became
// the last thing in tab order: opened from the keyboard, focus stayed on the
// burger and Tab walked every link of the covered page, unseen, before it reached
// the menu (CodeRabbit, on #2158). These drive the SHIPPED component — cut out of
// pageShell.jsx by the parser and compiled, never retyped — so an equivalent
// rewrite passes and a regression fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/Store.html' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require('react');
const ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const act = React.act;

const SHELL = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
const decl = parse(SHELL, { sourceType: 'module', plugins: ['jsx'] }).program.body
  .find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === 'MobileDrawer');
assert.ok(decl, 'pageShell.jsx no longer declares MobileDrawer at the top level — these tests are driving nothing');
const compiled = babel.transformSync(SHELL.slice(decl.start, decl.end), {
  presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script',
}).code;
// Everything the component reads from the shell's scope, stubbed small: two links
// is enough to have a first and a last control either side of the rest.
const MobileDrawer = new Function('React', 'ReactDOM', 'navGroupsFor', 'dashShellHref', 'sans', 'navSans', 'INK', 'TEAL', 'TEAL_BRIGHT',
  compiled + '\nreturn MobileDrawer;')(
  React, ReactDOM,
  () => [{ kind: 'link', label: 'App', href: 'GetApp.html' }, { kind: 'link', label: 'About', href: 'About.html' }],
  (href) => href, 'sans-serif', 'sans-serif', '#f2ede4', '#0ac5a8', '#2ee0c4',
);

// Header's shape: a burger, a page link the drawer covers, and the drawer, with a
// FRESH onClose arrow on every render — exactly what Header passes.
let closes = 0, closedAtTick = null;
function Page({ tick }) {
  const [open, setOpen] = React.useState(false);
  return React.createElement(React.Fragment, null,
    React.createElement('button', { id: 'burger', onClick: () => setOpen(true) }, 'Open menu'),
    React.createElement('a', { id: 'page-link', href: '#covered' }, 'A link on the covered page ' + tick),
    React.createElement(MobileDrawer, { open, onClose: () => { closes++; closedAtTick = tick; setOpen(false); }, active: 'App', authUser: null, onLogout: () => {} }),
  );
}
async function mountPage() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(React.createElement(Page, { tick: 0 })); });
  return {
    rerender: (tick) => act(async () => { root.render(React.createElement(Page, { tick })); }),
    close: () => act(async () => { root.unmount(); el.remove(); }),
  };
}
const $ = (sel) => document.querySelector(sel);
const dialog = () => $('[role="dialog"]');
const controls = () => Array.from(dialog().querySelectorAll('a[href], button:not([disabled])'));
async function openFromKeyboard() {
  $('#burger').focus();
  await act(async () => { $('#burger').click(); });
  assert.ok(dialog(), 'the drawer did not open');
}
// Keys go to whatever holds focus and bubble, the way a real keypress does.
async function press(key, shiftKey = false) {
  const ev = new dom.window.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  await act(async () => { document.activeElement.dispatchEvent(ev); });
  return ev;
}

test('opening the drawer moves focus into it, onto the close button', async () => {
  const page = await mountPage();
  await openFromKeyboard();
  const at = document.activeElement;
  assert.ok(dialog().contains(at), 'focus stayed outside the open drawer (on ' + (at && at.outerHTML.slice(0, 60)) + ')');
  assert.equal(at.getAttribute('aria-label'), 'Close menu', 'focus landed on something other than the close button');
  assert.equal(dialog().getAttribute('aria-label'), 'Menu', 'the dialog has no accessible name');
  await page.close();
});

test('Tab and Shift+Tab wrap at the drawer\'s edges, and a Tab from outside is pulled in', async () => {
  const page = await mountPage();
  await openFromKeyboard();
  const list = controls();
  assert.ok(list.length >= 4, 'the drawer has ' + list.length + ' controls — the fixture is too small to have a middle');
  const first = list[0], last = list[list.length - 1];

  last.focus();
  assert.ok((await press('Tab')).defaultPrevented, 'Tab on the last control was left to the browser — it walks out onto the covered page');
  assert.ok(document.activeElement === first, 'Tab on the last control did not wrap to the first');

  first.focus();
  assert.ok((await press('Tab', true)).defaultPrevented, 'Shift+Tab on the first control was left to the browser');
  assert.ok(document.activeElement === last, 'Shift+Tab on the first control did not wrap to the last');

  // In the middle the browser's own Tab is right, so the handler must stay out of it.
  list[1].focus();
  assert.ok(!(await press('Tab')).defaultPrevented, 'a Tab in the middle of the drawer was intercepted');

  // Something outside grabbed focus (the covered page's own link): the next Tab
  // comes back into the menu rather than continuing down the page.
  $('#page-link').focus();
  assert.ok((await press('Tab')).defaultPrevented, 'a Tab from the covered page was not pulled back into the drawer');
  assert.ok(document.activeElement === first, 'a Tab from the covered page did not land on the drawer\'s first control');
  $('#page-link').focus();
  await press('Tab', true);
  assert.ok(document.activeElement === last, 'a Shift+Tab from the covered page did not land on the drawer\'s last control');
  await page.close();
});

test('Escape closes the drawer and hands focus back to the burger', async () => {
  const page = await mountPage();
  await openFromKeyboard();
  const before = closes;
  const ev = await press('Escape');
  assert.ok(ev.defaultPrevented, 'Escape was not handled');
  assert.equal(closes, before + 1, 'Escape did not call onClose');
  assert.ok(!dialog(), 'the drawer is still open after Escape');
  assert.ok(document.activeElement === $('#burger'), 'focus did not go back to the burger after Escape');
  await page.close();
});

test('closing from the close button also hands focus back to the burger', async () => {
  const page = await mountPage();
  await openFromKeyboard();
  await act(async () => { document.activeElement.click(); });
  assert.ok(!dialog(), 'the close button did not close the drawer');
  assert.ok(document.activeElement === $('#burger'), 'focus did not go back to the burger after the close button');
  await page.close();
});

test('a re-render while open does not yank focus back to the close button', async () => {
  // Header re-renders on its own (auth, inbox, scroll) and hands a NEW onClose
  // every time; the focus effect must be keyed on `open` alone.
  const page = await mountPage();
  await openFromKeyboard();
  const link = controls()[2];
  link.focus();
  await page.rerender(1);
  await page.rerender(2);
  assert.ok(document.activeElement === link, 'a re-render moved focus off the control the reader was on');
  // And the handler it keeps calls the CURRENT onClose, not the first render's:
  // each render's onClose records the render it came from.
  const before = closes;
  await press('Escape');
  assert.equal(closes, before + 1, 'Escape after a re-render did not reach onClose');
  assert.equal(closedAtTick, 2, 'Escape called a stale onClose (from render ' + closedAtTick + ', not the latest)');
  assert.ok(!dialog(), 'Escape after a re-render did not close the drawer');
  await page.close();
});

test('the key handler leaves with the drawer', async () => {
  const page = await mountPage();
  await openFromKeyboard();
  await press('Escape');
  $('#page-link').focus();
  const ev = await press('Tab');
  assert.ok(!ev.defaultPrevented, 'a Tab on the page was still intercepted after the drawer closed');
  assert.ok(document.activeElement === $('#page-link'), 'focus moved on a Tab after the drawer closed');
  const esc = await press('Escape');
  assert.ok(!esc.defaultPrevented, 'Escape on the page was still intercepted after the drawer closed');
  await page.close();
});

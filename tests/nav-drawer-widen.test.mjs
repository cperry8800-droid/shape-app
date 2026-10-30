// The phone drawer closes when the window widens past the collapse width (#2158's open item).
// Widened, the burger hides and the tabs come back; the drawer used to stay open over them with
// the page's scroll locked. The real Header and MobileDrawer, cut out of pageShell.jsx by the
// parser, run in jsdom. jsdom has no media queries, so the test sets the burger's display the
// way the stylesheet would at each width.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import { statement } from './helpers/nav-tables.mjs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/newdesign/Community.html' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const React = require('react');
const ReactDOM = require('react-dom');
const { createRoot } = require('react-dom/client');
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const act = React.act;

const SHELL = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
const body = parse(SHELL, { sourceType: 'module', plugins: ['jsx'] }).program.body;
function fnSource(name) {
  const decl = body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === name);
  assert.ok(decl, 'pageShell.jsx no longer declares ' + name + ' at the top level');
  return SHELL.slice(decl.start, decl.end);
}
const tableSrc = ['COACHES_HREF', 'COACHES_ITEMS', 'REWARDS_HREF', 'STORE_TAB', 'REWARDS_ITEMS', 'SHAPE_NAV_GROUPS', 'SIGNED_OUT_ONLY', 'PORTAL_NAV', 'DASH_SHELL_STUBS']
  .map((n) => statement(SHELL, n)).join('\n');
const fnSrc = ['dashShellRole', 'dashShellHref', 'navGroupsFor', 'NavCaret', 'NavDropdown', 'MobileDrawer', 'Header'].map(fnSource).join('\n');
const compiled = babel.transformSync(tableSrc + '\n' + fnSrc, {
  presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script',
}).code;
const noop = () => null;
const scope = {
  React, ReactDOM,
  shapeReadPortalMe: async () => ({ user: null }), shapePortalSignOutStandalone: noop,
  useDashInboxFeed: noop, useStaffLevel: () => null, ShapeMobileStyles: noop, SiteSearch: noop, DashInbox: noop, RadioWordmark: noop,
  navSans: 'sans-serif', navDisp: 'sans-serif', sans: 'sans-serif', navChamfer: 'none',
  INK: '#f2ede4', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', TEAL_APP: '#34d6c5', RUST: '#c0533b',
  NAV_PILL_H: 30, NAV_H: 72, NAV_LOGO_H: 40,
};
const C = new Function(...Object.keys(scope), compiled + '\nreturn { Header };')(...Object.values(scope));
window.ShapePortalSession = { peek: () => null, clear: noop };

const drawer = () => document.querySelector('[role="dialog"][aria-label="Menu"]');
const resize = () => act(async () => { window.dispatchEvent(new window.Event('resize')); });

test('widened past the collapse width, the open drawer closes and the page scrolls again', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(C.Header, { active: 'Community' })); });
  await act(async () => {});
  const burger = host.querySelector('.shape-nav-burger');
  assert.ok(burger, 'no burger');
  burger.style.display = 'inline-flex'; // a phone: the stylesheet shows the burger
  await act(async () => { burger.click(); });
  assert.ok(drawer(), 'the burger did not open the drawer');
  assert.equal(document.body.style.overflow, 'hidden');

  await resize(); // a resize that keeps the phone layout (a keyboard, a rotation that stays narrow)
  assert.ok(drawer(), 'a resize that keeps the burger closed the drawer');

  burger.style.display = 'none'; // past the collapse width: the stylesheet hides the burger
  await resize();
  assert.equal(drawer(), null, 'the drawer stayed open over the full nav');
  assert.equal(document.body.style.overflow, '', 'the page is still scroll-locked');
  assert.ok(!document.body.classList.contains('shape-drawer-open'));

  // And the listener goes with the drawer: narrowing again and reopening works as before.
  burger.style.display = 'inline-flex';
  await act(async () => { burger.click(); });
  assert.ok(drawer(), 'the drawer would not open again');
  await act(async () => { root.unmount(); });
  host.remove();
});

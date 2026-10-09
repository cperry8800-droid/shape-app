// ── The Store: a Rewards menu item signed out, a tab of its own signed in ────
//
// Owner, 2026-10-09: "theres no shape store tab on website on nav bar, it should
// be a sub tab under rewards and then make it its own tab on nav bar when logged
// into an account". The Store was reachable from the footer alone.
//
// These drive the SHIPPED components (the bar's `Header`, `NavDropdown` and the
// phone drawer `MobileDrawer`), cut out of pageShell.jsx by the parser and
// compiled with the real nav tables and the real `navGroupsFor`, never retyped.
// tests/site-nav.test.mjs keeps the homepage's static bar in step with the same
// tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import { navTables, statement } from './helpers/nav-tables.mjs';

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
const ND = new URL('../public/newdesign/', import.meta.url);
const NAV = navTables(SHELL);
const target = (href) => String(href || '').replace(/^.*\//, '');

const body = parse(SHELL, { sourceType: 'module', plugins: ['jsx'] }).program.body;
function fnSource(name) {
  const decl = body.find((n) => n.type === 'FunctionDeclaration' && n.id && n.id.name === name);
  assert.ok(decl, 'pageShell.jsx no longer declares ' + name + ' at the top level — this test is driving nothing');
  return SHELL.slice(decl.start, decl.end);
}
// The tables, the shell routing that `navGroupsFor` reads, and the three components.
const tableSrc = ['COACHES_HREF', 'COACHES_ITEMS', 'REWARDS_HREF', 'STORE_TAB', 'REWARDS_ITEMS', 'SHAPE_NAV_GROUPS', 'SIGNED_OUT_ONLY', 'PORTAL_NAV', 'DASH_SHELL_STUBS']
  .map((n) => statement(SHELL, n)).join('\n');
const fnSrc = ['dashShellRole', 'dashShellHref', 'navGroupsFor', 'NavDropdown', 'MobileDrawer', 'Header'].map(fnSource).join('\n');
const compiled = babel.transformSync(tableSrc + '\n' + fnSrc, {
  presets: [presetReact], babelrc: false, configFile: false, sourceType: 'script',
}).code;

const noop = () => null;
let session = null; // what ShapePortalSession.peek() and shapeReadPortalMe() answer
const scope = {
  React, ReactDOM,
  shapeReadPortalMe: async () => ({ user: session }), shapePortalSignOutStandalone: noop,
  useDashInboxFeed: noop, ShapeMobileStyles: noop, SiteSearch: noop, DashInbox: noop, RadioWordmark: noop,
  navSans: 'sans-serif', navDisp: 'sans-serif', sans: 'sans-serif', navChamfer: 'none',
  INK: '#f2ede4', TEAL: '#0ac5a8', TEAL_BRIGHT: '#2ee0c4', TEAL_APP: '#34d6c5', RUST: '#c0533b',
  NAV_PILL_H: 30, NAV_H: 72, NAV_LOGO_H: 40,
};
const C = new Function(...Object.keys(scope), compiled + '\nreturn { Header, NavDropdown, MobileDrawer, navGroupsFor };')(...Object.values(scope));
window.ShapePortalSession = { peek: () => (session ? { user: session } : null), clear: noop };

const MEMBER = { id: 'm', email: 'm@shape.test', firstName: 'Chris', role: 'client', roles: ['client'] };

async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(el); });
  return { host, unmount: () => act(async () => { root.unmount(); host.remove(); }) };
}
const text = (a) => a.childNodes[0].textContent.trim();

// ── the tables ───────────────────────────────────────────────────────────────
test('signed out, Rewards is a menu whose one item is the Shape Store', () => {
  const rewards = NAV.SHAPE_NAV_GROUPS.filter((g) => g.label === 'Rewards');
  assert.equal(rewards.length, 1, 'the signed-out row has ' + rewards.length + ' Rewards tabs');
  const [r] = rewards;
  assert.equal(r.kind, 'drop', 'Rewards is not a menu on the signed-out row, so the Store has no place on it');
  assert.equal(target(r.href), 'Score.html', 'the Rewards trigger no longer opens the Rewards page');
  assert.deepEqual(r.items.map(([n, h]) => [n, target(h)]), [['Shape Store', 'Store.html']]);
  assert.ok(existsSync(new URL('Store.html', ND)), 'the menu points at Store.html, which is not in public/newdesign');
  // The Store is not ALSO a tab signed out: one destination, offered once.
  assert.ok(!NAV.SHAPE_NAV_GROUPS.some((g) => target(g.href) === 'Store.html'), 'the Store is a signed-out tab as well as a Rewards menu item');
});

test('signed in, the Store is its own tab beside a plain Rewards link', () => {
  const labels = NAV.PORTAL_NAV.map((g) => g.label);
  const at = labels.indexOf('Rewards');
  assert.notEqual(at, -1, 'Rewards left the signed-in row');
  assert.equal(labels[at + 1], 'Store', 'the Store tab does not sit right after Rewards: ' + labels.join(' · '));
  const rewards = NAV.PORTAL_NAV[at], store = NAV.PORTAL_NAV[at + 1];
  assert.equal(store.kind, 'link');
  assert.equal(target(store.href), 'Store.html');
  // ⚠ A MENU HOLDING ONLY THE TAB BESIDE IT offers one page twice on one row.
  assert.equal(rewards.kind, 'link', 'signed in, Rewards is still a menu, so the Store is offered twice on one row');
  assert.equal(target(rewards.href), 'Score.html');
  const storeTargets = NAV.PORTAL_NAV.flatMap((g) => [g.href, ...(g.items || []).map(([, h]) => h)]).filter((h) => target(h) === 'Store.html');
  assert.equal(storeTargets.length, 1, 'the signed-in row offers the Store ' + storeTargets.length + ' times');
});

// ── the bar ─────────────────────────────────────────────────────────────────
async function bar(user) {
  session = user;
  const m = await mount(React.createElement(C.Header, { active: 'Store' }));
  await act(async () => {}); // shapeReadPortalMe resolves
  const tabs = m.host.querySelector('nav.shape-nav-tabs');
  assert.ok(tabs, 'the header rendered no .shape-nav-tabs row');
  const row = [...tabs.children].map((el) => el.querySelector('a'));
  return { m, tabs, row };
}

test('signed out, the bar\'s Rewards trigger opens Rewards and its menu opens the Store', async () => {
  const { m, row } = await bar(null);
  try {
    const rewards = row.find((a) => text(a) === 'Rewards');
    assert.ok(rewards, 'the signed-out bar has no Rewards tab: ' + row.map(text).join(' · '));
    assert.equal(target(rewards.getAttribute('href')), 'Score.html');
    assert.ok(rewards.textContent.includes('▾'), 'the Rewards tab shows no menu caret');
    assert.ok(!row.some((a) => text(a) === 'Store'), 'the Store is a signed-out tab as well as a menu item');
    // On the Store page the Rewards menu is the lit tab.
    assert.equal(rewards.style.textDecoration, 'underline', 'the Rewards menu does not light on the Store page');
    await act(async () => { rewards.parentElement.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })); });
    const item = [...rewards.parentElement.querySelectorAll('a')].find((a) => a !== rewards);
    assert.ok(item, 'hovering Rewards opened no menu');
    assert.equal(item.textContent, 'Shape Store');
    assert.equal(target(item.getAttribute('href')), 'Store.html');
  } finally { await m.unmount(); }
});

test('signed in, the bar carries Store as a tab and Rewards without a menu', async () => {
  const { m, row } = await bar(MEMBER);
  try {
    assert.deepEqual(row.map(text), NAV.PORTAL_NAV.map((g) => g.label), 'the signed-in bar is not PORTAL_NAV');
    const rewards = row.find((a) => text(a) === 'Rewards');
    const store = row.find((a) => text(a) === 'Store');
    assert.ok(!rewards.textContent.includes('▾'), 'signed in, Rewards still shows a menu caret');
    assert.equal(target(store.getAttribute('href')), 'Store.html');
    assert.equal(store.style.textDecoration, 'underline', 'the Store tab does not light on its own page');
    assert.equal(rewards.style.textDecoration, 'none', 'Rewards lights on the Store page while the Store has its own tab');
  } finally { await m.unmount(); session = null; }
});

// ── the phone drawer ────────────────────────────────────────────────────────
async function drawer(user, active) {
  const m = await mount(React.createElement(C.MobileDrawer, { open: true, onClose: noop, active, authUser: user, onLogout: noop }));
  const links = [...document.querySelectorAll('[role="dialog"] nav a')].map((a) => [a.textContent.trim(), target(a.getAttribute('href'))]);
  return { m, links };
}

test('signed out, the drawer offers Rewards as a link with the Shape Store under it', async () => {
  const { m, links } = await drawer(null, 'Store');
  try {
    const at = links.findIndex(([n]) => n === 'Rewards');
    assert.notEqual(at, -1, 'the drawer offers no Rewards link, so a phone cannot reach the page: ' + links.map(([n]) => n).join(' · '));
    assert.equal(links[at][1], 'Score.html');
    assert.deepEqual(links[at + 1], ['Shape Store', 'Store.html'], 'the Shape Store is not under Rewards in the drawer');
    // ⚠ A MENU'S TAB IS A PAGE: Coaches was a <div> here, so a phone reached
    // Coaches.html only from the homepage drawer.
    assert.ok(links.some(([n, h]) => n === 'Coaches' && h === 'Coaches.html'), 'the drawer\'s Coaches is not a link to its page');
    assert.ok(!links.some(([n]) => n === 'Store'), 'the drawer offers a Store tab signed out');
  } finally { await m.unmount(); }
});

test('signed in, the drawer offers Store as its own link and no Shape Store item', async () => {
  const { m, links } = await drawer(MEMBER, 'Store');
  try {
    const names = links.map(([n]) => n);
    const at = names.indexOf('Rewards');
    assert.notEqual(at, -1, 'the signed-in drawer has no Rewards');
    assert.deepEqual(links[at + 1], ['Store', 'Store.html'], 'the Store is not its own link right after Rewards: ' + names.join(' · '));
    assert.ok(!names.includes('Shape Store'), 'the signed-in drawer still carries the menu item beside the tab');
  } finally { await m.unmount(); }
});

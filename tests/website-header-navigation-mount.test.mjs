import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from '@babel/core';
import presetReact from '@babel/preset-react';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

const shell = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
const header = shell.slice(shell.indexOf('function Header({ active })'), shell.indexOf('function HeroBg()'));
assert.ok(header.includes('async function switchRole('));
const { code } = transformSync(header, { presets: [[presetReact, { runtime: "classic" }]], babelrc: false, configFile: false });

test('account controls survive remount; first pointer click opens switcher; failed switches retry and successful ones stay locked', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test/newdesign/TrainerApp.html' });
  const oldWindow = globalThis.window, oldDocument = globalThis.document, oldAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let root;
  try {
    const user = { id: 'member-a', firstName: 'Member', role: 'trainer', roles: ['client', 'trainer', 'nutritionist'] };
    let finish, calls = 0, clears = 0;
    const alerts = [];
    const win = { ShapePortalSession: { peek: () => ({ user }), clear: () => { clears++; } }, location: { href: '' } };
    const noop = () => null;
    const context = {
      React, window: win, shapeReadPortalMe: async () => ({ user }), shapePortalSignOutStandalone: noop,
      useDashInboxFeed: noop, dashShellHref: () => '#today', navGroupsFor: () => [],
      ShapeMobileStyles: noop, NavDropdown: noop, SiteSearch: noop, DashInbox: noop, RadioWordmark: noop, MobileDrawer: noop,
      navSans: 'sans-serif', navDisp: 'sans-serif', sans: 'sans-serif', navChamfer: 'none',
      INK: '#111', TEAL: '#099', TEAL_BRIGHT: '#0bb', TEAL_APP: '#0aa', RUST: '#800',
      NAV_PILL_H: 30, NAV_H: 72, NAV_LOGO_H: 40,
      alert: text => alerts.push(text),
      fetch: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    };
    const Header = new Function(...Object.keys(context), code + '\nreturn Header;')(...Object.values(context));
    const host = document.getElementById('root');
    root = createRoot(host);
    const buttons = () => [...host.querySelectorAll('button')];
    const pill = () => host.querySelector('button[aria-expanded]');
    const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await act(() => root.render(React.createElement(Header)));
    assert.ok(host.textContent.includes('Hi, Member'));
    assert.equal(host.textContent.includes('Log in'), false);
    // Changing tabs remounts Header. Its first render must already know this account.
    await act(() => root.render(React.createElement(Header, { key: 'next-tab' })));
    assert.equal(host.textContent.includes('Log in'), false);
    await act(() => {
      pill().dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
      click(pill());
    });
    assert.equal(pill().getAttribute('aria-expanded'), 'true', 'hover must not make the first click close the menu');
    await act(() => click(buttons().find(b => b.textContent === 'Client')));
    assert.equal(calls, 1);
    assert.equal(pill().disabled, true);
    assert.ok(pill().textContent.includes('Switching'));
    await act(() => click(pill()));
    assert.equal(calls, 1);
    await act(async () => finish({ ok: false, json: async () => ({ error: 'Please retry' }) }));
    assert.deepEqual(alerts, ['Please retry']);
    assert.equal(pill().disabled, false);
    await act(() => click(pill()));
    await act(() => click(buttons().find(b => b.textContent === 'Client')));
    await act(async () => finish({ ok: true, json: async () => ({ dashboard: '/newdesign/ClientApp.html' }) }));
    assert.equal(win.location.href, '/newdesign/ClientApp.html');
    assert.equal(clears, 1);
    assert.equal(calls, 2);
    assert.equal(pill().disabled, true, 'stay locked during the document navigation');
  } finally {
    if (root) await act(() => root.unmount());
    dom.window.close();
    globalThis.window = oldWindow; globalThis.document = oldDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = oldAct;
  }
});

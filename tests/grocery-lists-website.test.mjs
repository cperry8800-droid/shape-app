// tests/grocery-lists-website.test.mjs
//
// The website's grocery page (public/newdesign/ClientGrocery.html) syncing the member's lists through the
// shared store in groceryLists.mjs: its real page script, compiled as the deploy build compiles it and run
// in jsdom with the repo's React, against a cloud row that does the backend's compare-and-set.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { transformSync } from '@babel/core';
import { ROOT } from './helpers/broadsheet-mount.mjs';
import * as GL from '../public/newdesign/groceryLists.mjs';

const HTML = readFileSync(join(ROOT, 'public/newdesign/ClientGrocery.html'), 'utf8');
const OPEN = '<script type="text/babel">\n';
const start = HTML.indexOf(OPEN) + OPEN.length;
const end = HTML.indexOf('ReactDOM.createRoot(document.getElementById("root"))');
assert.ok(start > OPEN.length && end > start, 'the page script moved: re-point this test');
const CODE = transformSync(`${HTML.slice(start, end)}\nwindow.__GroceryPage = ClientGroceryPage;\n`, {
  presets: [['@babel/preset-react', { runtime: 'classic' }]], babelrc: false, configFile: false,
}).code;

const clone = (v) => JSON.parse(JSON.stringify(v));
const ids = (lists) => lists.map((l) => l.id);
const STORE_KEY = 'shape.grocery.lists.v1';

async function mountPage({ row, stored, onWrite }) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'outside-only', url: 'https://theshapecommunity.com/newdesign/ClientGrocery.html' });
  const w = dom.window;
  const cloud = { row, writes: [], conflicts: 0 };
  w.React = React;
  for (const name of ['DashPage', 'Card', 'SectionTitle', 'PickRow', 'InstacartSendCard']) {
    w[name] = ({ children }) => React.createElement('div', null, children);
  }
  w.clientNavItems = () => [];
  w.clientPayoutCard = null;
  // pageShell.jsx's shared style constants.
  for (const name of ['PAPER', 'INK', 'INK_DEEP', 'TEAL', 'TEAL_BRIGHT', 'TEAL_APP', 'RUST', 'serif', 'sans', 'mono']) w[name] = 'inherit';
  w.fetch = async () => ({ ok: false });
  w.ShapeGroceryListsLib = GL;
  w.shapeDb = {
    getUser: async () => ({ id: 'u1' }),
    getUserGoals: async () => (cloud.row == null ? {} : clone(cloud.row)),
    saveUserGoalsIfRev: async (kind, data, expectedRev, expectedUid) => {
      assert.equal(kind, 'client_grocery_lists');
      assert.equal(expectedUid, 'u1');
      if (onWrite) onWrite(cloud);
      const rev = cloud.row && !Array.isArray(cloud.row) && cloud.row.rev != null ? String(cloud.row.rev) : null;
      if (rev !== (expectedRev == null ? null : String(expectedRev))) { cloud.conflicts += 1; return { conflict: true }; }
      cloud.writes.push(clone(data));
      cloud.row = clone(data);
      return { ok: true };
    },
  };
  if (stored) w.localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  w.eval(CODE);
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const root = ReactDOMClient.createRoot(w.document.getElementById('root'));
  await React.act(async () => { root.render(React.createElement(w.__GroceryPage)); });
  const settle = async () => { for (let i = 0; i < 6; i += 1) await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
  await settle();
  return {
    w, cloud, settle,
    local: () => JSON.parse(w.localStorage.getItem(STORE_KEY)),
    done: async () => { await React.act(async () => { root.unmount(); }); Object.assign(globalThis, saved); },
  };
}

// A list the app saved from a chat: received, credited, with aisles the website doesn't show.
const RECEIVED = {
  id: 'received-m1', name: 'Week 3 shop', kind: 'custom', editable: true, provenance: 'received', createdAt: 1700000000000,
  author: 'Sam Reyes', authorSelf: false, note: '', usedCount: 2, preview: 'Spinach · Eggs', count: 2,
  items: [{ id: 'a', n: 'Spinach', q: '2 bags', a: 'Produce' }, { id: 'b', n: 'Eggs', q: '12', a: 'Protein' }],
  aisles: [{ aisle: 'Produce', items: [{ id: 'a', n: 'Spinach', q: '2 bags', a: 'Produce' }] }, { aisle: 'Protein', items: [{ id: 'b', n: 'Eggs', q: '12', a: 'Protein' }] }],
};
const WEB = { id: 'default', name: 'My groceries', items: [{ id: 'g1', item: 'Avocados', qty: '4', category: 'produce', checked: false }] };
// The same list as the page stored it (webToSynced).
const WEB_STORED = {
  id: 'default', name: 'My groceries', kind: 'custom', editable: true, eyebrow: 'Custom · Synced', usedCount: 0, count: 1, preview: 'Avocados',
  items: [{ id: 'g1', n: 'Avocados', q: '4', meals: 'My groceries' }], aisles: [{ aisle: 'Items', items: [{ id: 'g1', n: 'Avocados', q: '4', meals: 'My groceries' }] }],
};

test('on load the page takes the app\'s lists and sends its own, compare-and-set, leaving the app\'s as stored', async () => {
  const page = await mountPage({ row: { v: 1, rev: 3, lists: [RECEIVED] }, stored: [WEB] });
  try {
    assert.equal(page.cloud.writes.length, 1);
    assert.equal(page.cloud.row.rev, 4);
    assert.deepEqual(ids(page.cloud.row.lists), ['default', 'received-m1']);
    assert.deepEqual(page.cloud.row.lists[1], RECEIVED, "the app's list goes back exactly as stored, not through the page's conversion");
    assert.deepEqual(ids(page.local()), ['default', 'received-m1'], 'and the page has it');
    assert.equal(JSON.parse(page.w.localStorage.getItem('shape.grocery.listsBase.v1')).uid, 'u1', 'its base kept for this account');
  } finally { await page.done(); }
});

test('an edit here and a list added on the phone at the same moment both survive', async () => {
  const page = await mountPage({
    row: { v: 1, rev: 1, lists: [RECEIVED] },
    stored: [WEB],
    onWrite: (cloud) => {
      // The phone writes between this page's read and its write, once the page has synced on load.
      if (cloud.writes.length === 1 && !cloud.phone) {
        cloud.phone = true;
        cloud.row = { v: 1, rev: cloud.row.rev + 1, lists: [{ id: 'phone', name: 'Phone list', items: [] }, ...cloud.row.lists] };
      }
    },
  });
  try {
    page.w.prompt = () => 'Costco trip';
    const btn = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent === '+ NEW LIST');
    assert.ok(btn, 'the New list button');
    await React.act(async () => { btn.click(); });
    await page.settle();
    assert.equal(page.cloud.conflicts, 1, 'the race really happened');
    const names = page.cloud.row.lists.map((l) => l.name);
    assert.deepEqual(names, ['Costco trip', 'Phone list', 'My groceries', 'Week 3 shop'], "the phone's list and this page's both in the cloud");
    assert.deepEqual(page.cloud.row.lists[3], RECEIVED);
    assert.ok(page.local().some((l) => l.id === 'phone'), "and the page took the phone's list");
  } finally { await page.done(); }
});

test('ticking items off writes nothing; a list deleted on the phone leaves the page', async () => {
  const page = await mountPage({ row: { v: 1, rev: 1, lists: [RECEIVED, WEB_STORED] }, stored: [WEB] });
  try {
    assert.equal(page.cloud.writes.length, 0, 'in step on load: nothing to write');
    // Tick an item: the page's lists change, the stored ones don't.
    const box = page.w.document.querySelector('button[aria-label="Check"]');
    assert.ok(box, 'an item to tick');
    await React.act(async () => { box.click(); });
    await page.settle();
    assert.equal(page.local().find((l) => l.id === 'default').items[0].checked, true, 'ticked on the page');
    assert.equal(page.cloud.writes.length, 0, 'ticks are not an edit');
    // The phone deletes the received list; the page's next sync takes the delete.
    page.cloud.row = { v: 1, rev: page.cloud.row.rev + 1, lists: page.cloud.row.lists.filter((l) => l.id !== 'received-m1') };
    page.w.prompt = () => 'Another';
    const btn = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent === '+ NEW LIST');
    await React.act(async () => { btn.click(); });
    await page.settle();
    assert.deepEqual(ids(page.cloud.row.lists).filter((id) => !id.startsWith('list-')), ['default']);
    assert.ok(!page.local().some((l) => l.id === 'received-m1'), 'gone from the page too');
  } finally { await page.done(); }
});

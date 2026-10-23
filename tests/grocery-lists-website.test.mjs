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

// ⚠ react-dom is loaded AFTER a window exists: it decides at load whether it runs in a DOM, and loaded
// first it never attaches its input handling, so typing into a field reaches nothing (broadsheet-builder-
// render.test.mjs records the same trap).
const BOOT = new JSDOM('<!doctype html>');
globalThis.window = BOOT.window;
globalThis.document = BOOT.window.document;
const ReactDOMClient = await import('react-dom/client');

const clone = (v) => JSON.parse(JSON.stringify(v));
const ids = (lists) => lists.map((l) => l.id);
const STORE_KEY = 'shape.grocery.lists.v1';

async function mountPage({ row, stored, onWrite, before }) {
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
      if (cloud.gate) await cloud.gate; // a write held in flight
      if (onWrite) onWrite(cloud);
      const rev = cloud.row && !Array.isArray(cloud.row) && cloud.row.rev != null ? String(cloud.row.rev) : null;
      if (rev !== (expectedRev == null ? null : String(expectedRev))) { cloud.conflicts += 1; return { conflict: true }; }
      cloud.writes.push(clone(data));
      cloud.row = clone(data);
      return { ok: true };
    },
  };
  if (stored) w.localStorage.setItem(STORE_KEY, JSON.stringify(stored));
  if (before) before(w);
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

test('another device\'s list taken in while a sync is queued is never read as deleted here (Codex P1 on #2433)', async () => {
  const page = await mountPage({ row: { v: 1, rev: 1, lists: [WEB_STORED] }, stored: [WEB] });
  try {
    assert.equal(page.cloud.writes.length, 0);
    // The phone adds a list.
    page.cloud.row = { v: 1, rev: 2, lists: [{ id: 'phone', name: 'Phone list', items: [] }, WEB_STORED] };
    const newList = async (name) => {
      page.w.prompt = () => name;
      const btn = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent === '+ NEW LIST');
      await React.act(async () => { btn.click(); });
    };
    // A new list here: its sync reads the phone's list, merges, and its write is held in flight.
    let release;
    page.cloud.gate = new Promise((r) => { release = r; });
    await newList('First');
    // A second edit while that write is in flight: its sync queues behind it.
    try { await newList('Second'); } catch (e) { page.cloud.gate = null; release(); throw e; }
    // The write lands. The first sync takes the phone's list in, and the queued sync runs straight after,
    // before React has rendered it.
    page.cloud.gate = null;
    await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    await page.settle();
    // ⚠ EVERY write, not only the last: the page's next sync would put a dropped list back, but in between
    // the cloud says it was deleted, and another device syncing then deletes its own copy.
    for (const w of page.cloud.writes) {
      const names = w.lists.map((l) => l.name);
      assert.ok(names.includes('Phone list'), `no write leaves the phone's list out: rev ${w.rev} has ${names.join(', ')}`);
    }
    const names = page.cloud.row.lists.map((l) => l.name);
    assert.ok(names.includes('First') && names.includes('Second'));
    assert.ok(page.local().some((l) => l.id === 'phone'), 'and on the page');
  } finally { await page.done(); }
});

test('an edit from the phone keeps the items ticked off on the page (Codex P2 on #2433)', async () => {
  const page = await mountPage({ row: { v: 1, rev: 1, lists: [WEB_STORED] }, stored: [WEB] });
  try {
    const box = page.w.document.querySelector('button[aria-label="Check"]');
    await React.act(async () => { box.click(); });
    await page.settle();
    // The phone renames the list and adds an item.
    const edited = { ...WEB_STORED, name: 'Saturday shop', items: [...WEB_STORED.items, { id: 'g2', n: 'Limes', q: '6' }] };
    page.cloud.row = { v: 1, rev: 2, lists: [edited] };
    // Any change here syncs.
    page.w.prompt = () => 'Another';
    const btn = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent === '+ NEW LIST');
    await React.act(async () => { btn.click(); });
    await page.settle();
    const mine = page.local().find((l) => l.id === 'default');
    assert.equal(mine.name, 'Saturday shop', "the phone's edit came in");
    assert.deepEqual(mine.items.map((it) => [it.item, it.checked]), [['Avocados', true], ['Limes', false]], 'the tick kept, by item');
  } finally { await page.done(); }
});

test('a tick while a write is in flight doesn\'t turn another device\'s edit back (Codex P1 on #2433, second round)', async () => {
  const page = await mountPage({ row: { v: 1, rev: 1, lists: [WEB_STORED] }, stored: [WEB] });
  try {
    // The phone renames the list.
    page.cloud.row = { v: 1, rev: 2, lists: [{ ...WEB_STORED, name: 'Saturday shop' }] };
    // A new list here: its sync reads the rename (this page hasn't touched that list) and its write is held.
    let release = () => {};
    page.cloud.gate = new Promise((r) => { release = r; });
    try {
      page.w.prompt = () => 'First';
      const add = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent === '+ NEW LIST');
      await React.act(async () => { add.click(); });
      // While it is in flight, back on the renamed list, an item is ticked off here.
      const buttons = () => [...page.w.document.querySelectorAll('button')];
      await React.act(async () => { buttons().find((b) => b.textContent.endsWith('▼')).click(); });
      await React.act(async () => { buttons().find((b) => b.textContent.startsWith('My groceries')).click(); });
      const box = page.w.document.querySelector('button[aria-label="Check"]');
      assert.ok(box, 'an item to tick');
      await React.act(async () => { box.click(); });
    } finally {
      page.cloud.gate = null;
      await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    }
    await page.settle();
    for (const w of page.cloud.writes) {
      const mine = w.lists.find((l) => l.id === 'default');
      assert.equal(mine.name, 'Saturday shop', `no write turns the phone's rename back (rev ${w.rev})`);
    }
    const mine = page.local().find((l) => l.id === 'default');
    assert.equal(mine.name, 'Saturday shop', 'the page took the rename');
    assert.equal(mine.items[0].checked, true, 'and kept the tick');
  } finally { await page.done(); }
});

test('with storage denied the page still takes the cloud\'s lists, and a list deleted here stays deleted (Codex P2 on #2433)', async () => {
  // Deny storage in the page's own window: every read and write throws.
  const page = await mountPage({
    row: { v: 1, rev: 1, lists: [RECEIVED] },
    before: (w) => {
      w.Storage.prototype.getItem = () => { throw new Error('SecurityError'); };
      w.Storage.prototype.setItem = () => { throw new Error('SecurityError'); };
    },
  });
  try {
    // On load: the demo list here and the received list from the cloud, in one write.
    assert.deepEqual(page.cloud.writes.map((w) => ids(w.lists)), [['default', 'received-m1']]);
    // The page took the received list: two lists, so the first can be deleted.
    page.w.confirm = () => true;
    page.w.alert = (m) => { throw new Error(`alerted: ${m}`); };
    const del = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent === 'DELETE LIST');
    assert.ok(del, 'a list to delete');
    await React.act(async () => { del.click(); });
    await page.settle();
    assert.deepEqual(ids(page.cloud.row.lists), ['received-m1'], 'deleted from the cloud, not brought back');
    // And it stays deleted at the next sync.
    page.w.prompt = () => 'Another';
    const add = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent === '+ NEW LIST');
    await React.act(async () => { add.click(); });
    await page.settle();
    assert.ok(!ids(page.cloud.row.lists).includes('default'));
    assert.equal(page.cloud.row.lists.length, 2);
  } finally { await page.done(); }
});

test('the open list deleted on the phone: the page opens one that\'s left, and an edit goes there (Codex P2 on #2433)', async () => {
  const SECOND = { id: 'w2', name: 'Second', items: [] };
  const SECOND_STORED = { id: 'w2', name: 'Second', kind: 'custom', editable: true, eyebrow: 'Custom · Synced', usedCount: 0, count: 0, preview: '', items: [], aisles: [{ aisle: 'Items', items: [] }] };
  const page = await mountPage({ row: { v: 1, rev: 1, lists: [WEB_STORED, SECOND_STORED] }, stored: [WEB, SECOND] });
  try {
    assert.equal(page.cloud.writes.length, 0, 'in step on load');
    // The phone deletes the open list (the page opens its first, My groceries).
    page.cloud.row = { v: 1, rev: 2, lists: [SECOND_STORED] };
    // A tick here syncs, and takes the delete in.
    const box = page.w.document.querySelector('button[aria-label="Check"]');
    await React.act(async () => { box.click(); });
    await page.settle();
    assert.deepEqual(ids(page.local()), ['w2'], 'gone from the page');
    assert.equal(page.w.localStorage.getItem('shape.grocery.activeListId.v1'), 'w2', 'the list that is left is open');
    // An item added now goes to it.
    const input = page.w.document.querySelector('input[placeholder="e.g. Almond butter"]');
    assert.ok(input, 'the add-item field');
    const setValue = Object.getOwnPropertyDescriptor(page.w.HTMLInputElement.prototype, 'value').set;
    await React.act(async () => { setValue.call(input, 'Limes'); input.dispatchEvent(new page.w.Event('input', { bubbles: true })); });
    const add = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent.trim() === '+ Add');
    assert.equal(add.disabled, false, 'the field took the name');
    await React.act(async () => { add.click(); });
    await page.settle();
    assert.deepEqual(page.local().find((l) => l.id === 'w2').items.map((it) => it.item), ['Limes']);
    assert.deepEqual(page.cloud.row.lists.find((l) => l.id === 'w2').items.map((it) => it.n), ['Limes'], 'and to the cloud');
  } finally { await page.done(); }
});

test('a sync that lands after a sign-out began puts nothing back on the device (Codex P1 on #2433)', async () => {
  const page = await mountPage({ row: { v: 1, rev: 1, lists: [WEB_STORED] }, stored: [WEB] });
  try {
    page.w.shapeDb.signOutGen = 0;
    const baseBefore = page.w.localStorage.getItem('shape.grocery.listsBase.v1');
    // The phone adds a list; a change here syncs, and its write is held in flight.
    page.cloud.row = { v: 1, rev: 2, lists: [{ id: 'phone', name: 'Phone list', items: [] }, WEB_STORED] };
    let release = () => {};
    page.cloud.gate = new Promise((r) => { release = r; });
    try {
      page.w.prompt = () => 'First';
      const add = [...page.w.document.querySelectorAll('button')].find((b) => b.textContent === '+ NEW LIST');
      await React.act(async () => { add.click(); });
      // The member signs out: the generation moves and the scrub clears the lists.
      page.w.shapeDb.signOutGen += 1;
      page.w.localStorage.removeItem(STORE_KEY);
      page.w.localStorage.removeItem('shape.grocery.listsBase.v1');
    } finally {
      page.cloud.gate = null;
      await React.act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    }
    assert.equal(page.w.localStorage.getItem(STORE_KEY), null, "the departing member's lists stay off the device");
    assert.equal(page.w.localStorage.getItem('shape.grocery.listsBase.v1'), null, 'and so does their base');
    assert.ok(baseBefore, 'there was one before');
  } finally { await page.done(); }
});

test('every list deleted on the phone stays an empty set: the sample list is never synced up (Codex P2 on #2433)', async () => {
  const page = await mountPage({ row: { v: 1, rev: 1, lists: [WEB_STORED] }, stored: [WEB] });
  let base;
  try {
    // The phone deletes the only list; a tick here syncs and takes the delete in.
    page.cloud.row = { v: 1, rev: 2, lists: [] };
    const box = page.w.document.querySelector('button[aria-label="Check"]');
    await React.act(async () => { box.click(); });
    await page.settle();
    assert.deepEqual(page.local(), [], 'no lists left');
    base = page.w.localStorage.getItem('shape.grocery.listsBase.v1');
  } finally { await page.done(); }
  // The next visit: the page opens on that empty set, not on the sample list, and writes nothing.
  const next = await mountPage({ row: { v: 1, rev: 2, lists: [] }, stored: [], before: (w) => w.localStorage.setItem('shape.grocery.listsBase.v1', base) });
  try {
    assert.deepEqual(next.local(), []);
    assert.equal(next.cloud.writes.length, 0, 'the sample list is not uploaded');
    assert.deepEqual(next.cloud.row.lists, []);
  } finally { await next.done(); }
});

// tests/grocery-share.test.mjs
//
// Sending a grocery list to another member (owner, 2026-10-23: "I want to also create ability to send
// grocery lists to other shape members"). The list rides in a direct message's metadata; the recipient's
// thread draws it as a card and Save to my lists copies it into their own lists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT, loadBroadsheet, SHIM } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import {
  bsGroceryShareItems, bsGroceryShareMessage, bsGroceryFromMetadata, bsReceivedGroceryList, bsReceivedGroceryId, bsGroceryGroupByAisle,
  BS_GROCERY_SHARE_KIND, BS_GROCERY_SHARE_MAX_ITEMS,
} from '../mobile-app/src/services/groceryShare.mjs';

const LIST = {
  name: 'Week 3 shop',
  aisles: [
    { aisle: 'Produce', items: [{ id: 'a', n: 'Spinach', q: '2 bags', meals: 'Mon' }, { id: 'b', n: 'Lemons', q: '3' }] },
    { aisle: 'Protein', items: [{ id: 'c', n: 'Chicken thighs', q: '1 kg', skippedMeal: true }, { id: 'd', n: 'Eggs', q: '12' }] },
  ],
};

test('the message: what the list shows, by aisle, with a body worded for both ends of the thread', () => {
  const msg = bsGroceryShareMessage(LIST, (it) => !it.skippedMeal);
  assert.equal(msg.body, 'Grocery list: “Week 3 shop” · 3 items');
  assert.equal(msg.metadata.kind, BS_GROCERY_SHARE_KIND);
  assert.equal(msg.metadata.name, 'Week 3 shop');
  assert.deepEqual(msg.metadata.items, [
    { n: 'Spinach', q: '2 bags', a: 'Produce' },
    { n: 'Lemons', q: '3', a: 'Produce' },
    { n: 'Eggs', q: '12', a: 'Protein' },
  ], 'a skipped meal\'s item stays off, and nothing but name, quantity and aisle travels');
  assert.equal(bsGroceryShareMessage({ name: 'Empty', aisles: [{ aisle: 'X', items: [] }] }), null, 'an empty list is not sent');
  assert.equal(bsGroceryShareMessage({ name: 'One', items: [{ n: 'Milk' }] }).body, 'Grocery list: “One” · 1 item');
  // A flat list (the library's records) travels too, capped.
  const many = { name: 'Big', items: Array.from({ length: 400 }, (_, i) => ({ n: `Thing ${i}` })) };
  assert.equal(bsGroceryShareItems(many).length, BS_GROCERY_SHARE_MAX_ITEMS);
});

test('what arrives is another member\'s input, read strictly: strings only, trimmed, capped, or no card at all', () => {
  assert.equal(bsGroceryFromMetadata(null), null);
  assert.equal(bsGroceryFromMetadata({ kind: 'shared_post', name: 'x', items: [{ n: 'y' }] }), null, 'another kind of message');
  assert.equal(bsGroceryFromMetadata({ kind: 'grocery_list', items: [{ n: 'y' }] }), null, 'no name');
  assert.equal(bsGroceryFromMetadata({ kind: 'grocery_list', name: 'x', items: 'not a list' }), null, 'no items');
  assert.equal(bsGroceryFromMetadata({ kind: 'grocery_list', name: { toString: () => 'x' }, items: [{ n: 'y' }] }), null, 'a name that is not a string');
  const got = bsGroceryFromMetadata({
    kind: 'grocery_list', name: '  Party   snacks  ',
    items: [
      { n: '  Chips ', q: 2, a: 'Snacks', extra: '<script>' },
      { n: ['array'] }, { n: '' }, null, 'string', { n: { obj: 1 } },
      { n: 'x'.repeat(300), q: 'y'.repeat(100), a: 'z'.repeat(100) },
    ],
  });
  assert.equal(got.name, 'Party snacks');
  assert.deepEqual(got.items[0], { n: 'Chips', q: '2', a: 'Snacks' }, 'a number quantity reads as text; unknown fields are dropped');
  assert.equal(got.items.length, 2, 'only the two items with a name made it');
  assert.equal(got.items[1].n.length, 80);
  assert.equal(got.items[1].q.length, 24);
  assert.equal(got.items[1].a.length, 40);
  const flood = bsGroceryFromMetadata({ kind: 'grocery_list', name: 'x', items: Array.from({ length: 1000 }, () => ({ n: 'y' })) });
  assert.equal(flood.items.length, BS_GROCERY_SHARE_MAX_ITEMS);
});

test('a saved copy is one of the recipient\'s own lists: custom, editable, credited to the sender, one per message', () => {
  const shared = bsGroceryFromMetadata(bsGroceryShareMessage(LIST).metadata);
  const list = bsReceivedGroceryList(shared, { messageId: 'abc-123', from: 'Sam Reyes', now: 1700000000000 });
  assert.equal(list.id, 'received-abc-123');
  assert.equal(list.id, bsReceivedGroceryList(shared, { messageId: 'abc-123', from: 'Sam Reyes' }).id, 'saving the same message again keeps one list');
  assert.equal(bsReceivedGroceryId('../../etc"; drop'), 'received-etcdrop', 'the id is built only from safe characters');
  assert.equal(list.name, 'Week 3 shop');
  assert.equal(list.kind, 'custom');
  assert.equal(list.editable, true);
  assert.equal(list.provenance, 'received');
  assert.equal(list.createdAt, 1700000000000);
  assert.equal(list.author, 'Sam Reyes');
  assert.equal(list.authorSelf, false, 'never credited to the recipient');
  assert.equal(list.count, 4);
  assert.equal(list.preview, 'Spinach · Lemons · Chicken thighs');
  assert.deepEqual(list.aisles.map((g) => [g.aisle, g.items.length]), [['Produce', 2], ['Protein', 2]]);
  assert.ok(list.items.every((it, i) => it.id === `received-abc-123-${i}` && it.n && it.q));
  assert.equal(bsReceivedGroceryList(null, {}), null);
});

test('a list keeps its aisles through an edit: the edit stores each item\'s aisle, and opening regroups by it (Codex P2 on #2432)', async () => {
  assert.deepEqual(bsGroceryGroupByAisle([{ n: 'a', a: 'Produce' }, { n: 'b' }, { n: 'c', a: 'Produce' }, null], 'Library items').map((g) => [g.aisle, g.items.map((i) => i.n)]),
    [['Produce', ['a', 'c']], ['Library items', ['b']]]);
  const { bsNormalizeGroceryList } = await loadBroadsheet(['bsNormalizeGroceryList'], SHIM);
  // A received list after its first edit: items flat, each with its aisle.
  const edited = { id: 'received-m1', name: 'Week 3 shop', kind: 'custom', items: [{ n: 'Spinach', a: 'Produce' }, { n: 'Eggs', a: 'Protein' }, { n: 'Lemons', a: 'Produce' }] };
  assert.deepEqual(bsNormalizeGroceryList(edited).aisles.map((g) => [g.aisle, g.items.map((i) => i.n)]), [['Produce', ['Spinach', 'Lemons']], ['Protein', ['Eggs']]]);
  // Lists with no aisle on their items read as before.
  assert.deepEqual(bsNormalizeGroceryList({ name: 'Old', kind: 'custom', items: [{ n: 'Milk' }] }).aisles.map((g) => g.aisle), ['Library items']);
  assert.deepEqual(bsNormalizeGroceryList({ name: 'Soup', kind: 'recipe', items: [{ n: 'Leek' }] }).aisles.map((g) => g.aisle), ['Recipe ingredients']);
  // The edit path keeps each item's aisle on the flat record.
  const persist = CLIENT_SRC.slice(CLIENT_SRC.indexOf('const persistGroceryList = (normalized) =>'));
  const body = persist.slice(0, persist.indexOf('\n  };'));
  assert.match(body, /flatMap\(a => \(a\.items \|\| \[\]\)\.map\(it => \(\{ \.\.\.it, a: it\.a \|\| a\.aisle \}\)\)\)/);
  assert.match(body, /meals: it\.meals \|\| normalized\.name, \.\.\.\(it\.a \? \{ a: it\.a \} : null\) \}/);
});
const CLIENT_SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');

// ── The card and the save, drawn with real React ─────────────────────────────
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const SHARE = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSGroceryShare.jsx'), {
  registry: new Map([['react', React]]),
});

function env({ lists = [], deleted = [], cloud = null, uid = 'u1', saveResult = { ok: true } } = {}) {
  const w = dom.window;
  w.localStorage.clear();
  w.localStorage.setItem('shape.recipeGroceryLists', JSON.stringify(lists));
  w.localStorage.setItem('shape.deletedGroceryIds', JSON.stringify(deleted));
  w.useBS = () => ({ isLight: true, PAPER: '#fff', INK: '#111', INK50: '#777', MONO: 'mono', DISPLAY: 'display', BODY: 'body' });
  w.ShapeI18n = { t: (key, o) => (key === 'nutrition:grocery.share.meta' ? `Grocery list · ${o.count} items` : o?.defaultValue) };
  const toasts = [];
  w.__bsToast = (msg, kind) => toasts.push([msg, kind]);
  const writes = [];
  // `cloud` is what getUserGoals answers: an array, {} for no document, or null for a failed read.
  w.shapeDb = cloud !== undefined && cloud !== false
    ? { getUser: async () => (uid ? { id: uid } : null), getUserGoals: async () => cloud, saveUserGoals: async (k, v, o) => { writes.push([k, v, o]); return saveResult; } }
    : undefined;
  return { toasts, writes };
}
async function render(el) {
  const saved = { window: globalThis.window, document: globalThis.document, CustomEvent: globalThis.CustomEvent };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.CustomEvent = dom.window.CustomEvent; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => { root.render(el); });
  return { host, done: async () => { await React.act(async () => { root.unmount(); }); host.remove(); Object.assign(globalThis, saved); } };
}
const SHARED = { name: 'Week 3 shop', items: [{ n: 'Spinach', q: '2 bags', a: 'Produce' }, { n: 'Lemons' }, { n: 'Eggs' }, { n: 'Oats' }] };

test('the card: the list\'s name, count and first three items; the sender\'s own copy has nothing to save', async () => {
  env();
  let r = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: SHARED, messageId: 'm1', from: 'Sam Reyes' }));
  try {
    const card = r.host.querySelector('[data-bs-grocery-share]');
    assert.match(card.textContent, /^Week 3 shopGrocery list · 4 itemsSpinach · Lemons · Eggs …Save to my lists$/);
    assert.equal(r.host.querySelector('[data-bs-grocery-save]').style.minHeight, '44px');
  } finally { await r.done(); }
  r = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: SHARED, me: true, messageId: 'm1' }));
  try { assert.ok(!r.host.querySelector('[data-bs-grocery-save]'), 'no save on my own message'); } finally { await r.done(); }
  // A coach reads the list but has no Eat lists to save it to.
  r = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: SHARED, canSave: false, messageId: 'm1', from: 'Sam Reyes' }));
  try {
    assert.match(r.host.textContent, /^Week 3 shop/);
    assert.ok(!r.host.querySelector('[data-bs-grocery-save]'), 'no save in the coach apps');
  } finally { await r.done(); }
  r = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: { name: 'x', items: [] }, messageId: 'm1' }));
  try { assert.equal(r.host.innerHTML, '', 'an empty list draws nothing'); } finally { await r.done(); }
});

test('Save with the Eat page on screen: the page takes the list, and nothing writes past it', async () => {
  const { toasts, writes } = env({ cloud: [] });
  const taken = [];
  const onReceived = (e) => { e.detail.handled = true; taken.push(e.detail.list); };
  dom.window.addEventListener('shape:groceryReceived', onReceived);
  const r = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: SHARED, messageId: 'm2', from: 'Sam Reyes' }));
  try {
    await React.act(async () => { r.host.querySelector('[data-bs-grocery-save]').click(); });
    await React.act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    assert.equal(taken.length, 1);
    assert.equal(taken[0].id, 'received-m2');
    assert.equal(taken[0].author, 'Sam Reyes');
    assert.equal(dom.window.localStorage.getItem('shape.recipeGroceryLists'), '[]', 'the chat did not write past the page');
    assert.deepEqual(writes, [], 'nor to the cloud');
    assert.equal(r.host.querySelector('[data-bs-grocery-save]').textContent, '✓ Saved to your lists');
    assert.deepEqual(toasts, [['Saved to your grocery lists', 'ok']]);
  } finally { dom.window.removeEventListener('shape:groceryReceived', onReceived); await r.done(); }
});

test('Save with the Eat page closed: written where it reads on mount, merged into the cloud, an earlier delete undone', async () => {
  const mine = { id: 'custom-1', name: 'Mine' };
  const { writes } = env({ lists: [mine], deleted: ['received-m3', 'custom-9'], cloud: [mine, { id: 'other-device' }] });
  const r = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: SHARED, messageId: 'm3', from: 'Sam Reyes' }));
  try {
    await React.act(async () => { r.host.querySelector('[data-bs-grocery-save]').click(); });
    await React.act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    const local = JSON.parse(dom.window.localStorage.getItem('shape.recipeGroceryLists'));
    assert.deepEqual(local.map((l) => l.id), ['received-m3', 'custom-1']);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('shape.deletedGroceryIds')), ['custom-9']);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], 'client_grocery_lists');
    assert.deepEqual(writes[0][1].map((l) => l.id), ['received-m3', 'custom-1', 'other-device'], 'read, merged, written back');
    assert.deepEqual(writes[0][2], { expectedUserId: 'u1' }, 'bound to the account the read was made for');
  } finally { await r.done(); }
  // Opened again later, the card knows it is saved; saving again adds nothing.
  const again = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: SHARED, messageId: 'm3', from: 'Sam Reyes' }));
  try {
    const btn = again.host.querySelector('[data-bs-grocery-save]');
    assert.equal(btn.getAttribute('aria-pressed'), 'true');
    await React.act(async () => { btn.click(); });
    assert.equal(JSON.parse(dom.window.localStorage.getItem('shape.recipeGroceryLists')).length, 2);
  } finally { await again.done(); }
});

test('the cloud write is skipped, never guessed: a failed read writes nothing; no document yet writes the one list (Codex P1s on #2432)', async () => {
  const save = async (messageId) => {
    const r = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: SHARED, messageId, from: 'Sam Reyes' }));
    try {
      await React.act(async () => { r.host.querySelector('[data-bs-grocery-save]').click(); });
      await React.act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    } finally { await r.done(); }
  };
  // getUserGoals answers null when the read fails: taken as "no lists", one list would overwrite them all.
  let w = env({ cloud: null });
  await save('m4');
  assert.deepEqual(w.writes, [], 'a failed read writes nothing to the cloud');
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('shape.recipeGroceryLists')).map((l) => l.id), ['received-m4'], 'the copy is kept on this device');
  // An absent document reads as {}: the first list starts it.
  w = env({ cloud: {} });
  await save('m5');
  assert.deepEqual(w.writes.map(([k, v]) => [k, v.map((l) => l.id)]), [['client_grocery_lists', ['received-m5']]]);
  // Signed out between the tap and the read: nothing to bind the write to.
  w = env({ cloud: [], uid: null });
  await save('m6');
  assert.deepEqual(w.writes, []);
  // The write refused (the account changed under it): the card still reads as saved, the copy is local.
  w = env({ cloud: [], saveResult: { accountChanged: true, error: { message: 'Account changed' } } });
  await save('m7');
  assert.equal(w.writes.length, 1);
  assert.deepEqual(w.writes[0][2], { expectedUserId: 'u1' });
});

test('a save that landed nowhere says so and stays tappable (Codex P2 on #2432)', async () => {
  const { toasts } = env({ cloud: false }); // no cloud at all
  const proto = dom.window.Storage.prototype;
  const realSet = proto.setItem;
  proto.setItem = function setItem() { throw new Error('QuotaExceededError'); };
  const r = await render(React.createElement(SHARE.BSGroceryShareCard, { shared: SHARED, messageId: 'm8', from: 'Sam Reyes' }));
  try {
    const btn = () => r.host.querySelector('[data-bs-grocery-save]');
    await React.act(async () => { btn().click(); });
    await React.act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    assert.deepEqual(toasts, [['Could not save the list. Try again.', 'error']]);
    assert.equal(btn().getAttribute('aria-pressed'), 'false', 'not saved, so still tappable');
    assert.equal(btn().disabled, false);
    // Storage back: the same tap saves.
    proto.setItem = realSet;
    await React.act(async () => { btn().click(); });
    await React.act(async () => { await new Promise((res) => setTimeout(res, 0)); });
    assert.equal(btn().getAttribute('aria-pressed'), 'true');
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('shape.recipeGroceryLists')).map((l) => l.id), ['received-m8']);
  } finally { proto.setItem = realSet; await r.done(); }
});

// ── The wiring ────────────────────────────────────────────────────────────────
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');

test('the grocery page sends what it shows; the send sheet sends it as the list message', () => {
  assert.match(CLIENT, /data-bs-grocery-send="" onClick=\{\(\) => setSendOpen\(true\)\}/, 'the page has its Send to a member button');
  assert.match(CLIENT, /\{sendOpen && <BSPostSendSheet post=\{\{ grocery: list, keep: \(it\) => !bsGrocerySkipped\(it, skipped\) \}\}/, 'what is sent leaves skipped meals\' items off');
  const sheet = CLIENT.slice(CLIENT.indexOf('function BSPostSendSheet'), CLIENT.indexOf('function BSPostActions'));
  assert.match(sheet, /if \(post\.grocery\) \{[\s\S]*?const msg = bsGroceryShareMessage\(post\.grocery, post\.keep\);[\s\S]*?sendMessage\(\{ conversationId: cid, body: msg\.body, metadata: msg\.metadata \}\)/);
  assert.match(sheet, /post\.grocery \? tr\('feed:send\.titlePlaylist', \{ defaultValue: 'Send “\{name\}” to', name: post\.grocery\.name \}\)/);
});

test('every way a message reaches a thread reads the list strictly, and the thread draws its card', () => {
  assert.equal((BACKEND.match(/grocery: bsGroceryFromMetadata\(message\.metadata\),/g) || []).length, 2, 'both thread readers');
  // ...and both keep the row's id, which names the saved copy (Codex P2 on #2432: the member thread reader
  // dropped it, so a reopened thread saved a fresh copy each time).
  assert.equal((BACKEND.match(/\n\s+id: message\.id \|\| null,\n/g) || []).length, 2, 'both thread readers keep the message id');
  assert.match(CLIENT, /grocery: bsGroceryFromMetadata\(row\.metadata\) \}\]\);/, 'and a message arriving live');
  assert.match(CLIENT, /coachInvite: m\.coachInvite \|\| null, grocery: m\.grocery \|\| null \}\)\),/, 'and the thread keeps it');
  assert.match(CLIENT, /\{m\.grocery && <BSGroceryShareCard shared=\{m\.grocery\} me=\{!!me\} canSave=\{canSaveGrocery\} messageId=\{m\.id\} from=\{me \? '' : senderName\} \/>\}/);
  // The coach apps mount the same chat (BSClientChat → BSClientFeed): only a member's thread offers Save.
  assert.match(CLIENT, /canSaveGrocery=\{myRole === 'client'\}/);
});

test('the Eat page takes a received list while it is on screen, and labels it received', () => {
  const at = CLIENT.indexOf("window.addEventListener('shape:groceryReceived', onReceived);");
  assert.ok(at > 0);
  const effect = CLIENT.slice(CLIENT.lastIndexOf('React.useEffect(', at), at);
  assert.match(effect, /e\.detail\.handled = true;/);
  assert.match(effect, /setRecipeLists\(\(prev\) => \(prev\.some\(\(l\) => l && l\.id === list\.id\) \? prev : \[list, \.\.\.prev\]\)\);/);
  assert.match(CLIENT, /received:\s+\{ key: 'nutrition:eat\.libReceivedToday', en: 'Shared · Received today', datedKey: 'nutrition:eat\.libReceivedOn', datedEn: 'Shared · Received \{date\}' \},/);
});

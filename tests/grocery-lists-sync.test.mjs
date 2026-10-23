// tests/grocery-lists-sync.test.mjs
//
// A member's saved grocery lists (user_goals 'client_grocery_lists') as a revisioned document, written
// compare-and-set by every writer: the app's Eat page, a received list saved from the chat, and the
// website's grocery page. Before this, the document was a bare array each writer replaced whole, so a
// write from another device between one device's read and write was lost (Codex on #2432).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers/broadsheet-mount.mjs';
import {
  BS_GROCERY_LISTS_KIND, BS_GROCERY_LISTS_CAS_TRIES,
  bsGroceryListsOf, bsGroceryListsRevised, bsGroceryListsRev, bsGroceryListsRevToken, bsGrocerySame,
  bsGroceryListsMerge, bsGroceryListsApply, bsGroceryListsStore, bsGroceryListsBaseIn, bsGroceryListsPageBase,
} from '../mobile-app/src/services/groceryLists.mjs';

const L = (id, extra = {}) => ({ id, name: id.toUpperCase(), items: [{ id: `${id}-1`, n: 'Milk', q: '1' }], ...extra });
const ids = (lists) => lists.map((l) => l.id);
const clone = (v) => JSON.parse(JSON.stringify(v));

// A cloud row with the compare-and-set the backend does (update where data->>'rev' matches the token).
function cloudDb(row, { uid = 'u1', onWrite } = {}) {
  const cloud = { row, writes: [], conflicts: 0, uid };
  cloud.db = {
    getUser: async () => (cloud.uid ? { id: cloud.uid } : null),
    getUserGoals: async (kind) => {
      assert.equal(kind, BS_GROCERY_LISTS_KIND);
      if (cloud.row === undefined) return null; // a failed read
      return cloud.row === null ? {} : clone(cloud.row);
    },
    saveUserGoalsIfRev: async (kind, data, expectedRev, expectedUid) => {
      if (onWrite) onWrite(cloud);
      const stored = cloud.row && !Array.isArray(cloud.row) && cloud.row.rev != null ? String(cloud.row.rev) : null;
      if (stored !== (expectedRev == null ? null : String(expectedRev))) { cloud.conflicts += 1; return { conflict: true }; }
      cloud.writes.push({ data: clone(data), expectedRev, expectedUid });
      cloud.row = clone(data);
      return { ok: true };
    },
  };
  return cloud;
}
const memBase = () => {
  const m = new Map();
  return { get: (uid) => (m.has(uid) ? m.get(uid) : null), set: (uid, lists) => m.set(uid, clone(lists)), m };
};

// ── Reading the document ──────────────────────────────────────────────────────

test('the document reads as the revisioned { v, rev, lists } and as the bare array an older build wrote', () => {
  assert.deepEqual(ids(bsGroceryListsOf([L('a'), L('b')])), ['a', 'b']);
  assert.deepEqual(ids(bsGroceryListsOf({ v: 1, rev: 4, lists: [L('a')] })), ['a']);
  assert.deepEqual(bsGroceryListsOf({}), [], 'no document yet');
  assert.deepEqual(ids(bsGroceryListsOf([L('a'), null, 'x', { name: 'no id' }, [], L('a', { name: 'dup' })])), ['a'], 'junk dropped, a repeated id keeps its first list');
  assert.equal(bsGroceryListsOf([L('a'), L('a', { name: 'dup' })])[0].name, 'A');
  assert.equal(bsGroceryListsRevised({ v: 1, rev: 0, lists: [] }), true);
  assert.equal(bsGroceryListsRevised([L('a')]), false, 'a bare array was written by a build that does not merge');
  assert.equal(bsGroceryListsRevised({}), false);
});

test('the compare-and-set token is the raw rev, and null where Postgres reads data->>\'rev\' as null', () => {
  assert.equal(bsGroceryListsRevToken({ v: 1, rev: 3, lists: [] }), '3');
  assert.equal(bsGroceryListsRevToken({ rev: '7x', lists: [] }), '7x', 'junk from another build matches byte for byte');
  assert.equal(bsGroceryListsRevToken({}), null);
  assert.equal(bsGroceryListsRevToken([L('a')]), null, 'a bare array has no rev');
  assert.equal(bsGroceryListsRev({ rev: 3 }), 3);
  assert.equal(bsGroceryListsRev({ rev: '7x' }), 0, 'the counter restarts from a junk rev');
  assert.equal(bsGroceryListsRev([L('a')]), 0);
  assert.equal(bsGrocerySame({ a: 1, b: { c: 2, d: undefined } }, { b: { c: 2 }, a: 1 }), true, 'key order and undefined ignored, as jsonb does');
});

// ── The merge ─────────────────────────────────────────────────────────────────

test('a first sync on a device (no base): every list from both sides, the cloud\'s copy winning a clash', () => {
  const remote = { v: 1, rev: 2, lists: [L('a', { name: 'Edited elsewhere' }), L('b'), L('gone')] };
  const m = bsGroceryListsMerge({ base: null, local: [L('a'), L('c')], remote, gone: ['gone'] });
  assert.deepEqual(ids(m.lists), ['c', 'a', 'b'], "this device's new list, then the cloud's in its order");
  assert.equal(m.lists.find((l) => l.id === 'a').name, 'Edited elsewhere', "with no base to tell, a stale copy here doesn't overwrite an edit made elsewhere");
  assert.deepEqual(ids(m.delta.put), ['b', 'a']);
  assert.deepEqual(m.delta.drop, []);
  assert.equal(m.changed, true, 'c is new to the cloud');
  // A list deleted here before this device had a base stays deleted.
  assert.ok(!ids(m.lists).includes('gone'));
});

test('the race: a list another device added between this read and write is kept, with this device\'s edit', () => {
  const base = [L('a'), L('b')];
  const local = [L('a', { name: 'Renamed here' }), L('b'), L('mine')];
  const remote = { v: 1, rev: 5, lists: [L('theirs'), L('a'), L('b')] };
  const m = bsGroceryListsMerge({ base, local, remote });
  assert.deepEqual(ids(m.lists), ['mine', 'theirs', 'a', 'b']);
  assert.equal(m.lists.find((l) => l.id === 'a').name, 'Renamed here');
  assert.deepEqual(ids(m.delta.put), ['theirs'], 'and this device takes theirs');
  assert.equal(m.changed, true);
});

test('deletes travel both ways, and an edit outranks a delete', () => {
  const base = [L('a'), L('b'), L('c'), L('d')];
  const remote = { v: 1, rev: 9, lists: [L('a'), L('b', { name: 'Edited elsewhere' }), L('d')] }; // c deleted elsewhere
  const local = [L('d', { name: 'Edited here' })]; // a and b deleted here; c untouched here
  const m = bsGroceryListsMerge({ base, local: [L('c'), ...local], remote });
  assert.deepEqual(ids(m.lists), ['b', 'd'], 'a: deleted here; b: deleted here but edited elsewhere since, so kept; c: deleted elsewhere');
  assert.equal(m.lists.find((l) => l.id === 'b').name, 'Edited elsewhere');
  assert.deepEqual(ids(m.delta.put), ['b'], 'b comes back to this device');
  assert.deepEqual(m.delta.drop, ['c'], 'c goes from this device');
  // Deleted elsewhere but edited here: the edit stays.
  const kept = bsGroceryListsMerge({ base: [L('c')], local: [L('c', { name: 'Edited here' })], remote: { v: 1, rev: 2, lists: [] } });
  assert.deepEqual(ids(kept.lists), ['c']);
  assert.deepEqual(kept.delta.drop, []);
});

test('a bare array (an older build) never reads as a delete, and an unchanged list goes back as stored', () => {
  const stored = L('a', { kind: 'custom', provenance: 'received', author: 'Sam' });
  // The website's view of it: converted, so not equal to the stored list, but unchanged by `same`.
  const local = [{ id: 'a', name: 'A', web: true }];
  const same = (s, l) => s.id === l.id;
  const toStored = (l) => ({ id: l.id, name: l.name, eyebrow: 'Custom · Synced' });
  const m = bsGroceryListsMerge({ base: [stored], local, remote: [L('other')], same, toStored });
  assert.deepEqual(ids(m.lists), ['a', 'other'], 'missing from an older build\'s array, still kept');
  assert.deepEqual(m.lists[0], stored, 'as it was stored, not through the lossy conversion');
  assert.deepEqual(m.delta.drop, []);
  // The same list missing from a revisioned document is a delete made elsewhere.
  assert.deepEqual(bsGroceryListsMerge({ base: [stored], local, remote: { v: 1, rev: 3, lists: [] }, same, toStored }).delta.drop, ['a']);
});

test('the merge keeps the cloud\'s order, so a device that orders its lists differently writes nothing', () => {
  const remote = { v: 1, rev: 1, lists: [L('a'), L('b'), L('c')] };
  const m = bsGroceryListsMerge({ base: [L('a'), L('b'), L('c')], local: [L('c'), L('b'), L('a')], remote });
  assert.deepEqual(ids(m.lists), ['a', 'b', 'c']);
  assert.equal(m.changed, false, 'no write only to reorder');
});

test('nothing to write when the merge equals the cloud', () => {
  const remote = { v: 1, rev: 1, lists: [L('a'), L('b')] };
  const m = bsGroceryListsMerge({ base: [L('a'), L('b')], local: [L('a'), L('b')], remote });
  assert.equal(m.changed, false);
  assert.deepEqual(m.delta, { put: [], drop: [] });
});

test('applying another device\'s changes leaves a list changed here since alone', () => {
  const used = [L('a'), L('b'), L('c')];
  const prev = [L('a'), L('b', { name: 'Edited since' }), L('c'), L('new-here')];
  const delta = { put: [L('a', { name: 'Theirs' }), L('b', { name: 'Theirs' }), L('x')], drop: ['c'] };
  const next = bsGroceryListsApply(prev, used, delta);
  assert.deepEqual(ids(next), ['x', 'a', 'b', 'new-here'], 'a new list goes first; c dropped');
  assert.equal(next[1].name, 'Theirs', 'a was untouched here: replaced in place');
  assert.equal(next[2].name, 'Edited since', 'b was edited after the merge read it: left for the next sync');
  assert.deepEqual(ids(bsGroceryListsApply(prev, used, delta, { at: 'end', fromStored: (l) => ({ ...l, web: true }) })), ['a', 'b', 'new-here', 'x']);
  assert.equal(bsGroceryListsApply(prev, used, { put: [], drop: [] }), prev, 'no change returns the same array, so a setter sees none');
  // fromStored is handed this device's copy it replaces, so state the document doesn't carry can be kept.
  const seen = [];
  bsGroceryListsApply(prev, used, delta, { fromStored: (r, p) => { seen.push([r.id, p ? p.id : null]); return r; } });
  assert.deepEqual(seen, [['a', 'a'], ['x', null]]);
  // `same` says what counts as changed here: what the document doesn't carry (a tick) doesn't.
  const ticked = [{ ...L('a'), ticked: true }];
  const put = { put: [L('a', { name: 'Theirs' })], drop: [] };
  assert.equal(bsGroceryListsApply(ticked, [L('a')], put), ticked, 'by default a tick is a change, and the edit waits');
  const took = bsGroceryListsApply(ticked, [L('a')], put, { same: (p, u) => bsGrocerySame({ ...p, ticked: undefined }, { ...u, ticked: undefined }) });
  assert.equal(took[0].name, 'Theirs');
  assert.equal(bsGroceryListsApply(prev, used, { put: [L('b', { name: 'Theirs' })], drop: [] }), prev, 'nor when every change was skipped');
});

// ── The store ─────────────────────────────────────────────────────────────────

test('two devices writing at once: the loser re-reads, merges again, and both lists survive', async () => {
  // Device A synced [a]; device B writes [b, a] after A's read and before A's write.
  const cloud = cloudDb({ v: 1, rev: 1, lists: [L('a')] }, {
    onWrite: (c) => { if (!c.interfered) { c.interfered = true; c.row = { v: 1, rev: 2, lists: [L('b'), L('a')] }; } },
  });
  const base = memBase();
  base.set('u1', [L('a')]);
  const store = bsGroceryListsStore({ db: cloud.db, baseStore: base });
  let local = [L('mine'), L('a')];
  const applied = [];
  const res = await store.sync({ getLocal: () => local, apply: (delta, used) => { applied.push(delta); local = bsGroceryListsApply(local, used, delta); } });
  assert.equal(res.ok, true);
  assert.equal(cloud.conflicts, 1, 'the race really happened, or this would pass with the compare-and-set removed');
  assert.deepEqual(ids(cloud.row.lists), ['mine', 'b', 'a'], "B's list and A's both in the cloud");
  assert.equal(cloud.row.rev, 3);
  assert.deepEqual(cloud.writes.map((w) => [w.expectedRev, w.expectedUid]), [['2', 'u1']], 'written on the rev it read, bound to the account');
  assert.deepEqual(ids(local), ['b', 'mine', 'a'], 'and A took B\'s list');
  assert.deepEqual(ids(base.get('u1')), ['mine', 'b', 'a'], 'the base is what was synced');
});

test('a bare array is replaced by the revisioned document on the null token', async () => {
  const cloud = cloudDb([L('a')]);
  const store = bsGroceryListsStore({ db: cloud.db, baseStore: memBase() });
  const res = await store.sync({ getLocal: () => [L('a'), L('b')], apply: () => {} });
  assert.equal(res.ok, true);
  assert.deepEqual(cloud.writes.map((w) => w.expectedRev), [null]);
  assert.deepEqual(cloud.row, { v: 1, rev: 1, lists: [L('b'), L('a')] });
});

test('a failed read writes nothing and leaves the base as it was', async () => {
  const cloud = cloudDb(undefined);
  const base = memBase();
  base.set('u1', [L('a')]);
  const res = await bsGroceryListsStore({ db: cloud.db, baseStore: base }).sync({ getLocal: () => [], apply: () => {} });
  assert.deepEqual([res.ok, res.reason], [false, 'unreadable']);
  assert.equal(cloud.writes.length, 0, 'an empty list here is never written over the member\'s synced lists');
  assert.deepEqual(ids(base.get('u1')), ['a']);
  const out = await bsGroceryListsStore({ db: cloudDb({}, { uid: null }).db }).sync({ getLocal: () => [L('a')] });
  assert.deepEqual([out.ok, out.reason], [false, 'signed-out']);
});

test('the base waits for the device to keep another device\'s changes, or the next sync would delete them', async () => {
  const cloud = cloudDb({ v: 1, rev: 1, lists: [L('theirs')] });
  const base = memBase();
  base.set('u1', []);
  const store = bsGroceryListsStore({ db: cloud.db, baseStore: base });
  // The page closed before it could keep `theirs` (apply throws): the base stays as it was.
  let res = await store.sync({ getLocal: () => [], apply: () => { throw new Error('storage off'); } });
  assert.equal(res.ok, true);
  assert.deepEqual(base.get('u1'), [], 'not recorded as synced');
  // So the next sync brings it again rather than reading it as deleted here.
  const kept = [];
  res = await store.sync({ getLocal: () => [], apply: (delta) => kept.push(...ids(delta.put)) });
  assert.deepEqual(kept, ['theirs']);
  assert.deepEqual(ids(cloud.row.lists), ['theirs'], 'still in the cloud');
  assert.deepEqual(ids(base.get('u1')), ['theirs']);
  // What the guard prevents: a base that ran ahead of this device's lists reads the list as deleted here.
  assert.deepEqual(bsGroceryListsMerge({ base: [L('theirs')], local: [], remote: cloud.row }).lists, []);
  // No apply at all: changes from elsewhere are never recorded as synced.
  const b2 = memBase();
  b2.set('u1', []);
  await bsGroceryListsStore({ db: cloudDb({ v: 1, rev: 1, lists: [L('x')] }).db, baseStore: b2 }).sync({ getLocal: () => [] });
  assert.deepEqual(b2.get('u1'), []);
  // Nor when the page had closed (apply kept them in storage but says they missed the lists on screen).
  const b3 = memBase();
  b3.set('u1', []);
  await bsGroceryListsStore({ db: cloudDb({ v: 1, rev: 1, lists: [L('x')] }).db, baseStore: b3 }).sync({ getLocal: () => [], apply: () => false });
  assert.deepEqual(b3.get('u1'), []);
});

test('a page that closes and opens again while a sync is queued gets that sync\'s changes', async () => {
  const cloud = cloudDb({ v: 1, rev: 1, lists: [L('theirs')] });
  const base = memBase();
  base.set('u1', []);
  const store = bsGroceryListsStore({ db: cloud.db, baseStore: base });
  // Hold the lane so the next syncs queue behind it.
  let release;
  const gate = new Promise((r) => { release = () => r({ id: 'u1' }); });
  let started = false;
  const hold = bsGroceryListsStore({ db: { ...cloud.db, getUser: () => { started = true; return gate; } } }).add(L('held'));
  const closed = [];
  const opened = [];
  const first = store.sync({ getLocal: () => [], apply: (d) => { closed.push(...ids(d.put)); return false; } });
  const second = store.sync({ getLocal: () => [], apply: (d) => { opened.push(...ids(d.put)); return true; } });
  assert.equal(first, second);
  while (!started) await new Promise((r) => setTimeout(r, 0)); // the held step has started
  release();
  await hold;
  await second;
  assert.deepEqual([closed, opened], [[], ['held', 'theirs']], "the open page's apply gets them, not the closed one's");
  assert.deepEqual(ids(base.get('u1')), ['held', 'theirs']);
});

test('a merge that throws resolves as a failed sync rather than rejecting into a page\'s effect', async () => {
  const cloud = cloudDb({ v: 1, rev: 1, lists: [] });
  const res = await bsGroceryListsStore({ db: cloud.db }).sync({ getLocal: () => { throw new Error('boom'); } });
  assert.deepEqual([res.ok, res.reason], [false, 'failed']);
  assert.equal(cloud.writes.length, 0);
});

test('a sync queued behind another is shared, and reads the latest lists when it runs', async () => {
  const cloud = cloudDb({});
  const store = bsGroceryListsStore({ db: cloud.db, baseStore: memBase() });
  let local = [L('a')];
  const first = store.sync({ getLocal: () => local, apply: () => {} });
  local = [L('a'), L('b')];
  const second = store.sync({ getLocal: () => local, apply: () => {} });
  assert.equal(first, second, 'one run for both');
  await second;
  assert.deepEqual(ids(cloud.row.lists), ['a', 'b']);
  assert.equal(cloud.writes.length, 1);
  // Once a run has read the lists, a later change gets a sync of its own.
  local = [L('a'), L('b'), L('c')];
  await store.sync({ getLocal: () => local, apply: () => {} });
  assert.deepEqual(ids(cloud.row.lists), ['c', 'a', 'b']);
});

test('an account switch between the read and the write writes nothing', async () => {
  const cloud = cloudDb({ v: 1, rev: 1, lists: [] });
  let reads = 0;
  const db = { ...cloud.db, getUserGoals: async (k) => { reads += 1; const v = await cloud.db.getUserGoals(k); cloud.uid = 'u2'; return v; } };
  const res = await bsGroceryListsStore({ db, baseStore: memBase() }).sync({ getLocal: () => [L('a')], apply: () => {} });
  assert.deepEqual([res.ok, res.reason, reads], [false, 'account-changed', 1]);
  assert.equal(cloud.writes.length, 0);
  // And the writer's own refusal is the same state, not a retryable failure.
  const c2 = cloudDb({});
  const db2 = { ...c2.db, saveUserGoalsIfRev: async () => ({ accountChanged: true, error: { message: 'Account changed' } }) };
  const r2 = await bsGroceryListsStore({ db: db2, baseStore: memBase() }).sync({ getLocal: () => [L('a')] });
  assert.deepEqual([r2.ok, r2.reason], [false, 'account-changed']);
});

test('the read is bound to the account: an A → B → A switch while it is in flight never brings B\'s lists (Codex P1 on #2433)', async () => {
  // The backend's read policy: a row is returned only for the session's own account. The session is B while
  // the request is in flight and A again by the time the store checks.
  const rows = { u1: { v: 1, rev: 1, lists: [L('a-list')] }, u2: { v: 1, rev: 1, lists: [L('b-secret')] } };
  const seen = [];
  const writes = [];
  let session = 'u1';
  const db = {
    getUser: async () => ({ id: session }),
    getUserGoals: async (kind, options) => {
      seen.push(options);
      session = 'u2';
      const asked = options && options.expectedUserId != null ? options.expectedUserId : session;
      const row = asked === session ? rows[session] : null; // read policy: own rows only
      session = 'u1';
      return row ? clone(row) : {};
    },
    saveUserGoalsIfRev: async (k, data, rev, uid) => { writes.push({ data, rev, uid }); return { conflict: true }; },
  };
  await bsGroceryListsStore({ db, baseStore: memBase() }).sync({ getLocal: () => [L('mine')], apply: () => true });
  assert.deepEqual(seen[0], { expectedUserId: 'u1' }, 'the read asks for the account that started the sync');
  assert.ok(writes.length > 0, 'it tried to write');
  for (const w of writes) assert.ok(!ids(w.data.lists).includes('b-secret'), "B's list never reaches A's document");
});

test('a write that keeps losing gives up honestly after a bounded number of tries', async () => {
  const cloud = cloudDb({ v: 1, rev: 1, lists: [] }, { onWrite: (c) => { c.row = { ...c.row, rev: c.row.rev + 1 }; } });
  const base = memBase();
  const res = await bsGroceryListsStore({ db: cloud.db, baseStore: base }).sync({ getLocal: () => [L('a')], apply: () => {} });
  assert.deepEqual([res.ok, res.reason], [false, 'contended']);
  assert.equal(cloud.conflicts, BS_GROCERY_LISTS_CAS_TRIES);
  assert.equal(base.get('u1'), null, 'nothing recorded as synced');
});

test('adding a received list merges into the document as read, and is a no-op when it is there', async () => {
  const cloud = cloudDb({ v: 1, rev: 6, lists: [L('a')] });
  const store = bsGroceryListsStore({ db: cloud.db });
  assert.equal((await store.add(L('received-m1'))).ok, true);
  assert.deepEqual(ids(cloud.row.lists), ['received-m1', 'a']);
  assert.equal(cloud.row.rev, 7);
  assert.deepEqual(cloud.writes.map((w) => w.expectedRev), ['6']);
  const again = await store.add(L('received-m1'));
  assert.deepEqual([again.ok, again.wrote], [true, false]);
  assert.equal(cloud.writes.length, 1);
});

test('a page\'s base lives in memory as long as the page, over the stored one', async () => {
  const stored = memBase();
  stored.set('u1', [L('old')]);
  const pb = bsGroceryListsPageBase(stored);
  assert.deepEqual(ids(pb.get('u1')), ['old'], 'the stored base until this page syncs');
  pb.set('u1', [L('new')]);
  assert.deepEqual(ids(pb.get('u1')), ['new']);
  assert.deepEqual(ids(stored.get('u1')), ['new'], 'and kept in storage too');
  assert.equal(pb.get('u2'), null);
  // Storage denied: the page still has its base, so a list deleted here stays deleted.
  const denied = bsGroceryListsPageBase(bsGroceryListsBaseIn(() => { throw new Error('SecurityError'); }, 'k'));
  const cloud = cloudDb({ v: 1, rev: 1, lists: [L('a'), L('b')] });
  const store = bsGroceryListsStore({ db: cloud.db, baseStore: memBase() });
  let local = [L('a'), L('b')];
  await store.sync({ getLocal: () => local, base: denied, apply: () => true });
  local = [L('b')];
  await store.sync({ getLocal: () => local, base: denied, apply: () => true });
  assert.deepEqual(ids(cloud.row.lists), ['b'], 'deleted here, not brought back');
  // A new page starts with no base of its own: with storage denied, its first sync keeps every list.
  const fresh = bsGroceryListsPageBase(bsGroceryListsBaseIn(() => { throw new Error('SecurityError'); }, 'k'));
  assert.equal(fresh.get('u1'), null);
});

test('the base is kept per account: one account\'s base is never used for another', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const b = bsGroceryListsBaseIn(storage, 'shape.test.base');
  b.set('u1', [L('a')]);
  assert.deepEqual(ids(b.get('u1')), ['a']);
  assert.equal(b.get('u2'), null);
  const off = bsGroceryListsBaseIn(() => { throw new Error('SecurityError'); }, 'k');
  assert.equal(off.get('u1'), null, 'denied storage reads as no base');
  off.set('u1', []); // and does not throw
});

test('an older shapeDb without the compare-and-set still writes, bound to the account', async () => {
  const writes = [];
  const db = { getUser: async () => ({ id: 'u1' }), getUserGoals: async () => ({}), saveUserGoals: async (k, v, o) => { writes.push([k, v, o]); return { ok: true }; } };
  const res = await bsGroceryListsStore({ db }).sync({ getLocal: () => [L('a')] });
  assert.equal(res.ok, true);
  assert.deepEqual(writes, [[BS_GROCERY_LISTS_KIND, { v: 1, rev: 1, lists: [L('a')] }, { expectedUserId: 'u1' }]]);
});

// ── The website's grocery page ────────────────────────────────────────────────

const HTML = readFileSync(join(ROOT, 'public/newdesign/ClientGrocery.html'), 'utf8');

test('the website tells its own edits from its view of a stored list', async () => {
  const GL = await import('../mobile-app/src/services/groceryLists.mjs');
  const start = HTML.indexOf('const SYNC_META');
  const end = HTML.indexOf('\nfunction ClientGroceryPage');
  assert.ok(start > 0 && end > start, 'the converters moved: re-point this test');
  const lib = new Function('guessCategory', 'window', `${HTML.slice(start, end)}; return { syncedToWeb, webToSynced, webSame };`)(() => 'other', { ShapeGroceryListsLib: GL });
  // A list the app made, read into the page: unchanged, even with items ticked off.
  const appMade = { id: 'r1', name: 'Received', kind: 'custom', provenance: 'received', author: 'Sam', usedCount: 3, aisles: [{ aisle: 'Produce', items: [{ id: 'x', n: 'Kale', q: '1', a: 'Produce' }] }], items: [{ id: 'x', n: 'Kale', q: '1', a: 'Produce' }] };
  const view = lib.syncedToWeb(appMade);
  assert.equal(lib.webSame(appMade, view), true);
  assert.equal(lib.webSame(appMade, { ...view, items: view.items.map((it) => ({ ...it, checked: true })) }), true, 'ticks are not an edit');
  assert.equal(lib.webSame(appMade, { ...view, name: 'Renamed' }), false);
  assert.equal(lib.webSame(appMade, { ...view, items: [...view.items, { id: 'y', item: 'Eggs', qty: '6', category: 'dairy', checked: false }] }), false);
  // A list made here, with a chosen category and no quantity, stored through webToSynced.
  const webMade = { id: 'w1', name: 'Mine', items: [{ id: 'i1', item: 'Milk', qty: '', category: 'dairy', checked: false }] };
  const stored = lib.webToSynced([webMade])[0];
  assert.equal(lib.webSame(stored, webMade), true);
  assert.equal(lib.webSame(stored, { ...webMade, items: [] }), false);
});

test('every writer goes through the store: no whole-document write of the lists is left', () => {
  const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
  const SHARE = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSGroceryShare.jsx'), 'utf8');
  for (const [name, src] of [['client', CLIENT], ['share', SHARE], ['website', HTML]]) {
    assert.doesNotMatch(src, /saveUserGoals\(\s*['"]client_grocery_lists['"]/, `${name}: no unconditional write`);
    assert.doesNotMatch(src, /getUserGoals\(\s*['"]client_grocery_lists['"]/, `${name}: no read outside the store`);
    assert.doesNotMatch(src, /saveUserGoals\(\s*(SYNC_KEY|CLOUD_KIND)/, `${name}: nor through a constant`);
  }
  assert.match(CLIENT, /bsGroceryListsAppStore\(\)\.sync\(\{\s*getLocal: \(\) => grocLocalRef\.current,\s*getGone: \(\) => grocGoneRef\.current,/);
  assert.match(CLIENT, /apply: \(delta, used\) => \{[\s\S]{0,700}window\.localStorage\.setItem\('shape\.recipeGroceryLists', JSON\.stringify\(next\)\)/, 'the Eat page keeps another device\'s changes in storage, not only on screen');
  // ⚠ apply makes the delta visible to getLocal BEFORE it returns, not only through a state update for the
  // next render: a sync queued behind runs first and would read the lists without it (Codex P1 on #2433).
  assert.match(CLIENT, /if \(!grocMountedRef\.current\) return false;[\s\S]{0,300}grocLocalRef\.current = bsGroceryListsApply\(grocLocalRef\.current, used, delta\);[\s\S]{0,300}setRecipeLists\(\(prev\) => bsGroceryListsApply\(prev, used, delta\)\);\s*if \(putIds\.size\) setDeletedGroceryIds[\s\S]{0,120}return true;/);
  assert.match(HTML, /if \(!mountedRef\.current\) return false;[\s\S]{0,300}const before = listsRef\.current;\s*listsRef\.current = GL\.bsGroceryListsApply\(before, used, delta, opts\);\s*setLists\(/);
  // Each page keeps its own base (as long-lived as its lists), and storage in apply is best-effort: denied,
  // the lists on screen still take the changes (Codex P2 on #2433).
  assert.match(CLIENT, /grocBaseRef\.current = bsGroceryListsPageBase\(bsGroceryListsAppStore\(\)\.base\)/);
  assert.match(CLIENT, /getGone: \(\) => grocGoneRef\.current,\s*base: grocBaseRef\.current,/);
  assert.match(CLIENT, /apply: \(delta, used\) => \{\s*try \{\s*const raw = window\.localStorage\.getItem\('shape\.recipeGroceryLists'\);[\s\S]{0,400}\} catch \(e\) \{[^}]*\}\s*if \(!grocMountedRef\.current\) return false;/);
  assert.match(HTML, /baseRef\.current = window\.ShapeGroceryListsLib\.bsGroceryListsPageBase\(store\.base\)/);
  assert.match(HTML, /same: \(p, u\) => GL\.bsGrocerySame\(stripTicks\(p\), stripTicks\(u\)\)/, 'the website\'s apply ignores ticks');
  assert.match(SHARE, /bsGroceryListsAppStore\(\)\.add\(list\)/);
  // The open list on the Eat page is drawn from its record, so another device's edit reaches the screen
  // before the next edit is made on it (Codex P1 on #2433).
  assert.match(CLIENT, /const openGroceryRecord = selectedGroceryList && selectedGroceryList\.id\s*\? recipeLists\.find\(\(l\) => l && l\.id === selectedGroceryList\.id\) : null;\s*const activeGroceryList = openGroceryRecord\s*\? \{ \.\.\.bsNormalizeGroceryList\(openGroceryRecord\),/);
  // Both shapeDbs bind getUserGoals to the expected account (Codex P1 on #2433).
  const BACKEND = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const SB = readFileSync(join(ROOT, 'public/supabase.js'), 'utf8');
  for (const [name, src] of [['app', BACKEND], ['website', SB]]) {
    assert.match(src, /async getUserGoals\(kind, options\) \{[\s\S]{0,200}want = options && options\.expectedUserId;\s*if \(want != null && String\(u\.id\) !== String\(want\)\) return null;\s*(var|const) res = await (supabase|client)\.from\('user_goals'\)\.select\('data'\)\.eq\('user_id', want != null \? want : u\.id\)/, name);
  }
  assert.match(HTML, /<script type="module">import \* as GL from "\/newdesign\/groceryLists\.mjs\?v=\d+"; window\.ShapeGroceryListsLib = GL;<\/script>\n<script type="text\/babel">/, 'the website loads the module before its page script');
  assert.match(HTML, /store\.sync\(\{\s*getLocal: \(\) => listsRef\.current,\s*same: webSame,/);
  assert.match(HTML, /apply: \(delta, used\) => \{[\s\S]{0,700}window\.localStorage\.setItem\(STORE_KEY, JSON\.stringify\(next\)\)/);
});

test('the website\'s shapeDb has the compare-and-set, with its load-bearing details', () => {
  const SB = readFileSync(join(ROOT, 'public/supabase.js'), 'utf8');
  const fn = SB.slice(SB.indexOf('async saveUserGoalsIfRev('), SB.indexOf('// Guard a dashboard page.'));
  assert.ok(fn.length > 100, 'saveUserGoalsIfRev is on the website shapeDb');
  assert.match(fn, /if \(expectedUid == null\)/, 'the account is required');
  assert.match(fn, /accountChanged: true/);
  assert.match(fn, /\.is\('data->>rev', null\)\.select\('kind'\)/, 'a missing rev is matched with IS NULL, and the affected rows asked for');
  assert.match(fn, /\.eq\('data->>rev', String\(expectedRev\)\)\.select\('kind'\)/);
  assert.match(fn, /if \(expectedRev != null\) return \{ conflict: true \};\s*var ins = await client\.from\('user_goals'\)\.insert\(row\)/, 'update first, insert as the fallback');
  assert.match(fn, /'23505'\) return \{ conflict: true \}/);
});

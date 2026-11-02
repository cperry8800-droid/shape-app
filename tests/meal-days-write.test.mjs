// tests/meal-days-write.test.mjs
//
// The member's own day plan is one whole document in user_goals (`client_meal_days`), written by
// bsMealDaysWrite (mobile-app/src/services/mealDays.mjs). Codex's two P1s on #2563: the write must be
// bound to the account that started it, from the read to the save, so a switch never puts one
// member's plan in another's row; and it must be compare-and-set on the document's revision, so two
// devices that each plan a meal both keep theirs. The backend here is shapeBackend.js's contract:
// getUserGoals(kind, { expectedUserId }) reads null for another account, saveUserGoalsIfRev(kind,
// data, rev, uid) answers { ok } | { conflict } | { accountChanged } | { error }.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsMealDaysWrite, bsMealDaysAdd, bsMealDaysRev, bsMealDaysRevToken, BS_MEAL_DAYS_KIND, BS_MEAL_DAYS_CAS_TRIES } from '../mobile-app/src/services/mealDays.mjs';

const TODAY = '2999-01-01';
const TOMORROW = '2999-01-02';
const meal = (id, title) => ({ id, slot: 'BREAKFAST', title, kcal: 400, p: 20, c: 40, f: 10 });
const add = (id, title) => (doc, today) => bsMealDaysAdd(doc, TOMORROW, meal(id, title), today);

// A user_goals backend for one kind, with the signed-in account settable mid-write.
function backend({ doc = {}, user = 'member-a', cas = true } = {}) {
  const b = {
    user, doc, reads: [], saves: [],
    // Runs before each save resolves: a test can switch accounts or let another device write here.
    beforeSave: null,
    getUser: async () => (b.user ? { id: b.user } : null),
    getUserGoals: async (kind, opts) => {
      b.reads.push({ kind, opts });
      if (b.readFails) return null;
      if (opts && opts.expectedUserId != null && b.user !== opts.expectedUserId) return null;
      return JSON.parse(JSON.stringify(b.doc));
    },
    saveUserGoals: async (kind, data, opts) => {
      b.saves.push({ kind, data, opts, how: 'upsert' });
      if (opts && opts.expectedUserId && b.user !== opts.expectedUserId) return { error: { message: 'Account changed' } };
      b.doc = data;
      return { ok: true };
    },
  };
  if (cas) {
    b.saveUserGoalsIfRev = async (kind, data, rev, uid) => {
      if (b.beforeSave) { const f = b.beforeSave; b.beforeSave = null; await f(b); }
      b.saves.push({ kind, data, rev, uid, how: 'cas' });
      if (b.user !== uid) return { accountChanged: true, error: { message: 'Account changed', code: 'account_changed' } };
      const cur = b.doc && b.doc.rev != null ? String(b.doc.rev) : null;
      if (cur !== rev) return { conflict: true };
      b.doc = data;
      return { ok: true };
    };
  }
  return b;
}

test('a write reads and saves as the account that started it, and carries the next revision', async () => {
  const b = backend({ doc: { v: 1, days: {}, rev: 3 } });
  const r = await bsMealDaysWrite(b, add('m1', 'Oats'), TODAY);
  assert.equal(r.ok, true);
  assert.deepEqual(b.reads.map((x) => [x.kind, x.opts && x.opts.expectedUserId]), [[BS_MEAL_DAYS_KIND, 'member-a']], 'the read is bound to the account');
  assert.equal(b.saves.length, 1);
  assert.equal(b.saves[0].uid, 'member-a', 'and so is the write');
  assert.equal(b.saves[0].rev, '3', 'compare-and-set on the revision the read saw');
  assert.equal(b.doc.rev, 4);
  assert.deepEqual(b.doc.days[TOMORROW].add.map((m) => m.id), ['m1']);
  assert.deepEqual(r.doc, b.doc, 'it resolves the document it saved');
});

test('a document with no revision yet is written on the absent key, then counts from 1', async () => {
  const b = backend({ doc: {} });
  const r = await bsMealDaysWrite(b, add('m1', 'Oats'), TODAY);
  assert.equal(r.ok, true);
  assert.equal(b.saves[0].rev, null, 'data->>rev IS NULL, the way Postgres reads an absent key');
  assert.equal(b.doc.rev, 1);
  assert.equal(bsMealDaysRev({ rev: 'junk' }), 0);
  assert.equal(bsMealDaysRevToken({ rev: 'junk' }), 'junk', 'the raw value is compared, junk included, so such a document can still be written');
  assert.equal(bsMealDaysRevToken({ v: 1 }), null);
});

test('⚠ two devices: a write that lost the race re-reads and re-applies, and both meals are kept', async () => {
  const b = backend({ doc: { v: 1, days: {}, rev: 1 } });
  // Another device plans its meal between this one's read and its save.
  b.beforeSave = async (be) => { be.doc = { ...bsMealDaysAdd(be.doc, TOMORROW, meal('other', 'Eggs'), TODAY), rev: 2 }; };
  const r = await bsMealDaysWrite(b, add('mine', 'Oats'), TODAY);
  assert.equal(r.ok, true);
  assert.deepEqual(b.saves.map((s) => s.rev), ['1', '2'], 'the first save conflicted, the second was made on the newer copy');
  assert.deepEqual(b.doc.days[TOMORROW].add.map((m) => m.id).sort(), ['mine', 'other'], 'the other device\'s meal is not written over');
  assert.equal(b.doc.rev, 3);
});

test('⚠ an account switch mid-write writes nothing into the other account', async () => {
  const b = backend({ doc: { v: 1, days: {}, rev: 5 } });
  b.beforeSave = async (be) => { be.user = 'member-b'; };
  const r = await bsMealDaysWrite(b, add('m1', 'Oats'), TODAY);
  assert.deepEqual(r, { ok: false, reason: 'account-changed' });
  assert.equal(b.doc.rev, 5, 'nothing was saved');
  // ⚠ Switched between the read and the save: the save is still bound to the account the write
  // started as, so B's row is never given A's plan (re-resolving the account at the save would
  // write it there, the window the mutation round found open).
  const m = backend({ doc: { v: 1, days: {}, rev: 5 } });
  const readA = m.getUserGoals;
  m.getUserGoals = async (kind, opts) => { const d = await readA(kind, opts); m.user = 'member-b'; return d; };
  assert.deepEqual(await bsMealDaysWrite(m, add('m1', 'Oats'), TODAY), { ok: false, reason: 'account-changed' });
  assert.equal(m.doc.rev, 5, 'nothing was written into the other account');
  assert.equal(m.saves[0].uid, 'member-a', 'the save named the account that started the write');
  // Switched before the read: the bound read comes back empty-handed, and nothing is written.
  const c = backend({ doc: { v: 1, days: {}, rev: 5 } });
  const realGet = c.getUserGoals;
  c.getUserGoals = async (kind, opts) => { c.user = 'member-b'; return realGet(kind, opts); };
  assert.deepEqual(await bsMealDaysWrite(c, add('m1', 'Oats'), TODAY), { ok: false, reason: 'unreadable' });
  assert.equal(c.saves.length, 0);
});

test('a read that fails writes nothing; signed out writes nothing', async () => {
  const b = backend({ doc: { v: 1, days: { [TOMORROW]: { add: [meal('keep', 'Kept')] } }, rev: 2 } });
  b.readFails = true;
  assert.deepEqual(await bsMealDaysWrite(b, add('m1', 'Oats'), TODAY), { ok: false, reason: 'unreadable' });
  assert.equal(b.saves.length, 0, 'an empty document is never saved over a real one');
  const s = backend({ user: null });
  assert.deepEqual(await bsMealDaysWrite(s, add('m1', 'Oats'), TODAY), { ok: false, reason: 'signed-out' });
});

test('a build without the compare-and-set falls back to the account-bound upsert', async () => {
  const b = backend({ cas: false, doc: { v: 1, days: {} } });
  const r = await bsMealDaysWrite(b, add('m1', 'Oats'), TODAY);
  assert.equal(r.ok, true);
  assert.deepEqual(b.saves.map((s) => [s.how, s.opts && s.opts.expectedUserId]), [['upsert', 'member-a']]);
});

test('every try lost to another device: nothing written, said as contended', async () => {
  const b = backend({ doc: { v: 1, days: {}, rev: 0 } });
  b.saveUserGoalsIfRev = async (kind, data, rev) => { b.saves.push({ rev }); b.doc = { ...b.doc, rev: (b.doc.rev || 0) + 1 }; return { conflict: true }; };
  assert.deepEqual(await bsMealDaysWrite(b, add('m1', 'Oats'), TODAY), { ok: false, reason: 'contended' });
  assert.equal(b.saves.length, BS_MEAL_DAYS_CAS_TRIES);
  const f = backend();
  f.saveUserGoalsIfRev = async () => ({ error: { message: 'boom' } });
  assert.deepEqual(await bsMealDaysWrite(f, add('m1', 'Oats'), TODAY), { ok: false, reason: 'write-failed' });
});

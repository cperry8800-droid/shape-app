// tests/profile-custom-cas.test.mjs
//
// Compare-and-set across every profile_custom writer (owner, 2026-11-11, on #2707: "Merge now, CAS later").
// Each writer reads the stored doc, puts only its own change over it and writes it back; an app save of a
// different field that landed between one writer's read and its write was lost to the later write (Codex P2
// on #2707). Now every writer stamps `rev` one past the rev it read and writes compare-and-set on that rev
// (profileCustom.mjs bsProfileCustomWrite over saveUserGoalsIfRev); on a conflict it reads again and puts
// the same change over the newer copy. What holds here:
//   · the helper: a save landing mid-write is kept and the writer's own change goes over it; a failed read
//     writes nothing; the read and write are bound to the account the save started on; it gives up after
//     a bounded number of tries with nothing written; a backend without CAS falls back to the bound upsert;
//   · the normalizer leaves `rev` alone (it is no profile field);
//   · two saves of the SAME field: the later one wins (owner, 2026-11-11: "this makes sense");
//   · settingsSync's links and the app's Customize, driven for real, keep a save that lands mid-write;
//   · Nora's account setup moves the rev on, so a client save that read before it conflicts;
//   · from the source: no profile_custom writer writes the doc any other way.
// The website's Edit profile (tests/profile-identity-web.test.mjs) and Make it yours
// (tests/coach-public-stats.test.mjs) carry their own mounted race tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as PC from '../mobile-app/src/services/profileCustom.mjs';
import { saveSettingsPatch, saveAccountDocPatch } from '../public/newdesign/settingsSync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const clone = (v) => JSON.parse(JSON.stringify(v));

// One account's user_goals in memory, with saveUserGoalsIfRev's semantics (shapeBackend.js / supabase.js):
// the write lands only while data->>'rev' is still the raw token read (null: no rev key). `during` runs once,
// just before the first compare-and-set, as another device's save landing in the round trip.
export function casDb({ uid = 'u1', docs = {}, during = null, cas = true } = {}) {
  const state = { uid, docs: clone(docs), writes: [], reads: [], conflicts: 0 };
  let pending = during;
  const tokenOf = (d) => (d && d.rev != null ? String(d.rev) : null);
  const db = {
    getUser: async () => (state.uid ? { id: state.uid } : null),
    getUserGoals: async (kind, opts) => {
      state.reads.push({ kind, opts });
      if (opts && opts.expectedUserId != null && opts.expectedUserId !== state.uid) return null;
      if (state.failRead) return null;
      return clone(state.docs[kind] || {});
    },
    saveUserGoals: async (kind, data, opts) => {
      if (opts && opts.expectedUserId && opts.expectedUserId !== state.uid) return { error: { message: 'Account changed' } };
      state.docs[kind] = clone(data); state.writes.push({ kind, data: clone(data), via: 'upsert' });
      return { ok: true };
    },
  };
  if (cas) {
    db.saveUserGoalsIfRev = async (kind, data, expectedRev, expectedUid) => {
      if (expectedUid == null) return { error: { message: 'saveUserGoalsIfRev requires expectedUid' } };
      if (String(expectedUid) !== String(state.uid)) return { accountChanged: true, error: { message: 'Account changed' } };
      if (pending) { const f = pending; pending = null; await f(state); }
      if (tokenOf(state.docs[kind]) !== (expectedRev == null ? null : String(expectedRev))) { state.conflicts += 1; return { conflict: true }; }
      state.docs[kind] = clone(data); state.writes.push({ kind, data: clone(data), via: 'cas' });
      return { ok: true };
    };
  }
  return { db, state };
}
// Another device's save, as every new writer makes it: its own change, the rev moved on.
const elsewhere = (patch) => (state) => {
  const cur = state.docs.profile_custom || {};
  state.docs.profile_custom = { ...cur, ...patch, rev: PC.bsProfileRev(cur) + 1 };
};

test('a save that lands mid-write is kept, and the writer puts its own change over it', async () => {
  const { db, state } = casDb({ docs: { profile_custom: { bio: 'Old bio', look: { paper: 'dark' }, rev: 3 } }, during: elsewhere({ look: { paper: 'bone' } }) });
  const res = await PC.bsProfileCustomWrite(db, 'u1', (d) => ({ ...d, bio: 'New bio' }));
  assert.equal(res.ok, true);
  assert.equal(state.conflicts, 1, 'the first write did not conflict');
  assert.deepEqual(state.docs.profile_custom, { bio: 'New bio', look: { paper: 'bone' }, rev: 5 }, 'the look saved mid-write was lost');
  assert.deepEqual(res.doc, state.docs.profile_custom, 'the caller gets the doc as saved');
  assert.ok(state.reads.every((r) => r.opts && r.opts.expectedUserId === 'u1'), 'a read was not bound to the account');
});

test('a doc written before revs (none) is stamped 1, and a junk rev is read as none', async () => {
  const a = casDb({ docs: { profile_custom: { bio: 'x' } } });
  await PC.bsProfileCustomWrite(a.db, 'u1', (d) => ({ ...d, line: 'Hi' }));
  assert.deepEqual(a.state.docs.profile_custom, { bio: 'x', line: 'Hi', rev: 1 });
  const b = casDb({ docs: { profile_custom: { rev: 'junk', bio: 'x' } } });
  const res = await PC.bsProfileCustomWrite(b.db, 'u1', (d) => ({ ...d, line: 'Hi' }));
  assert.equal(res.ok, true, 'a junk rev could never be written again');
  assert.equal(b.state.docs.profile_custom.rev, 1);
  assert.equal(PC.bsProfileRevToken({ rev: 'junk' }), 'junk', 'the compare is on the raw value Postgres reads');
  assert.equal(PC.bsProfileRevToken({}), null);
  assert.equal(PC.bsProfileRev({ rev: -2 }), 0);
  // rev is no profile field: the normalizer keeps it as it is, a junk one too (it is not its to drop).
  assert.equal(PC.bsNormalizeProfileCustom({ bio: 'x', rev: 4 }, 'u1').rev, 4);
  assert.equal(PC.bsNormalizeProfileCustom({ rev: 'junk' }, 'u1').rev, 'junk');
});

test('a given read is used once: the first try writes on it, a conflict reads again', async () => {
  const stored = { bio: 'Read by the caller', rev: 7 };
  const { db, state } = casDb({ docs: { profile_custom: stored }, during: elsewhere({ climbBg: 'dusk' }) });
  const res = await PC.bsProfileCustomWrite(db, 'u1', (d) => ({ ...d, bio: 'Mine' }), { stored: clone(stored) });
  assert.equal(res.ok, true);
  assert.equal(state.reads.length, 1, 'the caller\'s read was not used for the first try');
  assert.deepEqual(state.docs.profile_custom, { bio: 'Mine', climbBg: 'dusk', rev: 9 });
});

test('a read that fails, or answers for another account, writes nothing', async () => {
  const a = casDb({ docs: { profile_custom: { bio: 'Kept' } } });
  a.state.failRead = true;
  assert.deepEqual(await PC.bsProfileCustomWrite(a.db, 'u1', (d) => ({ ...d, bio: 'x' })), { ok: false, reason: 'unreadable' });
  const b = casDb({ uid: 'u2', docs: { profile_custom: { bio: 'Theirs' } } });
  assert.equal((await PC.bsProfileCustomWrite(b.db, 'u1', (d) => ({ ...d, bio: 'x' }))).reason, 'unreadable');
  // A conflict whose re-read fails writes nothing either: the doc as first read would undo the save since.
  const c = casDb({ docs: { profile_custom: { bio: 'Kept', rev: 1 } }, during: (s) => { elsewhere({ line: 'Other' })(s); s.failRead = true; } });
  assert.equal((await PC.bsProfileCustomWrite(c.db, 'u1', (d) => ({ ...d, bio: 'x' }))).reason, 'unreadable');
  for (const s of [a.state, b.state, c.state]) assert.equal(s.writes.length, 0);
  assert.equal(c.state.docs.profile_custom.line, 'Other');
});

test('the write is bound to the account the save started on; none at all writes nothing', async () => {
  const a = casDb({ docs: { profile_custom: {} }, during: (s) => { s.uid = 'u2'; } });
  // The switch lands after the read: the compare-and-set refuses it.
  a.db.saveUserGoalsIfRev = ((orig) => async (...args) => { a.state.uid = 'u2'; return orig(...args); })(a.db.saveUserGoalsIfRev);
  assert.equal((await PC.bsProfileCustomWrite(a.db, 'u1', (d) => ({ ...d, bio: 'x' }))).reason, 'account-changed');
  assert.equal(a.state.writes.length, 0);
  const b = casDb();
  assert.equal((await PC.bsProfileCustomWrite(b.db, null, (d) => d)).reason, 'signed-out');
  assert.equal((await PC.bsProfileCustomWrite(b.db, 'u1', () => null)).reason, 'unchanged');
  assert.equal(b.state.writes.length, 0);
});

test('every try lost to another save gives up with nothing written', async () => {
  const { db, state } = casDb({ docs: { profile_custom: { rev: 1 } } });
  const orig = db.saveUserGoalsIfRev;
  db.saveUserGoalsIfRev = async (...args) => { elsewhere({ n: Math.random() })(state); return orig(...args); };
  const res = await PC.bsProfileCustomWrite(db, 'u1', (d) => ({ ...d, bio: 'x' }));
  assert.equal(res.reason, 'contended');
  assert.equal(state.conflicts, PC.BS_PROFILE_CAS_TRIES);
  assert.equal(state.writes.length, 0);
});

test('a backend without compare-and-set falls back to the account-bound upsert', async () => {
  const { db, state } = casDb({ docs: { profile_custom: { bio: 'x', rev: 2 } }, cas: false });
  const res = await PC.bsProfileCustomWrite(db, 'u1', (d) => ({ ...d, line: 'Hi' }));
  assert.equal(res.ok, true);
  assert.deepEqual(state.writes, [{ kind: 'profile_custom', data: { bio: 'x', line: 'Hi', rev: 3 }, via: 'upsert' }]);
  // Bound to the account there too: a switch after the read writes nothing.
  const b = casDb({ docs: { profile_custom: { bio: 'x' } }, cas: false });
  const up = b.db.saveUserGoals;
  b.db.saveUserGoals = async (...args) => { b.state.uid = 'u2'; return up(...args); };
  assert.equal((await PC.bsProfileCustomWrite(b.db, 'u1', (d) => ({ ...d, line: 'Hi' }))).ok, false);
  assert.equal(b.state.writes.length, 0);
});

test('two saves of the same field: the later one wins', async () => {
  const { db, state } = casDb({ docs: { profile_custom: { bio: 'Start', rev: 1 } }, during: elsewhere({ bio: 'From the app' }) });
  await PC.bsProfileCustomWrite(db, 'u1', (d) => ({ ...d, bio: 'From the website' }));
  assert.equal(state.docs.profile_custom.bio, 'From the website');
});

// ── settingsSync: the website's links (Settings and Edit profile) ─────────────────────────────
test('settingsSync: a link saved while the app saves the Bio keeps both', async () => {
  const { db, state } = casDb({ uid: 'a', docs: { profile_custom: { bio: 'Old', links: { youtube: 'v' }, rev: 2 }, client_identity: { name: 'N' } }, during: elsewhere({ bio: 'From the app' }) });
  await saveSettingsPatch(db, { instagram: 'coach', location: 'Austin' }, 'a');
  assert.deepEqual(state.docs.profile_custom, { bio: 'From the app', links: { youtube: 'v', instagram: 'coach' }, rev: 4 });
  assert.equal(state.docs.client_identity.location, 'Austin', 'another kind still saves as before');
  assert.equal(state.writes.find((w) => w.kind === 'client_identity').via, 'upsert');
  const b = casDb({ uid: 'a', docs: { profile_custom: { bio: 'Old', rev: 1 } }, during: elsewhere({ line: 'Other' }) });
  await saveAccountDocPatch(b.db, 'profile_custom', { headLinks: true }, 'a');
  assert.deepEqual(b.state.docs.profile_custom, { bio: 'Old', line: 'Other', headLinks: true, rev: 3 });
});

test('settingsSync: an account switch mid-write says so and writes nothing', async () => {
  const { db, state } = casDb({ uid: 'a', docs: { profile_custom: { rev: 1 } } });
  const orig = db.saveUserGoalsIfRev;
  db.saveUserGoalsIfRev = async (...args) => { state.uid = 'b'; return orig(...args); };
  await assert.rejects(saveSettingsPatch(db, { instagram: 'x' }, 'a'), /account changed/i);
  assert.equal(state.writes.length, 0);
});

// ── The app's Customize, driven for real ─────────────────────────────────────────────────────
const { loadBroadsheet, drive } = await import('./helpers/broadsheet-mount.mjs');
const mod = await loadBroadsheet(['BSProfileCustomizer']);
const withSurface = (fn) => {
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => ({}), body: {} };
  try { return fn(); } finally { globalThis.document = saved; }
};

test('Customize: a Bio saved while the website saves the look keeps both', async () => {
  const stored = { bio: 'hi', look: { paper: 'dark', accent: 'teal' }, rev: 5 };
  const { db, state } = casDb({ uid: 'u-me', docs: { profile_custom: stored }, during: elsewhere({ look: { paper: 'bone', accent: 'rust' } }) });
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'u-me' } }) };
  globalThis.window.shapeDb = db;
  globalThis.window.__bsToast = () => {};
  try {
    const d = withSurface(() => drive(mod.BSProfileCustomizer, { initial: stored, c: '#c9a227', INK: '#111', BG: '#fff', onClose() {}, onSave() {}, ownerUid: 'u-me' }));
    d.nodes().find((n) => n.props && n.props['data-cust-row'] === 'about').props.onClick();
    withSurface(() => d.render());
    d.nodes().find((n) => n.props && n.props['data-cust-field'] === 'bio').props.onChange({ target: { value: 'hello' } });
    withSurface(() => d.render());
    await withSurface(() => d.nodes().find((n) => n.props && n.props['data-cust-save'] != null).props.onClick());
  } finally { delete globalThis.window.shapeDb; delete globalThis.window.__bsToast; }
  assert.equal(state.conflicts, 1);
  assert.equal(state.docs.profile_custom.bio, 'hello');
  assert.deepEqual(state.docs.profile_custom.look, { paper: 'bone', accent: 'rust' }, 'the website\'s look, saved mid-write, was undone');
  assert.equal(state.docs.profile_custom.rev, 7);
});

// ── Nora's account setup moves the rev on ────────────────────────────────────────────────────
test('Nora\'s account setup moves the rev on, so a client save that read before it is made to read again', () => {
  const src = read('src/lib/ai/accountSetup.mjs');
  assert.match(src, /if \(c0\.kind === BS_PROFILE_CUSTOM_KIND\) \{[\s\S]*?data\.rev = bsProfileRev\(row \? row\.data : null\) \+ 1;/);
  // Its own guard stays the updated_at compare, asked for its rows back (a zero-row update is no error).
  assert.match(src, /\.update\(\{ data \}\)\.eq\('user_id', uid\)\.eq\('kind', c0\.kind\)\.eq\('updated_at', row\.updatedAt\)\.select\('kind'\)/);
  // The behaviour is in tests/nora-account-setup.test.mjs: the doc's rev after Confirm and after Undo.
});

// ── From the source: every writer goes through the helper ─────────────────────────────────────
test('every profile_custom writer writes through bsProfileCustomWrite, and none upserts it directly', () => {
  const web = read('public/newdesign/livingDesktop.jsx');
  assert.match(web, /await plib\.bsProfileCustomWrite\(window\.shapeDb, uid, make, \{ stored \}\)/);
  assert.doesNotMatch(web, /upsert\(\{ user_id: uid, kind: "profile_custom"/, 'the website editor still upserts the doc');
  const mine = read('mobile-app/src/broadsheet/BSMakeItYours.jsx');
  assert.match(mine, /await bsProfileCustomWrite\(window\.shapeDb, uid,/);
  assert.doesNotMatch(mine, /saveUserGoals\?\.\('profile_custom'/);
  const cust = read('mobile-app/src/broadsheet/BSProfileCustomizer.jsx');
  assert.match(cust, /await bsProfileCustomWrite\(window\.shapeDb, uid, make, \{ stored \}\)/);
  assert.doesNotMatch(cust, /saveUserGoals\?\.\('profile_custom'/);
  const sync = read('public/newdesign/settingsSync.mjs');
  assert.match(sync, /if\(kind===BS_PROFILE_CUSTOM_KIND\) \{\n\s*const res=await bsProfileCustomWrite\(/);
  // Both website loaders carry the compare-and-set the helper calls.
  assert.match(read('public/supabase.js'), /async saveUserGoalsIfRev\(kind, data, expectedRev, expectedUid\)/);
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /async saveUserGoalsIfRev\(kind, data, expectedRev, expectedUid\)/);
});

// A member's saved grocery lists — `user_goals` kind `client_grocery_lists`, shared by three writers: the
// app's Eat page, a list another member sent and saved from the chat (BSGroceryShare.jsx), and the
// website's grocery page (ClientGrocery.html). The app imports this file through the
// mobile-app/src/services/groceryLists.mjs shim; the website loads it as a module.
//
// ⚠ WHY A REVISION. The document used to be a bare array that every writer replaced whole, so two devices
// that read it, each changed something and each wrote back left only the later write: the other device's
// new list was gone from the cloud with nothing reporting it. The document is now { v, rev, lists }, every
// write is a compare-and-set on `rev` (shapeDb.saveUserGoalsIfRev), and a write that loses the race re-reads
// and merges again. No migration: the revision lives inside the jsonb document, as for client_recipes.
//
// ⚠ A BARE ARRAY STILL READS. An older build (an open tab, an installed app not yet updated) still writes
// one, unconditionally. Its lists are read as before, and since a build that does not merge cannot be
// trusted to have left a list out on purpose, a list missing from a bare array is never read as deleted.
//
// ⚠ EACH WRITER MERGES ITS OWN CHANGES, NOT ITS WHOLE STATE. A writer keeps the lists as it last synced
// them (the base, stored per account on the device). What differs between the base and its lists now is
// what it changed; what differs between the base and the cloud is what another device changed. Both are
// kept. With no base yet (a first sync on this device), the cloud's copy of a list wins over this device's.
//
// No `window` at module scope: every environment read is injected or happens at call time.

export const BS_GROCERY_LISTS_KIND = 'client_grocery_lists';
export const BS_GROCERY_LISTS_V = 1;

// How many times a contended write re-reads and merges again before giving up.
export const BS_GROCERY_LISTS_CAS_TRIES = 4;

const isList = (l) => !!(l && typeof l === 'object' && !Array.isArray(l) && typeof l.id === 'string' && l.id);

// The lists in a stored document: the revisioned { v, rev, lists }, or the bare array an older build wrote.
// Anything else (an absent document is {}) has none. A repeated id keeps its first list.
export function bsGroceryListsOf(raw) {
  const src = Array.isArray(raw) ? raw
    : (raw && typeof raw === 'object' && Array.isArray(raw.lists) ? raw.lists : []);
  const seen = new Set();
  const out = [];
  for (const l of src) {
    if (isList(l) && !seen.has(l.id)) { seen.add(l.id); out.push(l); }
  }
  return out;
}

// Whether the document was written by a build that merges: only then can a missing list be read as deleted.
export function bsGroceryListsRevised(raw) {
  return !!(raw && typeof raw === 'object' && !Array.isArray(raw) && raw.rev != null && Array.isArray(raw.lists));
}

// The revision as a non-negative integer, so the counter always moves forward from somewhere. ⚠ Not what
// the compare-and-set compares: that is bsGroceryListsRevToken.
export function bsGroceryListsRev(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.rev : null;
  const n = typeof r === 'number' && Number.isFinite(r) ? Math.floor(r) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// The value to compare-and-set on: the raw `rev` as a string, or null when there is none — which is how
// Postgres reads `data->>'rev'` on {} and on a bare array alike.
export function bsGroceryListsRevToken(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.rev == null) return null;
  return String(raw.rev);
}

// Content equality that ignores key order and undefined values, as jsonb does.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canon(v[k]);
    return o;
  }
  return v;
}
export function bsGrocerySame(a, b) {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

const byId = (lists) => {
  const m = new Map();
  for (const l of lists || []) if (isList(l) && !m.has(l.id)) m.set(l.id, l);
  return m;
};

// Merge this device's lists into the document just read.
//   base     the lists as this device last synced them, or null when it has none yet
//   local    this device's lists now, in the writer's own shape
//   remote   the stored document as just read
//   gone     ids this device deleted (the app's tombstones), honoured when there is no base to tell
//   same     (storedList, localList) => whether the local list is unchanged from the stored one
//   toStored (localList) => the list as the document stores it
// Returns the lists to store, whether they differ from the document's, and the delta this device should
// take: `put`, stored lists another device added or changed, and `drop`, ids another device deleted.
export function bsGroceryListsMerge({ base = null, local = [], remote, gone = [], same = bsGrocerySame, toStored = (l) => l } = {}) {
  const known = Array.isArray(base);
  const revised = bsGroceryListsRevised(remote);
  const remoteLists = bsGroceryListsOf(remote);
  const B = byId(known ? base : []);
  const L = byId(local);
  const R = byId(remoteLists);
  const tomb = new Set(Array.isArray(gone) ? gone : []);
  const put = [];
  const drop = [];
  const keep = new Map(); // id -> the version kept, for lists the cloud has
  const fresh = [];       // this device's lists the cloud doesn't have

  // What the cloud has that this device doesn't.
  for (const r of remoteLists) {
    if (L.has(r.id)) continue;
    const b = B.get(r.id);
    if (b) {
      // This device deleted it since it last synced. Another device's edit since then outranks the delete.
      if (!bsGrocerySame(b, r)) { keep.set(r.id, r); put.push(r); }
      continue;
    }
    if (!known && tomb.has(r.id)) continue; // deleted here before this device had a base
    keep.set(r.id, r);
    put.push(r);
  }

  // This device's lists.
  for (const l of L.values()) {
    const r = R.get(l.id);
    const b = B.get(l.id);
    const unchanged = !!b && same(b, l);
    if (r) {
      if (unchanged || !known) {
        // Not changed here (or no base to tell): the cloud's copy, which may carry another device's edit.
        keep.set(l.id, r);
        if (!same(r, l)) put.push(r);
      } else {
        keep.set(l.id, toStored(l));
      }
      continue;
    }
    if (unchanged && revised) { drop.push(l.id); continue; } // another device deleted it
    // New here, or missing from a bare array. Unchanged, it goes back as it was stored, not converted.
    fresh.push(unchanged ? b : toStored(l));
  }

  // ⚠ THE CLOUD'S ORDER, with this device's new lists in front. Each surface orders its own lists (the
  // app puts a new list first, the website last), so a merge in this device's order would differ from
  // the document on every sync and write it again only to reorder it, each device undoing the other.
  const lists = [...fresh, ...remoteLists.filter((r) => keep.has(r.id)).map((r) => keep.get(r.id))];
  return { lists, changed: !bsGrocerySame(lists, remoteLists), delta: { put, drop } };
}

// Take another device's changes into this device's lists. `used` is the local snapshot the merge read and
// `prev` the lists now; a list changed here since the merge read it is left alone, and the next sync
// carries that change. Returns `prev` itself when nothing changed, so a state setter sees no update.
//   fromStored (storedList, prevList) => the list in the writer's shape; `prevList` is this device's copy
//              it replaces (null for a new one), so state the document doesn't carry can be kept
//   at         'start' | 'end' for a new list
//   same       (prevList, usedList) => whether a list is unchanged here since the merge read it. ⚠ It must
//              ignore what the document doesn't carry (the website's ticks): a tick in that window would
//              otherwise skip another device's edit while the store records it as synced, and the next
//              sync would take the stale copy for an edit made here (Codex P1 on #2433).
export function bsGroceryListsApply(prev, used, delta, { fromStored = (l) => l, at = 'start', same = bsGrocerySame } = {}) {
  const put = (delta && delta.put) || [];
  const drop = (delta && delta.drop) || [];
  if (!put.length && !drop.length) return prev;
  const P = byId(prev);
  const U = byId(used);
  const untouched = (id) => {
    const p = P.get(id);
    const u = U.get(id);
    return (!p && !u) || (!!p && !!u && (p === u || same(p, u)));
  };
  let next = Array.isArray(prev) ? prev.slice() : [];
  let moved = false;
  const fresh = [];
  for (const r of put) {
    if (!untouched(r.id)) continue;
    const i = next.findIndex((l) => l && l.id === r.id);
    const v = fromStored(r, i >= 0 ? next[i] : null);
    if (i >= 0) next[i] = v; else fresh.push(v);
    moved = true;
  }
  if (fresh.length) next = at === 'end' ? [...next, ...fresh] : [...fresh, ...next];
  const gone = new Set(drop.filter(untouched));
  if (gone.size) { next = next.filter((l) => !(l && gone.has(l.id))); moved = true; }
  return moved ? next : prev;
}

// ---------------------------------------------------------------------------
// The store. `db` is shapeDb (or a function returning it, read at call time); `baseStore` keeps the base
// per account ({ get(uid), set(uid, lists) }, null for none). One lane per JavaScript runtime, shared by
// every store, so the chat's save and the Eat page never interleave a read and a write.

const LANE = { chain: Promise.resolve() };
export function bsGroceryListsSerial(step) {
  const run = LANE.chain.then(step, step);
  LANE.chain = run.then(() => {}, () => {});
  return run;
}

// A base kept in local storage under one key, for one account at a time. ⚠ The key is in the sign-out
// scrub (localScrub.mjs), since it holds the lists themselves.
export function bsGroceryListsBaseIn(storage, key) {
  const st = () => (typeof storage === 'function' ? storage() : storage);
  return {
    get(uid) {
      try {
        const s = st();
        const raw = s && s.getItem(key);
        const v = raw ? JSON.parse(raw) : null;
        return v && v.uid != null && String(v.uid) === String(uid) && Array.isArray(v.lists) ? v.lists : null;
      } catch (e) { return null; }
    },
    set(uid, lists) {
      try { const s = st(); if (s) s.setItem(key, JSON.stringify({ uid, lists })); } catch (e) { /* storage off or full */ }
    },
  };
}

// A page's own base: kept in memory for as long as the page's lists are, over the stored one. Where
// storage is denied the stored base never holds, and without this every sync would be a first sync, so a
// list deleted here would come back from the cloud. Made with the page and dropped with it, because a base
// that outlived the lists it describes (a page opened again with storage denied starts empty) would read
// every list as deleted here.
export function bsGroceryListsPageBase(stored) {
  const mem = { uid: null, lists: null };
  return {
    get(uid) {
      if (mem.uid != null && String(mem.uid) === String(uid)) return mem.lists;
      return stored ? stored.get(uid) : null;
    },
    set(uid, lists) {
      mem.uid = uid; mem.lists = lists;
      if (stored) stored.set(uid, lists);
    },
  };
}

// `session` (optional) returns the sign-out generation (the app's signOutGen(), the website's
// shapeDb.signOutGen). It is read when a commit starts and again before its write and before it settles:
// once a sign-out has begun, nothing is written or kept, since a sync that resumes after the sign-out's
// storage scrub would put the departing member's lists back for the next person on the device (Codex P1
// on #2433).
export function bsGroceryListsStore({ db, baseStore = null, session = null } = {}) {
  const getDb = () => (typeof db === 'function' ? db() : db);
  // An in-memory base for when there is no storage to keep one in.
  const mem = { uid: null, lists: null };
  const base = baseStore || {
    get: (uid) => (mem.uid != null && String(mem.uid) === String(uid) ? mem.lists : null),
    set: (uid, lists) => { mem.uid = uid; mem.lists = lists; },
  };

  const uidNow = async () => {
    try {
      const d = getDb();
      if (!d || !d.getUser) return null;
      const u = await d.getUser();
      return (u && u.id) || null;
    } catch (e) { return null; }
  };

  // The stored document, or null when it can't be known. getUserGoals answers null for no backend, no user
  // and a failed read, and {} for an absent document: a null declines the write, a {} is merged into.
  // ⚠ THE READ IS BOUND TO THE ACCOUNT (Codex P1 on #2433). A check of the account after the read can't
  // tell an A → B → A switch while it was in flight, which would merge B's lists into A's. So the read asks
  // for `uid`'s row only (`expectedUserId`): under another account's session the read policy returns no
  // row, never theirs. An older shapeDb ignores the option and reads as before.
  const readCloud = async (uid) => {
    try {
      const d = getDb();
      if (!d || !d.getUserGoals) return null;
      const v = await d.getUserGoals(BS_GROCERY_LISTS_KIND, { expectedUserId: uid });
      return v && typeof v === 'object' ? v : null;
    } catch (e) { return null; }
  };

  // Compare-and-set where the backend can. ⚠ The account goes into the writer, which resolves the user
  // itself: a switch after our own check would otherwise write this member's lists into the new account's
  // row. A backend without saveUserGoalsIfRev (an older shapeDb) writes unconditionally, bound to the
  // account, rather than not at all; the race stays open there until no such client is left.
  const writeDoc = async (next, expectedRev, uid) => {
    const d = getDb();
    if (d && d.saveUserGoalsIfRev) return d.saveUserGoalsIfRev(BS_GROCERY_LISTS_KIND, next, expectedRev, uid);
    if (d && d.saveUserGoals) return d.saveUserGoals(BS_GROCERY_LISTS_KIND, next, { expectedUserId: uid });
    return { error: { message: 'No backend' } };
  };

  // Read, change, compare-and-set, bound to the account that started it; a lost race re-reads and runs
  // `change` again on the newer document. `change(raw, uid)` returns { lists, write } plus anything to hand
  // back.
  const attempt = async (change, live) => {
    const uid0 = await uidNow();
    if (!uid0) return { ok: false, reason: 'signed-out' };
    for (let tries = 0; tries < BS_GROCERY_LISTS_CAS_TRIES; tries += 1) {
      const raw = await readCloud(uid0);
      if (raw === null) return { ok: false, reason: 'unreadable' };
      // getUserGoals resolves the user itself, so the document belongs to whoever was signed in then.
      const uid1 = await uidNow();
      if (!uid1 || String(uid1) !== String(uid0)) return { ok: false, reason: 'account-changed' };
      const out = change(raw, uid0) || {};
      if (!out.write) return { ...out, ok: true, wrote: false, uid: uid0 };
      const next = { v: BS_GROCERY_LISTS_V, rev: bsGroceryListsRev(raw) + 1, lists: out.lists };
      if (!live()) return { ok: false, reason: 'signed-out' };
      let res = null;
      try { res = await writeDoc(next, bsGroceryListsRevToken(raw), uid0); } catch (e) { return { ok: false, reason: 'write-failed' }; }
      if (res && res.conflict) continue; // another device wrote in between: read it and merge again
      if (res && res.accountChanged) return { ok: false, reason: 'account-changed' };
      if (!res || res.error || res.ok === false) return { ok: false, reason: 'write-failed' };
      return { ...out, ok: true, wrote: true, uid: uid0, doc: next };
    }
    // Every attempt lost the race. Nothing was written and nothing was lost.
    return { ok: false, reason: 'contended' };
  };

  // `settle(result)` runs on success inside the lane, so nothing else reads or writes before it is done.
  // Resolves, never rejects: a sync runs from a page's effect, with nothing there to catch it.
  // ⚠ The sign-out generation is read when the commit is asked for, not when its turn in the lane comes: a
  // sync queued behind another before a sign-out would otherwise read the bumped value and run as live
  // (Codex P1 on #2433).
  const commit = (change, settle) => {
    const gen = session ? session() : null;
    const live = () => !session || session() === gen;
    return bsGroceryListsSerial(async () => {
      let res;
      try { res = await attempt(change, live); } catch (e) { return { ok: false, reason: 'failed' }; }
      if (res.ok && !live()) return { ok: false, reason: 'signed-out' }; // settle nothing after a sign-out began
      if (res.ok && settle) { try { settle(res); } catch (e) { /* the base stays as it was */ } }
      return res;
    });
  };

  // Sync a writer's lists with the cloud. A sync already queued and not yet started is shared, and runs
  // with the callbacks of the latest call: `getLocal` and `getGone` when it reads the lists, `apply` when
  // it is done. So a page that closed and opened again while a sync was queued gets that sync's changes.
  // `base` (optional) is the page's own (bsGroceryListsPageBase); the store's stored base otherwise.
  // `apply(delta, used)` takes another device's changes into the writer's lists, keeping them where the
  // next load reads them where it can (storage may be denied: the lists on screen still take them), and
  // returns false when they did not reach the lists the next sync will read (the page had closed). ⚠ "Reached" means `getLocal` returns them before `apply` returns, not only a
  // state update queued for the next render: a sync queued behind this one runs straight after it, and
  // reading the lists without them it would take them for lists deleted here (Codex P1 on #2433).
  // ⚠ THE BASE NEVER RUNS AHEAD OF THE LISTS. It becomes the merged lists only once `apply` has taken the
  // delta in: a base holding a list this device's lists don't have reads it, at the next sync, as deleted
  // here, and deletes it from the cloud. With no `apply`, one that returns false, or one that throws, a
  // sync that brought changes leaves the base as it was, and the next sync brings them again.
  let queued = null;
  let latest = {};
  const sync = (opts = {}) => {
    latest = opts;
    if (queued) return queued;
    const run = commit((raw, uid) => {
      if (queued === run) queued = null; // from here a change needs a sync of its own
      const { getLocal, getGone, same, toStored } = latest;
      const local = (getLocal && getLocal()) || [];
      const gone = getGone ? getGone() : [];
      const m = bsGroceryListsMerge({ base: (latest.base || base).get(uid), local, remote: raw, gone, same, toStored });
      return { lists: m.lists, write: m.changed, delta: m.delta, used: local };
    }, (res) => {
      const pending = !!(res.delta && (res.delta.put.length || res.delta.drop.length));
      if (pending) {
        const { apply } = latest;
        if (!apply) return;
        let took = true;
        try { took = apply(res.delta, res.used); } catch (e) { return; }
        if (took === false) return;
      }
      (latest.base || base).set(res.uid, res.lists);
    }).then((res) => {
      if (queued === run) queued = null;
      return res;
    });
    queued = run;
    return run;
  };

  // Add one list (a list another member sent) unless the document has it already.
  const add = (list) => commit((raw) => {
    const lists = bsGroceryListsOf(raw);
    if (!isList(list) || lists.some((l) => l.id === list.id)) return { lists, write: false };
    return { lists: [list, ...lists], write: true };
  });

  return { uidNow, readCloud, commit, sync, add, base };
}

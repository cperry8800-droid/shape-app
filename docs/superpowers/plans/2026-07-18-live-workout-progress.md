# Live Workout Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boost senders (and coaches passing the same audience test) see a live session's current exercise / set counts, broadcast from the session player through a new RLS-enforced `user_activity_live` row.

**Architecture:** The session player derives a small payload (names + set counts, **never loads/RPE**) via a pure tested module, stamps the member's own resolved share tier (`public`/`followers`; `private` writes nothing), and upserts one row per member. RLS + Supabase realtime (`postgres_changes` respects RLS) enforce the audience server-side. Two consumers: a live line in `BSLiveBoostSheet`, and a real mode in the coach's `BSProLiveWatch` (today 100% demo).

**Tech Stack:** Supabase (RLS + realtime), pure ESM service module + `node --test`, React (broadsheet client + pros modules), i18n ×13.

**Spec:** `docs/superpowers/specs/2026-07-18-live-workout-progress-design.md` — read it first; owner decisions there are binding (share-rule audience, no coach exception, no loads in v1, both consumers, no new toggle).

## Global Constraints

- Theme tokens only (`t.INK/PAPER/...`); teal literal only as `t.isLight ? '#0a8f87' : '#34d6c5'`.
- All files LF (verify `tr -cd '\r' < f | wc -c` → 0). Mobile-only — **no website files, no `?v=` anywhere**.
- i18n: `tr('<ns>:<key>', { defaultValue })` via the module's `useShapeTr()`; **literal keys only** (no concatenated key families — the #1759 lesson); new keys land in the already-registered `feed` + `coach` namespaces (NO new namespace, NO test-list edit needed). Never key React off a translated string.
- Honest-absent everywhere: no readable row → render exactly today's UI; never a fabricated exercise or count.
- Fail closed: a failed settings READ → `null` audience → write nothing (the #1613 Codex-P1 precedent at `shapeBackend.js:2446-2447`).
- Verify per task: JSX parse (`node -e "require('@babel/parser').parse(...)"`) · `npm test` · PowerShell `VITE_BASE=/m/` build exit 0 (NEVER Git Bash for the build — MSYS mangles `/m/`).
- Commit per task; branch `claude/live-progress`; PR only when the whole plan is done.

---

### Task 1: Migration — `user_activity_live`

**Files:**
- Create: `supabase-migrations/2026-07-18-user-activity-live.sql`

**Interfaces:**
- Produces: table `public.user_activity_live (user_id pk, visibility, payload, started_at, updated_at, expires_at)`; RLS owner-all + audience-read; realtime publication membership. Tasks 3+ write/read it. The OWNER applies it (raw link on the PR); all code degrades to a silent no-op until then.

- [ ] **Step 1: Write the migration** (idempotent, additive — the house pattern from `2026-06-09-user-activity.sql`):

```sql
-- Live set-by-set workout progress, broadcast by the session player so a boost
-- sender (and a coach passing the same audience test) can see the session as it
-- happens. One row per member; the OWNER'S OWN CLIENT stamps `visibility` from
-- its resolved share rule (bsWorkoutSharePrivacy): 'public' | 'followers'.
-- A private member's row is ABSENT by design — there is no 'private' value, so
-- absence can never leak a setting choice. Payload carries names + set counts
-- ONLY (never loads/RPE — spec 2026-07-18, owner decision 2).
-- Idempotent — safe to re-run.

create table if not exists public.user_activity_live (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  visibility text not null check (visibility in ('public','followers')),
  payload    jsonb not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);

alter table public.user_activity_live enable row level security;

drop policy if exists "live owner write" on public.user_activity_live;
create policy "live owner write" on public.user_activity_live
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Audience read: self, public, or followers-tier + an ACCEPTED follow.
-- Realtime postgres_changes enforces this per subscriber, so a followers-tier
-- row is never pushed to a non-follower. (DELETE events carry only the PK —
-- replica identity — which is equivalent to the already-public dot going out.)
drop policy if exists "live read" on public.user_activity_live;
create policy "live read" on public.user_activity_live
  for select to authenticated using (
    user_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'followers' and exists (
          select 1 from public.user_follows
          where follower_id = auth.uid() and following_id = user_id and status = 'accepted'))
  );

-- Reads filter `expires_at > now()` in code (the get_active_activities pattern);
-- RLS deliberately does not.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_activity_live'
  ) then
    alter publication supabase_realtime add table public.user_activity_live;
  end if;
end $$;
```

- [ ] **Step 2: Sanity-check the referenced shapes against the repo** (not the live DB): `grep -n "status = 'accepted'" supabase-migrations/2026-06-08-follow-requests.sql` (columns `follower_id`/`following_id`/`status` exist) and `grep -n "pg_publication_tables" supabase-migrations/2026-06-09-user-activity.sql` (the publication guard matches the house pattern). Expected: both hit.
- [ ] **Step 3: LF check** — `tr -cd '\r' < supabase-migrations/2026-07-18-user-activity-live.sql | wc -c` → `0`.
- [ ] **Step 4: Commit** — `git add supabase-migrations/2026-07-18-user-activity-live.sql && git commit -m "live-progress: user_activity_live migration (RLS audience + realtime)"`

---

### Task 2: Pure module `liveProgress.mjs` (TDD)

**Files:**
- Create: `mobile-app/src/services/liveProgress.mjs`
- Create: `tests/live-progress.test.mjs` (auto-discovered — `npm test` globs `tests/**/*.test.mjs`)

**Interfaces:**
- Consumes: `bsWorkoutSharePrivacy` from `./workoutShare.mjs` (same directory; signature `bsWorkoutSharePrivacy(doc) → 'public'|'followers'|'private'`).
- Produces (exact — Tasks 3–6 rely on these):
  - `bsLiveProgressPayload(moves, completed, moveIdx, resting)` → `{ v:1, title?, exercises:[{n,done,total}], curIdx, resting, setsDone, setsTotal } | null` — `moves` is the player's state shape `[{ m: string, sets: number, ... }]` (name field is **`m`**), `completed` is the `{ '<moveIdx>-<setIdx>': true }` map, `title` is attached by the caller (Task 4), not this function.
  - `bsLiveAudience(settingsDoc, readFailed)` → `'public' | 'followers' | null`.
  - `bsShouldPushProgress(prevPayload, nextPayload, lastPushAt, now)` → `boolean`.
  - `bsValidLivePayload(raw)` → sanitized payload `| null` — every consumer (Tasks 5–6) renders ONLY through this.

- [ ] **Step 1: Write the failing tests**

```js
// tests/live-progress.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsLiveProgressPayload, bsLiveAudience, bsShouldPushProgress, bsValidLivePayload } from '../mobile-app/src/services/liveProgress.mjs';

const MOVES = [ { m: 'Pull-up', sets: 4 }, { m: 'Barbell row', sets: 4 }, { m: '', sets: 3 } ];
const DONE = { '0-0': true, '0-1': true, '0-2': true, '0-3': true, '1-0': true, '1-1': true };

test('payload derives per-move done/total from the completed map', () => {
  const p = bsLiveProgressPayload(MOVES, DONE, 1, true);
  assert.equal(p.v, 1);
  assert.deepEqual(p.exercises, [
    { n: 'Pull-up', done: 4, total: 4 },
    { n: 'Barbell row', done: 2, total: 4 },
    { n: 'Exercise', done: 0, total: 3 },   // unnamed open-session move → honest generic
  ]);
  assert.equal(p.curIdx, 1);
  assert.equal(p.resting, true);
  assert.equal(p.setsDone, 6);
  assert.equal(p.setsTotal, 11);
});

test('payload is null when there is nothing meaningful', () => {
  assert.equal(bsLiveProgressPayload([], {}, 0, false), null);
  assert.equal(bsLiveProgressPayload(null, {}, 0, false), null);
});

test('payload never carries loads/reps/rpe even when moves do', () => {
  const p = bsLiveProgressPayload([{ m: 'Squat', sets: 2, l: '225 lb', reps: '5', rpe: '9' }], {}, 0, false);
  assert.deepEqual(Object.keys(p.exercises[0]).sort(), ['done', 'n', 'total']);
});

test('audience maps the share rule; private → null; failed read → null (fail closed)', () => {
  assert.equal(bsLiveAudience({ shareWorkoutData: 'On', profileVisibility: 'Public' }, false), 'public');
  assert.equal(bsLiveAudience({ shareWorkoutData: 'On', profileVisibility: 'Just friends' }, false), 'followers');
  assert.equal(bsLiveAudience({ shareWorkoutData: 'Off', profileVisibility: 'Public' }, false), null);
  assert.equal(bsLiveAudience({ profileVisibility: 'Private' }, false), null);
  assert.equal(bsLiveAudience({}, false), 'public');       // empty-but-readable doc = documented On·Public default
  assert.equal(bsLiveAudience({ shareWorkoutData: 'On', profileVisibility: 'Public' }, true), null); // read FAILED → closed
});

test('payload bounds hostile state: Infinity/fractional sets clamp, never loop', () => {
  const p = bsLiveProgressPayload([{ m: 'X', sets: Infinity }, { m: 'Y', sets: 2.7 }], {}, 0, false);
  assert.equal(p.exercises[0].total, 1);   // Infinity is not finite → floor 1, no infinite loop
  assert.equal(p.exercises[1].total, 2);
});

test('bsValidLivePayload accepts its own builder output and rejects malformed wire data', () => {
  const own = bsLiveProgressPayload(MOVES, DONE, 1, true);
  assert.ok(bsValidLivePayload(own));
  assert.equal(bsValidLivePayload(null), null);
  assert.equal(bsValidLivePayload({ v: 2, exercises: [] }), null);
  assert.equal(bsValidLivePayload({ v: 1, exercises: [{ n: 'A', done: 3, total: 2 }], curIdx: 0, setsDone: 3, setsTotal: 2 }), null); // done > total
  assert.equal(bsValidLivePayload({ v: 1, exercises: [{ n: 'A', done: 0, total: 2 }], curIdx: 5, setsDone: 0, setsTotal: 2 }), null); // curIdx out of range
});

test('throttle: unchanged never pushes; changed pushes only past the 4s floor', () => {
  const a = bsLiveProgressPayload(MOVES, DONE, 1, false);
  const b = bsLiveProgressPayload(MOVES, { ...DONE, '1-2': true }, 1, false);
  const rest = bsLiveProgressPayload(MOVES, DONE, 1, true);
  assert.equal(bsShouldPushProgress(a, a, 0, 100000), false);          // no change, plenty of time
  assert.equal(bsShouldPushProgress(a, b, 100000, 101000), false);     // changed but inside the floor
  assert.equal(bsShouldPushProgress(a, b, 100000, 104100), true);      // changed + past the floor
  assert.equal(bsShouldPushProgress(a, rest, 100000, 104100), true);   // a resting flip is material
  assert.equal(bsShouldPushProgress(null, a, 0, 1000), true);          // first push always goes
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/live-progress.test.mjs` → FAIL (module not found).
- [ ] **Step 3: Write the module**

```js
// mobile-app/src/services/liveProgress.mjs
// Live workout-progress broadcast (spec 2026-07-18): the ONE derivation of the
// payload the session player writes to user_activity_live, the audience rule,
// and the push throttle. Pure — timestamps injected; unit-tested.
//
// PRIVACY INVARIANTS (owner decisions — do not widen without a new spec):
//  · The payload carries exercise NAMES + SET COUNTS only. Never loads, reps
//    figures, RPE, or HR — the audience can include followers or the public.
//  · Audience is the member's own share rule (bsWorkoutSharePrivacy).
//    'private' → null → the caller writes NOTHING (absence, not filtering).
//  · A FAILED settings read is null too (fail closed — the #1613 lesson).
import { bsWorkoutSharePrivacy } from './workoutShare.mjs';

const PUSH_FLOOR_MS = 4000;
const MAX_SETS = 50;      // per-move bound — also blocks Infinity/fractional state (review: CodeRabbit)
const MAX_EXERCISES = 60;

const intSets = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(MAX_SETS, Math.max(1, Math.floor(n))) : 1;
};

export function bsLiveProgressPayload(moves, completed, moveIdx, resting) {
  if (!Array.isArray(moves) || moves.length === 0) return null;
  const done = completed && typeof completed === 'object' ? completed : {};
  const exercises = moves.slice(0, MAX_EXERCISES).map((m, i) => {
    const total = intSets(m && m.sets);
    let d = 0;
    for (let s = 0; s < total; s++) if (done[`${i}-${s}`]) d++;
    return { n: String((m && m.m) || '').trim().slice(0, 80) || 'Exercise', done: d, total };
  });
  const setsTotal = exercises.reduce((s, e) => s + e.total, 0);
  const setsDone = exercises.reduce((s, e) => s + e.done, 0);
  const curIdx = Number.isInteger(moveIdx) && moveIdx >= 0 && moveIdx < exercises.length ? moveIdx : -1;
  return { v: 1, exercises, curIdx, resting: !!resting, setsDone, setsTotal };
}

export function bsLiveAudience(settingsDoc, readFailed) {
  if (readFailed) return null;
  const tier = bsWorkoutSharePrivacy(settingsDoc);
  return tier === 'private' ? null : tier;
}

export function bsShouldPushProgress(prevPayload, nextPayload, lastPushAt, now) {
  if (!nextPayload) return false;
  if (JSON.stringify(prevPayload) === JSON.stringify(nextPayload)) return false;
  return (Number(now) || 0) - (Number(lastPushAt) || 0) >= PUSH_FLOOR_MS;
}

// Consumer-side structural validator (review: CodeRabbit) — jsonb off the wire
// is attacker-shaped until proven otherwise. Anything malformed → null → the
// honest-absent render; a v1 consumer never guesses at a partial shape.
export function bsValidLivePayload(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  if (!Array.isArray(raw.exercises) || raw.exercises.length === 0 || raw.exercises.length > MAX_EXERCISES) return null;
  const okInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  for (const e of raw.exercises) {
    if (!e || typeof e !== 'object') return null;
    if (typeof e.n !== 'string' || !e.n || e.n.length > 80) return null;
    if (!okInt(e.total, 1, MAX_SETS) || !okInt(e.done, 0, e.total)) return null;
  }
  if (!Number.isInteger(raw.curIdx) || raw.curIdx < -1 || raw.curIdx >= raw.exercises.length) return null;
  if (!okInt(raw.setsDone, 0, MAX_SETS * MAX_EXERCISES) || !okInt(raw.setsTotal, 1, MAX_SETS * MAX_EXERCISES) || raw.setsDone > raw.setsTotal) return null;
  return { v: 1, title: typeof raw.title === 'string' ? raw.title.slice(0, 80) : '', exercises: raw.exercises.map((e) => ({ n: e.n, done: e.done, total: e.total })), curIdx: raw.curIdx, resting: !!raw.resting, setsDone: raw.setsDone, setsTotal: raw.setsTotal };
}
```

- [ ] **Step 4: Run to verify pass** — `node --test tests/live-progress.test.mjs` → 7 pass. Then the full suite: `npm test` → 637 pass (630 + these 7), 0 fail.
- [ ] **Step 5: Commit** — `git add mobile-app/src/services/liveProgress.mjs tests/live-progress.test.mjs && git commit -m "live-progress: pure payload/audience/throttle module (TDD)"`

---

### Task 3: `window.ShapeLiveProgress` (shapeBackend.js)

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` — add one import near the top-of-file import block (`import { bsLiveAudience } from './liveProgress.mjs';` beside the existing `./workoutShare.mjs` import at line ~10) and one new section **directly below the ShapePresence block** (`window.ShapePresence = {...}` ends near line ~5375).

**Interfaces:**
- Consumes: `bsLiveAudience` (Task 2); the module's existing `supabase` client + auth `state`.
- Produces: `window.ShapeLiveProgress = { push(payload), clear(), get(uid), subscribe(uid, cb) }` — Tasks 4–6 call exactly these. `get` resolves `{ payload, visibility, started_at, updated_at } | null`; `subscribe` invokes `cb(rowOrNull)` and returns an unsubscribe function.

- [ ] **Step 1: Add the section** (below the ShapePresence exposure; follow its style):

```js
// ─── Live workout progress (spec 2026-07-18) ────────────────────────────────
// One row per member in user_activity_live; RLS enforces the audience.
// The AUDIENCE is resolved PER PUSH — deliberately NO cache (spec review:
// Codex P1 + CodeRabbit CWE-862 — a cache breaks retro-tightening inside its
// TTL, and a cached success masks a later failed read, defeating fail-closed).
// The writer's 4s throttle bounds this to one small single-row select per push.
// FAILS CLOSED: a failed read → null → clear(), never a broadcast (#1613).
// Push/clear are GENERATION-guarded so an in-flight push can never resurrect
// the row after session end (spec review: CodeRabbit race finding).
// Pre-migration degrade: any error is a silent no-op (the feature just
// doesn't exist until the OWNER applies the SQL).
let _liveGen = 0;
async function _liveAudience() {
  let doc = null; let failed = false;
  try {
    const { data, error } = await supabase.from('user_goals').select('data')
      .eq('user_id', state.user.id).eq('kind', 'client_settings').maybeSingle();
    if (error) failed = true; else doc = (data && data.data) || null;
  } catch (e) { failed = true; }
  return bsLiveAudience(doc, failed);
}
async function livePush(payload) {
  try {
    if (!state.user || !payload) return;
    const gen = _liveGen;
    const vis = await _liveAudience();
    if (gen !== _liveGen) return;              // clear() ran while we awaited — session over
    if (!vis) { await liveClear(); return; }   // private (or read-failed) → absence
    const now = new Date();
    if (gen !== _liveGen) return;
    await supabase.from('user_activity_live').upsert({
      user_id: state.user.id, visibility: vis, payload,
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 6 * 3600 * 1000).toISOString(),
    }, { onConflict: 'user_id' });
  } catch (e) {}
}
async function liveClear() {
  try { if (state.user) await supabase.from('user_activity_live').delete().eq('user_id', state.user.id); } catch (e) {}
}
window.ShapeLiveProgress = {
  push: livePush,
  clear: () => { _liveGen++; return liveClear(); },  // bump FIRST: any awaited push aborts
  get: async (uid) => {
    try {
      const { data } = await supabase.from('user_activity_live')
        .select('payload, visibility, started_at, updated_at, expires_at')
        .eq('user_id', uid).gt('expires_at', new Date().toISOString()).maybeSingle();
      return data || null;   // RLS decides; absent/error → null (honest-absent)
    } catch (e) { return null; }
  },
  subscribe: (uid, cb) => {
    try {
      const channel = supabase.channel(`live-progress-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_activity_live', filter: `user_id=eq.${uid}` },
          (payload) => { try { cb(payload.eventType === 'DELETE' ? null : (payload.new || null)); } catch (e) {} })
        .subscribe();
      return () => { try { supabase.removeChannel(channel); } catch (e) {} };
    } catch (e) { return () => {}; }
  },
};
```

- [ ] **Step 2: Note on `started_at`** — the DB default (`now()` at first upsert) is the session start; later upserts must NOT send `started_at` (they don't — it's absent from the push object, so the original value survives the upsert **only if the column is omitted**… it is: `push` never includes it). The coach console derives elapsed from it.
- [ ] **Step 3: Verify** — `node --check mobile-app/src/services/shapeBackend.js` → clean; `npm test` → 635.
- [ ] **Step 4: Commit** — `git add mobile-app/src/services/shapeBackend.js && git commit -m "live-progress: ShapeLiveProgress push/clear/get/subscribe (per-push fail-closed audience; generation-guarded clear)"`

---

### Task 4: Writer — `BSSession` broadcasts

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSSession` (function starts line ~21257) + an import: add `import { bsLiveProgressPayload, bsShouldPushProgress } from '../services/liveProgress.mjs';` beside the module's existing `../services/` imports.

**Interfaces:**
- Consumes: `bsLiveProgressPayload`/`bsShouldPushProgress` (Task 2), `window.ShapeLiveProgress.push/clear` (Task 3). Player state already in scope: `moves` (`[{ m, sets, ... }]`), `completed` (`{ '<i>-<s>': true }`), `moveIdx`, `restEnd` (ms timestamp | null), `title` prop.
- Produces: nothing new for later tasks — the broadcast side is complete after this.

- [ ] **Step 1: Add the broadcast effect** inside `BSSession`, directly below the existing activity effect at line ~21334 (`React.useEffect(() => { bsSetMyActivity('workout'); }, []);`):

```jsx
  // ── Live progress broadcast (spec 2026-07-18) ──────────────────────────────
  // Push names + set counts (NEVER loads/RPE) through the throttle whenever the
  // watched state changes; trailing retry so a change inside the 4s floor still
  // lands. Clear on end/unmount so live detail can never outlive the dot.
  const liveRef = React.useRef({ prev: null, lastAt: 0, timer: null, restTimer: null });
  React.useEffect(() => {
    const resting = !!restEnd && restEnd > Date.now();
    const base = bsLiveProgressPayload(moves, completed, moveIdx, resting);
    const next = base ? { ...base, title: String(title || '').slice(0, 80) } : null;
    const lr = liveRef.current;
    const fire = () => {
      lr.prev = next; lr.lastAt = Date.now();
      try { window.ShapeLiveProgress && window.ShapeLiveProgress.push(next); } catch (e) {}
    };
    if (lr.timer) { clearTimeout(lr.timer); lr.timer = null; }
    if (lr.restTimer) { clearTimeout(lr.restTimer); lr.restTimer = null; }
    if (!next) return;
    if (bsShouldPushProgress(lr.prev, next, lr.lastAt, Date.now())) fire();
    else if (JSON.stringify(lr.prev) !== JSON.stringify(next)) {
      lr.timer = setTimeout(fire, Math.max(250, 4000 - (Date.now() - lr.lastAt)));   // trailing push
    }
    // Rest-expiry re-push (spec review, Codex P2): a rest that counts down to
    // zero changes NO dependency — restEnd stays set, Date.now() just passes it
    // — so viewers would hold `resting: true` until the next tap. While resting,
    // schedule a push of the resting:false payload at expiry (same floor rules).
    if (resting) {
      lr.restTimer = setTimeout(() => {
        const after = { ...next, resting: false };
        if (bsShouldPushProgress(lr.prev, after, lr.lastAt, Date.now())) {
          lr.prev = after; lr.lastAt = Date.now();
          try { window.ShapeLiveProgress && window.ShapeLiveProgress.push(after); } catch (e) {}
        }
      }, Math.max(250, restEnd - Date.now() + 4050));   // past the floor by construction
    }
  }, [moves, completed, moveIdx, restEnd, title]);
  React.useEffect(() => () => {
    const lr = liveRef.current;
    if (lr.timer) clearTimeout(lr.timer);
    if (lr.restTimer) clearTimeout(lr.restTimer);
    try { window.ShapeLiveProgress && window.ShapeLiveProgress.clear(); } catch (e) {}
  }, []);
```

- [ ] **Step 2: Clear at the two explicit end sites** — at line ~21335 (`const endWorkout = () => { bsSetMyActivity(null); onBack(); };`) and the finish path at line ~21573 (`bsSetMyActivity(null);`), add directly beside each `bsSetMyActivity(null)`:

```jsx
    try { window.ShapeLiveProgress && window.ShapeLiveProgress.clear(); } catch (e) {}
```

(The unmount cleanup in Step 1 also covers both — the explicit calls make the clear immediate rather than unmount-ordered.)

- [ ] **Step 3: Verify** — JSX parse on the client file → clean; PowerShell `VITE_BASE=/m/` build → exit 0; `npm test` → 635.
- [ ] **Step 4: Commit** — `git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx && git commit -m "live-progress: BSSession broadcasts through the throttle (trailing push; clear on end)"`

---

### Task 5: Consumer 1 — the boost sheet's live line (+ en keys)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSLiveBoostSheet` (function starts line ~7657).
- Modify: `mobile-app/src/i18n/catalogs/en/feed.json` — 2 new keys.

**Interfaces:**
- Consumes: `window.ShapeLiveProgress.get/subscribe` (Task 3) and `bsValidLivePayload` (Task 2 — extend the Task 4 import line in this same file to include it). The sheet already has `person.userId`, `kind` (`'workout'|'cooking'`), `accent`, `t`, and the `mins` effect as the anchor.
- Produces: `feed:boost.liveSet` = `set {done, number} of {total, number}` · `feed:boost.liveSets` = `{done, number}/{total, number} sets` (Task 7 translates ×12).

- [ ] **Step 1: Add the keys to `en/feed.json`** (flat dotted keys, keep file order tidy):

```json
"boost.liveSet": "set {done, number} of {total, number}",
"boost.liveSets": "{done, number}/{total, number} sets"
```

- [ ] **Step 2: Add live state + subscription** inside `BSLiveBoostSheet`, directly below the existing `mins` effect (after line ~7678):

```jsx
  const tr = useShapeTr();
  // Live set-by-set line (spec 2026-07-18) — renders ONLY when a row is
  // readable under RLS. No row → today's sheet, byte-identical; absence is
  // deliberately unremarkable (never "they hid this" — that would leak the
  // existence of a setting choice). Demo people (no userId) never fetch.
  const [live, setLive] = useStateBSC(null);
  React.useEffect(() => {
    if (!person.userId || kind !== 'workout' || !window.ShapeLiveProgress) return undefined;
    let on = true; let expTimer = null;
    const take = (row) => {
      if (!on) return;
      setLive(row);
      // Subscription-side expiry (spec review): the SQL filter protects get()
      // only — an already-open sheet must drop a row when its expires_at passes.
      if (expTimer) { clearTimeout(expTimer); expTimer = null; }
      const expMs = row && row.expires_at ? new Date(row.expires_at).getTime() - Date.now() : 0;
      if (expMs > 0) expTimer = setTimeout(() => { if (on) setLive(null); }, expMs);
    };
    window.ShapeLiveProgress.get(person.userId).then(take).catch(() => {});
    const off = window.ShapeLiveProgress.subscribe(person.userId, take);
    return () => { on = false; if (expTimer) clearTimeout(expTimer); off(); };
  }, [person.userId, kind]);
  const lp = live ? bsValidLivePayload(live.payload) : null;   // malformed/unknown wire shape → render nothing
  const lpCur = lp && lp.curIdx >= 0 && lp.exercises && lp.exercises[lp.curIdx] ? lp.exercises[lp.curIdx] : null;
```

- [ ] **Step 3: Render the line** — inside the header block, directly under the element that renders the "In a workout now · N min in" copy (same indentation level, immediately after that line's closing tag):

```jsx
            {lp && (
              <div style={{ marginTop: 5 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lpCur ? <>
                    <span style={{ color: t.INK, fontWeight: 800 }}>{lpCur.n}</span>
                    {' · '}{tr('feed:boost.liveSet', { done: Math.min(lpCur.done + 1, lpCur.total), total: lpCur.total, defaultValue: 'set {done, number} of {total, number}' })}
                    {' — '}
                  </> : null}
                  {tr('feed:boost.liveSets', { done: lp.setsDone, total: lp.setsTotal, defaultValue: '{done, number}/{total, number} sets' })}
                </div>
                <div aria-hidden style={{ marginTop: 4, height: 2, background: bsTHexA(t.INK, 0.12) }}>
                  <div style={{ height: 2, width: `${lp.setsTotal ? Math.round((lp.setsDone / lp.setsTotal) * 100) : 0}%`, background: accent }} />
                </div>
              </div>
            )}
```

(The "current set" figure is `done + 1` clamped to `total` — the set they're ON, not the count finished; the summary pair stays raw done/total.)

- [ ] **Step 4: Seed the 2 keys into ALL 13 locale `feed.json` catalogs** (identical English values for now — the parity suite stays green on every commit; Task 7 REPLACES the 12 non-en values with real translations and the branch must never merge before it does). One scripted loop, not hand-edits.
- [ ] **Step 5: Verify** — JSX parse → clean; `npm test` → 637 including catalog parity 3/3.
- [ ] **Step 6: Commit** — `git add mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx mobile-app/src/i18n/catalogs/*/feed.json && git commit -m "live-progress: boost sheet live line (honest-absent; RLS decides)"`

---

### Task 6: Consumer 2 — the coach live-watch goes real (+ en keys)

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — `BSProLiveWatch` (line ~465) + the render call site (line ~1189).
- Modify: `mobile-app/src/i18n/catalogs/en/coach.json` — 2 new keys.

**Interfaces:**
- Consumes: `window.ShapeLiveProgress.get/subscribe` (Task 3). Call-site state already carries `clientId` (`setLiveWatch({ client: lc.n, clientId: lc.userId, ... })` line ~1445) — **but the component never receives it today**.
- Produces: `coach:live.detailUnavailable` = `Live detail unavailable — set-by-set isn't shared here` · `coach:live.liveTag` = `Live` (Task 7 translates ×12). Also consumes `bsValidLivePayload` — the pros module imports it from `../services/liveProgress.mjs` (new import line at the top of the pros file).

- [ ] **Step 1: Pass `clientId` through** — line ~1189: `<BSProLiveWatch client={liveWatch.client} workout={liveWatch.workout} onBack={...} />` → add `clientId={liveWatch.clientId}`.
- [ ] **Step 2: Add the en keys** to `coach.json`:

```json
"live.detailUnavailable": "Live detail unavailable — set-by-set isn't shared here",
"live.liveTag": "Live"
```

(**Neutral by design** — spec review: RLS makes *private*, *not visible to this viewer*, and *pre-migration* indistinguishable; naming any one would fabricate a state we cannot know.)

- [ ] **Step 3: Live mode in the component** — signature becomes `function BSProLiveWatch({ client = 'Alex Rivera', clientId = null, workout = 'Upper Pull — Peak', onBack = () => {} })`. Below the existing state, add:

```jsx
  // Real mode (spec 2026-07-18): a real clientId + a readable row → render the
  // PAYLOAD (names + set counts; loads render '—' — v1 broadcasts none, and the
  // demo figures must NEVER show for a real client). No readable row → the
  // demo grid is NOT shown either: the console keeps elapsed/kind and reads an
  // honest "live detail private" line. The hardcoded demo grid survives ONLY
  // for demo roster entries (clientId == null).
  const [liveRow, setLiveRow] = useStateBSP(null);
  useEffectBSP(() => {
    if (!clientId || !window.ShapeLiveProgress) return undefined;
    let on = true; let expTimer = null;
    const take = (r) => {
      if (!on) return;
      setLiveRow(r);
      if (expTimer) { clearTimeout(expTimer); expTimer = null; }
      const expMs = r && r.expires_at ? new Date(r.expires_at).getTime() - Date.now() : 0;
      if (expMs > 0) expTimer = setTimeout(() => { if (on) setLiveRow(null); }, expMs);   // subscription-side expiry
    };
    window.ShapeLiveProgress.get(clientId).then(take).catch(() => {});
    const off = window.ShapeLiveProgress.subscribe(clientId, take);
    return () => { on = false; if (expTimer) clearTimeout(expTimer); off(); };
  }, [clientId]);
  const lp = liveRow ? bsValidLivePayload(liveRow.payload) : null;   // malformed → honest-absent
  const liveMode = !!clientId;   // real client → NEVER the demo data, row or not
```

- [ ] **Step 4: Branch the derived data** — replace the hardcoded `moves`/`startedAt` usage with a derived triple (keep the demo constants; select by mode):

```jsx
  const demoMoves = moves;   // ← rename the existing hardcoded array to demoMoves
  const shownMoves = liveMode
    ? (lp ? lp.exercises.map((e, i) => ({ name: e.n, scheme: `${e.done}/${e.total}`, rest: '—', load: '—', sets: e.total, done: e.done, active: i === lp.curIdx })) : [])
    : demoMoves;
  const shownStartedAt = liveMode ? (liveRow ? new Date(liveRow.started_at).getTime() : null) : startedAt;
```

**⚠ Crash guard (spec review, Codex P1):** with `shownMoves = []`, the existing render path dereferences the derived current move (`cur.done`, `cur.sets`, `cur.name`) BEFORE any grid render — `cur` would be `undefined` and the console crashes instead of showing the intended fallback. So: derive `const noDetail = liveMode && !lp;` immediately after `shownMoves`; make every current-move derivation null-safe (`const cur = shownMoves.length ? shownMoves[Math.max(0, curIdx)] : null;`); every downstream read (`totalSets`, `doneSets`, `pct`, the grid map, the header counter, the elapsed clock) reads `shownMoves` / `shownStartedAt`; elapsed renders `—:—` when `shownStartedAt` is null; and where `noDetail`, render the block below IN PLACE OF the header counter + exercise section + grid (the cue composer stays):

```jsx
          <div style={{ padding: '14px 0', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
            {tr('coach:live.detailUnavailable', { defaultValue: "Live detail unavailable — set-by-set isn't shared here" })}
          </div>
```

- [ ] **Step 5: Seed the 2 keys into ALL 13 locale `coach.json` catalogs** (English values; Task 7 replaces the 12 — same never-merge-before-Task-7 rule).
- [ ] **Step 6: Verify** — JSX parse on the pros file → clean; PowerShell `/m/` build → exit 0; `npm test` → 637 including parity 3/3.
- [ ] **Step 7: Commit** — `git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx mobile-app/src/i18n/catalogs/*/coach.json && git commit -m "live-progress: coach live-watch real mode (demo stays demo-only; honest-absent loads)"`

---

### Task 7: Translations ×12 · gates · docs · registration

**Files:**
- Modify: `mobile-app/src/i18n/catalogs/<L>/feed.json` + `<L>/coach.json` for the 12 non-en locales (4 keys total per locale).
- Modify: `docs/WORKLOG.md` (dated entry) · `src/lib/warroom.ts` (registration).

**Interfaces:** consumes the exact en values from Tasks 5–6. Nothing downstream.

- [ ] **Step 1: REPLACE the 12 seeded-English values per key** (Tasks 5–6 seeded all 13 with English to keep parity green; merging with seeds in place ships English — this step makes the branch mergeable). Dispatch ONE translation agent (run-lean; this is tiny) with the standing per-locale rules verbatim: brand nouns literal · ICU args `{done}`/`{total}` preserved exactly · tr = placeholders-only apostrophe rule (proper-noun suffixes ARE correct) · ha = no leftover English · pcm = real Naija Pidgin, no formal register · ru/uk informal, "Score" never «счёт»/«рахунок» (not present here, but the rules ride whole) · id = `kamu`. Instruct: REUSE each locale's existing `coach:live.*` vocabulary for the coach keys.
- [ ] **Step 2: Full gates** — `npm test` → **all green including catalog parity 3/3**; JSX parse ×2; `node --check` shapeBackend; `npx tsc --noEmit` → clean; PowerShell `VITE_BASE=/m/` build → exit 0; LF audit over every touched file → CR=0.
- [ ] **Step 3: Browser verification** (dev server, two contexts): member starts a session → viewer's boost sheet shows the line, updates on a set toggle (≤5s), disappears on end; Settings → Private mid-session → row deleted on next transition; coach console with a real linked client renders payload moves + `—` loads; demo roster entry still renders the demo grid.
- [ ] **Step 4: WORKLOG entry + War Room** — dated entry (what shipped · the RLS/visibility model · the no-loads decision · degrade behavior); War Room: flip the v2 "see the workout in progress live" item → done, register **OWNER runs `2026-07-18-user-activity-live.sql`** (raw link on the PR), the on-device pass, and the v2 candidates (coach-only richer channel · cooking detail · website).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "live-progress: translations x12 + docs + War Room registration"`

---

## Self-Review (done at write time)

- **Spec coverage:** migration→T1 · pure module→T2 · backend API→T3 · writer+trailing push+retro-tighten (audience cache reset on clear; 60s TTL bounds staleness)→T3/T4 · boost line + member-side silence→T5 · coach real mode + private line + demo-stays-demo→T6 · i18n ×13 + gates + browser proof + registration→T7. Non-goals honored (no loads test in T2 enforces decision 2 structurally).
- **Type consistency:** `bsLiveProgressPayload(moves, completed, moveIdx, resting)` consistent across T2/T4; `ShapeLiveProgress.{push,clear,get,subscribe}` consistent across T3/T5/T6; `title` attached by the caller (T4) per T2's interface note.
- **Review round applied (spec PR #1763, 12 findings):** audience cache removed (per-push resolve — Codex P1 + CodeRabbit CWE-862) · push/clear generation guard (race) · rest-expiry re-push (Codex P2) · coach no-row crash guard (Codex P1) · `bsValidLivePayload` consumer validator + bounds on `m.sets` (Infinity/fractional) · subscription-side `expires_at` timers on both consumers · seed-13-then-replace resolves the parity-gate contradiction · coach copy neutral `detailUnavailable` (honest-absent: RLS makes private / not-visible / pre-migration indistinguishable) · client-stamped `visibility` DECLINED-with-receipts (trust model = #1613's `community_posts.privacy`; a server-side re-derive trigger registered as the v2 hardening candidate).

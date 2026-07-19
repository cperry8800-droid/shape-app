# Live Coach Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach watching a client's live session sees real loads/reps/RPE (replacing the honest `—`) through a separate coach-only `user_activity_live_coach` row, gated on the active coach link alone.

**Architecture:** A second table (never a second column — RLS is row-level) with owner `for all` + coach-read policies, 30-min rolling expiry, and a `pg_column_size` payload bound. The canonical `liveProgress.mjs` gains `bsLiveCoachPayload` + `bsValidLiveCoachPayload`; the writer pushes both payloads in one `_liveEnqueue` job; `clear()` becomes the transactional `live_clear()` RPC deleting both rows. Consumers (mobile `BSProLiveWatch` + the web station) prefer the coach row when readable AND unexpired, falling back to the public row, then neutral.

**Tech Stack:** Postgres (RLS + realtime + invoker RPC), pure ESM + `node --test`, React (pros module + newdesign).

**Spec:** `docs/superpowers/specs/2026-07-19-live-coach-channel-design.md` — binding; **it carries the owner-ratified decision** (coach-link gate, no new toggle). Re-read the post-review revisions: owner `for all` policy spelled out, 30-min expiry, size bound, denial matrix, revocation bound.

**Ordering:** after live-progress-web merges (consumes the canonical module + the web station).

## Global Constraints

- The PUBLIC payload is untouched — names + set counts only. The coach payload adds `sets: [{load, reps, rpe, done}]` — raw strings as entered, ≤12 chars each, ≤10 sets per exercise serialized. NEVER HR, notes, video, location.
- Fail-closed + honest-absent: malformed coach payload → null → the consumer falls back to the public row; expired (`expires_at <= now()`) → ineligible.
- Consumers hold NO persistent cache — component state only (the revocation bound).
- Theme tokens; i18n in `coach` namespace, literal keys; verify per task (JSX parse · `npm test` · `/m/` build · LF); migration OWNER-run (raw link only).

---

### Task 1: Migration — `user_activity_live_coach` + `live_clear()`

**Files:**
- Create: `supabase-migrations/2026-07-19-user-activity-live-coach.sql`

**Interfaces:**
- Produces: the coach table (v1's shape minus `visibility`, 30-min default expiry, 8KB payload bound); `public.live_clear()` (invoker, deletes the caller's row in BOTH live tables in one statement); realtime publication membership. Tasks 2–4 write/read it.

- [ ] **Step 1: Write it** (idempotent; model header comments on `2026-07-18-user-activity-live.sql`):

```sql
-- Coach-only live channel (spec 2026-07-19, owner-ratified): loads/reps/RPE
-- for the client's ACTIVE COACH only — it changes WHEN the coach reads what
-- the session log will already tell them, not WHAT. A separate table because
-- RLS is row-level, not column-level (the v1 lesson). No visibility column:
-- the audience is structural. 30-MINUTE rolling expiry (the writer refreshes
-- every push) so a crashed session's loads — or a row visible to a
-- since-revoked coach — dies fast. Payload bounded at the write boundary by
-- SIZE only; the content contract is enforced by the one shared validator on
-- read (a SQL twin would be exactly the drift the one-module rule prevents).
-- Idempotent — safe to re-run.

create table if not exists public.user_activity_live_coach (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null check (pg_column_size(payload) <= 8192),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);

alter table public.user_activity_live_coach enable row level security;

-- Owner: full CRUD — spelled out because the SECURITY INVOKER live_clear()
-- rides this policy's DELETE leg.
drop policy if exists "live coach owner all" on public.user_activity_live_coach;
create policy "live coach owner all" on public.user_activity_live_coach
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Coach read: the active coach↔client subscription IS the permission
-- (the get_client_lifts house rule). Expiry gates the read path directly —
-- a stale row is unreadable to the coach even before cleanup.
drop policy if exists "live coach read" on public.user_activity_live_coach;
create policy "live coach read" on public.user_activity_live_coach
  for select to authenticated using (
    user_id = auth.uid()
    or (expires_at > now() and public.is_coach_on_client(user_id))
  );

-- One transactional clear for BOTH live rows: session end can never strand a
-- coach row behind a deleted public one. INVOKER — owner RLS is the scope.
create or replace function public.live_clear()
returns void language sql security invoker set search_path = public, pg_temp as $$
  with a as (delete from public.user_activity_live where user_id = auth.uid())
  delete from public.user_activity_live_coach where user_id = auth.uid();
$$;
revoke all on function public.live_clear() from public, anon;
grant execute on function public.live_clear() to authenticated;

-- Expired-row hygiene: rows are PK-bounded (ONE per user, upserted over by
-- the next session and deleted by live_clear on every clean end), so an
-- orphan is at most one ≤8KB unreadable row per user — no scheduled job is
-- warranted. The index makes any future sweep (and the expiry-gated read
-- policy) cheap.
create index if not exists user_activity_live_coach_expires_idx
  on public.user_activity_live_coach (expires_at);

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_activity_live_coach'
  ) then
    alter publication supabase_realtime add table public.user_activity_live_coach;
  end if;
end $$;
```

⚠ Verify `is_coach_on_client(uuid)` exists + its exact name via `grep -rn "is_coach_on_client" supabase-migrations/ | head -3` (it's the shipped helper the client-stats/lifts RPCs gate on). Note the CTE form: a single SQL statement so both deletes share one transaction snapshot.

- [ ] **Step 2: LF + commit.** OWNER applies later; every code path degrades silently until then.

---

### Task 2: Canonical module — `bsLiveCoachPayload` + `bsValidLiveCoachPayload` (TDD)

**Files:**
- Modify: `public/newdesign/liveProgress.mjs`
- Modify: `tests/live-progress.test.mjs`

**Interfaces:**
- Consumes: the session player's state — `moves` (`[{ m, sets, ... }]`), `completed` map, and `setInputs` — ⚠ read the ACTUAL shape in `BSSession` (`iosAppBroadsheetClient.jsx` ~21380–21430 writer region): the per-set inputs live in the session's set-state (load/reps/rpe strings per `<moveIdx>-<setIdx>`). Pin the real accessor before coding; the plan assumes `setInputs[`${i}-${s}`] = { l, r, rpe }` — ADJUST to the code's true keys.
- Produces (Tasks 3–4 rely on):
  - `bsLiveCoachPayload(moves, completed, moveIdx, resting, setInputs)` → the v1 payload shape PLUS per-exercise `sets: [{ load, reps, rpe, done }]` (strings ≤12 chars, ≤10 per exercise) | null.
  - `bsValidLiveCoachPayload(raw)` → sanitized | null — the full-contract discipline: everything `bsValidLivePayload` checks on the base shape, plus per-set string bounds; any violation → null.

- [ ] **Step 1: Failing tests** — mirror the v1 vectors: builder output validates; loads/rpe strings clamp to 12 chars at BUILD (the builder's courtesy) but REJECT >12 on the WIRE; >10 sets serialized → builder truncates the tail, wire rejects; `done` boolean; aggregates must still sum; malformed → null.
- [ ] **Step 2–3: Implement + green.** The coach builder wraps `bsLiveProgressPayload` for the base shape then attaches `sets`; the validator calls `bsValidLivePayload` on the base then validates `sets` (`Array.isArray`, ≤10, each `{load,reps,rpe}` string ≤12 + `done` boolean; extra keys stripped).
- [ ] **Step 4: Commit.**

---

### Task 3: Writer + data layer

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` — the live-progress block (~5394–5480).
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx` — `BSSession`'s push call sites (~21392, ~21410) to derive + hand over the coach payload.

**Interfaces:**
- Produces: `window.ShapeLiveProgress.push(payload, fresh, coachPayload)` — one `_liveEnqueue` job upserting the public row and (when `coachPayload` present) the coach row; `clear()` → `supabase.rpc('live_clear')` with the two-delete fallback pre-migration; `getCoach(uid)` + `subscribeCoach(uid, cb)` mirrors of the v1 reader pair against `user_activity_live_coach`.

- [ ] **Step 1: Writer** — inside `livePush`'s enqueued job (after the public upsert at ~5448):

```js
    if (coachPayload) {
      const crow = {
        user_id: state.user.id, payload: coachPayload,
        updated_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
      };
      if (fresh) crow.started_at = now.toISOString();
      await supabase.from('user_activity_live_coach').upsert(crow, { onConflict: 'user_id' });
    } else {
      // A null coach payload AFTER a valid one (malformed state, nothing to
      // show) must not leave the old loads readable until expiry — delete,
      // so the consumer falls back to the public row / '—' honestly.
      await supabase.from('user_activity_live_coach').delete().eq('user_id', state.user.id);
    }
```

Same generation guard covers it (it's inside the same job). ⚠ The coach row is written even when the PUBLIC audience resolves null? **NO** — decide per spec: the coach channel is gated on the coach link, NOT the member's share rule, so a private member's coach row SHOULD still write. Restructure the private branch at ~5440: `if (!vis) { delete public row; }` but continue to the coach upsert (the coach payload's presence is the writer's only gate). Public delete + coach upsert in the same job is correct and spec-true — a private member still streams to her own coach, exactly as her session logs already do.

- [ ] **Step 2: clear()** — replace `_liveDelete` with an RPC-first version:

```js
async function _liveDelete() {
  if (!supabase || !state.user) return;
  try {
    const { error } = await supabase.rpc('live_clear');
    if (!error) return;
  } catch (e) {}
  // pre-migration fallback: two best-effort deletes
  try { await supabase.from('user_activity_live').delete().eq('user_id', state.user.id); } catch (e) {}
  try { await supabase.from('user_activity_live_coach').delete().eq('user_id', state.user.id); } catch (e) {}
}
```

- [ ] **Step 3: Readers** — add `getCoach`/`subscribeCoach` to `window.ShapeLiveProgress` (copy `get`/`subscribe` at ~5461–5479, table swapped, channel name `live-coach-${uid}`).
- [ ] **Step 4: `BSSession` call sites** — at ~21392 and ~21410, derive `const coachP = bsLiveCoachPayload(moves, completed, moveIdx, resting, setInputs)` beside the existing payload derivation and pass it as the third arg. (Import from `'../services/liveProgress.mjs'` — the shim re-exports the canonical fns; ADD the two new names to the shim's re-export list in the live-web plan's file if this lands after it — it will.)
- [ ] **Step 5: Verify + commit** — `node --check` shapeBackend · JSX parse · `/m/` build · `npm test`.

---

### Task 4: Consumers — mobile console + web station prefer the coach row

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` — `BSProLiveWatch` (~481–528).
- Modify: `public/newdesign/coachClientDetail.jsx` — `CKLiveStation` (from the live-web PR).

**Interfaces:**
- Consumes: `ShapeLiveProgress.getCoach/subscribeCoach` + `bsValidLiveCoachPayload` (pros module imports it beside `bsValidLivePayload` at line 7; web gets it via the `window.ShapeLiveValidate` namespace — no loader change, the module grew).

- [ ] **Step 1: Mobile** — beside the existing `liveRow` effect (~482–498), add a parallel `coachRow` effect using `getCoach`/`subscribeCoach` with the SAME take/evented/expiry-timer structure, with one delta (spec round-3): **on expiry-timer fire, RE-FETCH via `getCoach` instead of just nulling** — a revoked link's protected re-read returns nothing under RLS, so held coach state actively clears at the first re-check (and any failed/empty re-read clears it too). Selection:

```js
  const cp = coachRow && coachRow.expires_at && new Date(coachRow.expires_at).getTime() > Date.now()
    ? bsValidLiveCoachPayload(coachRow.payload) : null;
  const lp = cp || (liveRow ? bsValidLivePayload(liveRow.payload) : null);
```

and the `shownMoves` map reads real figures when `cp`: `load: e.sets?.[…]` — render the CURRENT set's `load`/`reps`/`rpe` in the grid cells that today hardcode `'—'` (~513). Keep `—` for any absent string (honest-absent per set). `shownStartedAt` prefers the coach row's `started_at` when `cp` drives.

- [ ] **Step 2: Web** — in `CKLiveStation`, add the same second subscription against `user_activity_live_coach` (direct `db.from`/`db.channel`, table swapped) with its own evented guard + expiry timer; same preference order; the `—` cell renders `s.load` / `s.reps` / `s.rpe` when the coach payload drives. `?v=` bump on both HTML pages.
- [ ] **Step 3: Verify + commit** — parses, `/m/` build, `npm test`.

---

### Task 5: Tests + denial matrix + PR

- [ ] Module vectors green (Task 2) + a writer test in `tests/live-progress.test.mjs` for the clear fallback ordering if mockable — else the RPC path is covered post-migration.
- [ ] **Post-migration (OWNER applied), the full denial matrix — every leg an explicit test, run read-only via three seeded accounts (member M, coach C linked to M, stranger S):** S reads zero rows OF M (own-row access tested separately as the owner policy working) · C reads M's row · C cannot INSERT/UPDATE/DELETE M's row · **S cannot INSERT/UPDATE/DELETE M's row either** (cross-member writes, not just coach writes) · revoke C's link (end the subscription row in the seed) → C reads nothing · anon reads nothing · an anonymous realtime subscription receives no events · `live_clear()` as M deletes BOTH rows (assert both gone) · an expired row is unreadable to C but readable to M.
- [ ] On-device (registered in War Room): coach watches live loads land; session end removes both rows.
- [ ] PR: `coach-channel: live loads/RPE for the client's own coach (spec 2026-07-19, owner-ratified)`; body: the ratification line + RAW migration link. CI + CodeRabbit; squash-merge; re-sync.

---

## Self-review notes

- **Spec coverage:** table+RLS+30min+size bound (T1) · live_clear (T1/T3) · module extension (T2) · one-job dual push incl. the private-member-still-streams-to-coach branch (T3) · both consumers with expiry-in-read-contract (T4) · denial matrix + revocation bound (T5, plus consumers hold state only).
- **Type consistency:** `bsLiveCoachPayload`/`bsValidLiveCoachPayload` names identical across T2/T3/T4; `push(payload, fresh, coachPayload)` arity consistent at both call sites; `getCoach`/`subscribeCoach` defined T3, consumed T4.
- **Flagged for the implementer:** Task 2's `setInputs` shape and Task 3's private-branch restructure are the two places the plan defers to the code — read before writing, both marked ⚠.

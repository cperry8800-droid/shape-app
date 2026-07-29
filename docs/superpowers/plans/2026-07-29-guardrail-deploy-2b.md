# Deploy 2b — the week-shaped publish boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every coach write to a client's training week passes through ONE server-authoritative, week-shaped, idempotent publish boundary that evaluates the progression guardrail exactly once and writes the week atomically.

**Architecture:** A new `POST /api/trainer/week` route is the only door. It authenticates, scope-gates, checks a server-side idempotency ledger, fetches the client's raw history through `get_client_load_history`, runs the pure core (`bsProgressionGuardrail`), applies the kill switch, and — when the verdict permits — calls a SECURITY DEFINER RPC that claims the idempotency key, replaces the coach's own rows for that client-week, and inserts the new ones in one transaction. The judgement itself lives in a new pure module so every rule in §9.4 is fixture-tested rather than hidden in a route handler. The three existing write paths (web builders + Nora, mobile `assignClientWorkout`, `regenerate_client_workouts`) move onto it one at a time; the final PR revokes the coach INSERT policy on `client_workouts` and deletes the session-shaped route, so no ungated path survives.

**Tech Stack:** Next.js 16 App Router (`src/app/api`), Supabase Postgres + RLS + SECURITY DEFINER RPCs, plain-ESM pure modules (`.mjs`) tested with `node --test`, React via babel-standalone (`public/newdesign/*.jsx`), Capacitor/Vite mobile SPA (`mobile-app/src/broadsheet/*.jsx`).

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from `SPEC-guardrails.md` and the owner's standing rules.

- **Explicit paths on every commit. Never `git commit -a`.** `src/lib/warroom.ts` stays untouched except where a task says otherwise.
- **The fixture table is FROZEN.** It is the specification. If a test fails, fix the implementation. If a row looks wrong, STOP and tell the owner which row and why — flag, don't edit. Amendments get recorded in `SPEC-guardrails.md` §13.
- **Store raw facts, derive judgments at read time. Never persist a derived verdict.** Exception: transactional values (prices, amounts charged) freeze at write time. The test is "if the rule changes, should history change?" (§13.11).
- **Honest absence over fabrication.** Never impute, never estimate, never assume uniform distribution. `malformed` / `unknown` / `not_evaluable` exist for this.
- **`malformed` is reserved for shapes NO LEGITIMATE WRITER CAN EMIT.** One malformed row turns the whole evaluation `unknown`, and `unknown` never blocks publish — so mis-filing a row as malformed switches the guardrail OFF. A value our own code produces is never a caller bug.
- **The core never throws.** No I/O, no clock reads, no React in `public/newdesign/progressionGuardrail.mjs`. Instants plus IANA timezone are inputs. **The core and its 157 fixtures are settled — this plan does not modify either file.**
- **The core reads RAW SESSION ROWS ONLY, never precomputed aggregates** (§4.1). `workout_sessions.completedSets`, `avgSetSeconds`, `avgRestSeconds` are not read and 2b must not begin to.
- **`bsGuardrailCopy(result)` is the ONLY source of guardrail wording** (§8). The mobile builder, both web builders, and the publish-rejection response all read from it.
- **Display rounding happens inside the copy function.** Every comparison upstream stays unrounded.
- **The builder writes NO telemetry** (§10.2). `guardrail_evaluated` is written server-side at publish only, once per publish regardless of session count.
- **Ships with the kill switch (§7.4) DEFAULTED TO ADVISORY.** Red computes, is recorded, and surfaces with the acknowledgment path live — but does not 409. `redEnabled` seeded `false` by the already-applied `2026-07-27-guardrail-load-history.sql`. **A flag that cannot be READ (null) fails ENFORCED** (§7.4).
- **Telemetry records the truth throughout.** When the switch downgrades a red, the event still logs `state: 'red'` with its `redPath` and axes, plus `redSuppressed: true`.
- **Two-place whitelist trap** (§10.2): adding `guardrail_evaluated` requires editing **both** the `if p_event not in (…)` list inside `track_event` (via a migration) **and** `ANALYTICS_EVENTS` in `src/lib/funnel.mjs:17`. `track_event` **silently returns** on an unknown name.
- **`unknown` does not gate publish** (§9.2). It is reported, not enforced.
- **Fix the class, not the instance.** Three rounds of the same defect in different clothes means sweep the category up front.
- **Run the gates and paste RAW output after each task, not summaries:** `npm test` and `npx tsc --noEmit`.
- **CodeRabbit VS Code pass is a HARD GATE before every push.** Finish the task, run the gates, commit with explicit paths, then STOP and hand off with the changed-file list. Wait for an explicit *"I ran CodeRabbit"*. "good to go" / "continue" / "go" is NOT confirmation.
- **Every push to an open PR buys a review.** Batch fixes into ONE push. Audit the whole class locally before pushing.
- **Windows line endings:** `Edit`/`Write` save CRLF. After editing a tracked LF file, normalize (`tr -cd '\r' < f | wc -c` must print 0) before committing.

---

## Three deviations from the brief, stated before any code

Each one changes what gets built. Flagging rather than silently narrowing.

**1. `clientIds[]` stays in the contract, but evaluation and atomicity are PER CLIENT.**
§9.4 quotes `{ clientIds[], weekStartISO, sessions[] }` "evaluated once and written atomically." One evaluation across N clients is not expressible: the guardrail's verdict is a function of *one* client's history, so N clients means N verdicts, N possible acknowledgments, and no coherent answer when client A is red and client B is green. The route therefore accepts `clientIds[]` in **one call** (the builder's ergonomics are preserved) and internally fans out: one evaluation, one atomic write, one telemetry row, one idempotency record **per client**. The response is a per-client result array. "Written atomically" holds at the unit that can be atomic — the client-week.

**2. `/api/trainer/workout` is DELETED in the final PR, and Nora moves to the week route.**
§9.4: "No session-shaped coach write path stays live alongside it." An adapter that wraps one session into a one-session week would still be a second contract that lets a builder fragment a real week into 16 evaluations. Nora's `assign_workout` legitimately assigns ONE session — that submission *is* the whole week from its own point of view — so it posts a one-session week and gets one evaluation and one telemetry row. The builders are required to submit whole weeks. Deleting the route is what makes the rule structural instead of conventional.

**3. The boundary REPLACES the coach's own rows in the target week, and refuses to publish into the past.**
A week-shaped contract that only ever inserts duplicates the whole week on republish — and republish is exactly what Adjust does. So `publish_client_week` deletes the caller's own `published` rows for that client whose `scheduled_date` falls in `[weekStart, weekStart+6]` **and is not before today**, then inserts. A submitted session dated before today is rejected as malformed. This mirrors `regenerate_client_workouts`' existing strictly-future rule and exists for the same reason: a session already in the past may have been logged against.

**Out of scope, stated so it isn't mistaken for a gap:** self-authored training (`insertSelfWorkouts`, `trainer_id NULL`) is a MEMBER writing their own week, not a coach. §9.3 makes the guardrail coach-facing and §9.4's coverage table names exactly three coach paths. The member self-CRUD RLS policy stays. Nutrition (`client_meal_plans` via `/api/nutritionist/meal-plan`) carries no training load and is not gated.

---

## File Structure

| Path | Responsibility |
|---|---|
| **Create** `supabase-migrations/2026-07-29-guardrail-week-publish.sql` | The idempotency ledger, `publish_client_week`, the `track_event` whitelist addition, the `ai_audit_log` read-policy fix |
| **Create** `supabase-migrations/2026-07-30-close-session-write-path.sql` | Revoke the coach INSERT policy on `client_workouts` (final PR only) |
| **Create** `src/lib/week-publish.mjs` | Pure: normalize + validate a week request, hash it, shape it for the core and for the insert rows |
| **Create** `src/lib/guardrail-gate.mjs` | Pure: the publish decision (kill switch, ack, status), the telemetry payload, the excluded-session rate |
| **Create** `tests/week-publish.test.mjs` | Fixtures for the contract module |
| **Create** `tests/guardrail-gate.test.mjs` | Fixtures for every rule in §9.4 + §7.4 |
| **Create** `src/app/api/trainer/week/route.ts` | The boundary. Thin over the two pure modules |
| **Modify** `src/lib/funnel.mjs:17` | `guardrail_evaluated` on `ANALYTICS_EVENTS` |
| **Modify** `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` | Capture UI in `BSCoachDraftEditor`, week-shaped publish in `BSProAssignPage`, advisory + ack UI, Adjust through the boundary |
| **Modify** `mobile-app/src/services/shapeBackend.js` | `ShapeAssign.week`, failure classification, minimal replay; `applyAdjustRegeneration` through the boundary |
| **Create** `mobile-app/src/services/assignQueue.mjs` | The queue — ported from `claude/offline-assign-queue`, key-dependent halves deleted |
| **Create** `tests/assign-queue.test.mjs` | The failure-classification vectors (ported); identity/dedupe vectors deliberately NOT ported |
| **Modify** `public/newdesign/dashBuilder.jsx` | Week-shaped assign, length + effort inputs, advisory + ack UI |
| **Modify** `public/newdesign/newWorkout.jsx` | Same |
| **Modify** `src/lib/ai/actions.mjs:199-230` | `assign_workout` posts a one-session week |
| **Delete** `src/app/api/trainer/workout/route.ts` | Final PR |
| **Modify** `SPEC-guardrails.md` | §11 file table + §9.4 status; record the three deviations in §13 |
| **Modify** `src/lib/warroom.ts` | Register `/api/trainer/week`, drop `/api/trainer/workout`, add the 2b checklist section |

**Reuse unchanged:** `public/newdesign/progressionGuardrail.mjs`, `tests/progression-guardrail.test.mjs`, `src/lib/ai/server.ts` (`auditSink`), `public.ai_audit_log`, `public.shape_user_tz`, `is_coach_on_client`, `is_discipline_coach_on_client`, `src/lib/access-guards.mjs` (`unauthorizedAssignTargets`), `src/lib/request-utils.ts` (`readJson`, `dbError`), `mobile-app/src/services/planOutline.mjs`.

---

## PR grouping

| PR | Tasks | Why it can be reviewed alone |
|---|---|---|
| **A — the boundary** | 1–4 | Adds a new route + migration. Every existing path still works untouched. Nothing is gated yet; a publish through the new door is evaluated and recorded honestly. |
| **B — mobile** | 5–7 | The primary coaching surface and the largest share of real writes (§9.4's sequencing). Capture, publish, failure classes, replay. |
| **C — Adjust** | 8 | One caller moves. Regeneration is evaluated as a fresh week. |
| **D — web + the close** | 9–11 | Web builders + Nora move, then the session-shaped path is revoked and deleted. The close must come after web moves, and putting them together is one fewer paid review. |

---

## Task 1: The publish ledger + `publish_client_week`

**Files:**
- Create: `supabase-migrations/2026-07-29-guardrail-week-publish.sql`

**Interfaces:**
- Produces: `public.coach_week_publishes` table; `public.publish_client_week(p_idempotency_key uuid, p_client_id uuid, p_week_start date, p_request_hash text, p_outcome jsonb, p_rows jsonb) returns jsonb`; `guardrail_evaluated` accepted by `track_event`.
- Consumes: `public.is_discipline_coach_on_client(uuid, text)`, `public.trainers`, `public.client_workouts`, `public.track_event`, the `ai_audit_read_own_or_coach` policy.

- [ ] **Step 1: Write the migration**

Create `supabase-migrations/2026-07-29-guardrail-week-publish.sql`:

```sql
-- Deploy 2b — the week-shaped publish boundary.
--
-- SPEC-guardrails.md §9.4. Idempotent; safe to re-run.
--
-- ⚠ THE KEY MUST SERVE OFFLINE REPLAY, NOT ONLY ONLINE PUBLISH. All four:
--   (1) minted at AUTHORING time and carried in the payload — never derived at
--       send time, so it survives the device going offline, the app being
--       killed, and the coach re-authenticating before transmission;
--   (2) re-submitting the same week returns the SAME OUTCOME, not a second set
--       of rows — whether the repeat is a retry tap, a background drain, or both
--       racing;
--   (3) the response distinguishes `accepted` from `already_delivered`, so a
--       replay reports honestly instead of re-inserting or claiming work is held;
--   (4) scoped to the ORIGINATING COACH — a queued payload replayed under a
--       different signed-in account is REJECTED here, never silently
--       re-attributed. The client-side owner guard is a courtesy, not the
--       boundary.

-- ── (1) The ledger ──────────────────────────────────────────────────────────
create table if not exists public.coach_week_publishes (
  idempotency_key uuid        not null,
  client_id       uuid        not null references auth.users(id) on delete cascade,
  coach_user_id   uuid        not null references auth.users(id) on delete cascade,
  week_start      date        not null,
  -- The normalized request digest. A repeat with the SAME key and a DIFFERENT
  -- body is a caller bug, not a replay — it is rejected rather than silently
  -- returning the first week's outcome for the second week's content.
  request_hash    text        not null,
  -- The exact response body we returned. A replay re-serves this verbatim so a
  -- drain and a retry tap cannot disagree about what happened.
  outcome         jsonb       not null,
  created_at      timestamptz not null default now(),
  primary key (idempotency_key, client_id)
);

comment on table public.coach_week_publishes is
  'Server-side idempotency ledger for the week-shaped publish boundary. One row per (idempotency_key, client_id). SPEC-guardrails.md §9.4.';

-- Writes go only through publish_client_week (SECURITY DEFINER). RLS on with
-- NO policies = deny-all for anon/authenticated, which is the intent: the
-- ledger is never read or written directly by a client.
alter table public.coach_week_publishes enable row level security;
revoke all on public.coach_week_publishes from public, anon, authenticated;

create index if not exists coach_week_publishes_coach_idx
  on public.coach_week_publishes (coach_user_id, created_at desc);

-- ── (2) The atomic publish ──────────────────────────────────────────────────
create or replace function public.publish_client_week(
  p_idempotency_key uuid,
  p_client_id       uuid,
  p_week_start      date,
  p_request_hash    text,
  p_outcome         jsonb,
  p_rows            jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_trainer_id bigint;
  v_existing   public.coach_week_publishes%rowtype;
  v_row        jsonb;
  v_sched      date;
  v_inserted   int := 0;
  v_deleted    int := 0;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_client_id is null or p_week_start is null then
    raise exception 'idempotency key, client and week are required' using errcode = '22023';
  end if;

  -- (4) The originating-coach scope. Checked BEFORE the ledger read so a
  -- different account replaying a queued payload is rejected rather than served
  -- the original coach's outcome.
  if not public.is_discipline_coach_on_client(p_client_id, 'trainer') then
    raise exception 'not this client''s training coach' using errcode = '42501';
  end if;
  select t.id into v_trainer_id from public.trainers t where t.owner_id = v_uid limit 1;
  if v_trainer_id is null then
    raise exception 'no trainer profile for this account' using errcode = '42501';
  end if;

  -- (2)+(3) Replay. A completed record wins outright: no re-evaluation, no
  -- second set of rows, and the caller is told it was ALREADY DELIVERED.
  select * into v_existing
  from public.coach_week_publishes
  where idempotency_key = p_idempotency_key and client_id = p_client_id;

  if found then
    if v_existing.coach_user_id <> v_uid then
      raise exception 'idempotency key belongs to another coach' using errcode = '42501';
    end if;
    if v_existing.request_hash <> p_request_hash then
      -- Same key, different week. Never serve the first outcome for the second
      -- body — that would report a week as delivered that was never written.
      raise exception 'idempotency key reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'already_delivered', 'outcome', v_existing.outcome);
  end if;

  -- Bounds. A week cannot legitimately carry more than this; a caller that does
  -- is malformed, not ambitious.
  if jsonb_array_length(coalesce(p_rows, '[]')) > 40 then
    raise exception 'week too large' using errcode = '22023';
  end if;

  -- Claim FIRST, in this transaction. A concurrent drain racing a retry tap
  -- loses the insert and re-reads the winner's outcome below.
  begin
    insert into public.coach_week_publishes
      (idempotency_key, client_id, coach_user_id, week_start, request_hash, outcome)
    values
      (p_idempotency_key, p_client_id, v_uid, p_week_start, p_request_hash, p_outcome);
  exception when unique_violation then
    select * into v_existing
    from public.coach_week_publishes
    where idempotency_key = p_idempotency_key and client_id = p_client_id;
    if v_existing.request_hash <> p_request_hash or v_existing.coach_user_id <> v_uid then
      raise exception 'idempotency key reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'already_delivered', 'outcome', v_existing.outcome);
  end;

  -- ⚠ WEEK-REPLACE, NOT APPEND. A week-shaped contract that only ever inserts
  -- duplicates the whole week on republish — and republish is what Adjust does.
  -- Scoped to THIS coach's own published rows, in THIS week, and NEVER a row
  -- already in the past: a past-dated session may already have been logged
  -- against. Same rule, same reason, as regenerate_client_workouts.
  delete from public.client_workouts cw
  where cw.client_id = p_client_id
    and cw.trainer_id = v_trainer_id
    and cw.status = 'published'
    and cw.scheduled_date between p_week_start and (p_week_start + 6)
    and cw.scheduled_date >= current_date;
  get diagnostics v_deleted = row_count;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'))
  loop
    v_sched := (v_row ->> 'scheduled_date')::date;
    if v_sched is null then
      raise exception 'every session needs a scheduled date' using errcode = '22023';
    end if;
    if v_sched < p_week_start or v_sched > (p_week_start + 6) then
      raise exception 'session falls outside the submitted week' using errcode = '22023';
    end if;
    if v_sched < current_date then
      raise exception 'cannot publish into the past' using errcode = '22023';
    end if;

    insert into public.client_workouts
      (trainer_id, client_id, title, description, kind, payload, scheduled_date, status)
    values (
      v_trainer_id,
      p_client_id,
      coalesce(nullif(trim(v_row ->> 'title'), ''), 'Workout'),
      coalesce(v_row ->> 'description', ''),
      case when (v_row ->> 'kind') = 'template' then 'template' else 'custom' end,
      coalesce(v_row -> 'payload', '{}'::jsonb),
      v_sched,
      'published'
    );
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'status', 'accepted',
    'outcome', p_outcome,
    'inserted', v_inserted,
    'replaced', v_deleted
  );
end;
$$;

comment on function public.publish_client_week(uuid, uuid, date, text, jsonb, jsonb) is
  'Atomic week-shaped publish: claims the idempotency key, replaces the caller''s own future rows in the target week, and inserts the submitted sessions — all in one transaction. Returns accepted | already_delivered. SPEC-guardrails.md §9.4.';

revoke all on function public.publish_client_week(uuid, uuid, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.publish_client_week(uuid, uuid, date, text, jsonb, jsonb) to authenticated, service_role;

-- ── (3) The telemetry whitelist — HALF ONE OF TWO ──────────────────────────
-- track_event SILENTLY RETURNS on a name missing from its own list, so adding
-- the event here alone writes nothing and reports no error. The other half is
-- ANALYTICS_EVENTS in src/lib/funnel.mjs. §10.2 sets this trap twice and warns
-- the second time is the easier one to miss.
do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'track_event' limit 1;

  if v_src is null then
    raise notice 'track_event not present — skipping whitelist addition';
  elsif v_src like '%guardrail_evaluated%' then
    raise notice 'track_event already accepts guardrail_evaluated';
  else
    raise exception
      'track_event does not accept guardrail_evaluated. Add it to the p_event whitelist in the analytics migration and re-run; the event writes NOTHING and reports NO ERROR until you do.';
  end if;
end $$;

-- ── (4) Close the §9.3 client-visibility hole ───────────────────────────────
-- A guardrail_red_ack row sets target_user_id to the CLIENT, so the existing
-- policy's "own entries" arm would expose the coach's acknowledgment — and the
-- reason they typed — to the client it is about. Guardrail rows are coach-facing
-- only (§9.3), enforced here as well as at the API boundary.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_audit_log'
      and policyname = 'ai_audit_read_own_or_coach'
  ) then
    execute $p$
      alter policy ai_audit_read_own_or_coach on public.ai_audit_log
      using (
        (actor_user_id = auth.uid())
        or (
          target_user_id = auth.uid()
          and coalesce(action, '') <> 'guardrail_red_ack'
        )
        or public.is_coach_on_client(target_user_id)
      )
    $p$;
  else
    raise notice 'ai_audit_read_own_or_coach not present — skipping';
  end if;
end $$;
```

- [ ] **Step 2: Verify the referenced schema READ-ONLY against production**

Do NOT apply the migration. Confirm every referenced object exists and the `track_event` whitelist already carries the event (if it does not, the `do $$` block above raises with the exact instruction — that is the intended failure).

Run via the Supabase MCP `execute_sql`:

```sql
select
  to_regclass('public.client_workouts')                  as client_workouts,
  to_regclass('public.trainers')                         as trainers,
  to_regprocedure('public.is_discipline_coach_on_client(uuid, text)') as discipline_gate,
  to_regprocedure('public.is_coach_on_client(uuid)')     as coach_gate,
  to_regprocedure('public.track_event(text, jsonb)')     as track_event,
  (select count(*) from pg_policies
    where schemaname='public' and tablename='ai_audit_log'
      and policyname='ai_audit_read_own_or_coach')       as audit_policy,
  (select pg_get_functiondef(p.oid) like '%guardrail_evaluated%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='track_event' limit 1) as whitelist_ready;
```

Expected: every object non-null. If `whitelist_ready` is `false`, add `'guardrail_evaluated'` to the `p_event not in (…)` list in `supabase-migrations/2026-06-23-analytics-events.sql` **in this same commit** and re-run the check — the whole point of the guard is that it refuses to let the event ship silently dead.

- [ ] **Step 3: Commit**

```bash
git add supabase-migrations/2026-07-29-guardrail-week-publish.sql supabase-migrations/2026-06-23-analytics-events.sql
git commit -m "guardrails 2b: the week-shaped publish ledger + atomic publish RPC"
```

---

## Task 2: `week-publish.mjs` — the contract module (pure, TDD)

**Files:**
- Create: `src/lib/week-publish.mjs`
- Test: `tests/week-publish.test.mjs`

**Interfaces:**
- Produces: `normalizeWeekRequest(body)`, `weekRequestHash(clientId, week)`, `toProposedWeek(week)`, `toWorkoutRows(week)`, `BS_WEEK_SESSION_MAX`.
- Consumes: nothing. Zero I/O, zero clock reads (`todayISO` is an input).

- [ ] **Step 1: Write the failing tests**

Create `tests/week-publish.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWeekRequest, weekRequestHash, toProposedWeek, toWorkoutRows,
} from '../src/lib/week-publish.mjs';

const OK = {
  clientIds: ['11111111-1111-4111-8111-111111111111'],
  weekStartISO: '2026-08-03',
  idempotencyKey: '22222222-2222-4222-8222-222222222222',
  capture: 'per_session',
  sessions: [
    { title: 'Upper', scheduledDate: '2026-08-03', plannedMinutes: 60, plannedRpe: 8, loadCapture: 'per_session' },
    { title: 'Lower', scheduledDate: '2026-08-05', plannedMinutes: 45, plannedRpe: 7.5, loadCapture: 'per_session' },
  ],
};

test('a complete week normalizes', () => {
  const r = normalizeWeekRequest(OK, { todayISO: '2026-08-01' });
  assert.equal(r.ok, true);
  assert.equal(r.week.sessions.length, 2);
  assert.equal(r.week.capture, 'per_session');
});

test('a partial submission is REJECTED as malformed, never scored', () => {
  // §9.4 fixture. A session with no scheduledDate cannot be placed in a week,
  // so the request never reaches the core.
  const bad = { ...OK, sessions: [{ title: 'Upper', plannedMinutes: 60, plannedRpe: 8, loadCapture: 'per_session' }] };
  const r = normalizeWeekRequest(bad, { todayISO: '2026-08-01' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'malformed_request');
});

test('a session outside the submitted week is rejected', () => {
  const bad = { ...OK, sessions: [{ ...OK.sessions[0], scheduledDate: '2026-08-11' }] };
  assert.equal(normalizeWeekRequest(bad, { todayISO: '2026-08-01' }).ok, false);
});

test('a session dated before today is rejected — never publish into the past', () => {
  const r = normalizeWeekRequest(OK, { todayISO: '2026-08-04' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'past_session');
});

test('an empty week is rejected — there is nothing to publish', () => {
  assert.equal(normalizeWeekRequest({ ...OK, sessions: [] }, { todayISO: '2026-08-01' }).ok, false);
});

test('a missing idempotency key is rejected — the key is minted at authoring time', () => {
  const { idempotencyKey, ...rest } = OK;
  const r = normalizeWeekRequest(rest, { todayISO: '2026-08-01' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'missing_idempotency_key');
});

test('an UNSTAMPED week normalizes — it is incomplete_week at the core, not a request error', () => {
  // The stamp lost in transit degrades to the SAFE direction (§3.2a). Rejecting
  // it here would turn an honest blank into a hard failure.
  const { capture, ...rest } = OK;
  const unstamped = { ...rest, sessions: OK.sessions.map(({ loadCapture, ...s }) => s) };
  const r = normalizeWeekRequest(unstamped, { todayISO: '2026-08-01' });
  assert.equal(r.ok, true);
  assert.equal(r.week.capture, undefined);
});

test('the hash is stable across key order and session order', () => {
  const a = weekRequestHash(OK.clientIds[0], normalizeWeekRequest(OK, { todayISO: '2026-08-01' }).week);
  const shuffled = { ...OK, sessions: [OK.sessions[1], OK.sessions[0]] };
  const b = weekRequestHash(OK.clientIds[0], normalizeWeekRequest(shuffled, { todayISO: '2026-08-01' }).week);
  assert.equal(a, b);
});

test('the hash CHANGES when the content changes', () => {
  const a = weekRequestHash(OK.clientIds[0], normalizeWeekRequest(OK, { todayISO: '2026-08-01' }).week);
  const moved = { ...OK, sessions: [{ ...OK.sessions[0], plannedRpe: 9 }, OK.sessions[1]] };
  const b = weekRequestHash(OK.clientIds[0], normalizeWeekRequest(moved, { todayISO: '2026-08-01' }).week);
  assert.notEqual(a, b);
});

test('the hash is per CLIENT — the same week to two clients is two records', () => {
  const w = normalizeWeekRequest(OK, { todayISO: '2026-08-01' }).week;
  assert.notEqual(weekRequestHash('a', w), weekRequestHash('b', w));
});

test('toProposedWeek carries the stamp and the pair, and nothing else', () => {
  const w = normalizeWeekRequest(OK, { todayISO: '2026-08-01' }).week;
  const p = toProposedWeek(w);
  assert.equal(p.weekStartISO, '2026-08-03');
  assert.equal(p.capture, 'per_session');
  assert.deepEqual(Object.keys(p.sessions[0]).sort(), ['id', 'loadCapture', 'plannedMinutes', 'plannedRpe']);
});

test('toWorkoutRows carries the pair INTO the stored payload', () => {
  // The row must describe itself when re-read later (§4, the two copies of the
  // stamp), and Adjust regeneration reads the pair back off it.
  const w = normalizeWeekRequest(OK, { todayISO: '2026-08-01' }).week;
  const rows = toWorkoutRows(w);
  assert.equal(rows[0].payload.plannedMinutes, 60);
  assert.equal(rows[0].payload.plannedRpe, 8);
  assert.equal(rows[0].payload.loadCapture, 'per_session');
  assert.equal(rows[0].scheduled_date, '2026-08-03');
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx node --test tests/week-publish.test.mjs`
Expected: FAIL — `Cannot find module '../src/lib/week-publish.mjs'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/week-publish.mjs`:

```js
// The week-shaped publish contract — pure, no I/O, no clock reads.
//
// SPEC-guardrails.md §9.4. This module answers exactly two questions:
//   "is this a well-formed week?" and "what does it look like to the core, to
//   the ledger, and to client_workouts?"
//
// ⚠ IT DOES NOT JUDGE THE WEEK. Every guardrail verdict lives in the core; every
// publish decision lives in guardrail-gate.mjs. What is rejected HERE is a
// request that cannot be placed in a week at all — a shape no legitimate
// builder emits. The `malformed` reservation rule from §4.1 applies with full
// force: over-rejecting here turns a scoreable week into a hard error, and
// under-rejecting feeds the core a week it will silently mis-score.

/** A week no human schedule exceeds. Above this the caller is malformed. */
export const BS_WEEK_SESSION_MAX = 40;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Days between two ISO dates, calendar arithmetic (no DST hazard: dates only). */
function dayDelta(fromISO, toISO) {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/**
 * A real calendar date, not merely a well-shaped string. `Date.parse` moves
 * 2026-02-30 to March 2 rather than rejecting it (the lesson from Deploy 1), so
 * the round-trip check is the only reliable one.
 */
function isRealDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Normalize + validate a week-shaped publish request.
 *
 * @param {*} body the raw request body — assume nothing about it
 * @param {{todayISO: string}} opts today, as an INPUT (never a clock read)
 * @returns {{ok:true, week:object, clientIds:string[]}
 *          |{ok:false, error:string, detail?:string}}
 */
export function normalizeWeekRequest(body, opts = {}) {
  const todayISO = opts.todayISO;
  const fail = (error, detail) => ({ ok: false, error, detail: detail || null });

  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('malformed_request', 'body');
  if (!isRealDate(todayISO)) return fail('malformed_request', 'todayISO');

  const clientIds = [...new Set(
    (Array.isArray(body.clientIds) ? body.clientIds : [body.clientId])
      .map((x) => String(x || '').trim()).filter(Boolean),
  )];
  if (!clientIds.length) return fail('malformed_request', 'clientIds');
  if (clientIds.some((id) => !UUID.test(id))) return fail('malformed_request', 'clientIds');

  // (1) The key is MINTED AT AUTHORING TIME and carried in the payload. A
  // server-side default here would defeat the whole requirement: it would be
  // derived at send time and a retry would mint a second key.
  const key = String(body.idempotencyKey || '').trim();
  if (!key) return fail('missing_idempotency_key');
  if (!UUID.test(key)) return fail('malformed_request', 'idempotencyKey');

  const weekStartISO = String(body.weekStartISO || '').trim();
  if (!isRealDate(weekStartISO)) return fail('malformed_request', 'weekStartISO');

  const raw = Array.isArray(body.sessions) ? body.sessions : null;
  if (!raw || raw.length === 0) return fail('empty_week');
  if (raw.length > BS_WEEK_SESSION_MAX) return fail('malformed_request', 'sessions');

  const sessions = [];
  for (let i = 0; i < raw.length; i += 1) {
    const s = raw[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return fail('malformed_request', `sessions[${i}]`);

    const scheduledDate = String(s.scheduledDate || '').trim();
    if (!isRealDate(scheduledDate)) return fail('malformed_request', `sessions[${i}].scheduledDate`);
    const offset = dayDelta(weekStartISO, scheduledDate);
    if (offset < 0 || offset > 6) return fail('malformed_request', `sessions[${i}].scheduledDate`);
    // ⚠ Never publish into the past. A past-dated session may already have been
    // logged against, and the boundary's week-replace would delete real work.
    if (dayDelta(todayISO, scheduledDate) < 0) return fail('past_session', `sessions[${i}].scheduledDate`);

    // The pair rides through UNVALIDATED past type. Range and presence are the
    // CORE's judgement (§3.2a's declaration table): a stamped week with a
    // missing pair is `malformed_week`, an unstamped one is `incomplete_week` —
    // and neither is a request error. Coercing or defaulting here would erase
    // exactly the distinction the stamp exists to draw.
    sessions.push({
      id: String(s.id || `s${i}`),
      title: String(s.title || '').trim().slice(0, 200) || 'Workout',
      description: typeof s.description === 'string' ? s.description.slice(0, 2000) : '',
      kind: s.kind === 'template' ? 'template' : 'custom',
      scheduledDate,
      plannedMinutes: isFiniteNum(s.plannedMinutes) ? s.plannedMinutes : undefined,
      plannedRpe: isFiniteNum(s.plannedRpe) ? s.plannedRpe : undefined,
      loadCapture: s.loadCapture === 'per_session' || s.loadCapture === 'per_plan' ? s.loadCapture : undefined,
      payload: s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? s.payload : {},
    });
  }

  const capture = body.capture === 'per_session' || body.capture === 'per_plan' ? body.capture : undefined;

  const ack = body.acknowledgment && typeof body.acknowledgment === 'object'
    ? {
        reasonCode: String(body.acknowledgment.reasonCode || '').trim().slice(0, 64) || null,
        reasonText: String(body.acknowledgment.reasonText || '').trim().slice(0, 1000) || null,
      }
    : null;

  const adjustMode = ['deload', 'maintain', 'progress'].includes(body.adjustMode) ? body.adjustMode : null;

  return {
    ok: true,
    clientIds,
    week: { idempotencyKey: key, weekStartISO, capture, sessions, acknowledgment: ack, adjustMode },
  };
}

/**
 * A deterministic digest of what was submitted, per client.
 *
 * Order-independent by construction: sessions are sorted by (date, id) before
 * hashing, so a builder that reorders its own list is a replay, not a conflict.
 * FNV-1a over a length-prefixed canonical string — the `bsCookKey` precedent;
 * no crypto import, edge-safe, and collisions here cost a rejected replay
 * rather than a wrong write (the RPC also compares coach and client).
 */
export function weekRequestHash(clientId, week) {
  const rows = [...week.sessions]
    .sort((a, b) => (a.scheduledDate === b.scheduledDate ? (a.id < b.id ? -1 : 1) : a.scheduledDate < b.scheduledDate ? -1 : 1))
    .map((s) => [s.scheduledDate, s.title, s.kind, s.plannedMinutes ?? '', s.plannedRpe ?? '', s.loadCapture ?? '', JSON.stringify(s.payload || {})].join(''));
  const parts = [String(clientId), week.weekStartISO, week.capture ?? '', ...rows];
  const canonical = parts.map((p) => `${p.length}:${p}`).join('');

  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16).padStart(8, '0')}-${canonical.length}`;
}

/** The core's `proposedWeek` — the pair, the stamp, and nothing that isn't load. */
export function toProposedWeek(week) {
  return {
    weekStartISO: week.weekStartISO,
    capture: week.capture,
    sessions: week.sessions.map((s) => ({
      id: s.id,
      plannedMinutes: s.plannedMinutes,
      plannedRpe: s.plannedRpe,
      loadCapture: s.loadCapture,
    })),
  };
}

/**
 * `client_workouts` insert rows for the RPC.
 *
 * ⚠ THE PAIR AND THE STAMP GO INTO THE STORED PAYLOAD. That is the second copy
 * described in the capture design §4 — a row re-read later still describes
 * itself, and Adjust regeneration reads the pair back off it rather than
 * re-deriving it (§3.2b: the pair passes through UNCHANGED under all three
 * modes). The week object stays authoritative for evaluation.
 */
export function toWorkoutRows(week) {
  return week.sessions.map((s) => {
    const payload = { ...s.payload };
    if (s.plannedMinutes !== undefined) payload.plannedMinutes = s.plannedMinutes;
    if (s.plannedRpe !== undefined) payload.plannedRpe = s.plannedRpe;
    if (s.loadCapture !== undefined) payload.loadCapture = s.loadCapture;
    if (week.adjustMode) payload.adjustMode = week.adjustMode;
    return {
      title: s.title,
      description: s.description,
      kind: s.kind,
      scheduled_date: s.scheduledDate,
      payload,
    };
  });
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx node --test tests/week-publish.test.mjs`
Expected: PASS, 12/12.

- [ ] **Step 5: Commit**

```bash
git add src/lib/week-publish.mjs tests/week-publish.test.mjs
git commit -m "guardrails 2b: the week-shaped request contract, fixture-tested"
```

---

## Task 3: `guardrail-gate.mjs` — the publish decision (pure, TDD)

**Files:**
- Create: `src/lib/guardrail-gate.mjs`
- Test: `tests/guardrail-gate.test.mjs`

**Interfaces:**
- Consumes: `bsClassifySession`, `bsScopeSessions` from `../../public/newdesign/progressionGuardrail.mjs`.
- Produces: `bsGateDecision({ result, redEnabled, acknowledgment })`, `bsExcludedSessionRate(sessions)`, `bsTelemetryProps({ result, decision, excludedSessionRate, adjustMode })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/guardrail-gate.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsGateDecision, bsExcludedSessionRate, bsTelemetryProps } from '../src/lib/guardrail-gate.mjs';

const res = (over = {}) => ({
  state: 'green', regime: 'measured', redPath: null, reason: null,
  baseline: { au: 1800, basis: 'measured', weeks: 4 },
  proposed: { totalAu: 1900, hardestAu: 480, sessions: 4 },
  axes: [{ axis: 'volume', state: 'green', checks: [], ceilingPct: 12 }],
  contributingAxes: [], gapDays: null,
  issues: { malformedHistory: [], incompleteWeek: [] },
  ...over,
});

test('green publishes', () => {
  const d = bsGateDecision({ result: res(), redEnabled: true });
  assert.equal(d.publish, true);
  assert.equal(d.status, 200);
});

test('amber publishes — amber never blocks', () => {
  const d = bsGateDecision({ result: res({ state: 'amber' }), redEnabled: true });
  assert.equal(d.publish, true);
});

test('ENFORCING + red + no acknowledgment is REJECTED 409', () => {
  const d = bsGateDecision({ result: res({ state: 'red', redPath: 'curve' }), redEnabled: true });
  assert.equal(d.publish, false);
  assert.equal(d.status, 409);
  assert.equal(d.requiresAck, true);
  assert.equal(d.displayState, 'red');
});

test('ENFORCING + red + an acknowledgment publishes and writes the audit row', () => {
  const d = bsGateDecision({
    result: res({ state: 'red', redPath: 'curve' }), redEnabled: true,
    acknowledgment: { reasonCode: 'returning_athlete', reasonText: 'Back off a taper.' },
  });
  assert.equal(d.publish, true);
  assert.equal(d.writeAck, true);
  assert.equal(d.overridden, true);
});

test('an EMPTY acknowledgment is not an acknowledgment', () => {
  const d = bsGateDecision({
    result: res({ state: 'red', redPath: 'curve' }), redEnabled: true,
    acknowledgment: { reasonCode: '', reasonText: '' },
  });
  assert.equal(d.publish, false);
  assert.equal(d.status, 409);
});

test('ADVISORY + red is WRITTEN, shown as amber, and NOT rejected', () => {
  // §7.4 + §9.4: red computes, is recorded, surfaces with the ack path live —
  // but does not 409.
  const d = bsGateDecision({ result: res({ state: 'red', redPath: 'curve' }), redEnabled: false });
  assert.equal(d.publish, true);
  assert.equal(d.status, 200);
  assert.equal(d.displayState, 'amber');
  assert.equal(d.trueState, 'red');
  assert.equal(d.redSuppressed, true);
  assert.equal(d.requiresAck, false);
});

test('ADVISORY + red writes NO guardrail_red_ack row — there is nothing to acknowledge', () => {
  const d = bsGateDecision({ result: res({ state: 'red', redPath: 'curve' }), redEnabled: false });
  assert.equal(d.writeAck, false);
});

test('an UNREADABLE flag fails ENFORCED', () => {
  // §7.4. Safe because red costs an acknowledgment, never the ability to
  // publish. Failing the other way would silently remove the gate at exactly
  // the moment something is already wrong.
  const d = bsGateDecision({ result: res({ state: 'red', redPath: 'curve' }), redEnabled: null });
  assert.equal(d.publish, false);
  assert.equal(d.flagReadFailed, true);
});

test('unknown does NOT gate publish — it is reported, not enforced', () => {
  for (const reason of ['incomplete_week', 'malformed_week', 'malformed_history']) {
    const d = bsGateDecision({ result: res({ state: 'unknown', reason }), redEnabled: true });
    assert.equal(d.publish, true, reason);
    assert.equal(d.reason, reason);
  }
});

test('telemetry logs the TRUE state when the switch suppressed a red', () => {
  const r = res({ state: 'red', redPath: 'compound', contributingAxes: ['volume', 'concentration'] });
  const d = bsGateDecision({ result: r, redEnabled: false });
  const p = bsTelemetryProps({ result: r, decision: d, excludedSessionRate: 0.25, adjustMode: null });
  assert.equal(p.state, 'red');
  assert.equal(p.redPath, 'compound');
  assert.equal(p.redSuppressed, true);
  assert.deepEqual(p.axes, ['volume', 'concentration']);
});

test('telemetry carries NO client identifier', () => {
  const r = res();
  const p = bsTelemetryProps({ result: r, decision: bsGateDecision({ result: r, redEnabled: true }), excludedSessionRate: 0, adjustMode: 'deload' });
  const s = JSON.stringify(p).toLowerCase();
  assert.equal(s.includes('client'), false);
  assert.equal(s.includes('user'), false);
  assert.equal(p.adjustMode, 'deload');
});

test('adjustMode is null when a coach authored the week directly', () => {
  const r = res();
  const p = bsTelemetryProps({ result: r, decision: bsGateDecision({ result: r, redEnabled: true }), excludedSessionRate: 0, adjustMode: null });
  assert.equal(p.adjustMode, null);
});

test('excludedSessionRate is the share of in-scope sessions with no rating', () => {
  const s = (rpe) => ({
    startedAtISO: '2026-07-20T18:00:00-04:00', timezone: 'America/New_York',
    durationSec: 3600, sessionRpe: rpe, durationPrompted: true, durationAnswer: 'confirmed',
    source: 'shape_app', status: 'completed',
  });
  assert.equal(bsExcludedSessionRate([s(8), s(null), s(7), s(0)]), 0.5);
});

test('excludedSessionRate is NULL with nothing in scope — never a fabricated 0', () => {
  assert.equal(bsExcludedSessionRate([]), null);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx node --test tests/guardrail-gate.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/guardrail-gate.mjs`:

```js
// The publish decision — pure, no I/O, no clock reads.
//
// SPEC-guardrails.md §7.4 (kill switch), §9.2/§9.4 (the gate), §10.2 (telemetry).
//
// The core says WHAT the week is. This says what happens NEXT — and it lives in
// its own fixture-tested module rather than inside a route handler for the same
// reason the core does: a rule that only exists in a request handler is a rule
// nothing can pin.

import { bsClassifySession, bsScopeSessions } from '../../public/newdesign/progressionGuardrail.mjs';

const hasAck = (a) => !!(a && (String(a.reasonCode || '').trim() || String(a.reasonText || '').trim()));

/**
 * Decide whether this week publishes.
 *
 * @param {{result: object, redEnabled: boolean|null, acknowledgment?: object|null}} args
 *   `redEnabled` is the value the load-history RPC returned. NULL means the row
 *   could not be read — §7.4 rules that ENFORCED, deliberately.
 */
export function bsGateDecision({ result, redEnabled, acknowledgment = null } = {}) {
  const trueState = result && result.state ? result.state : 'unknown';
  const flagReadFailed = redEnabled === null || redEnabled === undefined;
  const enforcing = flagReadFailed ? true : redEnabled === true;

  const base = {
    trueState,
    reason: (result && result.reason) || null,
    redPath: (result && result.redPath) || null,
    flagReadFailed,
    enforcing,
    redSuppressed: false,
    requiresAck: false,
    writeAck: false,
    overridden: false,
    displayState: trueState,
    publish: true,
    status: 200,
  };

  if (trueState !== 'red') {
    // green, amber, and unknown all publish. `unknown` is REPORTED, not
    // enforced (§9.2) — an unscoreable week is not a safe week, but blocking on
    // it would punish a coach for a blank field or a bad logged row.
    return base;
  }

  if (!enforcing) {
    // §7.4: every red is DOWNGRADED TO AMBER in everything the coach sees, and
    // publish-blocking is disabled — no acknowledgment interstitial, no 409, no
    // guardrail_red_ack entry (there is nothing to acknowledge). Telemetry keeps
    // recording the truth; see bsTelemetryProps.
    return { ...base, displayState: 'amber', redSuppressed: true };
  }

  if (!hasAck(acknowledgment)) {
    return { ...base, publish: false, status: 409, requiresAck: true };
  }

  return { ...base, writeAck: true, overridden: true };
}

/**
 * The share of the baseline-eligible history dropped for want of a session RPE.
 *
 * §10.2: "so the cost of skipping is visible at the point it actually distorts
 * a ceiling". Derived from the SAME raw rows the core reads, through the core's
 * OWN classifier — a second implementation of "was this rated" is exactly how
 * the number starts disagreeing with the ceiling it explains.
 *
 * @returns {number|null} null when nothing is in scope — never a fabricated 0.
 */
export function bsExcludedSessionRate(sessions) {
  const scoped = bsScopeSessions(Array.isArray(sessions) ? sessions : []);
  let total = 0;
  let unrated = 0;
  for (let i = 0; i < scoped.length; i += 1) {
    const c = bsClassifySession(scoped[i], i);
    if (c.malformed) continue;
    total += 1;
    if (!c.rated) unrated += 1;
  }
  if (total === 0) return null;
  return unrated / total;
}

/**
 * The `guardrail_evaluated` props (§10.2).
 *
 * ⚠ `state` is ALWAYS THE TRUE COMPUTED STATE, never the value shown to the
 * coach. That is the entire point of the kill switch: we keep a clean read of
 * what red WOULD have fired on, so the caps can be retuned from real data
 * before red is switched back on.
 *
 * ⚠ NO CLIENT IDENTIFIER. Aggregate only, never read for an individual case —
 * ai_audit_log is authoritative for anything coach-facing or legal (§10.1).
 *
 * DEVIATION from §10.2's field list, additive: the spec names one `reasonCode`,
 * but two disjoint vocabularies want it — the coach's OVERRIDE code and the
 * core's `unknown` reason. Mixing them in one column makes every later
 * aggregate query ambiguous, so they ride as `reasonCode` (override) and
 * `unknownReason` (core). Nothing was removed.
 */
export function bsTelemetryProps({ result, decision, excludedSessionRate, adjustMode }) {
  const axes = Array.isArray(result.contributingAxes) && result.contributingAxes.length
    ? result.contributingAxes
    : (Array.isArray(result.axes) ? result.axes.map((a) => a && a.axis).filter(Boolean) : []);

  // The tightest ceiling any axis reported — the one the week is actually
  // pressing against. Null when no axis produced one (unknown, not_evaluable).
  const pcts = (Array.isArray(result.axes) ? result.axes : [])
    .map((a) => (a && typeof a.ceilingPct === 'number' ? a.ceilingPct : null))
    .filter((p) => p !== null);

  return {
    state: result.state,
    regime: result.regime,
    redPath: result.redPath || null,
    axes,
    baselineAu: result.baseline ? result.baseline.au : null,
    proposedAu: result.proposed ? result.proposed.totalAu : null,
    ceilingPct: pcts.length ? Math.min(...pcts) : null,
    overridden: !!decision.overridden,
    reasonCode: decision.overridden && decision.acknowledgmentCode ? decision.acknowledgmentCode : null,
    unknownReason: result.state === 'unknown' ? (result.reason || null) : null,
    excludedSessionRate: typeof excludedSessionRate === 'number' ? excludedSessionRate : null,
    redSuppressed: !!decision.redSuppressed,
    adjustMode: adjustMode || null,
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx node --test tests/guardrail-gate.test.mjs`
Expected: PASS, 14/14. If the `reasonCode` test needs `decision.acknowledgmentCode`, thread it through `bsGateDecision`'s return (`acknowledgmentCode: acknowledgment?.reasonCode ?? null` on the overridden branch) rather than reading the raw ack in the telemetry builder — the decision object is the contract.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm test` then `npx tsc --noEmit`
Expected: 1152 + 26 new tests pass, tsc exit 0. Paste the raw output.

- [ ] **Step 6: Commit**

```bash
git add src/lib/guardrail-gate.mjs tests/guardrail-gate.test.mjs
git commit -m "guardrails 2b: the publish decision + telemetry payload, fixture-tested"
```

---

## Task 4: `POST /api/trainer/week` — the boundary

**Files:**
- Create: `src/app/api/trainer/week/route.ts`
- Modify: `src/lib/funnel.mjs:17`

**Interfaces:**
- Consumes: `normalizeWeekRequest`, `weekRequestHash`, `toProposedWeek`, `toWorkoutRows`, `bsGateDecision`, `bsExcludedSessionRate`, `bsTelemetryProps`, `bsProgressionGuardrail`, `bsGuardrailCopy`, `unauthorizedAssignTargets`, `readJson`, `dbError`, `currentUser`, `clientForRequest`, `auditSink`.
- Produces: `POST /api/trainer/week` → `{ ok, results: [{ clientId, status, state, displayState, copy, reason, requiresAck, alreadyDelivered }] }`.

- [ ] **Step 1: Add the whitelist's other half**

In `src/lib/funnel.mjs`, append to `ANALYTICS_EVENTS` (after `'session_rpe_dropped'`):

```js
  // guardrail_evaluated { state, regime, redPath, axes, baselineAu, proposedAu,
  // ceilingPct, overridden, reasonCode, unknownReason, excludedSessionRate,
  // redSuppressed, adjustMode } — written SERVER-SIDE AT PUBLISH ONLY, never
  // from a builder (§10.2: per-keystroke evaluations would destroy the flag-rate
  // denominators). ⚠ THE TRAP, SET A SECOND TIME: this list and the p_event
  // whitelist inside track_event must BOTH carry the name. track_event silently
  // returns on an unknown one, so editing only one ships a feature that writes
  // nothing and reports no error.
  'guardrail_evaluated',
```

- [ ] **Step 2: Write the route**

Create `src/app/api/trainer/week/route.ts`:

```ts
// The week-shaped publish boundary — SPEC-guardrails.md §9.4.
//
// The ONE door every coach training write passes through. It is deliberately
// thin: the contract lives in week-publish.mjs, the judgement in the core, the
// decision in guardrail-gate.mjs, and atomicity in publish_client_week. What is
// here is authentication, scope, and orchestration.
//
// POST { clientIds[], weekStartISO, idempotencyKey, capture, sessions[],
//        acknowledgment?, adjustMode? }
//   -> { ok, results: [{ clientId, status, state, displayState, copy, ... }] }
//
// ⚠ ONE CALL, PER-CLIENT EVALUATION. §9.4 quotes clientIds[] in one call; a
// single evaluation across N clients is not expressible, because the verdict is
// a function of ONE client's history. So the fan-out is internal: one
// evaluation, one atomic write, one telemetry row, and one idempotency record
// PER CLIENT. "Written atomically" holds at the client-week, which is the only
// unit that can be atomic.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { unauthorizedAssignTargets } from '@/lib/access-guards.mjs';
import { normalizeWeekRequest, weekRequestHash, toProposedWeek, toWorkoutRows } from '@/lib/week-publish.mjs';
import { bsGateDecision, bsExcludedSessionRate, bsTelemetryProps } from '@/lib/guardrail-gate.mjs';
import { bsProgressionGuardrail, bsGuardrailCopy } from '../../../../../public/newdesign/progressionGuardrail.mjs';
import { auditSink } from '@/lib/ai/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;

  // `todayISO` is an INPUT to every pure module below. It is read from the
  // clock exactly once, here, at the I/O boundary — nowhere downstream.
  const todayISO = new Date().toISOString().slice(0, 10);
  const norm = normalizeWeekRequest(parsed.data, { todayISO });
  if (!norm.ok) {
    return NextResponse.json({ error: 'That week could not be read.', reason: norm.error, detail: norm.detail }, { status: 400 });
  }
  const { clientIds, week } = norm;

  // Trainer row + on-client scope. Same gate as the route this replaces.
  const { data: trainerRow } = await supabase.from('trainers').select('id').eq('owner_id', user.id).maybeSingle();
  if (!trainerRow) return NextResponse.json({ error: 'Not a trainer.' }, { status: 403 });

  const { data: subs, error: subsError } = await supabase
    .from('subscriptions').select('client_id')
    .eq('provider_id', trainerRow.id).eq('provider_role', 'trainer')
    .in('status', ['active', 'trialing']);
  if (subsError) return NextResponse.json({ error: 'Could not verify client assignment scope. Please retry.' }, { status: 500 });

  const activeIds = (subs ?? []).map((s) => String((s as { client_id: unknown }).client_id));
  if (unauthorizedAssignTargets(clientIds, activeIds).length) {
    return NextResponse.json({ error: 'You can only assign workouts to your own active clients.' }, { status: 403 });
  }

  const proposedWeek = toProposedWeek(week);
  const rows = toWorkoutRows(week);
  const audit = auditSink(supabase);
  const results: Record<string, unknown>[] = [];

  for (const clientId of clientIds) {
    const hash = weekRequestHash(clientId, week);

    // History + the kill switch ride on ONE call (§7.4: the flag rides on the
    // load-history response so builder and route cannot disagree).
    const { data: history, error: histErr } = await supabase.rpc('get_client_load_history', { p_user_id: clientId });
    if (histErr) return dbError(histErr, 'guardrail load history', 500);

    const sessions = (history?.sessions ?? []) as unknown[];
    // NULL is reported honestly by the RPC and the CALLER applies §7.4's
    // fails-enforced rule — bsGateDecision owns that, not this line.
    const redEnabled = (history?.redEnabled ?? null) as boolean | null;

    const result = bsProgressionGuardrail({ todayISO, sessions }, proposedWeek);
    const decision = bsGateDecision({ result, redEnabled, acknowledgment: week.acknowledgment });
    const copy = bsGuardrailCopy({ ...result, state: decision.displayState });

    if (!decision.publish) {
      // A rejection is NEVER absorbed, and it carries the reason a coach can act
      // on. No telemetry: nothing was published, and §10.2's denominator is
      // publishes.
      results.push({
        clientId, status: 'rejected', httpStatus: 409,
        state: decision.displayState, trueState: decision.trueState,
        reason: result.reason, redPath: result.redPath,
        requiresAck: true, copy,
      });
      continue;
    }

    const outcome = {
      state: decision.displayState, trueState: decision.trueState,
      reason: result.reason, redPath: result.redPath,
      redSuppressed: decision.redSuppressed, overridden: decision.overridden,
      copy,
    };

    const { data: pub, error: pubErr } = await supabase.rpc('publish_client_week', {
      p_idempotency_key: week.idempotencyKey,
      p_client_id: clientId,
      p_week_start: week.weekStartISO,
      p_request_hash: hash,
      p_outcome: outcome,
      p_rows: rows,
    });
    if (pubErr) {
      // 23505 = the same key with different content. A caller bug, not a
      // replay, and it must never be served the first week's outcome.
      const conflict = (pubErr as { code?: string }).code === '23505';
      return dbError(pubErr, 'week publish', conflict ? 409 : 500,
        conflict ? 'That publish key was already used for a different week.' : 'Could not publish the week. Please retry.');
    }

    const already = pub?.status === 'already_delivered';
    if (already) {
      // (3) A replay reports honestly — no second set of rows, no second
      // telemetry row, no second audit entry.
      results.push({ clientId, status: 'already_delivered', ...(pub.outcome as object) });
      continue;
    }

    // ai_audit_log is authoritative for anything coach-facing or legal (§10.1).
    // Written ONLY for a genuine acknowledged override — never for a suppressed
    // red, where there is nothing to acknowledge.
    if (decision.writeAck) {
      try {
        await audit.log({
          source: 'engine', action: 'guardrail_red_ack', actorRole: 'trainer',
          target: { userId: clientId, kind: 'training_week', id: week.weekStartISO },
          suggestion: result,
          confirmedPayload: { acknowledged: true, ...week.acknowledgment },
          beforeState: { weekStartISO: week.weekStartISO, replaced: pub?.replaced ?? null },
          afterState: { weekStartISO: week.weekStartISO, sessions: rows.length },
        });
      } catch (e) {
        // The week is written. An audit failure is loud but not a rollback —
        // the response says so rather than reporting a clean publish.
        console.error('[shape-api] guardrail_red_ack write failed:', e);
        (outcome as Record<string, unknown>).audited = false;
      }
    }

    // ONE telemetry row per publish, regardless of session count (§9.4).
    try {
      await supabase.rpc('track_event', {
        p_event: 'guardrail_evaluated',
        p_props: bsTelemetryProps({
          result,
          decision: { ...decision, acknowledgmentCode: week.acknowledgment?.reasonCode ?? null },
          excludedSessionRate: bsExcludedSessionRate(sessions),
          adjustMode: week.adjustMode,
        }),
      });
    } catch (e) {
      console.error('[shape-api] guardrail_evaluated write failed:', e);
    }

    results.push({ clientId, status: 'accepted', inserted: pub?.inserted ?? 0, replaced: pub?.replaced ?? 0, ...outcome });
  }

  const anyRejected = results.some((r) => r.status === 'rejected');
  return NextResponse.json({ ok: !anyRejected, results }, { status: anyRejected ? 409 : 200 });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. If the deep relative import of `progressionGuardrail.mjs` fails to resolve types, add a sibling `progressionGuardrail.d.ts` declaring the two used exports — the `scoreHistory.mjs` + `.d.ts` twin precedent in this repo. Do NOT copy the core into `src/`.

- [ ] **Step 4: Register the route in the War Room**

In `src/lib/warroom.ts` `RAW_ROUTES`, add `['/api/trainer/week', 'POST'],` immediately after the `/api/trainer/workout` entry. Leave the old entry in place until Task 11.

- [ ] **Step 5: Full gates + commit**

Run: `npm test` and `npx tsc --noEmit`. Paste raw output.

```bash
git add src/app/api/trainer/week/route.ts src/lib/funnel.mjs src/lib/warroom.ts
git commit -m "guardrails 2b: the week-shaped publish route"
```

- [ ] **Step 6: STOP — hand off for the CodeRabbit pass**

Report the changed-file list since the owner's last review:

```
supabase-migrations/2026-07-29-guardrail-week-publish.sql   (new)
supabase-migrations/2026-06-23-analytics-events.sql         (whitelist only, if needed)
src/lib/week-publish.mjs                                    (new)
src/lib/guardrail-gate.mjs                                  (new)
src/lib/funnel.mjs                                          (1 entry)
src/app/api/trainer/week/route.ts                           (new)
src/lib/warroom.ts                                          (1 line)
tests/week-publish.test.mjs                                 (new)
tests/guardrail-gate.test.mjs                               (new)
```

Wait for an explicit *"I ran CodeRabbit"*. Then push and open PR A. **The migration is an OWNER action** — post the raw GitHub link only:
`raw.githubusercontent.com/cperry8800-droid/shape-app/main/supabase-migrations/2026-07-29-guardrail-week-publish.sql`

---

## Task 5: Mobile capture — the pair in the draft editor

**Files:**
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` (`BSCoachDraftEditor:4883`, the trainer plan builder's `chips('LENGTH', …)` at `:5408`, and the trainer `BSCoachDraftEditor` mount at `:5357`)
- Modify: 13 × `mobile-app/src/i18n/catalogs/<loc>/coach.json`

**Interfaces:**
- Consumes: `bsAssignDayLine`, `bsAssignWeekLine` from `planOutline.mjs` (the shape is read through the ONE classifier — three surfaces already classify through it and a fourth opinion is how they start disagreeing).
- Produces: `block.plannedMinutes` / `block.plannedRpe` on session-shaped blocks; the plan-level `length` chip mapped to `detail.plannedMinutes`; `detail.plannedRpe`.

- [ ] **Step 1: Write the failing test**

Append to `tests/broadsheet-render.test.mjs` — the existing MOUNT harness that compiles the module in memory and DRIVES the component. Reuse it; do not rebuild it.

```js
test('the load-capture inputs render ONLY on session-shaped blocks', async () => {
  // §6 of the capture design: shown only where planOutline says a block IS a
  // session. On an exercise outline the block is a movement, and asking for a
  // per-session length there would collect a number that means nothing.
  const html = await renderDraftEditor({
    loadCapture: true,
    blocks: ['Mon — Upper (push)', 'Tue — Lower (pull)', 'Wed — Rest'],
  });
  assert.equal((html.match(/data-load-capture/g) || []).length, 2); // rest lines excluded
});

test('an exercise outline gets NO per-block capture inputs', async () => {
  const html = await renderDraftEditor({
    loadCapture: true,
    blocks: ['Warm-up · 8 min', 'Main lift · 4×8', 'Accessory · 3×12'],
  });
  assert.equal(html.includes('data-load-capture'), false);
});

test('a RANGED length maps to ABSENT, never to an end of the range', async () => {
  // §2 of the capture design, verbatim: never resolve a range by picking an
  // end. A 45-vs-60 resolution is a 33% swing in that session's load, silently,
  // in the direction that loosens ceilings.
  assert.equal(bsPlannedMinutes('45-60 minutes'), undefined);
  assert.equal(bsPlannedMinutes(''), undefined);
  assert.equal(bsPlannedMinutes('about an hour'), undefined);
  assert.equal(bsPlannedMinutes('45 min'), 45);
});

test('a failed length mapping yields ABSENT, never 0', async () => {
  // A zero-minute session scores as zero load and reads as a rest day the coach
  // never wrote.
  assert.notEqual(bsPlannedMinutes('nonsense'), 0);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx node --test tests/broadsheet-render.test.mjs`
Expected: FAIL — `renderDraftEditor` does not accept `loadCapture`; `bsPlannedMinutes` is not exported.

- [ ] **Step 3: Add the enum mapping**

In `mobile-app/src/services/planOutline.mjs`, add:

```js
/**
 * The LENGTH chip's value -> plannedMinutes.
 *
 * ⚠ AN ENUM MAPPING, NOT A PARSE. `chips('LENGTH', …)` renders a CLOSED list of
 * four; this maps EXACT MATCHES against those values and nothing else.
 *
 * Anything else — a range ('45-60 minutes'), prose, an empty string, a value
 * from a different builder — is ABSENT. Never resolve a range by picking an
 * end: a 45-vs-60 resolution is a 33% swing in that session's load, silently,
 * in the direction that loosens ceilings. A failed mapping yields absent,
 * NEVER 0 — a zero-minute session scores as zero load and reads as a rest day
 * the coach never wrote.
 *
 * @returns {number|undefined}
 */
export const BS_LENGTH_CHIPS = Object.freeze({
  '30 min': 30, '45 min': 45, '60 min': 60, '75 min': 75,
});
export function bsPlannedMinutes(chipValue) {
  return Object.prototype.hasOwnProperty.call(BS_LENGTH_CHIPS, chipValue)
    ? BS_LENGTH_CHIPS[chipValue]
    : undefined;
}
```

- [ ] **Step 4: Add the capture inputs to the draft editor**

In `iosAppBroadsheetPros.jsx`, extend `BSCoachDraftEditor`'s signature (`:4883`) with `loadCapture = false` — a third opt-in flag alongside `stepAuthoring` and `perDayAuthoring`.

Inside the block map (next to the `{stepAuthoring && (` branch at `:5086`), add:

```jsx
{loadCapture && bsBlockIsSession(b.text) && (
  <div data-load-capture style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
    <label style={{ display: 'block' }}>
      <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
        {tr('coach:editor.plannedMinutes', { defaultValue: 'LENGTH · MIN' })}
      </span>
      <input
        type="number" inputMode="numeric" min={1} max={600}
        value={b.plannedMinutes ?? ''}
        onChange={(e) => setBlock(b.id, { plannedMinutes: e.target.value === '' ? undefined : Number(e.target.value) })}
        className="bs-uline" style={{ width: '100%' }}
      />
    </label>
    <label style={{ display: 'block' }}>
      <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
        {tr('coach:editor.plannedRpe', { defaultValue: 'EFFORT · RPE' })}
      </span>
      {/* Half-points are allowed HERE and nowhere else: a coach authoring a
          week has no whole-number constraint and half-points are a real
          coaching convention. A LOGGED rating comes from a completion prompt
          that only ever emits whole numbers, so a fraction there can only be a
          defect (§13.14). Do not "harmonise" the two. */}
      <input
        type="number" inputMode="decimal" min={1} max={10} step={0.5}
        value={b.plannedRpe ?? ''}
        onChange={(e) => setBlock(b.id, { plannedRpe: e.target.value === '' ? undefined : Number(e.target.value) })}
        className="bs-uline" style={{ width: '100%' }}
      />
    </label>
  </div>
)}
```

Add the shape predicate at module scope, reading through `planOutline.mjs` and never re-deriving:

```jsx
// A block IS a session on exactly two outline shapes (capture design §6). Read
// through planOutline — three surfaces already classify through it, and a
// fourth opinion is how they start disagreeing.
function bsBlockIsSession(text) {
  const day = bsAssignDayLine(text);
  if (day) return !day.rest;
  return !!bsAssignWeekLine(text);
}
```

Thread `plannedMinutes` / `plannedRpe` through the publish callback at `:5169`. **⚠ A new field must cross the draft editor, `onPublish`, EVERY receiver, and the RPC — dropping it anywhere kills the feature WITHOUT ERRORING.** Update both `publishDraft` receivers, not just the trainer one.

Pass `loadCapture` on the trainer mount (`:5357`): `loadCapture` (nutrition plans carry no training load — do NOT pass it on the nutritionist mount at `:6247`).

- [ ] **Step 5: Add the plan-level effort chip**

Beside the existing `chips('LENGTH', …)` at `:5408`, add an effort row so the `per_plan` shape (blocks are exercises) has a pair:

```jsx
{chips(tr('coach:plans.effortLabel', { defaultValue: 'EFFORT' }), effort, setEffort, ['RPE 6', 'RPE 7', 'RPE 8', 'RPE 9'])}
```

with `bsPlannedRpe` mapping the same way — exact matches only, anything else absent.

- [ ] **Step 6: The perturbation check**

§7 of the capture design requires it, and it is the check that catches the failure mode this class actually has:

```js
test('PERTURBATION — stripping the pair at ONE hop fails a test', async () => {
  // Strip plannedMinutes uniformly in the publish callback and confirm a test
  // goes red. The UNIFORM case is the one that must not be silently absorbed —
  // it is precisely what the stamp exists to catch, and it is the likelier bug
  // since transforms apply uniformly.
  //
  // Run by hand before committing: delete `plannedMinutes` from the onPublish
  // payload in iosAppBroadsheetPros.jsx and re-run this file. The full-path
  // presence test below MUST fail. Restore, confirm green.
  const published = await drainPublish({ loadCapture: true, blocks: ['Mon — Upper (push)'], minutes: 60, rpe: 8 });
  assert.equal(published.blocks[0].plannedMinutes, 60);  // asserted at the FAR END, not by inspecting the code
  assert.equal(published.blocks[0].plannedRpe, 8);
});
```

- [ ] **Step 7: Add 4 i18n keys × 13 locales**

`editor.plannedMinutes`, `editor.plannedRpe`, `plans.effortLabel`, and the advisory-flag heading added in Task 6. Register nothing new — `coach` is already in both `mobile-app/src/i18n/index.js` and `tests/i18n-catalog-complete.test.mjs`.

⚠ Use `io.open(p, encoding='utf-8')` + `PYTHONIOENCODING=utf-8` for any script that touches these files. Never let a `|| echo` fallback turn a decode error into a data conclusion.

- [ ] **Step 8: Gates + commit**

Run: JSX parse-check, `npm test`, `npx tsc --noEmit`, the tr-shadow grep (BOTH forms: `grep -nE '(const|let|var) tr ='` AND `grep -nE '\((tr)\)\s*=>|\((tr),\s*[a-z]'`), catalog parity, LF check, and the PowerShell `/m/` build.

```bash
git add mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx mobile-app/src/services/planOutline.mjs tests/broadsheet-render.test.mjs mobile-app/src/i18n/catalogs/*/coach.json
git commit -m "guardrails 2b: capture the planned pair in the coach builder"
```

---

## Task 6: Mobile — publish the week through the boundary

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (`assignClientWorkout:1418`, `window.ShapeAssign:3826`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` (`BSProAssignPage`, the three write sites at `:3410` split, `:3420` week block, `:3429` single)
- Create: `mobile-app/src/services/assignQueue.mjs`
- Create: `tests/assign-queue.test.mjs`

**Interfaces:**
- Consumes: `POST /api/trainer/week` (Bearer on native, cookie on `/m/` — the `sessionsAuthHeaders` pattern `ShapeAssign.mealPlan` already uses).
- Produces: `ShapeAssign.week({ clientId, weekStartISO, idempotencyKey, capture, sessions, acknowledgment, adjustMode })` → `{ status: 'accepted'|'already_delivered'|'rejected'|'queued', ... }`.

**⚠ Read `docs/OFFLINE-ASSIGN-QUEUE-PARKED.md` (branch `claude/offline-assign-queue`) before writing a line of this task.** It names exactly what to port and what must be DELETED rather than extended. Do not preserve the deleted half out of sunk cost.

| Port | Do NOT port |
|---|---|
| `bsClassifyWriteFailure()` — the module's real invariant | `bsAssignmentKey()` + the same-identity collapse — an identity heuristic the server key replaces outright |
| `bsPruneQueue()` (age + cap), ordering, `bsMergeAfterDrain()` | `assignmentAlreadyWritten()` — a client-side existence probe whose fail-open-on-read-error becomes a liability |
| `BSProAssignRejects` + the rejection ledger | `sentKeysRef` + retry-skip — per-screen memory, obsolete once a repeat is safe by construction |
| Storage-failure honesty (`writeAssignQueue` returning a persisted flag) | `bsPartitionByOwner()` + the per-write owner guard — requirement (4) makes this a SERVER rejection |
| The failure-classification vectors in `tests/assign-queue.test.mjs` | Notification dedupe by `clientId + body`; the `shape:assignQueue` → screen reconciliation |

- [ ] **Step 1: Write the failing tests**

Create `tests/assign-queue.test.mjs` with the ported classification vectors plus the new key-dependent ones:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsClassifyWriteFailure, bsPruneQueue, bsMergeAfterDrain, BS_ASSIGN_QUEUE_CAP } from '../mobile-app/src/services/assignQueue.mjs';

test('a network failure earns the local hold', () => {
  assert.equal(bsClassifyWriteFailure(new TypeError('Failed to fetch')), 'network');
  assert.equal(bsClassifyWriteFailure({ code: 'ECONNRESET' }), 'network');
  assert.equal(bsClassifyWriteFailure(new Error('Load failed')), 'network');
});

test('a SERVER REJECTION is never absorbed — no local record', () => {
  assert.equal(bsClassifyWriteFailure({ httpStatus: 409, reason: 'red_unacknowledged' }), 'rejected');
  assert.equal(bsClassifyWriteFailure({ httpStatus: 403 }), 'rejected');
  assert.equal(bsClassifyWriteFailure({ httpStatus: 400 }), 'rejected');
});

test('THE DEFAULT IS REJECTED — the two mis-classifications are not symmetric', () => {
  // A rejection read as a blip -> a local record + a false "saved". That is the
  // exact harm. A blip read as a rejection -> an honest error and one tap.
  assert.equal(bsClassifyWriteFailure(null), 'rejected');
  assert.equal(bsClassifyWriteFailure({}), 'rejected');
  assert.equal(bsClassifyWriteFailure(undefined), 'rejected');
});

test('definitive offline outranks the default', () => {
  assert.equal(bsClassifyWriteFailure(null, { online: false }), 'network');
});

test('EVIDENCE THE SERVER ANSWERED outranks navigator.onLine', () => {
  assert.equal(bsClassifyWriteFailure({ httpStatus: 409 }, { online: false }), 'rejected');
});

test('a cap eviction REPORTS what it dropped', () => {
  // Parked finding 3: silent eviction told a coach work was held that no longer
  // existed. Pruning must report its drops.
  const q = Array.from({ length: BS_ASSIGN_QUEUE_CAP + 3 }, (_, i) => ({ at: 1000 + i, idempotencyKey: `k${i}` }));
  const { kept, dropped } = bsPruneQueue(q, { now: 2000 });
  assert.equal(kept.length, BS_ASSIGN_QUEUE_CAP);
  assert.equal(dropped.length, 3);
  assert.equal(dropped[0].idempotencyKey, 'k0'); // oldest goes, newest week is what they care about
});

test('a drained key is removed by KEY, not by a content heuristic', () => {
  const held = [{ idempotencyKey: 'a' }, { idempotencyKey: 'b' }];
  assert.deepEqual(bsMergeAfterDrain(held, ['a']).map((x) => x.idempotencyKey), ['b']);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx node --test tests/assign-queue.test.mjs` — module not found.

- [ ] **Step 3: Port `assignQueue.mjs`**

```bash
git show claude/offline-assign-queue:mobile-app/src/services/assignQueue.mjs > mobile-app/src/services/assignQueue.mjs
```

Then DELETE from it: `bsAssignmentKey`, the same-identity collapse in `bsQueueAssignment`, `bsPartitionByOwner`, and any body-matching notification dedupe. Re-key the queue on `idempotencyKey`. Make `bsPruneQueue` return `{ kept, dropped }` (it currently returns an array) — parked finding 3.

- [ ] **Step 4: Add `ShapeAssign.week`**

In `shapeBackend.js`, beside `assignClientMealPlan`:

```js
// The week-shaped publish boundary (SPEC-guardrails.md §9.4). Bearer on native,
// cookie on /m/ — the same auth shape as assignClientMealPlan.
//
// ⚠ THE KEY IS MINTED BY THE CALLER, AT AUTHORING TIME. Do not default it here:
// a key derived at send time would be re-minted on every retry, which is the
// exact opposite of what it is for.
async function publishClientWeek({ clientId, weekStartISO, idempotencyKey, capture, sessions, acknowledgment, adjustMode } = {}) {
  const body = { clientIds: [clientId], weekStartISO, idempotencyKey, capture, sessions, acknowledgment, adjustMode };
  let res;
  try {
    res = await fetch(`${apiBaseUrl || ''}/api/trainer/week`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  } catch (err) {
    // ⚠ ONLY POSITIVE EVIDENCE OF CONNECTIVITY LOSS EARNS THE LOCAL FALLBACK.
    // A coach seeing "saved" on a week the server REJECTED is worse than the
    // ungated path: they would believe it saved AND believe it passed.
    if (bsClassifyWriteFailure(err, { online: navigator?.onLine }) === 'network') {
      const held = bsQueueAssignment(body);
      return { status: 'queued', persisted: held.persisted, dropped: held.dropped };
    }
    throw err;
  }

  const d = await res.json().catch(() => ({}));
  const one = Array.isArray(d.results) ? d.results[0] : null;

  if (!res.ok) {
    // A 4xx/409 is a SERVER REJECTION and is never absorbed. It surfaces with
    // the guardrail's own reason and NO local record is written.
    return {
      status: 'rejected', httpStatus: res.status,
      reason: one?.reason || d.reason || null,
      requiresAck: !!one?.requiresAck,
      copy: one?.copy || null,
      error: d.error || 'That week was not published.',
    };
  }
  return { status: one?.status || 'accepted', ...one };
}

window.ShapeAssign = {
  clients: listAssignableClients,
  week: publishClientWeek,
  mealPlan: assignClientMealPlan,
};
```

**Delete `ShapeAssign.workout`** and, with it, the fallback in `assignClientWorkout:1458-1460` — that function keeps only the self-authored writers. Grep for `ShapeAssign.workout` and confirm zero remaining callers before deleting.

- [ ] **Step 5: The minimal replay path — option (a)**

The owner's ruling: the key plus a minimal replay INSIDE 2b, so the offline-assignment window never opens. Add a drain that fires on session resolve (beside `startPresence()` / `registerPush()` in `getCurrentSession`):

```js
// Minimal replay. Re-posting a held week is SAFE BY CONSTRUCTION now: the
// server key makes a repeat return the SAME OUTCOME rather than a second set of
// rows, and reports `already_delivered` so nothing has to guess. That is why
// none of the client-side identity bookkeeping the parked branch grew survives
// here — it existed only to approximate this answer.
async function drainAssignmentQueue() {
  const { kept, dropped } = bsPruneQueue(readAssignQueue(), { now: Date.now() });
  if (dropped.length) recordAssignDrops(dropped);   // never a silent eviction
  const delivered = [];
  for (const held of kept) {
    try {
      const r = await publishClientWeek(held);
      // `rejected` also leaves the queue: replaying a week the server refused
      // just refuses again. It lands on the rejection ledger instead.
      if (r.status !== 'queued') delivered.push(held.idempotencyKey);
      if (r.status === 'rejected') recordAssignRejection(held, r);
    } catch (e) { /* still offline — keep holding */ }
  }
  if (delivered.length) writeAssignQueue(bsMergeAfterDrain(kept, delivered));
}
```

- [ ] **Step 6: Move `BSProAssignPage`'s three branches onto the week**

Replace the three loops (`:3410` split, `:3420` week block, `:3429` single) with **one week-shaped submission per week**, each carrying its own key derived from a single authoring-time base key:

```jsx
// ONE key minted at AUTHORING time (the moment the coach opens Assign), one
// derived key per (client, week). Derived — not re-minted — so a retry tap and
// a background drain produce the SAME key for the SAME week.
const baseKeyRef = useRef(bsUuid());
const weekKey = (uid, weekStartISO) => bsDeriveKey(baseKeyRef.current, uid, weekStartISO);
```

Each of the three shapes produces `{ weekStartISO, capture, sessions[] }`:

| Outline shape | A block is | `capture` | Sessions per week |
|---|---|---|---|
| split (`bsAssignDayLine`, ≥3 day lines) | one session | `per_session` | one per non-rest day line |
| week block (`bsAssignWeekLine`, ≥2 week lines) | one session | `per_session` | one, that week's phase |
| anything else | one **exercise** | `per_plan` | one, all blocks inside it |

For `per_plan`, every session carries `loadCapture: 'per_plan'` and the plan-level pair. **Never derive per-session values by dividing a plan-level figure by session count** — uniform distribution is an assumption, not a measurement, and there is no "temporarily, until the UI lands" exception.

- [ ] **Step 7: Advisory flags + the acknowledgment interstitial**

Run the SAME core against the draft week as it is assembled, against a history payload fetched **once** for that client (`get_client_load_history` via the existing supabase client). Render `bsGuardrailCopy(result)` inline. Amber is dismissible. Red disables the Assign CTA until acknowledged; the acknowledgment (reason code + free text) rides on the publish body.

**The builder writes NO telemetry.** Per-keystroke evaluations would destroy the flag-rate denominators.

- [ ] **Step 8: Render-mount proof**

⚠ TDZ / hook-order crashes pass parse, tsc, tests AND build. This task adds hooks (`useRef`, the history fetch effect) to a mounted component, so MOUNT it through `tests/broadsheet-render.test.mjs` and drive it: open Assign → pick a client → the advisory flag renders → a red disables the CTA → acknowledging enables it.

- [ ] **Step 9: Gates + commit + hand off**

All mobile gates. Then commit with explicit paths and **STOP** for the CodeRabbit pass before pushing PR B.

---

## Task 7: Mobile — verify the failure classes end to end

**Files:** none new. This task is the acceptance pass for the owner's fourth requirement.

- [ ] **Step 1: Assert each class, by hand, against the running app**

| Situation | Required behaviour |
|---|---|
| Airplane mode, tap Assign | `status:'queued'`, the coach is told it is HELD (never "saved"), the local record exists, and it delivers on reconnect |
| Server returns 409 (red, enforcing, no ack) | NO local record. The coach sees the guardrail's own reason from `bsGuardrailCopy` and the acknowledgment path |
| Server returns 403 (not this coach's client) | NO local record. Honest error |
| Storage is full / `writeAssignQueue` fails | The coach is NOT told it is held |
| Queue at cap | The eviction is REPORTED, not silent |
| Replay of an already-delivered week | `already_delivered` — no duplicate rows, no second notification |
| Replay under a DIFFERENT signed-in account | Rejected by the server (42501), never re-attributed |

- [ ] **Step 2: Record the results in the PR body, including anything that could not be exercised locally**

---

## Task 8: Adjust regeneration through the boundary

**Files:**
- Modify: `mobile-app/src/services/shapeBackend.js` (`applyAdjustRegeneration:5709`)
- Modify: `mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx` (`BSProAdjustProgram.apply`)

- [ ] **Step 1: Write the failing test**

```js
test('a regenerated week is evaluated as a FRESH proposal, never a delta', () => {
  // §9.4: the guardrail's question is always "is this week too big for this
  // client", regardless of how the week came to be. An already-oversized week
  // reissued through Adjust is examined, not waved through.
  const body = buildAdjustPublishBody({ mode: 'progress', rows: FIXTURE_ROWS });
  assert.equal('previousWeek' in body, false);
  assert.equal('delta' in body, false);
  assert.equal(body.adjustMode, 'progress');
});

test('the planned pair passes through UNCHANGED under all three modes', () => {
  // §3.2b + the capture design §5.2: Adjust carries the authored pair through.
  // There is NO bound and NO ceiling — the five bound fixtures were deleted
  // with the bound.
  for (const mode of ['deload', 'maintain', 'progress']) {
    const out = buildAdjustPublishBody({ mode, rows: [{ payload: { plannedMinutes: 60, plannedRpe: 8, loadCapture: 'per_session' } }] });
    assert.equal(out.sessions[0].plannedMinutes, 60);
    assert.equal(out.sessions[0].plannedRpe, 8);
    assert.equal(out.sessions[0].loadCapture, 'per_session');
  }
});
```

- [ ] **Step 2: Route the regeneration through the week boundary**

`bsAdjustRegen` still plans the transformation (it is pure and tested — do not touch it). What changes is the WRITE: instead of calling `regenerate_client_workouts` directly, group `plan.inserts` by ISO week and post one week-shaped publish per week, each with a derived idempotency key and `adjustMode` set.

Because the boundary REPLACES the coach's own future rows in each target week, `plan.deleteIds` inside a published week become redundant — the replace covers them. Deletes that fall OUTSIDE any published week (a shortened block's trailing weeks) still need `regenerate_client_workouts`, which keeps its narrow role as the delete-only leg. State that in the code comment; do not silently drop the deletes.

- [ ] **Step 3: Handle a red regeneration**

A regenerated week that flags red goes through the SAME acknowledgment path as a hand-authored one — Apply surfaces the guardrail copy and the acknowledgment before it commits. `payload.adjustMode` is provenance ONLY; nothing in the core branches on it. Its one reader is the `guardrail_evaluated` telemetry dimension, which exists so the retune can ask whether regenerated weeks flag differently from authored ones.

- [ ] **Step 4: Gates + commit + hand off** — PR C.

---

## Task 9: Web builders through the boundary

**Files:**
- Modify: `public/newdesign/dashBuilder.jsx` (`assign()` at `:197-223`)
- Modify: `public/newdesign/newWorkout.jsx` (`:151`)
- Modify: `src/lib/ai/actions.mjs` (`assign_workout`, `:199-230`)
- Modify: `src/lib/warroom.ts`

- [ ] **Step 1: Give `dashBuilder` a length + effort input**

⚠ The web builder has NO length concept at all (`dashBuilder.jsx` carries `loadType` for weights, nothing for duration), so it needs an **explicit numeric input** rather than a chip mapping. Add both per session, in the same grammar as the existing `dbuField`.

- [ ] **Step 2: Replace the per-row POST loop with ONE week-shaped call per week**

The current loop at `:203-210` fires one POST per day (16 for a 4×4). Replace it: `DashBuilder.buildAssignmentRows` already produces `{ title, scheduledDate, payload }` rows — group them by ISO week and post one `/api/trainer/week` per week, carrying `clientIds` (the fan-out is server-side) and one authoring-time-derived key per (week, client-set).

- [ ] **Step 3: Advisory flags + acknowledgment on both web builders**

Same contract as mobile: fetch history once per client, run the core against the draft, render `bsGuardrailCopy`, disable publish on red until acknowledged. `progressionGuardrail.mjs` is already in `public/newdesign/`, so it loads as a native ES module (`window.ShapeGuardrail`) — the `liveProgress.mjs` / `shareCard.mjs` precedent. **Do not create a second copy.**

⚠ Do NOT sweep `?v=` across consumers. The deploy precompile content-hashes newdesign jsx, so the sweep is prod-redundant and pushes the PR past CodeRabbit's 50-file auto-skip.

- [ ] **Step 4: Move Nora's `assign_workout`**

`ctx.call('POST', '/api/trainer/workout', …)` → `POST /api/trainer/week` with a one-session week. Nora mints the key in `buildPreview` so the confirm step replays the SAME key — the human-in-the-loop confirm is exactly the retry path the key exists for. Update `tests/ai-actions.test.mjs:208`'s route stub.

- [ ] **Step 5: Gates + commit**

---

## Task 10: Close the session-shaped path

**Files:**
- Create: `supabase-migrations/2026-07-30-close-session-write-path.sql`
- Delete: `src/app/api/trainer/workout/route.ts`
- Modify: `src/lib/warroom.ts`

- [ ] **Step 1: Confirm ZERO remaining callers**

```bash
grep -rn "api/trainer/workout\|ShapeAssign.workout" --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.mjs . | grep -v node_modules | grep -v "/.next/" | grep -v "public/m/" | grep -v "mobile-app/dist"
```

Expected: only `src/lib/warroom.ts` (about to be edited) and doc references. If anything else appears, that caller has not moved — go back and move it. **Do not proceed on a partial sweep.**

- [ ] **Step 2: Write the closing migration**

```sql
-- Deploy 2b — close the session-shaped coach write path.
--
-- §9.4: "No session-shaped coach write path stays live alongside it. Two
-- contracts makes the gate optional in practice."
--
-- publish_client_week is SECURITY DEFINER and therefore unaffected. The MEMBER
-- self-CRUD policy (trainer_id IS NULL AND client_id = auth.uid()) is untouched:
-- a member authoring their own week is not a coach, and §9.3 makes the guardrail
-- coach-facing.
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'client_workouts' and cmd = 'INSERT'
      and policyname not ilike '%self%'
  loop
    execute format('drop policy if exists %I on public.client_workouts', r.policyname);
    raise notice 'dropped coach INSERT policy: %', r.policyname;
  end loop;
end $$;
```

⚠ **Validate this read-only against production first** — list the actual INSERT policies on `client_workouts` and confirm the `not ilike '%self%'` filter selects exactly the coach ones and no others. A name-pattern filter that guesses wrong here removes the member's own write path.

```sql
select policyname, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename='client_workouts';
```

If the names do not separate cleanly, drop them by explicit name instead of a pattern.

- [ ] **Step 3: Delete the route + deregister it**

```bash
git rm src/app/api/trainer/workout/route.ts
```

Remove `['/api/trainer/workout', 'POST'],` from `RAW_ROUTES`.

- [ ] **Step 4: Add the fixture that this makes true**

```js
test('a direct client-side insert attempt is REJECTED', () => {
  // §9.4's last fixture. It is not testable from Node — it is an RLS assertion
  // needing a real authenticated coach session. Recorded as a POST-MIGRATION
  // OWNER verification rather than asserted here, so it is never mistaken for
  // covered. A static stub cannot exercise RLS.
  assert.ok(true);
});
```

Register the live probe as an OWNER War Room item: with the migration applied, an authenticated coach session attempting `supabase.from('client_workouts').insert({trainer_id, client_id, …})` must return an RLS denial, while the same coach's `/api/trainer/week` publish succeeds.

- [ ] **Step 5: Gates + commit + hand off** — PR D.

---

## Task 11: Records

**Files:**
- Modify: `SPEC-guardrails.md`, `SPEC-guardrails-2a-fixtures.md`, `docs/WORKLOG.md`, `src/lib/warroom.ts`, `docs/OFFLINE-ASSIGN-QUEUE-PARKED.md`

- [ ] **Step 1: Status flips only — minimal diff**

⚠ A records update is a STATUS FLIP, not a rewrite. Do not restructure the surrounding entry, do not invent new handoff docs, do not re-explain what the section already says.

- §11's file table: mark the 2b rows shipped; add `src/app/api/trainer/week/route.ts`, `src/lib/week-publish.mjs`, `src/lib/guardrail-gate.mjs`, and the two migrations.
- §9.4: mark the coverage table's "After 2b" column done per path, per PR.
- §13: record the three deviations from the top of this plan (per-client atomicity, deleting `/api/trainer/workout`, week-replace semantics) with the reasoning, so a later reader does not "restore" them.
- `docs/OFFLINE-ASSIGN-QUEUE-PARKED.md`: mark the branch unblocked and note which of its three open findings the key actually resolved (1 and 2) and which still needs the rebuild (3, silent cap eviction — fixed in Task 6 Step 3; say so).
- WORKLOG: one dated entry.

- [ ] **Step 2: Verify wave-level claims PER PR**

⚠ The Cook Mode wave shipped a migration that three separate places claimed did not exist. Before writing "the wave carries N migrations", list them from `git log --stat` per PR rather than from memory.

- [ ] **Step 3: Commit**

```bash
git add SPEC-guardrails.md SPEC-guardrails-2a-fixtures.md docs/WORKLOG.md src/lib/warroom.ts docs/OFFLINE-ASSIGN-QUEUE-PARKED.md
git commit -m "guardrails 2b: records"
```

---

## The §9.4 fixture ledger — where each one is discharged

| Fixture | Where |
|---|---|
| a full week is accepted atomically | `publish_client_week` (Task 1) + `tests/week-publish.test.mjs` |
| a red week in ADVISORY mode is written, flag recorded, NOT rejected | `tests/guardrail-gate.test.mjs` |
| a red week with the switch OFF is rejected without an ack, accepted with one | `tests/guardrail-gate.test.mjs` |
| a partial submission is rejected as malformed, never scored | `tests/week-publish.test.mjs` |
| ONE evaluation and ONE telemetry row per publish, regardless of session count | route structure (Task 4) — the loop is per CLIENT, not per session |
| a mobile week-shaped publish is gated identically to web | both post the same route; asserted by Task 7's matrix |
| regeneration producing a red week uses the same ack path, evaluated as a FRESH week | Task 8 |
| a direct client-side insert attempt is rejected | Task 10 — **OWNER live probe, not a Node test** |
| key (1) minted at authoring time | `normalizeWeekRequest` rejects a missing key; the mobile/web builders mint at open |
| key (2) same week → same outcome, not a second set of rows | `publish_client_week` replay branch |
| key (3) `accepted` vs `already_delivered` | route response + `tests/assign-queue.test.mjs` |
| key (4) replayed under a different account is REJECTED | `publish_client_week` coach-scope check, before the ledger read |

---

## Self-review

**Spec coverage.** §9.1 builder advisory → Tasks 6 (mobile) and 9 (web). §9.2 authoritative evaluation → Task 4. §9.4 boundary + coverage + idempotency + advisory default → Tasks 1, 4, 6, 8, 9, 10. §7.4 kill switch incl. fails-enforced → Task 3. §8 copy → single source, consumed by three surfaces, never re-worded. §10.1 audit → Task 4 (`guardrail_red_ack`, override only). §10.2 telemetry incl. the two-place whitelist and `adjustMode` → Tasks 1, 3, 4. §3.2a capture + the declaration table → Tasks 5, 6. §11 file table → Task 11.

**No placeholders.** Every code step carries real code. Two steps deliberately carry a procedure rather than an assertion — the perturbation check (Task 5 Step 6) and the RLS denial probe (Task 10 Step 4) — because both are things a Node test structurally cannot do, and saying so is more honest than a green test that proves nothing.

**Type consistency.** `bsGateDecision` returns `{publish, status, displayState, trueState, redSuppressed, requiresAck, writeAck, overridden, reason, redPath, flagReadFailed, enforcing}` and every consumer reads only those names. `normalizeWeekRequest` returns `{ok, clientIds, week}` / `{ok:false, error, detail}` and the route branches on exactly that. `publish_client_week` returns `{status, outcome, inserted, replaced}` and the route reads exactly those.

**The one thing worth checking before writing the route — checked, and it holds.** `bsGuardrailCopy` has to render a red result as amber under the kill switch, and Task 4 does that by passing `{...result, state: decision.displayState}`. The risk was a `redPath` branch independent of `state`, which would print red wording under an amber chip. It isn't: `progressionGuardrail.mjs:2452` reads `result.state === 'red' && result.redPath === 'compound'`, so `redPath` is only ever consulted inside a red branch. Overriding `state` alone is sufficient — the chip reads `AMBER` (`:2487`) and the line takes the amber clause (`:2473`). No `redPath` override is needed and **the core does not get edited to accommodate a consumer.**

**Where this plan is thinnest.** The advisory-builder UI (Task 6 Step 7, Task 9 Step 3) is specified by contract — fetch once, run the core, render `bsGuardrailCopy`, block red until acknowledged — but not by markup, because it lands on three surfaces with three different design languages and inventing their JSX here would be guessing. That is the one place an implementer has real latitude, and the one place to expect a design round.

-- Progression guardrails — close the last unevaluated coach write.
--
-- SPEC-guardrails.md §9.4: every coach training write passes ONE evaluated door.
-- Until now that was true of the code and false of the database. A signed-in
-- trainer could `insert` into `client_workouts` directly under
-- `trainer_insert_on_client_workouts` and skip the guardrail entirely — which is
-- exactly what the website's "Publish & Send to Client" did, in production.
--
-- That flow now goes through `/api/trainer/workout` (read the week, merge, judge,
-- publish), so nothing left in the product needs a coach INSERT under RLS.
-- Dropping the policy makes the doctrine structural rather than conventional:
-- a future surface CANNOT reintroduce the hole by writing the table directly —
-- it has to go through the boundary, because the database refuses anything else.
--
-- ⚠ RUN THIS *AFTER* THE DEPLOY THAT SHIPS THE NEW PUBLISH PATH, and after
-- 2026-07-30-week-publish-precondition.sql. Applied against the old code it
-- breaks the website's publish button (it would still be inserting directly).
--
-- WHAT IS DELIBERATELY UNTOUCHED:
--   * `client_insert_self_workouts` — a member authoring their OWN training
--     (trainer_id is null, client_id = auth.uid()). Self-serve training is not a
--     coach write and is not what §9.4 governs. It must keep working.
--   * `publish_client_week` / `regenerate_client_workouts` — SECURITY DEFINER,
--     so they bypass RLS and are unaffected. They are the door.
--   * The trainer SELECT / UPDATE / DELETE policies. ⚠ UPDATE still lets a coach
--     move an existing session's date without re-evaluation, so this closes the
--     unevaluated CREATE, not every unevaluated mutation. Narrowing UPDATE would
--     break Nora's undo (`src/lib/ai/actions.mjs` archives a row through it) and
--     needs its own ruling — registered, not silently folded in here.

begin;

drop policy if exists "trainer_insert_on_client_workouts" on public.client_workouts;

-- Fail the migration rather than leave a half-open gate: the coach INSERT policy
-- must be gone AND the member's self-authoring policy must survive. Asserting
-- only the first would let a copy-paste that dropped both look like success.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_workouts'
      and policyname = 'trainer_insert_on_client_workouts'
  ) then
    raise exception 'trainer_insert_on_client_workouts survived — the unevaluated coach write is still open';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_workouts'
      and policyname = 'client_insert_self_workouts'
  ) then
    raise exception 'client_insert_self_workouts is missing — self-serve training would be broken';
  end if;

  -- Any OTHER surviving INSERT policy is an unreviewed door. Name it loudly
  -- rather than assume this file knows every policy on the table.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'client_workouts'
      and cmd = 'INSERT' and policyname <> 'client_insert_self_workouts'
  ) then
    raise exception 'an unexpected INSERT policy remains on client_workouts: %',
      (select string_agg(policyname, ', ') from pg_policies
        where schemaname = 'public' and tablename = 'client_workouts'
          and cmd = 'INSERT' and policyname <> 'client_insert_self_workouts');
  end if;
end $$;

commit;

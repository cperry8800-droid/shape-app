-- A nutrition day can now carry a coach's review note.
--
-- THE DEFECT THIS CLOSES. `coach_workout_review_notes.session_id` is NOT NULL
-- with an FK to `workout_sessions.id`, and every policy on the table routes
-- through `can_access_workout_session(session_id)`. So the note path is
-- structurally a WORKOUT path: there is no row shape that says "this note is
-- about the client's Tuesday". The 2026-08-31 source fix (the nutritionist's
-- review queue reading meal-log days instead of the trainer's workout sessions)
-- had to hide the composer and refuse the write outright, because the insert
-- would fail 23502 and the existing catch would report **"saved locally"** for a
-- write that saved nowhere. This file gives the day a real row shape; the
-- honest-absent line stands until a follow-up cut wires the composer.
--
-- WHY A NULLABLE session_id RATHER THAN A SECOND TABLE. A review note is one
-- object with one lifecycle — reviewer, provider identity, visibility
-- (client | coach_private | team), body, edit + delete. A parallel table
-- duplicates all of it and then has to be UNIONed by every reader. So the note
-- keeps its identity and gains a second SUBJECT: either a workout session, or a
-- client's calendar day. Exactly one, enforced by a CHECK — never both, never
-- neither, so no row can be ambiguous about what it is a note on.
--
-- ⚠ THE DAY IS KEYED BY (client_id, snapshot_date), NOT BY THE SNAPSHOT ROW'S
-- id. `daily_health_snapshot` is UPSERTED on (user_id, snapshot_date) by the
-- member's own logging, so its surrogate `id` is a row identity, not a day
-- identity — any writer that ever replaces rather than updates would silently
-- cascade a coach's note away. The natural key is the day itself, which is what
-- the note is actually about, and it survives any rewrite of the underlying
-- snapshot. It also means the note does not depend on a snapshot row existing
-- at write time, which is correct: the coach is annotating a date.
--
-- THE ACCESS STORY, WHICH IS THE HALF THAT CANNOT BE COPIED FROM THE SESSION
-- PATH. `can_access_workout_session` gates on the SESSION's own provider — a
-- session names the coach who owns it. A day names nobody, so the day branch
-- gates on the coaching RELATIONSHIP instead:
--   read   — the member themself, or any active coach on them
--            (`is_coach_on_client`, the same predicate the coach-side reads of
--            `daily_health_snapshot` already run on).
--   write  — the reviewer must own the provider row the note declares AND that
--            declaration must be a real, active coaching link of the SAME
--            discipline (`is_discipline_coach_on_client`). A nutritionist may
--            write as a nutritionist; a trainer as a trainer; neither may write
--            under the other's role, and a coach with no live subscription to
--            that client writes nothing at all.
-- The session branch is preserved BYTE-FOR-BYTE — this file must not widen who
-- can read or write a workout note.
--
-- Measured read-only against prod before writing this (2026-08-31):
--   coach_workout_review_notes  0 rows  → the CHECK validates against nothing,
--                                          and no existing note needs a backfill
--   workout_sessions            0 rows
--   daily_health_snapshot       1 row
--   realtime publication        not published → no publication change owed
-- Idempotent — safe to re-run.
--
-- VALIDATED AS AN ARTIFACT, NOT AS PIECES (the #1853 lesson — a migration that
-- could not compile once reached review because only its parts had been
-- checked). The whole file was applied inside a transaction against production
-- and ROLLED BACK, its own structural guard passing, with prod confirmed
-- untouched afterwards (day columns 0, session_id still NOT NULL, XOR check
-- absent). A behavioural probe in the same transaction drove the CHECK over
-- five shapes: a subject-less note, a two-subject note and a dateless day note
-- are all REJECTED (23514); a day note and a session note both insert. And the
-- guard's `search_path=public, pg_temp` literal was read off two live pinned
-- functions rather than assumed — a wrong literal there fails a CORRECT apply.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The day subject.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.coach_workout_review_notes
  alter column session_id drop not null;

alter table public.coach_workout_review_notes
  add column if not exists client_id uuid references auth.users(id) on delete cascade;

alter table public.coach_workout_review_notes
  add column if not exists snapshot_date date;

-- Exactly one subject. Dropped and re-added rather than guarded so a re-run
-- always leaves the CURRENT definition in place (0 rows, so validation is free).
alter table public.coach_workout_review_notes
  drop constraint if exists coach_workout_review_notes_subject_check;
alter table public.coach_workout_review_notes
  add constraint coach_workout_review_notes_subject_check check (
    (session_id is not null and client_id is null and snapshot_date is null)
    or
    (session_id is null and client_id is not null and snapshot_date is not null)
  );

-- The day queue reads a client's notes for a date range, newest first.
create index if not exists coach_workout_review_notes_day_idx
  on public.coach_workout_review_notes (client_id, snapshot_date, created_at)
  where client_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. One predicate for "may this caller see this note's subject".
--
-- A policy cannot branch on a nullable FK without re-stating both halves at
-- every site, and three policies re-stating a security predicate is how the
-- halves drift apart. `can_access_review_note` is the single answer; the
-- CHECK above guarantees exactly one branch is ever live, and the `else false`
-- fails closed if that guarantee were ever removed.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_access_review_note(p_session_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_session_id is not null then public.can_access_workout_session(p_session_id)
    when p_client_id  is not null then (p_client_id = auth.uid() or public.is_coach_on_client(p_client_id))
    else false
  end;
$function$;

-- Supabase default-grants EXECUTE on public functions to anon AND authenticated,
-- and `revoke from public` does NOT remove those explicit grants — the bug class
-- 2026-06-30-rpc-authz-hardening.sql exists for. Revoke by name, then grant the
-- roles that actually evaluate policies.
revoke execute on function public.can_access_review_note(uuid, uuid) from public, anon;
grant  execute on function public.can_access_review_note(uuid, uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Policies.
--
-- SELECT + INSERT are replaced (they were the two that named session_id).
-- UPDATE and DELETE are LEFT ALONE on purpose: both are `reviewer_id =
-- auth.uid()` with no subject dependency, so a day note inherits edit + delete
-- with no change — and touching them here would be a widening nobody asked for.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "participants read coach workout review notes" on public.coach_workout_review_notes;
create policy "participants read coach workout review notes"
  on public.coach_workout_review_notes
  for select to authenticated
  using (
    public.can_access_review_note(session_id, client_id)
    and (visibility <> 'coach_private' or reviewer_id = auth.uid())
  );

drop policy if exists "providers create workout review notes" on public.coach_workout_review_notes;
create policy "providers create workout review notes"
  on public.coach_workout_review_notes
  for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and (
      -- Workout session note — the original predicate, unchanged.
      (session_id is not null and public.can_access_workout_session(session_id))
      -- Day note — a live coaching link of the discipline the note declares.
      or (client_id is not null and public.is_discipline_coach_on_client(client_id, provider_role))
    )
    -- The reviewer must own the provider row they are writing as. Unchanged.
    and (
      (provider_role = 'trainer' and exists (
        select 1 from public.trainers t
        where t.id = coach_workout_review_notes.provider_id and t.owner_id = auth.uid()
      ))
      or
      (provider_role = 'nutritionist' and exists (
        select 1 from public.nutritionists n
        where n.id = coach_workout_review_notes.provider_id and n.owner_id = auth.uid()
      ))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Structural guard — every half must have landed, or this file failed.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v int;
  v_txt text;
begin
  -- The relaxation itself.
  select count(*) into v from information_schema.columns
   where table_schema='public' and table_name='coach_workout_review_notes'
     and column_name='session_id' and is_nullable='YES';
  if v <> 1 then raise exception 'session_id is still NOT NULL'; end if;

  select count(*) into v from information_schema.columns
   where table_schema='public' and table_name='coach_workout_review_notes'
     and column_name in ('client_id','snapshot_date');
  if v <> 2 then raise exception 'day columns missing (found %)', v; end if;

  select count(*) into v from pg_constraint
   where conrelid='public.coach_workout_review_notes'::regclass
     and conname='coach_workout_review_notes_subject_check';
  if v <> 1 then raise exception 'subject XOR check missing'; end if;

  select count(*) into v from pg_indexes
   where schemaname='public' and indexname='coach_workout_review_notes_day_idx';
  if v <> 1 then raise exception 'day index missing'; end if;

  -- The predicate, and that it is a pinned SECURITY DEFINER (a SECURITY INVOKER
  -- copy would silently return false for the coach branch, hiding every note).
  select count(*) into v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='can_access_review_note'
     and p.prosecdef and 'search_path=public, pg_temp' = any(coalesce(p.proconfig, array[]::text[]));
  if v <> 1 then raise exception 'can_access_review_note missing or not a pinned SECURITY DEFINER'; end if;

  -- The policies actually route through it / through the discipline gate.
  select qual into v_txt from pg_policies
   where schemaname='public' and tablename='coach_workout_review_notes'
     and policyname='participants read coach workout review notes';
  if v_txt is null or strpos(v_txt, 'can_access_review_note') = 0 then
    raise exception 'read policy does not route through can_access_review_note';
  end if;

  select with_check into v_txt from pg_policies
   where schemaname='public' and tablename='coach_workout_review_notes'
     and policyname='providers create workout review notes';
  if v_txt is null then raise exception 'insert policy missing'; end if;
  if strpos(v_txt, 'is_discipline_coach_on_client') = 0 then
    raise exception 'insert policy does not gate the day branch on a discipline coaching link';
  end if;
  -- The session branch must survive verbatim — this file may not widen it.
  if strpos(v_txt, 'can_access_workout_session') = 0 then
    raise exception 'insert policy lost the workout-session gate';
  end if;

  -- UPDATE/DELETE must still exist and still be reviewer-scoped.
  select count(*) into v from pg_policies
   where schemaname='public' and tablename='coach_workout_review_notes'
     and cmd in ('UPDATE','DELETE');
  if v <> 2 then raise exception 'reviewer update/delete policies missing (found %)', v; end if;
end $$;

-- Verify after apply:
--   -- a day note is writable by the client's own nutritionist, and by nobody else:
--   select public.can_access_review_note(null, '<client uuid>');   -- true for that client + their coaches
--   -- and the two subjects cannot be mixed:
--   insert into public.coach_workout_review_notes (session_id, client_id, snapshot_date, reviewer_id, body)
--   values (null, null, null, auth.uid(), 'x');                    -- expect 23514 (subject check)

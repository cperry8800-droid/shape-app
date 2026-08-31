-- A coach review note's SUBJECT becomes immutable. Codex P1 on PR #1988,
-- verified against the live policy before writing this.
--
-- ⚠ THE HOLE, AND IT IS ONE 2026-08-31-nutrition-day-review-notes.sql WIDENED.
-- The UPDATE policy shipped 2026-05-02 is, in full:
--
--     using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid())
--
-- — it tests the AUTHOR and nothing else. That was survivable while the only
-- subject was `session_id`: NOT NULL with an FK to workout_sessions, so a
-- retarget needed a real session uuid, which is not guessable. The day path
-- replaced that with `client_id` — a uuid pointing straight at auth.users, and
-- a member's uuid is ORDINARY knowledge (community_posts.author_id carries it,
-- get_public_profile takes it, a coach's own roster is full of them).
--
-- So after that migration any coach holding one legitimate note of their own
-- could PATCH it through PostgREST — reviewer_id unchanged, XOR satisfied — and
-- land arbitrary text on ANY member's arbitrary day, where the read policy then
-- serves it to that member and every coach on them as a review note from a real
-- provider. Not a leak (they still read nothing of that member's), but an
-- injection: a note attributed to a coach, on a client who never hired them.
--
-- ⚠ AND MY OWN COMMENT IN THAT FILE ARGUED FOR LEAVING THIS ALONE — "UPDATE /
-- DELETE are deliberately untouched (already reviewer_id = auth.uid() with no
-- subject dependency)". The clause is accurate and the conclusion is backwards:
-- "no subject dependency" is exactly the defect once the subject columns became
-- reachable. A because-clause is a claim, and this one was wrong.
--
-- ⚠ THE FIX IS A FREEZE, NOT A RE-STATED POLICY. Codex offered both. Freezing
-- is the narrower one: re-checking subject access in the UPDATE policy would
-- put the same security rule at a THIRD site (INSERT policy, the
-- can_access_review_note predicate, and now UPDATE) to be kept in step — the
-- drift this table's own migration set already warns about. And it matches what
-- is actually true of a note: editing the WORDS is the legitimate operation;
-- repointing one at a different person never is. Same idiom as
-- 2026-08-16-created-at-freeze-and-application-dob.sql.
--
-- Measured before writing: the only writer of this table anywhere in the tree
-- (shapeBackend.js addCoachWorkoutReviewNote) INSERTs and never updates, so the
-- freeze breaks no shipped path. Idempotent.

create or replace function public.freeze_review_note_subject()
returns trigger
language plpgsql
-- SECURITY INVOKER (default) -- LOAD-BEARING, DO NOT ADD `security definer`.
-- The first cut of this file did, and it made the whole trigger a no-op:
-- under SECURITY DEFINER PostgreSQL sets current_user to the function OWNER,
-- so `current_user in (...,'postgres')` below is true for EVERY caller, the
-- early return fires unconditionally, and a coach can still retarget a note.
-- Measured on this database rather than argued: one temp function each way,
-- called after `set local role authenticated` -> definer sees `postgres`,
-- invoker sees `authenticated`. The function needs no elevated privilege
-- anyway: it only inspects OLD/NEW and reads a session-scoped GUC, neither of
-- which the security context affects. This is exactly the note
-- 2026-08-16-created-at-freeze-and-application-dob.sql already carries on
-- set_over_18(); the idiom was copied from there and its security context was
-- not -- a copied guard whose rationale was left behind.
set search_path = public, pg_temp
as $$
declare
  jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  -- PostgREST SET ROLEs to the JWT role; the service key -> 'service_role'.
  -- An ops repair from the SQL editor or a migration must stay possible.
  is_privileged boolean := current_user in ('service_role','supabase_admin','postgres')
                           or jwt_role = 'service_role';
begin
  if is_privileged then
    return new;
  end if;
  -- Distinct-from, not `<>`: session_id and client_id are each NULL on the
  -- other's rows, and NULL <> NULL is NULL, which an IF reads as false.
  if new.session_id is distinct from old.session_id
     or new.client_id is distinct from old.client_id
     or new.snapshot_date is distinct from old.snapshot_date
     or new.reviewer_id is distinct from old.reviewer_id then
    raise exception 'A review note''s subject is immutable — write a new note.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists freeze_review_note_subject on public.coach_workout_review_notes;
create trigger freeze_review_note_subject
  before update on public.coach_workout_review_notes
  for each row execute function public.freeze_review_note_subject();

-- ─────────────────────────────────────────────────────────────────────────────
-- Structural guard — the freeze is only done if the trigger actually landed.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v int;
begin
  select count(*) into v
    from pg_trigger
   where tgrelid = 'public.coach_workout_review_notes'::regclass
     and tgname = 'freeze_review_note_subject'
     and not tgisinternal;
  if v <> 1 then
    raise exception 'freeze_review_note_subject trigger is not installed (found %)', v;
  end if;

  -- ⚠ The security context is the whole guard. Under SECURITY DEFINER,
  -- current_user is the function OWNER, so the is_privileged early return
  -- fires for every caller and this trigger silently becomes a no-op --
  -- installed, green, and enforcing nothing. That is exactly what the first
  -- cut of this file shipped. Fail the apply rather than let it back in.
  select count(*) into v
    from pg_proc
   where oid = 'public.freeze_review_note_subject()'::regprocedure
     and prosecdef;
  if v <> 0 then
    raise exception 'freeze_review_note_subject is SECURITY DEFINER — the freeze would be a no-op';
  end if;

  -- The four columns the trigger names must all still exist; a rename would
  -- make the freeze silently stop covering one of them.
  select count(*) into v
    from information_schema.columns
   where table_schema = 'public' and table_name = 'coach_workout_review_notes'
     and column_name in ('session_id','client_id','snapshot_date','reviewer_id');
  if v <> 4 then
    raise exception 'expected 4 subject/author columns, found %', v;
  end if;
end $$;

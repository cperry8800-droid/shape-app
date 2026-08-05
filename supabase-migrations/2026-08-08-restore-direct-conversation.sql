-- Restore public.get_or_create_direct_conversation, and close its create race.
--
-- WHY THIS EXISTS
-- `2026-05-02-conversations-messages.sql` declares this function, but it is
-- ABSENT FROM PRODUCTION. Found by the 2026-08-08 schema-drift audit, which
-- diffed all 174 live functions and all 218 live policies against
-- supabase-migrations/. It is one of eight functions the repo declares that the
-- database does not have; it is the only one of those eight that live product
-- code calls.
--
-- ⚠ TWO LIVE CALLERS, AND THE WORSE ONE FAILS SILENTLY.
--   1. src/app/api/nutrition/meal-note/route.ts:126 — the mobile meal logger's
--      "dispatch to coach". It uploads the voice memo and photo to storage
--      SUCCESSFULLY, then loops the member's coaches, calls this function, and
--      hits `if (convErr || !conversationId) continue;`. The route returns HTTP
--      200 with delivered:false, and the client only toasts on success — so the
--      member gets no error, no warning, and no note reaches any coach.
--   2. src/app/api/messages/direct/route.ts:84 — the "message this provider"
--      button on the live /trainers/[id] and /nutritionists/[id] pages. This one
--      at least fails loudly (400).
--
-- ⚠ NOBODY HAS BEEN AFFECTED. Verified against production before writing this:
-- `messages` and `conversations` are both EMPTY (0 rows), so no member has ever
-- sent a meal note or a direct message. This is a defect that would fire on the
-- first real use, not damage already done. There is nothing to backfill.
--
-- The body below is the 2026-05-02 original, verbatim, with three deliberate
-- changes noted at their sites: pg_temp pinned, the create race closed, and the
-- grant tightened. Every column and CHECK constraint it writes was verified
-- against the LIVE schema first (kind/provider_role CHECKs both admit the values
-- it uses; conversation_participants' primary key is exactly the (conversation_id,
-- user_id) pair its ON CONFLICT infers).

-- ===== The race guard =====
-- ⚠ THE ORIGINAL WAS SELECT-THEN-INSERT WITH NOTHING SERIALIZING IT, so two
-- overlapping calls for the SAME (provider_role, provider_id, client_id) triple
-- could both miss the SELECT and create two direct conversations for one pair —
-- splitting a coach's thread in half with nothing erroring. This index makes that
-- unrepresentable rather than merely unlikely.
--
-- ⚠ THE COACH FAN-OUT IS **NOT** THAT RACE, and an earlier draft of this comment
-- claimed it was. Recorded rather than quietly deleted, because asserting a
-- mechanism that turns out to be false is this repo's most-repeated defect class.
-- Two reasons it cannot be: meal-note's loop is a sequential `for … await`, so the
-- trainer and nutritionist legs never run at the same time; and even concurrent
-- they carry different provider_role AND provider_id, so they occupy different
-- index entries and could not collide. The real window is two overlapping
-- REQUESTS on ONE pair — a double-tapped Log, a client retry, or meal-note racing
-- /api/messages/direct for the same coach.
--
-- Safe to add: production holds ZERO conversations, so it cannot fail on legacy
-- rows. Partial, because `kind` also admits 'room' and 'community', and the
-- member-to-member DMs added in 2026-06-03 dedupe on `dm_key` instead and leave
-- provider_id/client_id null.
create unique index if not exists conversations_direct_pair_uniq
  on public.conversations (provider_role, provider_id, client_id)
  where kind = 'direct' and provider_id is not null and client_id is not null;

create or replace function public.get_or_create_direct_conversation(
  p_provider_role text,
  p_provider_id bigint
)
returns uuid
language plpgsql
security definer
-- ⚠ pg_temp is pinned, which the 2026-05-02 original did not do. An omitted
-- pg_temp is not merely absent from the search path — it is searched FIRST,
-- ahead of pg_catalog (CWE-426).
set search_path = public, pg_temp
as $$
declare
  v_client_id uuid := auth.uid();
  v_owner_id uuid;
  v_conversation_id uuid;
  v_provider_name text;
begin
  if v_client_id is null then
    raise exception 'Authentication is required.';
  end if;

  if p_provider_role not in ('trainer','nutritionist') then
    raise exception 'Invalid provider role.';
  end if;

  if p_provider_role = 'trainer' then
    select owner_id, name into v_owner_id, v_provider_name
    from public.trainers
    where id = p_provider_id;
  else
    select owner_id, name into v_owner_id, v_provider_name
    from public.nutritionists
    where id = p_provider_id;
  end if;

  if v_provider_name is null then
    raise exception 'Provider was not found.';
  end if;

  select id into v_conversation_id
  from public.conversations
  where kind = 'direct'
    and provider_role = p_provider_role
    and provider_id = p_provider_id
    and client_id = v_client_id
  limit 1;

  if v_conversation_id is null then
    -- ⚠ The insert can now lose a race to a concurrent caller rather than
    -- silently duplicating. Re-select on the violation so the loser returns the
    -- winner's conversation instead of surfacing a 23505 to a member who did
    -- nothing wrong. Without this the new index would trade a duplicate thread
    -- for an error, which is not an improvement.
    begin
      insert into public.conversations (kind, title, provider_role, provider_id, client_id)
      values ('direct', v_provider_name, p_provider_role, p_provider_id, v_client_id)
      returning id into v_conversation_id;
    exception when unique_violation then
      select id into v_conversation_id
      from public.conversations
      where kind = 'direct'
        and provider_role = p_provider_role
        and provider_id = p_provider_id
        and client_id = v_client_id
      limit 1;
    end;
  end if;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values (v_conversation_id, v_client_id, 'client')
  on conflict (conversation_id, user_id) do nothing;

  if v_owner_id is not null then
    insert into public.conversation_participants (conversation_id, user_id, role)
    values (v_conversation_id, v_owner_id, p_provider_role)
    on conflict (conversation_id, user_id) do nothing;
  end if;

  return v_conversation_id;
end;
$$;

-- ===== Grants =====
-- ⚠ REVOKE FIRST. Supabase default-grants EXECUTE on a new public function to
-- anon AND authenticated, and `revoke ... from public` does NOT remove those
-- explicit role grants. This function binds auth.uid() itself and raises for an
-- anonymous caller, so an anon grant is dead weight rather than a hole — but the
-- 2026-07-30 access-control audit found six live holes from exactly this default,
-- so the pattern is: revoke everything, then grant only what is needed.
revoke all on function public.get_or_create_direct_conversation(text, bigint) from public;
revoke all on function public.get_or_create_direct_conversation(text, bigint) from anon;
revoke all on function public.get_or_create_direct_conversation(text, bigint) from authenticated;
grant execute on function public.get_or_create_direct_conversation(text, bigint) to authenticated;

-- ===== Guard =====
-- Asserts the end state rather than trusting the statements above. Compile-tested
-- as a whole: every RAISE below takes exactly the arguments its format string
-- names (a bare % in a never-executed branch aborts the entire migration at
-- compile time, which is how 2026-07-30's search-term migration shipped dead).
do $guard$
declare
  v_secdef boolean;
  v_path text;
  v_src text;
  v_anon boolean;
  v_auth boolean;
begin
  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''), p.prosrc
    into v_secdef, v_path, v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_or_create_direct_conversation'
    and pg_get_function_identity_arguments(p.oid) = 'p_provider_role text, p_provider_id bigint';

  if v_secdef is null then
    raise exception 'get_or_create_direct_conversation(text, bigint) is missing after this migration';
  end if;
  if not v_secdef then
    raise exception 'get_or_create_direct_conversation must be SECURITY DEFINER';
  end if;
  if position('pg_temp' in v_path) = 0 then
    raise exception 'get_or_create_direct_conversation must pin pg_temp; search_path is %', v_path;
  end if;

  -- ⚠ ASSERT THE SHAPE, NOT JUST THE METADATA. Every other check here passes on a
  -- function whose unique_violation handler has been stripped back to the bare
  -- 2026-05-02 insert — still SECURITY DEFINER, still pg_temp-pinned, same grants,
  -- and the index is a separate object so it survives untouched. That end state is
  -- strictly WORSE than before this migration: the index would turn a lost race
  -- into a raw 23505 for a member who did nothing wrong, which the comment on the
  -- handler explicitly says is not an improvement. A guard that cannot fail on the
  -- one shape the migration exists to create is decoration.
  if position('unique_violation' in v_src) = 0 then
    raise exception 'get_or_create_direct_conversation must handle unique_violation, or the new unique index turns a lost race into an error';
  end if;

  select has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    into v_anon, v_auth
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_or_create_direct_conversation'
    and pg_get_function_identity_arguments(p.oid) = 'p_provider_role text, p_provider_id bigint';

  if v_anon then
    raise exception 'anon must not hold EXECUTE on get_or_create_direct_conversation';
  end if;
  if not v_auth then
    raise exception 'authenticated must hold EXECUTE on get_or_create_direct_conversation';
  end if;

  if to_regclass('public.conversations_direct_pair_uniq') is null then
    raise exception 'conversations_direct_pair_uniq index is missing after this migration';
  end if;
end
$guard$;

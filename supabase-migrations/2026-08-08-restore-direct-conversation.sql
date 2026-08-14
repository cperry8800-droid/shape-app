-- Restore public.get_or_create_direct_conversation and handle its lost-race error.
--
-- WHY THIS EXISTS
-- `2026-05-02-conversations-messages.sql` declares this function, but it is
-- ABSENT FROM PRODUCTION. Found by the 2026-08-05 schema-drift audit, which
-- diffed all 174 live functions and all 218 live policies against
-- supabase-migrations/. It is one of eight functions the repo declares that the
-- database does not have; it is the only one of those eight that live product
-- code calls.
--
-- ⚠ THREE LIVE CALLERS, AND THE WORST ONE FAILS SILENTLY.
-- (This header said "TWO" until 2026-08-14; the third was found by Codex on the
-- changelog PR. Corrected in place rather than quietly, because an inventory that
-- undercounts is worse than no inventory — see the grant warning at the foot of
-- this list.)
--   1. src/app/api/nutrition/meal-note/route.ts:135 — the mobile meal logger's
--      "dispatch to coach". It uploads the voice memo and photo to storage
--      SUCCESSFULLY, then loops the member's coaches, calls this function, and
--      hits `if (convErr || !conversationId) continue;`. The route returns HTTP
--      200 with delivered:false, and the client only toasts on success — so the
--      member gets no error, no warning, and no note reaches any coach.
--   2. src/app/api/messages/direct/route.ts:84 — the "message this provider"
--      button on the live /trainers/[id] and /nutritionists/[id] pages. This one
--      at least fails loudly (400).
--   3. mobile-app/src/services/shapeBackend.js:1990 — `supabase.rpc(...)` called
--      DIRECTLY FROM THE CLIENT as `authenticated`, not through any API route.
--      Reached via `sendProviderMessage` (:2022) from the marketplace listing
--      panel (iosAppBroadsheetMarketplace.jsx:2119) and from the meal- and
--      exercise-swap flows (iosAppBroadsheetClient.jsx:9235, :5212). It degrades
--      semi-loudly: the catch writes the thread locally and shows "Message saved
--      locally" with the error text — copy that already anticipates exactly this
--      migration being unrun.
--
-- ⚠ CALLER 3 IS WHY THE `authenticated` GRANT BELOW IS LOAD-BEARING. Reading the
-- old two-caller list, a future reader would conclude only server routes reach
-- this function and that the grant could be narrowed to service_role. That would
-- silently break the marketplace "message this coach" button — silently because
-- caller 3 swallows the error into a local-save notice. Do not narrow it without
-- re-running this inventory.
--
-- Caller 3 does NOT widen the null-role hole fixed below:
-- `normalizeProviderRoleForMessages` (shapeBackend.js:1879) falls through to
-- `normalizeRole`, which returns 'client' for anything unrecognised and can never
-- return null, and `resolveCoachProvider` (:1886) rejects anything outside
-- trainer/nutritionist before the call. Both send a non-null role, so they get the
-- loud 'Invalid provider role.' — the null path still requires a hand-made
-- PostgREST call.
--
-- ⚠ NOBODY HAS BEEN AFFECTED. Verified against production before writing this:
-- `messages` and `conversations` are both EMPTY (0 rows), so no member has ever
-- sent a meal note or a direct message. This is a defect that would fire on the
-- first real use, not damage already done. There is nothing to backfill.
--
-- The body below is the 2026-05-02 original, verbatim, with four deliberate
-- changes noted at their sites: pg_temp pinned, the lost-race error handled, the
-- NULL-role validation bypass closed, and the grant tightened. ⚠ That third one is
-- a BEHAVIOUR fix, not hardening — the original's role check was bypassable by the
-- one value it existed to reject; see the comment at its site.
-- Every column and CHECK constraint it writes was verified
-- against the LIVE schema first (kind/provider_role CHECKs both admit the values
-- it uses; conversation_participants' primary key is exactly the (conversation_id,
-- user_id) pair its ON CONFLICT infers).

-- ===== The race guard =====
-- ⚠ THIS MIGRATION SHIPPED A DUPLICATE INDEX ON A FALSE PREMISE, and the
-- correction is recorded rather than quietly deleted, because asserting a
-- mechanism that turns out to be false is this repo's most-repeated defect class.
--
-- The original text here claimed "the original was SELECT-THEN-INSERT with
-- nothing serializing it … this index makes that unrepresentable". The first
-- clause is true of the FUNCTION and false of the DATABASE:
-- `2026-05-02-conversations-messages.sql:18` already created
-- **conversations_direct_unique_idx** on exactly (provider_role, provider_id,
-- client_id) where kind = 'direct'. So the duplicate-thread race was closed on
-- 2026-05-02, and the index added here enforced nothing the database was not
-- already enforcing. (Its predicate omitted `provider_role is not null`, which
-- is inert: NULLs are distinct in a unique index, so a NULL provider_role can
-- never conflict either way. Two indexes, one constraint, double the write cost.)
--
-- WHAT WAS GENUINELY MISSING is the `unique_violation` handler below. With the
-- 2026-05-02 index live and no handler, a lost race did not duplicate the
-- thread — it surfaced a raw 23505 to a member who did nothing wrong. The
-- handler is the real fix; the index was noise.
--
-- Dropping it is safe for the same reason it was redundant: every constraint it
-- expressed is still expressed by conversations_direct_unique_idx, and the
-- function's insert uses an exception handler rather than ON CONFLICT, so no
-- inference depends on this index existing by name.
--
-- ⚠ RE-DECLARE THE CANONICAL INDEX FIRST RATHER THAN ASSUMING IT. It is present
-- in production today (checked 2026-08-08), but this migration exists precisely
-- because 2026-05-02 did NOT fully apply — the function it declares was missing
-- from the database. Having proven that file is not a reliable premise, this one
-- should not depend on another of its objects being there. `if not exists` makes
-- it a no-op on the live database and a real create on a fresh rebuild.
--
-- Order is create-then-drop so the pair is never momentarily unconstrained.
create unique index if not exists conversations_direct_unique_idx
  on public.conversations (provider_role, provider_id, client_id)
  where kind = 'direct'
    and provider_role is not null
    and provider_id is not null
    and client_id is not null;

drop index if exists public.conversations_direct_pair_uniq;

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

  -- ⚠ THE `is null` HALF IS LOAD-BEARING — DO NOT "SIMPLIFY" IT BACK TO A BARE
  -- MEMBERSHIP CHECK. `null not in ('trainer','nutritionist')` evaluates to NULL, not
  -- true, and PL/pgSQL's IF treats NULL as false — so the 2026-05-02 original's bare
  -- check was BYPASSED by the one value it most needed to reject. Verified against
  -- production 2026-08-14; a NULL role then does all three of these:
  --   · `p_provider_role = 'trainer'` is also NULL, so execution falls to the ELSE
  --     branch and looks the id up in `nutritionists` regardless of what was meant.
  --   · The existing-conversation lookup below compares `provider_role =
  --     p_provider_role` — NULL = NULL is NULL, so it can never match and every call
  --     inserts a new row.
  --   · `conversations.provider_role` is NULLABLE and its CHECK is
  --     `provider_role = any(array['trainer','nutritionist'])`. A CHECK passes when it
  --     evaluates to TRUE **or NULL**, so the role-less row inserts cleanly — and
  --     conversations_direct_unique_idx's predicate requires `provider_role is not
  --     null`, so the row is not indexed and uniqueness never applies. Repeated calls
  --     accumulate unbounded duplicates. (For a CLAIMED provider it is louder but not
  --     safer: the participants insert below fails the NOT NULL on
  --     `conversation_participants.role` and the whole transaction rolls back. 41 of
  --     the 43 live listings are unclaimed, so the silent-junk path is the common one.)
  -- Reachability: /api/messages/direct rejects an unknown role before calling
  -- (`normalizeProviderRole` returns null → 400), and the meal-note fan-out passes
  -- literals — but this function is granted to `authenticated`, so any signed-in
  -- member can call it directly through PostgREST and skip both.
  --
  -- `p_provider_id` needs no matching guard: `where id = null` matches no rows, so
  -- v_provider_name stays null and 'Provider was not found.' already raises below.
  if p_provider_role is null
     or p_provider_role not in ('trainer','nutritionist') then
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

  -- ⚠ THE NULL-OWNER SKIP IS CORRECT — DO NOT "FIX" IT BY RAISING. 41 of the 43
  -- live provider listings have a NULL owner_id (verified against production
  -- 2026-08-08: trainers 20/21, nutritionists 21/22), so this branch is the
  -- ordinary path, and it looks like it strands the member's message with nobody
  -- on the other end. It does not, because coach access to a conversation is NOT
  -- carried by this participants row:
  --   · RLS reads it through a LIVE JOIN — `can_access_conversation`
  --     (2026-05-02-conversations-messages.sql:77-89) grants access to whoever
  --     satisfies `trainers.owner_id = auth.uid()` / `nutritionists.owner_id =
  --     auth.uid()` at query time.
  --   · The coach inbox never joins participants either — /api/trainer/messages
  --     resolves providerId from `owner_id = user.id`, then lists conversations by
  --     (kind, provider_role, provider_id). Same shape for nutritionists.
  -- So the moment a coach claims the listing they see the thread AND every message
  -- already in it. The conversation self-heals on claim rather than being lost.
  --
  -- Raising here would be a REGRESSION twice over: it would break that
  -- deliver-on-claim path, and because owner_id is `on delete set null`, a
  -- previously-claimed listing reverts to NULL when the coach's auth user is
  -- deleted — so a raise would newly fail the meal-note coach fan-out for a
  -- provider that still has live subscriptions.
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
  -- 2026-05-02 insert — still SECURITY DEFINER, still pg_temp-pinned, same grants.
  -- And conversations_direct_unique_idx is an object this migration does not own,
  -- so it stays live either way: without the handler a lost race surfaces a raw
  -- 23505 to a member who did nothing wrong. A guard that cannot fail on the one
  -- shape the migration exists to create is decoration.
  if position('unique_violation' in v_src) = 0 then
    raise exception 'get_or_create_direct_conversation must handle unique_violation, or a lost race against conversations_direct_unique_idx surfaces a raw 23505 to the member';
  end if;

  -- ⚠ AND ASSERT THE NULL-ROLE REJECTION, because every other check here passes on a
  -- function carrying the bypassable bare membership test. The match is on the null
  -- test rather than the role list, since the list is present in BOTH the correct and
  -- the broken shape. Honest limit: prosrc includes comments, so this is a source-shape
  -- assertion, not a behavioural one — the function gates on `auth.uid() is not null`
  -- first, and auth.uid() is NULL during a migration, so calling it here can only ever
  -- raise the authentication error. The phrase below is deliberately code-shaped and
  -- appears nowhere in this file's prose; keep it that way.
  if position('if p_provider_role is null' in v_src) = 0 then
    raise exception 'get_or_create_direct_conversation must reject a null p_provider_role explicitly — a bare membership test is bypassed by NULL, and the role-less conversation it then creates is invisible to both the lookup and conversations_direct_unique_idx';
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

  -- The pre-existing index is what actually closes the duplicate-thread race, and
  -- the unique_violation handler above is written against it — so assert it is
  -- present rather than asserting the duplicate this migration used to add.
  if to_regclass('public.conversations_direct_unique_idx') is null then
    raise exception 'conversations_direct_unique_idx (2026-05-02) is missing — the unique_violation handler has nothing to catch and duplicate direct threads become possible';
  end if;

  if to_regclass('public.conversations_direct_pair_uniq') is not null then
    raise exception 'conversations_direct_pair_uniq still exists — it duplicates conversations_direct_unique_idx and should have been dropped by this migration';
  end if;
end
$guard$;

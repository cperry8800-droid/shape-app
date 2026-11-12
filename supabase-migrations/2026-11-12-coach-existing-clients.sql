-- A coach's existing clients: the only clients Shape takes no cut from (owner, 2026-11-12).
--
-- The owner's rule: "Shape takes 15% cut on clients that sign up through Shape. Existing clients,
-- Shape takes no cut from." A coach finds clients on Shape or invites their own; both pay 15% when
-- they sign up through Shape. Only a client the coach already had before joining Shape pays 0%.
-- This replaces the 2026-07-21 rule (2026-07-21-coach-byo-commission-split.sql), under which any
-- client who subscribed within 30 days of the coach's in-app invite or ?ref= link paid 0%.
--
-- HOW A CLIENT COUNTS AS EXISTING (owner, 2026-11-12, asked before this was built):
--   * the coach lists their existing clients by email, on their own list, while it is open;
--   * the list is open for 60 days from the day the coach joined Shape (the provider row's
--     created_at), and for a coach who joined before 2026-11-12, for 60 days from 2026-11-12;
--     after that it is fixed: nothing is added or removed;
--   * a member whose confirmed account email is on that coach's list pays 0% at that coach's
--     checkout (origin 'coach_existing'). Everyone else pays 15% (origin 'marketplace').
--   * invites and links already sent are honoured: a client-bound tag (coach_referrals) that is
--     still inside its 30-day window when this runs pays 0% if the client subscribes before it
--     expires (origin 'coach_invite' / 'coach_link', as before). From this migration on, no tag is
--     created or extended, so every one of them runs out within 30 days.
--
-- WHAT DOES NOT CHANGE
--   * The fee RATE stays code-owned (src/lib/platform-fee.mjs, src/lib/coach-origin.mjs): this
--     returns the origin, the code stamps the rate.
--   * A row already stamped keeps its rate: origin and fee_bps are write-once
--     (freeze_origin_fee_bps, 2026-07-21), and src/lib/coach-origin.mjs ISSUED_FEE_BPS keeps every
--     rate each origin was ever issued at, so an in-flight checkout lands at the rate it was made at.
--   * Waitlist wins, full stop: a member in the coach's Shape waiting room found them on Shape and
--     pays 15%, even if the coach listed them.
--   * The durable link token (create_coach_referral_link) stays: the coach's share link still opens
--     their profile on Coaching (livingDesktop.jsx DesktopProfile). It no longer sets the fee.
--
-- Called by: src/lib/coach-origin.ts (resolve_coach_checkout_origin, at every coach checkout),
-- mobile-app/src/services/coachExistingClients.mjs (the coach's list in the app: get, add, remove).
-- The pure mirror of the precedence and the window is src/lib/coach-origin.mjs, which
-- tests/coach-origin.test.mjs and tests/coach-existing-clients-sql.test.mjs hold to this file.
--
-- Re-runnable: "if not exists", "create or replace", each constraint dropped before it is added.

begin;

-- ── 1) The list ───────────────────────────────────────────────────────────────
-- One row per (provider, email). The email is stored lowercased and trimmed; checkout compares it
-- with the member's account email the same way. Writes go through the RPCs below only.
create table if not exists public.coach_existing_clients (
  id            uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users (id) on delete cascade,
  provider_role text not null check (provider_role in ('trainer', 'nutritionist')),
  provider_id   bigint not null,
  email         text not null,
  created_at    timestamptz not null default now(),
  constraint coach_existing_clients_email_shape check (
    email = lower(btrim(email))
    and length(email) between 3 and 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint coach_existing_clients_uq unique (provider_role, provider_id, email)
);

alter table public.coach_existing_clients enable row level security;

-- The coach reads their own list. No client read, and no INSERT/UPDATE/DELETE policy: writes are the
-- definer RPCs below, which check the caller owns the provider row and the list is still open.
drop policy if exists "coach reads own existing clients" on public.coach_existing_clients;
create policy "coach reads own existing clients" on public.coach_existing_clients
  for select
  to authenticated
  using (coach_user_id = auth.uid());

-- ── 2) The window ─────────────────────────────────────────────────────────────
-- When a coach's list closes: 60 days from the later of the day they joined Shape and the day this
-- rule began (2026-11-12, 00:00 UTC). The 60 days are written as 1440 hours, so a session's time zone
-- can't move the close by an hour across a daylight-saving change. src/lib/coach-origin.mjs
-- existingClientsClosesAt is the same arithmetic; tests/coach-existing-clients-sql.test.mjs holds the
-- two to each other.
create or replace function public.coach_existing_clients_closes_at(p_joined timestamptz)
returns timestamptz
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(coalesce(p_joined, timestamptz '2026-11-12 00:00:00+00'),
                  timestamptz '2026-11-12 00:00:00+00') + interval '1440 hours'
$$;

-- ── 3) The coach's list: read, add, remove ────────────────────────────────────

-- get_coach_existing_clients: the caller's list for one of their provider rows, when it closes,
-- and whether it is still open. Refuses a provider row the caller does not own.
create or replace function public.get_coach_existing_clients(
  p_provider_role text,
  p_provider_id bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_joined timestamptz;
  v_found  boolean := false;
  v_closes timestamptz;
begin
  if p_provider_role not in ('trainer', 'nutritionist') then
    raise exception 'invalid provider role' using errcode = '22023';
  end if;
  if auth.uid() is null then
    raise exception 'not your provider row' using errcode = '42501';
  end if;
  if p_provider_role = 'trainer' then
    select t.created_at into v_joined from public.trainers t
     where t.id = p_provider_id and t.owner_id = auth.uid();
    v_found := found;
  else
    select n.created_at into v_joined from public.nutritionists n
     where n.id = p_provider_id and n.owner_id = auth.uid();
    v_found := found;
  end if;
  if not v_found then
    raise exception 'not your provider row' using errcode = '42501';
  end if;

  v_closes := public.coach_existing_clients_closes_at(v_joined);
  return jsonb_build_object(
    'closes_at', v_closes,
    'open', now() < v_closes,
    'emails', coalesce((
      select jsonb_agg(jsonb_build_object('email', e.email, 'added_at', e.created_at)
                       order by e.created_at, e.email)
        from public.coach_existing_clients e
       where e.provider_role = p_provider_role and e.provider_id = p_provider_id
    ), '[]'::jsonb)
  );
end;
$$;

-- add_coach_existing_clients: adds up to 200 emails at a time to the caller's list while it is open.
-- Each is trimmed and lowercased; one already on the list is left as it is. Returns how many were
-- added and the entries that are not an email address (or are the coach's own), which are skipped.
-- A closed list refuses with 'existing_client_list_closed'.
create or replace function public.add_coach_existing_clients(
  p_provider_role text,
  p_provider_id bigint,
  p_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_joined  timestamptz;
  v_found   boolean := false;
  v_closes  timestamptz;
  v_own     text;
  v_added   integer := 0;
  v_invalid text[];
begin
  if p_provider_role not in ('trainer', 'nutritionist') then
    raise exception 'invalid provider role' using errcode = '22023';
  end if;
  if auth.uid() is null then
    raise exception 'not your provider row' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_emails), 0) > 200 then
    raise exception 'at most 200 emails at a time' using errcode = '22023';
  end if;
  if p_provider_role = 'trainer' then
    select t.created_at into v_joined from public.trainers t
     where t.id = p_provider_id and t.owner_id = auth.uid();
    v_found := found;
  else
    select n.created_at into v_joined from public.nutritionists n
     where n.id = p_provider_id and n.owner_id = auth.uid();
    v_found := found;
  end if;
  if not v_found then
    raise exception 'not your provider row' using errcode = '42501';
  end if;

  v_closes := public.coach_existing_clients_closes_at(v_joined);
  if now() >= v_closes then
    raise exception 'existing_client_list_closed' using errcode = 'P0001';
  end if;

  select lower(btrim(u.email)) into v_own from auth.users u where u.id = auth.uid();

  with norm as (
    select distinct lower(btrim(x)) as e
      from unnest(coalesce(p_emails, array[]::text[])) as x
     where x is not null and btrim(x) <> ''
  )
  insert into public.coach_existing_clients (coach_user_id, provider_role, provider_id, email)
  select auth.uid(), p_provider_role, p_provider_id, norm.e
    from norm
   where length(norm.e) between 3 and 254
     and norm.e ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     and norm.e is distinct from v_own
  on conflict (provider_role, provider_id, email) do nothing;
  get diagnostics v_added = row_count;

  select coalesce(array_agg(n.e order by n.e), array[]::text[]) into v_invalid
    from (
      select distinct lower(btrim(x)) as e
        from unnest(coalesce(p_emails, array[]::text[])) as x
       where x is not null and btrim(x) <> ''
    ) n
   where not (length(n.e) between 3 and 254
              and n.e ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
      or n.e is not distinct from v_own;

  return jsonb_build_object('added', v_added, 'invalid', to_jsonb(v_invalid), 'closes_at', v_closes);
end;
$$;

-- remove_coach_existing_client: takes one email off the caller's list while it is open (true when a
-- row went). A closed list refuses with 'existing_client_list_closed'.
create or replace function public.remove_coach_existing_client(
  p_provider_role text,
  p_provider_id bigint,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_joined timestamptz;
  v_found  boolean := false;
begin
  if p_provider_role not in ('trainer', 'nutritionist') then
    raise exception 'invalid provider role' using errcode = '22023';
  end if;
  if auth.uid() is null then
    raise exception 'not your provider row' using errcode = '42501';
  end if;
  if p_provider_role = 'trainer' then
    select t.created_at into v_joined from public.trainers t
     where t.id = p_provider_id and t.owner_id = auth.uid();
    v_found := found;
  else
    select n.created_at into v_joined from public.nutritionists n
     where n.id = p_provider_id and n.owner_id = auth.uid();
    v_found := found;
  end if;
  if not v_found then
    raise exception 'not your provider row' using errcode = '42501';
  end if;
  if now() >= public.coach_existing_clients_closes_at(v_joined) then
    raise exception 'existing_client_list_closed' using errcode = 'P0001';
  end if;

  delete from public.coach_existing_clients e
   where e.provider_role = p_provider_role and e.provider_id = p_provider_id
     and e.email = lower(btrim(coalesce(p_email, '')));
  return found;
end;
$$;

-- ── 4) The new origin on the money rows ───────────────────────────────────────
-- 'coach_existing' joins the three 2026-07-21 origins. Every existing row already satisfies the new
-- check; the names are the live ones (checked 2026-11-12).
alter table public.subscriptions drop constraint if exists subscriptions_origin_check;
alter table public.subscriptions add constraint subscriptions_origin_check
  check (origin in ('marketplace', 'coach_invite', 'coach_link', 'coach_existing'));

alter table public.one_time_purchases drop constraint if exists one_time_purchases_origin_check;
alter table public.one_time_purchases add constraint one_time_purchases_origin_check
  check (origin in ('marketplace', 'coach_invite', 'coach_link', 'coach_existing'));

-- ── 5) No new tag, and none extended ──────────────────────────────────────────
-- The invite and the link no longer set the fee, so neither writes a client-bound tag. Both keep
-- their checks and their return shape, so an app build from before this keeps working: an invite
-- still sends (the RPC returns null, as it did on no error), and a link open still binds nothing
-- harmful. The tags already written are the honoured in-flight ones (§6) and expire on their own.
create or replace function public.create_coach_referral(
  p_provider_role text,
  p_provider_id bigint,
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owns boolean := false;
begin
  if p_provider_role not in ('trainer', 'nutritionist') then
    raise exception 'invalid provider role' using errcode = '22023';
  end if;
  if p_client_id is null or p_client_id = auth.uid() then
    raise exception 'invalid referral target' using errcode = '22023';  -- no self-referral
  end if;
  if p_provider_role = 'trainer' then
    select exists(select 1 from public.trainers t where t.id = p_provider_id and t.owner_id = auth.uid()) into v_owns;
  else
    select exists(select 1 from public.nutritionists n where n.id = p_provider_id and n.owner_id = auth.uid()) into v_owns;
  end if;
  if not v_owns then
    raise exception 'not your provider row' using errcode = '42501';
  end if;
  -- 2026-11-12: an invite is not an existing-client claim. Nothing is written.
  return null;
end;
$$;

create or replace function public.bind_coach_referral(p_token uuid)
returns table (provider_role text, provider_id bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_coach uuid;
  v_role  text;
  v_pid   bigint;
begin
  if p_token is null or auth.uid() is null then
    return;
  end if;
  select r.coach_user_id, r.provider_role, r.provider_id
    into v_coach, v_role, v_pid
  from public.coach_referrals r
  where r.token = p_token and r.client_id is null;
  if not found or v_coach = auth.uid() then
    return;
  end if;
  -- 2026-11-12: opening a coach's link no longer starts or extends a 0% window. Nothing is written;
  -- the provider is returned as before.
  return query select v_role, v_pid;
end;
$$;

-- ── 6) The checkout origin ────────────────────────────────────────────────────
-- The one checkout-time resolution, auth.uid()-scoped as before. Precedence (src/lib/coach-origin.mjs
-- resolveOriginDecision mirrors it):
--   1. waitlist (waiting, or invited while the invite is live) → marketplace;
--   2. the member's confirmed account email is on this provider's existing-client list
--      → coach_existing;
--   3. an unexpired client-bound tag from before this migration → coach_invite / coach_link, with
--      its id for the webhook to consume;
--   4. otherwise → marketplace.
-- p_ref is kept so the callers' signature holds; a presented token is no longer a touch.
create or replace function public.resolve_coach_checkout_origin(
  p_provider_role text,
  p_provider_id bigint,
  p_ref uuid default null
)
returns table (origin text, referral_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_bound record;
begin
  if v_uid is null or p_provider_role not in ('trainer', 'nutritionist') then
    return query select 'marketplace'::text, null::uuid; return;
  end if;

  -- 1) Waitlist wins: Shape-found demand, whatever else is true.
  if exists (
    select 1 from public.coach_waitlist w
    where w.client_id = v_uid and w.provider_role = p_provider_role
      and w.provider_id = p_provider_id
      and (w.status = 'waiting'
           or (w.status = 'invited' and w.invite_expires_at > now()))
  ) then
    return query select 'marketplace'::text, null::uuid; return;
  end if;

  -- 2) On the coach's existing-client list, by the member's own confirmed email.
  if exists (
    select 1
      from public.coach_existing_clients e
      join auth.users u on u.id = v_uid
     where e.provider_role = p_provider_role and e.provider_id = p_provider_id
       and u.email is not null and u.email_confirmed_at is not null
       and e.email = lower(btrim(u.email))
  ) then
    return query select 'coach_existing'::text, null::uuid; return;
  end if;

  -- 3) An in-flight tag from before the rule changed (none is written or extended after it).
  select r.id, r.channel into v_bound
  from public.coach_referrals r
  where r.client_id = v_uid and r.provider_role = p_provider_role
    and r.provider_id = p_provider_id and r.expires_at > now()
  order by r.expires_at desc
  limit 1;
  if not found then
    return query select 'marketplace'::text, null::uuid; return;
  end if;

  return query select
    (case v_bound.channel when 'dm' then 'coach_invite' when 'link' then 'coach_link' else 'marketplace' end)::text,
    (case when v_bound.channel in ('dm', 'link') then v_bound.id else null end);
end;
$$;

-- ── 7) Grants: signed-in members only ─────────────────────────────────────────
revoke all on function public.coach_existing_clients_closes_at(timestamptz) from public, anon;
revoke all on function public.get_coach_existing_clients(text, bigint) from public, anon;
revoke all on function public.add_coach_existing_clients(text, bigint, text[]) from public, anon;
revoke all on function public.remove_coach_existing_client(text, bigint, text) from public, anon;
revoke all on function public.create_coach_referral(text, bigint, uuid) from public, anon;
revoke all on function public.bind_coach_referral(uuid) from public, anon;
revoke all on function public.resolve_coach_checkout_origin(text, bigint, uuid) from public, anon;
grant execute on function public.coach_existing_clients_closes_at(timestamptz) to authenticated;
grant execute on function public.get_coach_existing_clients(text, bigint) to authenticated;
grant execute on function public.add_coach_existing_clients(text, bigint, text[]) to authenticated;
grant execute on function public.remove_coach_existing_client(text, bigint, text) to authenticated;
grant execute on function public.create_coach_referral(text, bigint, uuid) to authenticated;
grant execute on function public.bind_coach_referral(uuid) to authenticated;
grant execute on function public.resolve_coach_checkout_origin(text, bigint, uuid) to authenticated;

-- ── 8) Guard ──────────────────────────────────────────────────────────────────
do $shape$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_origin_check'
                    and pg_get_constraintdef(oid) like '%coach_existing%')
     or not exists (select 1 from pg_constraint
                     where conrelid = 'public.one_time_purchases'::regclass and conname = 'one_time_purchases_origin_check'
                       and pg_get_constraintdef(oid) like '%coach_existing%') then
    raise exception 'coach-existing-clients: the origin checks do not allow coach_existing';
  end if;
end
$shape$;

commit;

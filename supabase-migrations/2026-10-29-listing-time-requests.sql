-- =====================================================================================
-- A time asked of a coach who isn't on Shape yet (the owner, 2026-10-29: sample times "need to be
-- clickable"; "Request, saved for her").
--
-- A seeded listing (a trainer or nutritionist row with no owner_id) shows sample open times on its
-- profile. A member taps one and asks for it; the ask is kept here against the listing. Shape's
-- owners hear of each ask (/api/listing-requests). Once the listing is claimed (claim_provider_row,
-- /dashboard/claim), the coach reads the asks on their own page; and when it is ready to book
-- (listing_ready), every member who asked is told the coach is on Shape now (the trigger below).
--
-- Who reads a row (RLS):
--   - the member who asked it;
--   - the account that owns the listing, once it does (trainers / nutritionists owner_id).
-- Nobody writes one through the API. The route checks the account and the ask (the time in the
-- next 60 days), then stores it through add_listing_time_request with the service role, which
-- checks the listing (it exists, has no owner, and is on the market), the same time asked before,
-- and the member's caps in the one transaction that inserts (below). A member's account going removes their asks
-- (on delete cascade).
--
-- One transaction; re-runnable.
-- =====================================================================================

begin;
set local lock_timeout = '10s';

create table if not exists public.listing_time_requests (
  id uuid primary key default gen_random_uuid(),
  provider_role text not null check (provider_role in ('trainer', 'nutritionist')),
  provider_id bigint not null,
  member_id uuid not null references auth.users(id) on delete cascade,
  slot_start timestamptz not null,
  duration_min integer not null check (duration_min between 5 and 240),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint listing_time_requests_once unique (provider_role, provider_id, member_id, slot_start)
);

create index if not exists listing_time_requests_listing_idx
  on public.listing_time_requests (provider_role, provider_id, slot_start);
create index if not exists listing_time_requests_member_idx
  on public.listing_time_requests (member_id, created_at desc);

alter table public.listing_time_requests enable row level security;

revoke all on table public.listing_time_requests from public;
revoke all on table public.listing_time_requests from anon;
revoke all on table public.listing_time_requests from authenticated;
grant select on table public.listing_time_requests to authenticated;

drop policy if exists listing_time_requests_member_read on public.listing_time_requests;
create policy listing_time_requests_member_read on public.listing_time_requests
  for select to authenticated
  using (member_id = (select auth.uid()));

drop policy if exists listing_time_requests_coach_read on public.listing_time_requests;
create policy listing_time_requests_coach_read on public.listing_time_requests
  for select to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t where t.id = provider_id and t.owner_id = (select auth.uid())))
    or (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n where n.id = provider_id and n.owner_id = (select auth.uid())))
  );

-- =====================================================================================
-- add_listing_time_request: the one way an ask is stored (/api/listing-requests, service role).
-- Each check holds until the insert commits:
--   - One member's asks go one at a time (a transaction advisory lock on the member), so two asks
--     sent together can't both find room under a cap.
--   - The listing's row is held FOR SHARE. A claim (claim_provider_row's UPDATE) waits for the ask
--     to commit, so the claim's notice to the askers reads it; or the ask waits for the claim, then
--     reads the owner and is refused.
--   - The same time asked again is the ask already stored, whatever the caps say.
-- Outcomes: no_listing (gone, or off the market), claimed, already, daily_cap, too_many, added
-- (with the new ask's id). The listing's name comes back for the route's messages.
create or replace function public.add_listing_time_request(
  p_role text,
  p_provider_id bigint,
  p_member_id uuid,
  p_slot_start timestamptz,
  p_duration_min integer,
  p_note text,
  p_per_day integer,
  p_per_listing integer
)
returns table (outcome text, ask_id uuid, coach text)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
  v_owner uuid;
  v_coach text;
  v_ready boolean;
  v_id uuid;
begin
  if p_member_id is null then
    raise exception 'member required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('listing_time_requests:' || p_member_id::text, 0));

  if p_role = 'trainer' then
    select true, t.owner_id, t.name, t.listing_ready into v_found, v_owner, v_coach, v_ready
    from public.trainers t where t.id = p_provider_id for share;
  elsif p_role = 'nutritionist' then
    select true, n.owner_id, n.name, n.listing_ready into v_found, v_owner, v_coach, v_ready
    from public.nutritionists n where n.id = p_provider_id for share;
  else
    raise exception 'invalid role %', p_role using errcode = '22023';
  end if;
  if v_found is not true then
    return query select 'no_listing'::text, null::uuid, null::text;
    return;
  end if;
  if v_owner is not null then
    return query select 'claimed'::text, null::uuid, v_coach;
    return;
  end if;
  -- Off the market (suspended): the app shows no such listing, so it takes no asks (Codex on 6cc407d).
  if v_ready is not true then
    return query select 'no_listing'::text, null::uuid, null::text;
    return;
  end if;

  if exists (
    select 1 from public.listing_time_requests r
    where r.provider_role = p_role and r.provider_id = p_provider_id
      and r.member_id = p_member_id and r.slot_start = p_slot_start
  ) then
    return query select 'already'::text, null::uuid, v_coach;
    return;
  end if;
  if (select count(*) from public.listing_time_requests r
      where r.member_id = p_member_id and r.created_at >= now() - interval '1 day') >= p_per_day then
    return query select 'daily_cap'::text, null::uuid, v_coach;
    return;
  end if;
  if (select count(*) from public.listing_time_requests r
      where r.member_id = p_member_id and r.provider_role = p_role and r.provider_id = p_provider_id
        and r.slot_start >= now()) >= p_per_listing then
    return query select 'too_many'::text, null::uuid, v_coach;
    return;
  end if;

  insert into public.listing_time_requests (provider_role, provider_id, member_id, slot_start, duration_min, note)
  values (p_role, p_provider_id, p_member_id, p_slot_start, p_duration_min, p_note)
  returning id into v_id;
  return query select 'added'::text, v_id, v_coach;
end;
$$;

revoke all on function public.add_listing_time_request(text, bigint, uuid, timestamptz, integer, text, integer, integer) from public, anon, authenticated;
grant execute on function public.add_listing_time_request(text, bigint, uuid, timestamptz, integer, text, integer, integer) to service_role;

-- =====================================================================================
-- listing_time_requests_tell: the members who asked are told once the listing is its coach's and
-- ready to book (Codex on 6cc407d: told at the claim, the notice opened a listing the app can't show,
-- as a claimed listing is ready only with a price, payouts on and a photo; provider_listing_ready_row,
-- 2026-10-12-coach-listing-ready.sql). An AFTER UPDATE trigger on each listing table sees the row as
-- provider_listing_ready_row left it, whichever change makes it ready (the claim itself, payouts, a
-- price, a photo, an unsuspension), and fires only on the change to owned and ready. One notice per
-- member and listing: the same row and copy the app's notices carry (listingJoined in the notice
-- catalog), its dedupe key making a second firing write nothing (notifications_dedupe_uidx). A
-- definer, as the coach's own update fires it and the notices are other accounts'. The notice
-- promises no time (Codex on af3756e: a listing on the marketplace can still have no open hours):
-- it says the coach is here, to message or to see what they offer.
create or replace function public.listing_time_requests_tell()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := tg_argv[0];
  v_coach text := nullif(btrim(coalesce(new.name, '')), '');
begin
  insert into public.notifications (user_id, type, title, body, route, data)
  select a.member_id,
         'listing_joined',
         coalesce(v_coach, 'The coach you asked') || ' is on Shape now',
         'You asked ' || coalesce(v_coach, 'them') || ' for a time before they joined. Message them or see what they offer on their listing.',
         'coach:' || v_role || ':' || new.id::text,
         jsonb_build_object(
           'dedupe', 'joined:' || v_role || ':' || new.id::text || ':' || a.member_id::text,
           'providerRole', v_role,
           'providerId', new.id,
           'side', 'client',
           'copy', jsonb_build_object(
             'title', jsonb_build_array('listingJoined.title', jsonb_build_object('coach', coalesce(v_coach, 'The coach you asked'))),
             'body', jsonb_build_array('listingJoined.body', jsonb_build_object('coach', coalesce(v_coach, 'them')))))
  from (select distinct r.member_id from public.listing_time_requests r
        where r.provider_role = v_role and r.provider_id = new.id) a
  on conflict (user_id, type, (data->>'dedupe')) where data ? 'dedupe' do nothing;
  return null;
end;
$$;

revoke all on function public.listing_time_requests_tell() from public, anon, authenticated;

drop trigger if exists listing_time_requests_tell on public.trainers;
create trigger listing_time_requests_tell
  after update on public.trainers
  for each row
  when (new.owner_id is not null and new.listing_ready and not (old.owner_id is not null and old.listing_ready))
  execute function public.listing_time_requests_tell('trainer');

drop trigger if exists listing_time_requests_tell on public.nutritionists;
create trigger listing_time_requests_tell
  after update on public.nutritionists
  for each row
  when (new.owner_id is not null and new.listing_ready and not (old.owner_id is not null and old.listing_ready))
  execute function public.listing_time_requests_tell('nutritionist');

-- =====================================================================================
-- Guard: the end state, asserted. Every RAISE takes exactly the arguments its format names.
do $guard$
declare
  v_policies text[];
  v_rls boolean;
  v_src text;
begin
  select relrowsecurity into v_rls from pg_class where oid = 'public.listing_time_requests'::regclass;
  if v_rls is not true then
    raise exception 'listing_time_requests: row level security is off';
  end if;
  select array_agg(policyname::text order by policyname) into v_policies
  from pg_policies where schemaname = 'public' and tablename = 'listing_time_requests';
  if v_policies is distinct from array['listing_time_requests_coach_read', 'listing_time_requests_member_read'] then
    raise exception 'listing_time_requests: the policies are %', v_policies;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listing_time_requests' and cmd <> 'SELECT') then
    raise exception 'listing_time_requests: a policy lets the API write';
  end if;
  if has_table_privilege('anon', 'public.listing_time_requests', 'SELECT') then
    raise exception 'listing_time_requests: anon can read';
  end if;
  if has_table_privilege('authenticated', 'public.listing_time_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.listing_time_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.listing_time_requests', 'DELETE') then
    raise exception 'listing_time_requests: authenticated can write';
  end if;
  if not has_table_privilege('authenticated', 'public.listing_time_requests', 'SELECT') then
    raise exception 'listing_time_requests: authenticated cannot read its own rows';
  end if;
  select p.prosrc into v_src from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'add_listing_time_request'
    and pg_get_function_identity_arguments(p.oid) = 'p_role text, p_provider_id bigint, p_member_id uuid, p_slot_start timestamp with time zone, p_duration_min integer, p_note text, p_per_day integer, p_per_listing integer';
  if v_src is null or v_src not like '%pg_advisory_xact_lock%' or v_src not like '%for share%' then
    raise exception 'add_listing_time_request is missing, or stores an ask without its locks';
  end if;
  if has_function_privilege('anon', 'public.add_listing_time_request(text, bigint, uuid, timestamptz, integer, text, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.add_listing_time_request(text, bigint, uuid, timestamptz, integer, text, integer, integer)', 'execute')
     or not has_function_privilege('service_role', 'public.add_listing_time_request(text, bigint, uuid, timestamptz, integer, text, integer, integer)', 'execute') then
    raise exception 'add_listing_time_request must be the service role''s alone';
  end if;
  if v_src not like '%v_ready is not true%' then
    raise exception 'add_listing_time_request takes asks for a listing off the market';
  end if;
  if (select count(*) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace ns on ns.oid = c.relnamespace
      where ns.nspname = 'public' and c.relname in ('trainers', 'nutritionists') and tg.tgname = 'listing_time_requests_tell' and not tg.tgisinternal) <> 2 then
    raise exception 'listing_time_requests_tell is not on both listing tables';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = 'listing_time_requests_tell' and p.prosecdef
        and p.proconfig is not null and array_to_string(p.proconfig, ',') like '%pg_temp%') then
    raise exception 'listing_time_requests_tell is not a definer pinned to pg_temp';
  end if;
end
$guard$;

commit;

-- Coach listings are discoverable once they are ready (owner, 2026-10-12: "hide unready coaches").
--
-- An approved coach's listing row is published at approval, before the coach has a photo, a price
-- or a way to be paid, so the marketplace showed listings a member could not buy from. A listing
-- with an account behind it (owner_id set) is now READY when all three hold:
--   · a price above zero (trainers.price / nutritionists.price, the monthly rate);
--   · Stripe payouts active (stripe_account_status = 'active', which only the service role writes:
--     guard_provider_admin_columns keeps a coach's own write of it out);
--   · a photo: the listing's own portrait (listing_media.portrait) or the coach's profile photo
--     (profiles.avatar_url), the two the marketplace shows.
-- Shape's own listings (owner_id null) are always ready.
--
-- `listing_ready` is a stored column kept by triggers, not a generated column, because the photo
-- can live on profiles. It is recomputed on every insert and update of a listing (so a value a
-- coach writes is overwritten), and a listing is recomputed when its owner's profile photo
-- changes. Every discovery read (the marketplaces, search, Nora's coach suggestions, the public
-- counts and the public plan lists) filters on it; a listing reached by its own id still opens.
--
-- Both trigger functions are SECURITY INVOKER: a coach's own listing write reads their own
-- profile (profiles_read_self), and a member's own profile write touches only listings they own
-- (the "update own row" policies). Every other writer is the service role.
--
-- Safe to re-run. ⚠ Run this BEFORE the code that filters on the column is deployed: a filter on
-- a column that does not exist answers 400, and the marketplace would read empty.

begin;

-- ── 1 · the column ──────────────────────────────────────────────────────────────────────────
alter table public.trainers add column if not exists listing_ready boolean not null default true;
alter table public.nutritionists add column if not exists listing_ready boolean not null default true;

comment on column public.trainers.listing_ready is
  'Discoverable: owner_id is null, or price > 0, Stripe payouts active and a photo (listing portrait or profile avatar). Kept by trainers_zz_listing_ready; never written directly.';
comment on column public.nutritionists.listing_ready is
  'Discoverable: owner_id is null, or price > 0, Stripe payouts active and a photo (listing portrait or profile avatar). Kept by nutritionists_zz_listing_ready; never written directly.';

-- anon's read of these tables is column-level (2026-10-10, L16): a visitor's filter on the column
-- needs it granted.
grant select (listing_ready) on table public.trainers to anon;
grant select (listing_ready) on table public.nutritionists to anon;

-- ── 2 · a listing recomputes itself on every write ─────────────────────────────────────────
-- ⚠ THE TRIGGER NAME SORTS LAST ON PURPOSE. BEFORE triggers fire in name order, and this one has
-- to see the row after <table>_guard_admin_columns has put back a stripe_account_status a coach
-- tried to write; run before it, a coach could set 'active' and be listed for one write.
create or replace function public.provider_listing_ready_row()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_avatar text;
begin
  if new.owner_id is null then
    new.listing_ready := true;
    return new;
  end if;
  select p.avatar_url into v_avatar from public.profiles p where p.id = new.owner_id;
  new.listing_ready :=
    coalesce(new.price, 0) > 0
    and coalesce(new.stripe_account_status, '') = 'active'
    and (
      btrim(coalesce(new.listing_media ->> 'portrait', '')) <> ''
      or btrim(coalesce(v_avatar, '')) <> ''
    );
  return new;
end;
$$;

revoke all on function public.provider_listing_ready_row() from public, anon, authenticated;

drop trigger if exists trainers_zz_listing_ready on public.trainers;
create trigger trainers_zz_listing_ready
  before insert or update on public.trainers
  for each row execute function public.provider_listing_ready_row();

drop trigger if exists nutritionists_zz_listing_ready on public.nutritionists;
create trigger nutritionists_zz_listing_ready
  before insert or update on public.nutritionists
  for each row execute function public.provider_listing_ready_row();

-- ── 3 · a profile photo change recomputes the owner's listings ─────────────────────────────
create or replace function public.profile_avatar_listing_ready()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.avatar_url is distinct from old.avatar_url then
    update public.trainers set listing_ready = listing_ready where owner_id = new.id;
    update public.nutritionists set listing_ready = listing_ready where owner_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.profile_avatar_listing_ready() from public, anon, authenticated;

drop trigger if exists profiles_zz_listing_ready on public.profiles;
create trigger profiles_zz_listing_ready
  after update of avatar_url on public.profiles
  for each row execute function public.profile_avatar_listing_ready();

-- ── 4 · the listings that exist today ──────────────────────────────────────────────────────
-- Only listings with an account behind them can be anything but ready.
update public.trainers set listing_ready = listing_ready where owner_id is not null;
update public.nutritionists set listing_ready = listing_ready where owner_id is not null;

-- ── 5 · the public plan list shows plans from ready listings only ─────────────────────────
-- get_market_plans (2026-06-14) lists every published, priced plan with its coach, for the app's
-- marketplace rail and universal search. A plan is listed only while its coach's listing for that
-- kind (a meal plan's nutritionist listing, any other plan's trainer listing) is ready, which also
-- drops a plan whose coach has no listing at all (it was listed with no provider to buy from).
-- Restated whole: CREATE OR REPLACE keeps its grants, and the SET clause is restated with it
-- because a replacement without one would drop the pin the 2026-08-09 sweep gave it.
create or replace function public.get_market_plans()
returns table (
  id uuid, kind text, tab text, name text, meta text, price text,
  coach_name text, owner_id uuid, provider_id bigint, provider_role text
)
language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select cp.id, cp.kind,
    case
      when cp.kind = 'meal_plan' then 'meal'
      when lower(coalesce(cp.detail->>'buildType', '')) in ('workout', 'single', 'session') then 'workout'
      else 'program'
    end as tab,
    cp.name, cp.meta, cp.price,
    coalesce(p.full_name, 'Shape coach') as coach_name,
    cp.owner_id,
    listing.id as provider_id,
    case when cp.kind = 'meal_plan' then 'nutritionist' else 'trainer' end as provider_role
  from coach_plans cp
  left join profiles p on p.id = cp.owner_id
  join lateral (
    select n.id from nutritionists n
    where cp.kind = 'meal_plan' and n.owner_id = cp.owner_id and n.listing_ready
    union all
    select t.id from trainers t
    where cp.kind <> 'meal_plan' and t.owner_id = cp.owner_id and t.listing_ready
    limit 1
  ) listing on true
  where cp.published = true
    and coalesce(nullif(trim(cp.price), ''), '') <> ''
  order by cp.created_at desc
  limit 60;
$$;

-- ── 6 · guard ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_count int;
begin
  select count(*) into v_count from information_schema.columns
  where table_schema = 'public' and table_name in ('trainers', 'nutritionists')
    and column_name = 'listing_ready' and data_type = 'boolean' and is_nullable = 'NO';
  if v_count <> 2 then raise exception 'listing_ready is missing or nullable (% of 2)', v_count; end if;

  if not has_column_privilege('anon', 'public.trainers', 'listing_ready', 'select')
     or not has_column_privilege('anon', 'public.nutritionists', 'listing_ready', 'select') then
    raise exception 'anon cannot read listing_ready, so a visitor''s marketplace filter would fail';
  end if;
  if has_table_privilege('anon', 'public.trainers', 'select')
     or has_table_privilege('anon', 'public.nutritionists', 'select') then
    raise exception 'anon holds a table-level read of the coach tables again (2026-10-10, L16)';
  end if;

  select count(*) into v_count from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal and t.tgenabled <> 'D'
    and ((c.relname = 'trainers' and t.tgname = 'trainers_zz_listing_ready')
      or (c.relname = 'nutritionists' and t.tgname = 'nutritionists_zz_listing_ready')
      or (c.relname = 'profiles' and t.tgname = 'profiles_zz_listing_ready'));
  if v_count <> 3 then raise exception 'listing_ready triggers: % of 3 present and enabled', v_count; end if;

  -- The recompute sorts after the admin-column guard on both tables.
  select count(*) into v_count from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal and c.relname in ('trainers', 'nutritionists')
    and t.tgname > (c.relname || '_zz_listing_ready') and (t.tgtype & 2) = 2;
  if v_count <> 0 then raise exception 'a BEFORE trigger on a coach table sorts after the listing_ready recompute'; end if;

  if exists (select 1 from public.trainers where owner_id is null and not listing_ready)
     or exists (select 1 from public.nutritionists where owner_id is null and not listing_ready) then
    raise exception 'a listing with no account behind it is marked not ready';
  end if;

  if not exists (
    select 1 from pg_proc
    where oid = 'public.get_market_plans()'::regprocedure and prosecdef
      and proconfig @> array['search_path=public, pg_temp']
      and pg_get_functiondef(oid) like '%listing_ready%'
  ) then
    raise exception 'get_market_plans is not the restated, pinned definition';
  end if;
  if not has_function_privilege('anon', 'public.get_market_plans()', 'execute') then
    raise exception 'get_market_plans lost its public execute: the app''s plan rail would fail for a visitor';
  end if;

  if has_function_privilege('anon', 'public.provider_listing_ready_row()', 'execute')
     or has_function_privilege('authenticated', 'public.provider_listing_ready_row()', 'execute')
     or has_function_privilege('anon', 'public.profile_avatar_listing_ready()', 'execute')
     or has_function_privilege('authenticated', 'public.profile_avatar_listing_ready()', 'execute') then
    raise exception 'a listing_ready trigger function is executable by anon or authenticated';
  end if;
end;
$$;

commit;

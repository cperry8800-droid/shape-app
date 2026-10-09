-- Security and data review, cut 2 (2026-10-08), the app-code half, money: H5 and H6.
--
-- Both findings were verified against THIS production catalog (function bodies, policies and
-- indexes read live; the paths exercised in rolled-back transactions). The findings page is
-- private to the owner; H5 and H6 are its ids. The route changes that call what this file
-- creates ship in the same PR; the database half is written so that a deploy before or after
-- the migration is safe either way (a route that calls a function this file has not created
-- yet fails loudly, never silently).
--
--   H5  One store-credit balance discounted unlimited purchases. The checkout route read the
--       wallet and lowered the charge with no write; the webhook debited `least(balance, amount)`
--       on completion and ignored the return value. Five checkouts opened against one $25
--       credit each charged $25 less; the first webhook debited $25, the other four debited
--       nothing, all five purchases stood, and the difference came out of Shape's fee (the
--       coach is paid on the GROSS price). Stripe Checkout sessions live 24 hours.
--       → Credit is RESERVED when the session is created (a negative `reservation` row under
--         the member's wallet lock, so the next checkout sees it gone), CONVERTED into the
--         checkout debit when the session completes, and RELEASED when Stripe says the session
--         expired, or by a sweep after 48 hours for an expiry event that never arrived. A
--         reservation is a ledger row like every other wallet movement, never an update or a
--         delete: `reservation` (−) · `reservation_release` (+) · `checkout` (−, the purchase).
--   H6  Lead Boosts ($79 to $249 of marketplace placement) were granted free: the route inserted
--       the row with no points debit and no bound on days (and sent a `payload` column the
--       table does not have, so in production it failed outright), while the store's own redeem
--       refused the item. #2280 dropped the coach write policies; this adds the one legitimate
--       path: a SECURITY DEFINER redemption that debits the fixed 7 / 14 / 30-day catalogue item
--       and activates the boost in one transaction. Days come from the catalogue row, never
--       from the caller.
--
-- Tested on a local PostgreSQL 16 replica of production (the tables these functions touch,
-- every function body, the triggers, policies and grants; the store tables rebuilt from the
-- live catalog read 2026-10-09), applied over production's state and again on a fresh
-- replica, with probes as members, coaches, an anonymous caller and the service role before
-- and after; the second run changed nothing. The PR description has the table.
--
-- Idempotent, safe to re-run. One transaction: a failure leaves the database exactly as it
-- was. If a table is busy, the lock wait gives up after 10 seconds and the whole file rolls
-- back rather than queueing in front of the app's own queries; run it again a minute later.

begin;
set local lock_timeout = '10s';

-- =====================================================================================
-- H5 · store credit: reserve · release · sweep · consume

-- One reservation and one release per ref. The indexes make a replayed call a no-op at the
-- database, not merely in the function's own check.
create unique index if not exists store_credits_reservation_uniq
  on public.store_credits (ref) where source = 'reservation';
create unique index if not exists store_credits_reservation_release_uniq
  on public.store_credits (ref) where source = 'reservation_release';
create index if not exists store_credits_reservation_sweep_idx
  on public.store_credits (created_at) where source = 'reservation';

-- Release one reservation: a compensating positive row. 0 when there is no such reservation
-- or it was already released (or converted, which releases it too). Service role only.
create or replace function public.release_store_credit_reservation(p_ref text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if p_ref is null or length(p_ref) = 0 then return 0; end if;
  select user_id, kind, -cents as cents into r
  from public.store_credits
  where ref = p_ref and source = 'reservation';
  if not found then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('shape_store_credit:' || r.user_id::text));
  if exists (select 1 from public.store_credits where ref = p_ref and source = 'reservation_release') then
    return 0;
  end if;
  insert into public.store_credits (user_id, kind, cents, source, ref, note)
  values (r.user_id, r.kind, r.cents, 'reservation_release', p_ref, 'Reservation released');
  return r.cents;
end;
$$;

-- Release every reservation older than p_older_than that was never released: the net for a
-- `checkout.session.expired` event that never arrived. Never under 24 hours, because a
-- Stripe Checkout session lives 24 hours and a reservation behind a live session is not
-- stale. With p_user_id, one member's wallet only (the checkout route calls it that way
-- before reading the wallet). Service role only. Returns how many it released.
create or replace function public.sweep_store_credit_reservations(p_user_id uuid default null, p_older_than interval default interval '48 hours')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
  v_age interval := case when p_older_than is null or p_older_than < interval '24 hours' then interval '48 hours' else p_older_than end;
  r record;
begin
  for r in
    select s.ref
    from public.store_credits s
    where s.source = 'reservation'
      and s.created_at < now() - v_age
      and (p_user_id is null or s.user_id = p_user_id)
      and not exists (select 1 from public.store_credits x where x.ref = s.ref and x.source = 'reservation_release')
    order by s.created_at
  loop
    if public.release_store_credit_reservation(r.ref) > 0 then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;

-- Reserve up to p_amount_cents of the member's credit of one kind against a checkout the route
-- is about to create. Returns what was reserved (the route charges the member that much less,
-- and only that much). Idempotent by ref. Service role only.
create or replace function public.reserve_store_credit(p_user_id uuid, p_kind text, p_ref text, p_amount_cents integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_avail integer;
  v_take integer;
  v_prior integer;
begin
  if p_user_id is null or p_ref is null or length(p_ref) = 0 then return 0; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then return 0; end if;
  if p_kind not in ('session', 'nutrition') then return 0; end if;

  -- The same lock consume_store_credit and redeem_store_item take, so a reservation, a
  -- redemption and a conversion for one member run one after another.
  perform pg_advisory_xact_lock(hashtext('shape_store_credit:' || p_user_id::text));

  select coalesce(-sum(cents), 0) into v_prior
  from public.store_credits
  where ref = p_ref and source = 'reservation';
  if v_prior > 0 then return v_prior; end if;

  -- This member's stale reservations go first, so a missed expiry never locks their credit.
  perform public.sweep_store_credit_reservations(p_user_id, interval '48 hours');

  select coalesce(sum(cents), 0) into v_avail
  from public.store_credits
  where user_id = p_user_id and kind = p_kind;

  v_take := least(v_avail, p_amount_cents);
  if v_take <= 0 then return 0; end if;

  insert into public.store_credits (user_id, kind, cents, source, ref, note)
  values (p_user_id, p_kind, -v_take, 'reservation', p_ref, 'Reserved at checkout');
  return v_take;
end;
$$;

-- The debit on a completed checkout. The live 4-argument signature is replaced by one that
-- takes the reservation ref the route stamped on the session (null for a session created
-- before this migration, or with no credit applied). A held reservation is converted: its
-- release row and the checkout debit are written together, so the wallet does not move.
-- Without a held reservation the function falls back to the live behaviour (take what the
-- wallet has) and the caller compares the return value with what it discounted.
-- Idempotent by session id. Service role only.
drop function if exists public.consume_store_credit(uuid, text, text, integer);
create or replace function public.consume_store_credit(p_user_id uuid, p_kind text, p_session_id text, p_amount_cents integer, p_reservation_ref text default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_avail integer;
  v_take integer;
  v_prior integer;
  v_res integer := 0;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then return 0; end if;
  if p_kind not in ('session', 'nutrition') then return 0; end if;

  -- Already consumed for this checkout? Return the prior amount (idempotent).
  select coalesce(-sum(cents), 0) into v_prior
  from public.store_credits
  where ref = p_session_id and source = 'checkout';
  if v_prior > 0 then return v_prior; end if;

  perform pg_advisory_xact_lock(hashtext('shape_store_credit:' || p_user_id::text));

  if p_reservation_ref is not null and length(p_reservation_ref) > 0 then
    select coalesce(-sum(cents), 0) into v_res
    from public.store_credits s
    where s.ref = p_reservation_ref and s.source = 'reservation'
      and s.user_id = p_user_id and s.kind = p_kind
      and not exists (select 1 from public.store_credits x where x.ref = p_reservation_ref and x.source = 'reservation_release');
  end if;

  if v_res > 0 then
    insert into public.store_credits (user_id, kind, cents, source, ref, note)
    values (p_user_id, p_kind, v_res, 'reservation_release', p_reservation_ref, 'Reservation converted at checkout');
    v_take := least(v_res, p_amount_cents);
  else
    select coalesce(sum(cents), 0) into v_avail
    from public.store_credits
    where user_id = p_user_id and kind = p_kind;
    v_take := least(v_avail, p_amount_cents);
  end if;

  if v_take <= 0 then return 0; end if;

  insert into public.store_credits (user_id, kind, cents, source, ref, note)
  values (p_user_id, p_kind, -v_take, 'checkout', p_session_id, 'Applied at checkout');
  return v_take;
end;
$$;

-- ⚠ REVOKE FIRST. Supabase default-grants EXECUTE on a new public function to anon AND
-- authenticated, and `revoke ... from public` does not remove those explicit grants. Every
-- function above moves money on a caller-named wallet, so only the server may call them.
revoke all on function public.release_store_credit_reservation(text) from public;
revoke all on function public.release_store_credit_reservation(text) from anon;
revoke all on function public.release_store_credit_reservation(text) from authenticated;
grant execute on function public.release_store_credit_reservation(text) to service_role;

revoke all on function public.sweep_store_credit_reservations(uuid, interval) from public;
revoke all on function public.sweep_store_credit_reservations(uuid, interval) from anon;
revoke all on function public.sweep_store_credit_reservations(uuid, interval) from authenticated;
grant execute on function public.sweep_store_credit_reservations(uuid, interval) to service_role;

revoke all on function public.reserve_store_credit(uuid, text, text, integer) from public;
revoke all on function public.reserve_store_credit(uuid, text, text, integer) from anon;
revoke all on function public.reserve_store_credit(uuid, text, text, integer) from authenticated;
grant execute on function public.reserve_store_credit(uuid, text, text, integer) to service_role;

revoke all on function public.consume_store_credit(uuid, text, text, integer, text) from public;
revoke all on function public.consume_store_credit(uuid, text, text, integer, text) from anon;
revoke all on function public.consume_store_credit(uuid, text, text, integer, text) from authenticated;
grant execute on function public.consume_store_credit(uuid, text, text, integer, text) to service_role;

-- =====================================================================================
-- H6 · Lead Boosts are redeemed, not granted

-- The catalogue carries the boost's length, so the function never reads days from a caller.
alter table public.store_catalogue add column if not exists boost_days integer;
alter table public.store_catalogue drop constraint if exists store_catalogue_boost_days_check;
alter table public.store_catalogue add constraint store_catalogue_boost_days_check
  check (boost_days is null or boost_days in (7, 14, 30));
update public.store_catalogue set boost_days = 7  where id = 'lead_boost_7'  and boost_days is distinct from 7;
update public.store_catalogue set boost_days = 14 where id = 'lead_boost_14' and boost_days is distinct from 14;
update public.store_catalogue set boost_days = 30 where id = 'lead_boost_30' and boost_days is distinct from 30;

-- Redeem a Lead Boost for the caller's own provider row: the catalogue item's points leave
-- the caller's ledger, a store_redemptions row records it, and the boost row is written, all
-- in one transaction. The lock is redeem_store_item's, so a boost and a merch redemption by
-- the same member cannot both pass one balance read. The active-boost index
-- (coach_lead_boosts_active_uniq, 2026-06-29) stays the last word: a lost race raises and
-- the transaction, debit included, rolls back. Errors are the store's vocabulary
-- (not_authenticated, unknown_item, item_locked, insufficient_points) plus bad_role,
-- no_provider and boost_active.
create or replace function public.redeem_lead_boost(p_item_id text, p_role text, p_provider_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_cost integer;
  v_days integer;
  v_kind text;
  v_locked boolean;
  v_name text;
  v_provider_id bigint;
  v_balance integer;
  v_rid uuid;
  v_code text;
  v_now timestamptz := now();
  v_boost public.coach_lead_boosts;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_role is null or p_role not in ('trainer', 'nutritionist') then
    raise exception 'bad_role' using errcode = '22023';
  end if;

  select cost_points, boost_days, kind, locked
    into v_cost, v_days, v_kind, v_locked
  from public.store_catalogue
  where id = p_item_id;
  if not found or v_kind is distinct from 'lead_boost' or v_days is null then
    raise exception 'unknown_item' using errcode = '22023';
  end if;
  if v_locked then
    raise exception 'item_locked' using errcode = '22023';
  end if;
  if v_cost is null or v_cost <= 0 then
    raise exception 'invalid_cost' using errcode = '22023';
  end if;

  -- The caller's own row for the role: the lowest id is the account's primary row, the rule
  -- /api/lead-boosts and /api/stripe/connect-account use; a named row must be the caller's.
  if p_role = 'trainer' then
    select id into v_provider_id from public.trainers
    where owner_id = v_uid and (p_provider_id is null or id = p_provider_id)
    order by id limit 1;
  else
    select id into v_provider_id from public.nutritionists
    where owner_id = v_uid and (p_provider_id is null or id = p_provider_id)
    order by id limit 1;
  end if;
  if v_provider_id is null then
    raise exception 'no_provider' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('shape_store_redeem:' || v_uid::text));

  -- Checked before any points move: a refused redemption costs nothing. The index below is
  -- what holds under a race; this is what keeps the ledger clean in the ordinary case.
  if exists (select 1 from public.coach_lead_boosts where provider_id = v_provider_id and status = 'active') then
    raise exception 'boost_active' using errcode = 'P0001';
  end if;

  select coalesce(sum(delta), 0)::integer into v_balance
  from public.score_ledger
  where user_id = v_uid;
  if v_balance < v_cost then
    raise exception 'insufficient_points' using errcode = 'P0001';
  end if;

  v_name := 'Lead Boost · ' || v_days || ' days';
  v_rid := gen_random_uuid();
  v_code := 'BOOST-' || upper(substr(replace(v_rid::text, '-', ''), 1, 8));

  insert into public.store_redemptions (id, user_id, item_id, item_name, cost_points, code, kind)
  values (v_rid, v_uid, p_item_id, v_name, v_cost, v_code, 'lead_boost');

  insert into public.score_ledger (user_id, category, source_kind, source_id, delta, note)
  values (v_uid, 'other', 'store_redeem', v_rid, -v_cost, 'Shape Store · ' || v_name);

  begin
    insert into public.coach_lead_boosts
      (provider_role, provider_id, duration_days, starts_at, ends_at, status, source, created_by, notes)
    values
      (p_role, v_provider_id, v_days, v_now, v_now + make_interval(days => v_days), 'active', 'shape_store', v_uid,
       'Redeemed in the Shape Store · ' || v_code)
    returning * into v_boost;
  exception when unique_violation then
    -- A concurrent redemption won the active slot: everything above rolls back with this.
    raise exception 'boost_active' using errcode = 'P0001';
  end;

  return jsonb_build_object(
    'id', v_boost.id,
    'role', p_role,
    'providerId', v_provider_id,
    'startsAt', v_boost.starts_at,
    'endsAt', v_boost.ends_at,
    'days', v_days,
    'cost', v_cost,
    'code', v_code,
    'balance', v_balance - v_cost
  );
end;
$$;

revoke all on function public.redeem_lead_boost(text, text, bigint) from public;
revoke all on function public.redeem_lead_boost(text, text, bigint) from anon;
revoke all on function public.redeem_lead_boost(text, text, bigint) from authenticated;
grant execute on function public.redeem_lead_boost(text, text, bigint) to authenticated;

-- =====================================================================================
-- Guard: the end state, asserted. Every RAISE takes exactly the arguments its format names.
do $guard$
declare
  f record;
  v_oid oid;
  v_secdef boolean;
  v_cfg text;
  v_problem text;
  v_days integer;
begin
  for f in
    select * from (values
      ('release_store_credit_reservation', 'p_ref text', false),
      ('sweep_store_credit_reservations', 'p_user_id uuid, p_older_than interval', false),
      ('reserve_store_credit', 'p_user_id uuid, p_kind text, p_ref text, p_amount_cents integer', false),
      ('consume_store_credit', 'p_user_id uuid, p_kind text, p_session_id text, p_amount_cents integer, p_reservation_ref text', false),
      ('redeem_lead_boost', 'p_item_id text, p_role text, p_provider_id bigint', true)
    ) as t(name, args, member_callable)
  loop
    select p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
      into v_oid, v_secdef, v_cfg
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = f.name
      and pg_get_function_identity_arguments(p.oid) = f.args;
    v_problem := case
      when v_oid is null then 'missing'
      when not v_secdef then 'not SECURITY DEFINER'
      when position('pg_temp' in v_cfg) = 0 then 'pg_temp not pinned'
      when has_function_privilege('anon', v_oid, 'EXECUTE') then 'executable by anon'
      when has_function_privilege('authenticated', v_oid, 'EXECUTE') <> f.member_callable then 'wrong authenticated grant'
      when not f.member_callable and not has_function_privilege('service_role', v_oid, 'EXECUTE') then 'not executable by service_role'
      else null end;
    if v_problem is not null then
      raise exception '%(%) after this migration: %', f.name, f.args, v_problem;
    end if;
    v_oid := null; v_secdef := null; v_cfg := null;
  end loop;

  -- The replaced signature is gone (two consume_store_credit overloads would make the route's
  -- call ambiguous to PostgREST).
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'consume_store_credit'
               and pg_get_function_identity_arguments(p.oid) = 'p_user_id uuid, p_kind text, p_session_id text, p_amount_cents integer') then
    raise exception 'the 4-argument consume_store_credit still exists beside the 5-argument one';
  end if;

  for f in select * from (values ('lead_boost_7', 7), ('lead_boost_14', 14), ('lead_boost_30', 30)) as t(id, days) loop
    select boost_days into v_days from public.store_catalogue where id = f.id and kind = 'lead_boost' and not locked;
    if v_days is distinct from f.days then
      raise exception 'store_catalogue.% must carry boost_days = % (an unlocked lead_boost row); found %', f.id, f.days, coalesce(v_days::text, 'no row');
    end if;
  end loop;

  if to_regclass('public.store_credits_reservation_uniq') is null
     or to_regclass('public.store_credits_reservation_release_uniq') is null then
    raise exception 'the reservation indexes on store_credits are missing';
  end if;
  if to_regclass('public.coach_lead_boosts_active_uniq') is null then
    raise exception 'coach_lead_boosts_active_uniq (2026-06-29) is missing: redeem_lead_boost relies on it under a race';
  end if;
end
$guard$;

commit;

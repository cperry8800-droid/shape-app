-- Follow-up to 2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql (#2285), from
-- Codex's review of that PR, read after it had merged and after the owner had run its file. A
-- FOLLOW-UP FILE, NOT AN EDIT TO THAT ONE, which is already applied. Two defects in the same
-- function, both reproducible from its own text:
--
--   1. An elapsed boost kept status = 'active'. Nothing in the app changes the status (the public
--      GET filters by ends_at), so once a coach's first boost had run its course the active check
--      and coach_lead_boosts_active_uniq refused every later redemption: a coach could buy a Lead
--      Boost exactly once. redeem_lead_boost now expires the caller's elapsed rows first, under
--      its lock, and this file expires every elapsed row once.
--   2. A provider is (provider_role, provider_id): trainer and nutritionist ids come from separate
--      tables. The active check, and the 2026-06-29 unique index it relies on, keyed on
--      provider_id alone, so trainer 12's boost made nutritionist 12 read boost_active, and the
--      insert would have failed on the index even with the check corrected. Both carry the role.
--
-- Production held 0 active boosts when this was written (2026-10-09), so the index rebuild has
-- nothing to collide on. One transaction; re-runnable (the second run changes nothing).
--
-- The route's own half (src/app/api/lead-boosts/route.ts): on boost_active it reads back only the
-- caller's own provider rows, not the newest active boost of any coach with the same role.

begin;
set local lock_timeout = '10s';

-- Elapsed rows first, so the rebuilt index has nothing to collide on and the function's own
-- expiry has nothing left from before.
update public.coach_lead_boosts set status = 'expired' where status = 'active' and ends_at <= now();

-- The active slot is per provider, role included.
drop index if exists public.coach_lead_boosts_active_uniq;
create unique index coach_lead_boosts_active_uniq
  on public.coach_lead_boosts (provider_role, provider_id) where status = 'active';

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

  -- A boost that has run its course is expired here, under the lock, so it never blocks the
  -- next one: nothing else in the app flips the status (the public read goes by ends_at), and
  -- before this an elapsed row kept 'active' and refused every later redemption (Codex, #2285).
  update public.coach_lead_boosts
  set status = 'expired'
  where provider_role = p_role and provider_id = v_provider_id and status = 'active' and ends_at <= v_now;

  -- Checked before any points move: a refused redemption costs nothing. The index below is
  -- what holds under a race; this is what keeps the ledger clean in the ordinary case. A
  -- provider is (provider_role, provider_id): trainer and nutritionist ids come from separate
  -- tables, so a check on the id alone let trainer 12's boost refuse nutritionist 12's.
  if exists (select 1 from public.coach_lead_boosts
             where provider_role = p_role and provider_id = v_provider_id and status = 'active') then
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
  v_oid oid;
  v_secdef boolean;
  v_cfg text;
  v_src text;
  v_def text;
begin
  select p.oid, p.prosecdef, coalesce(array_to_string(p.proconfig, ','), ''), p.prosrc
    into v_oid, v_secdef, v_cfg, v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'redeem_lead_boost'
    and pg_get_function_identity_arguments(p.oid) = 'p_item_id text, p_role text, p_provider_id bigint';
  if v_oid is null then
    raise exception 'redeem_lead_boost(p_item_id text, p_role text, p_provider_id bigint) is missing after this migration';
  end if;
  if not v_secdef or position('pg_temp' in v_cfg) = 0 then
    raise exception 'redeem_lead_boost is not a SECURITY DEFINER pinned to pg_temp';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') or not has_function_privilege('authenticated', v_oid, 'EXECUTE') then
    raise exception 'redeem_lead_boost grants: anon must not run it, authenticated must';
  end if;
  if position('where provider_role = p_role and provider_id = v_provider_id and status = ''active'' and ends_at <= v_now' in v_src) = 0 then
    raise exception 'redeem_lead_boost does not expire the caller''s elapsed boosts before its check';
  end if;
  if position('where provider_role = p_role and provider_id = v_provider_id and status = ''active'') then' in v_src) = 0 then
    raise exception 'redeem_lead_boost''s active check does not carry the provider role';
  end if;

  select indexdef into v_def from pg_indexes
  where schemaname = 'public' and tablename = 'coach_lead_boosts' and indexname = 'coach_lead_boosts_active_uniq';
  if v_def is null then
    raise exception 'coach_lead_boosts_active_uniq is missing after this migration';
  end if;
  if position('UNIQUE' in v_def) = 0
     or position('(provider_role, provider_id)' in v_def) = 0
     or position('status = ''active''' in v_def) = 0 then
    raise exception 'coach_lead_boosts_active_uniq is not unique on (provider_role, provider_id) where status = ''active'': %', v_def;
  end if;

  if exists (select 1 from public.coach_lead_boosts where status = 'active' and ends_at <= now()) then
    raise exception 'an elapsed Lead Boost is still active after this migration';
  end if;
end
$guard$;

commit;

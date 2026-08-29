-- Rate-limit the two universal-search RPCs.
--
-- WHY THIS IS A DATABASE CHANGE AND NOT A ROUTE CHANGE. `search_shape_people`
-- and `search_members` are SECURITY DEFINER functions granted to `authenticated`,
-- and every one of their five callers reaches them DIRECTLY from the browser with
-- the publishable key — the app's universal search, the site header search, the
-- standalone-page search, the DM send picker and the post tag picker. None of them
-- passes through /api/*, so the proxy's limiter (2026-06-15-rate-limits.sql) has
-- never covered them. The 2026-07-30 hardening pass escaped the LIKE wildcards and
-- clamped the term to 80 characters, which removed the pathological backtracking;
-- what it explicitly did NOT close is the volume, and its own note says so: "the
-- real fix is having them call the existing HMAC bucket RPC". This is that fix.
--
-- ⚠ BOTH FUNCTIONS BECOME plpgsql AND VOLATILE, AND THEY HAVE TO. A rate-limit
-- counter is a WRITE, and Postgres refuses one inside a non-volatile function
-- ("INSERT is not allowed in a non-volatile function"); `LANGUAGE sql` also has no
-- RAISE, so a refusal could not be signalled at all. Each SELECT is carried over
-- VERBATIM inside `return query` — the search behaviour, ranking, escaping, clamp,
-- visibility rules and limits are all unchanged. The only behavioural difference is
-- that a caller past the ceiling gets an error instead of rows.
--
-- ⚠ AND THE BUCKET NAME HAS TO BE UNFORGEABLE, which is the whole reason this file
-- touches `check_rate_limit`. That function is granted to `anon` and
-- `authenticated` by design (the Edge proxy's anon client must reach it), so any
-- signed-in caller can bump ANY bucket it can name. A key like
-- `self:search:<victim-uuid>` is trivially guessable, so a limiter keyed on the
-- caller's uid would hand every member a way to lock a chosen victim out of search.
-- The TypeScript limiter solves this by HMAC-ing its keys with a server-only
-- secret; SQL cannot read that secret, so this file takes the other route: the
-- `self:` namespace is RESERVED, `check_rate_limit` refuses it outright, and only
-- `check_rate_limit_self` — which builds the key from `auth.uid()` itself and is
-- revoked from every client role — can write there.
--
-- The counter therefore moves into ONE private helper both entry points call, so
-- the fixed-window arithmetic, the opportunistic GC and the upsert exist once.
-- Idempotent; safe to re-run.

begin;

-- ── the counter, once ────────────────────────────────────────────────────────
-- Verbatim from 2026-06-15-rate-limits.sql, moved so both entry points share it.
-- Private: nothing outside this schema's own functions may call it.
create or replace function public._rate_limit_bump(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window  bigint      := floor(extract(epoch from now()) / p_window_seconds);
  v_bucket  text        := p_key || ':' || v_window;
  v_expires timestamptz := to_timestamp((v_window + 1) * p_window_seconds);
  v_count   integer;
begin
  -- Opportunistic GC so the table can't grow unbounded without pg_cron.
  if random() < 0.005 then
    delete from public.rate_limits where expires_at < now();
  end if;

  insert into public.rate_limits as r (bucket, count, expires_at)
       values (v_bucket, 1, v_expires)
  on conflict (bucket)
  do update set count = r.count + 1
  returning r.count into v_count;

  return query
    select (v_count <= p_max),
           greatest(p_max - v_count, 0),
           greatest(ceil(extract(epoch from (v_expires - now())))::int, 0);
end;
$$;

revoke all on function public._rate_limit_bump(text, integer, integer) from public, anon, authenticated;
grant execute on function public._rate_limit_bump(text, integer, integer) to service_role;

-- ── the public entry point (unchanged behaviour + the reserved namespace) ────
-- ⚠ `create or replace` PRESERVES the grants an earlier version made, so the
-- anon/authenticated grants below are re-asserted BY NAME rather than assumed —
-- the proxy calls this on every /api/* request and losing them would take the
-- whole API down (it fails open, but every request would pay a failed RPC).
create or replace function public.check_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
returns table (allowed boolean, remaining integer, reset_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The reserved namespace. Buckets under `self:` are derived from auth.uid() by
  -- check_rate_limit_self and must not be reachable through a caller-supplied key,
  -- or a member could burn another member's search allowance by naming their uuid.
  if p_key like 'self:%' then
    raise exception 'reserved rate-limit namespace' using errcode = '42501';
  end if;

  return query select * from public._rate_limit_bump(p_key, p_max, p_window_seconds);
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to anon, authenticated, service_role;

-- ── the self-scoped entry point ──────────────────────────────────────────────
-- The caller supplies only a SCOPE; the identity comes from the JWT, so there is
-- nothing to forge. Revoked from every client role anyway: its callers are
-- SECURITY DEFINER functions owned by postgres, which reach it as their owner.
create or replace function public.check_rate_limit_self(
  p_scope text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_ok  boolean;
begin
  -- No identity, no bucket. Every caller already refuses an unauthenticated
  -- request, so reaching here without a uid means something upstream changed —
  -- fail LOUD rather than silently sharing one bucket between every anon caller,
  -- which would rate-limit them as a single client.
  if v_uid is null then
    raise exception 'rate limit requires an authenticated caller' using errcode = '42501';
  end if;

  select allowed into v_ok
  from public._rate_limit_bump('self:' || p_scope || ':' || v_uid::text, p_max, p_window_seconds);

  return coalesce(v_ok, true);
end;
$$;

revoke all on function public.check_rate_limit_self(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit_self(text, integer, integer) to service_role;

-- ── the two search RPCs ──────────────────────────────────────────────────────
-- 60 searches per rolling minute, per member.
--
-- ⚠ THE CEILING IS SET BY WHAT A DEBOUNCED TYPEAHEAD ACTUALLY EMITS, not by a
-- round number. Every caller debounces (220ms on the post tag picker, 250ms in
-- the site header, 350ms in the app), and a debounce fires only after the typing
-- STOPS — so a continuous typist sends ONE request per search and a hunt-and-peck
-- typist sends roughly one per character. A search session is therefore ~5-10
-- requests, and 60/min leaves room for six to twelve genuine searches a minute:
-- far past any human browsing rate, and a hard ceiling on an automated one.
--
-- ⚠ ONE WINDOW, DELIBERATELY. A second, wider window (say 600/hour) would bound a
-- slow grind as well as a burst, but it doubles the counter write on the hot path
-- for a caller population that is already bounded by real authenticated accounts.
-- Registered rather than guessed at.
--
-- ⚠ THE REFUSAL IS A CODE, NOT A SENTENCE. SQLSTATE `PT429` is PostgREST's
-- HTTP-status convention, so a deployment that honours it answers 429; one that
-- does not still surfaces `code: 'PT429'` in the PostgREST error body, which is
-- what every client here matches on. Matching the MESSAGE would pin a spelling —
-- the trap #1936 paid for.
--
-- ⚠ AND THE SELECTS BELOW ARE THE SHIPPED ONES, CARRIED OVER UNCHANGED. Only the
-- wrapper is new: language, volatility, and the two lines that check the ceiling.

create or replace function public.search_shape_people(
  p_q text default '',
  p_limit integer default 20
)
returns table (id uuid, full_name text, role text, avatar text, points bigint)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not public.check_rate_limit_self('search', 60, 60) then
    raise exception 'too many searches — try again in a moment' using errcode = 'PT429';
  end if;

  return query
  with q as (
    -- left() BEFORE anything else: the clamp is the cost control, so it must
    -- apply to what the caller actually sent.
    select left(trim(leading '@' from trim(coalesce(p_q, ''))), 80) as raw
  ),
  qq as (
    select raw, public._escape_like_pattern(raw) as pat
    from q
  )
  select p.id,
         p.full_name,
         coalesce(nullif(p.role, ''), 'client') as role,
         case
           when public.shape_profile_visibility(p.id) = 'private' then null
           else ident.data->>'photo'
         end as avatar,
         coalesce((select sum(l.delta)::bigint from public.score_ledger l where l.user_id = p.id), 0) as points
  from public.profiles p
  cross join qq
  left join lateral (
    select g.data from public.user_goals g
    where g.user_id = p.id and g.kind = 'client_identity' limit 1
  ) ident on true
  where auth.uid() is not null
    and coalesce(p.full_name, '') <> ''
    and (
      qq.raw = ''
      or p.full_name ilike '%' || qq.pat || '%'
      or coalesce(p.username, '') ilike '%' || qq.pat || '%'
      or replace(coalesce(ident.data->>'handle', ''), '@', '') ilike '%' || qq.pat || '%'
      or (public.shape_profile_visibility(p.id) <> 'private' and (
              coalesce(ident.data->>'bio', '')  ilike '%' || qq.pat || '%'
           or coalesce(ident.data->>'goal', '') ilike '%' || qq.pat || '%'))
    )
  -- Prefix matches rank first. Uses the ESCAPED pattern too — ranking with the
  -- raw term would keep a wildcard live in the ORDER BY after the WHERE had
  -- neutralised it, so a `%` term would sort by "matches everything".
  order by (p.full_name ilike (select pat from qq) || '%'
            or coalesce(p.username, '') ilike (select pat from qq) || '%') desc,
           p.full_name
  limit least(greatest(coalesce(p_limit, 20), 1), 40);
end;
$fn$;

revoke all on function public.search_shape_people(text, integer) from public, anon;
grant execute on function public.search_shape_people(text, integer) to authenticated, service_role;

create or replace function public.search_members(p_q text default '')
returns table (id uuid, full_name text)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $fn$
begin
  -- ⚠ THE SAME BUCKET AS search_shape_people, ON PURPOSE. The app's universal
  -- search falls back to this function when the newer one is unavailable, so two
  -- buckets would let a refused call immediately spend a second allowance — the
  -- limiter would double the load it exists to halve.
  if not public.check_rate_limit_self('search', 60, 60) then
    raise exception 'too many searches — try again in a moment' using errcode = 'PT429';
  end if;

  return query
  with q as (
    select left(coalesce(p_q, ''), 80) as raw
  ),
  qq as (
    select raw, public._escape_like_pattern(raw) as pat
    from q
  )
  select p.id, p.full_name
  from public.profiles p
  cross join qq
  where auth.uid() is not null
    and p.id <> auth.uid()
    and (qq.raw = '' or p.full_name ilike '%' || qq.pat || '%')
  order by p.full_name nulls last
  limit 20;
end;
$fn$;

revoke all on function public.search_members(text) from public, anon;
grant execute on function public.search_members(text) to authenticated, service_role;

-- ── structural guard ─────────────────────────────────────────────────────────
-- Raises rather than reporting success, so a partial apply cannot look clean.
do $guard$
declare
  v_missing text;
begin
  if to_regprocedure('public._rate_limit_bump(text, integer, integer)') is null
     or to_regprocedure('public.check_rate_limit_self(text, integer, integer)') is null then
    raise exception 'the limiter helpers are missing';
  end if;

  -- The reserved namespace is the whole defence — without it a member can bump
  -- another member's search bucket by naming their uuid.
  if position('self:%' in pg_get_functiondef(to_regprocedure('public.check_rate_limit(text, integer, integer)'))) = 0 then
    raise exception 'check_rate_limit no longer reserves the self: namespace';
  end if;

  -- Both writers must be unreachable from a client role, or the key stops being
  -- unforgeable and the ban above buys nothing.
  select string_agg(f, ', ') into v_missing from (
    select f from unnest(array[
      'public._rate_limit_bump(text, integer, integer)',
      'public.check_rate_limit_self(text, integer, integer)'
    ]) f
    where has_function_privilege('anon', f::regprocedure, 'execute')
       or has_function_privilege('authenticated', f::regprocedure, 'execute')
  ) x;
  if v_missing is not null then
    raise exception 'a client role can still reach the private limiter: %', v_missing;
  end if;

  -- The proxy calls check_rate_limit on every /api/* request.
  if not has_function_privilege('anon', 'public.check_rate_limit(text, integer, integer)'::regprocedure, 'execute')
     or not has_function_privilege('authenticated', 'public.check_rate_limit(text, integer, integer)'::regprocedure, 'execute') then
    raise exception 'check_rate_limit lost the grants the proxy depends on';
  end if;

  -- A STABLE search function cannot write a counter, so a replay that reverted
  -- the volatility would silently drop the limit rather than fail.
  if (select provolatile from pg_proc where oid = 'public.search_shape_people(text, integer)'::regprocedure) <> 'v'
     or (select provolatile from pg_proc where oid = 'public.search_members(text)'::regprocedure) <> 'v' then
    raise exception 'a search function is not VOLATILE — it cannot bump the counter';
  end if;

  -- Both must still be authenticated-only.
  if has_function_privilege('anon', 'public.search_shape_people(text, integer)'::regprocedure, 'execute')
     or has_function_privilege('anon', 'public.search_members(text)'::regprocedure, 'execute') then
    raise exception 'a search function became anon-callable';
  end if;
end;
$guard$;

commit;

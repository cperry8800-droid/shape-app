-- STEP 1 of 2 — ADDITIVE ONLY. Safe to run at any time, including right now.
--
-- Creates the batch display-name resolver that step 2's policy lockdown depends
-- on. Nothing is revoked and no policy changes here, so running this cannot break
-- anything: the permissive profiles policy is still in place and every existing
-- read keeps working.
--
-- RUN ORDER, AND WHY IT IS TWO FILES:
--   1. THIS FILE      — now. Creates get_display_names().
--   2. deploy the code — the six cross-user call sites switch to the function.
--   3. 2026-08-04-profiles-pii-lockdown.sql — drops the USING (true) policy.
--
-- Done as one migration there is an unavoidable breakage window in EITHER
-- direction: run the policy drop before the code deploys and the call sites read
-- a policy that is gone; deploy the code first and they call a function that does
-- not exist. Split, there is no window — at every point in the sequence both the
-- old path and the new path work.
--
-- Context for the whole change is in step 2's header.

begin;

-- ── 1. The batch display-name resolver ─────────────────────────────────────
-- Mirrors get_user_points' batch shape so the call sites stay one round trip.
-- Returns ONLY the three display fields. It is security definer so it can read
-- past the new row policies, which is precisely why it must never be widened to
-- select email/phone/date_of_birth/stripe_customer_id — that would rebuild the
-- hole this migration closes, behind a function name that sounds harmless.
create or replace function public.get_display_names(p_ids uuid[])
returns table (user_id uuid, full_name text, avatar_url text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Signed-in only. Display names are not for the open internet, and the anon
  -- surfaces that legitimately show names (get_active_now, get_market_plans)
  -- already have their own gated functions.
  if auth.uid() is null then
    return;
  end if;
  -- A bounded batch. Unbounded, this is a whole-table name scrape in one call;
  -- the roster RPCs use the same guard (get_roster_weekly_adherence raises >100).
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;
  if array_length(p_ids, 1) > 200 then
    raise exception 'too many ids' using errcode = '22023';
  end if;
  return query
    select p.id, p.full_name, p.avatar_url
    from public.profiles p
    where p.id = any (p_ids);
end;
$$;

revoke all on function public.get_display_names(uuid[]) from public, anon;
grant execute on function public.get_display_names(uuid[]) to authenticated, service_role;

commit;

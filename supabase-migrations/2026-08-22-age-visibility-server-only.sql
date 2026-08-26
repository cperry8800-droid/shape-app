-- The raw-date door stops being reachable from a browser.
--
-- ⚠ THE DEFECT THIS FIXES WAS MINE, AND IT DEFEATED THE WHOLE POINT OF THE
-- FEATURE. 2026-08-22-age-visibility-batch.sql granted EXECUTE on
-- member_dobs_for_viewer(uuid[]) to `authenticated` — which is EVERY signed-in
-- member. PostgREST exposes it, so any of them could call
-- /rest/v1/rpc/member_dobs_for_viewer from a browser console and receive raw
-- `date_of_birth` values, bypassing the server-side reduction to an integer that
-- the route above it performs. Every comment in this feature says "no birthdate
-- ever reaches a browser"; the grant said otherwise.
--
-- ⚠ AND ONLY ONE BRANCH ACTUALLY LEAKED, WHICH IS WHY IT WAS EASY TO MISS.
-- Self already reads its own date through RLS, and a coach already reads a
-- client's raw date through `providers_read_subscriber_profiles_base` — so those
-- two branches disclosed nothing new. The `age_public = true` branch is the new
-- one: a member who opted in to showing their AGE was handing every signed-in
-- member their exact DATE OF BIRTH. They consented to the derived form, not the
-- PII it is derived from.
--
-- ⚠ WHY NOT COMPUTE THE AGE IN SQL AND KEEP THE FUNCTION BROWSER-CALLABLE. That
-- was the other candidate fix and it is genuinely attractive — it makes a direct
-- call harmless by construction. It was rejected because CI has no database, so
-- SQL cannot be behaviourally tested here (the one existing SQL drift guard,
-- tests/weekend-split.test.mjs, source-matches a scalar CONSTANT — a technique
-- that cannot pin anniversary arithmetic, where the failure is clamp-vs-roll on
-- Feb 29 and a 12-hour reference-day offset). Moving the age derivation into SQL
-- would make the one number members see depend on untested code, and would add a
-- THIRD implementation of it — src/app/api/{trainer,nutritionist}/console
-- already carry local copies. ageFromDob() in Node stays the single derivation,
-- with the 801-case sweep that proves it agrees with the 18+ gate.
--
-- ⚠ THE VIEWER IS NOW A PARAMETER, AND `viewer is not null` IS LOAD-BEARING.
-- Called by service_role there is no JWT, so auth.uid() is NULL and cannot be
-- the subject any more. Without the null guard the self branch would simply be
-- false, the coach branch false — but `p.age_public = true` does NOT depend on
-- the viewer at all, so a NULL viewer would still return every opted-in member's
-- date. Absence must refuse, not fall through to the one branch that ignores it.

-- ⚠ THE CREATE AND THE REVOKES MUST NOT BE SEPARATELY COMMITTED. Postgres grants EXECUTE
-- to PUBLIC by default on a brand-new function signature, so between the `create` below
-- and the `revoke`s further down this function is briefly callable by everyone —
-- `authenticated` inherits PUBLIC, which is exactly the door this file exists to shut.
-- Run statement-by-statement (psql -f, autocommit) that window is real. Wrapping the file
-- in one transaction makes the function's first visible state the locked-down one.
-- Wrapping a grant-lockdown migration is the repo's own convention — see
-- 2026-08-02-rpc-grant-lockdown.sql. (Its transaction covers a revoke/grant SET; the
-- create-window above is specific to a brand-new signature, so the reason here is
-- narrower than that file's, not identical to it.)
begin;

create or replace function public.member_dobs_for_viewer(viewer uuid, targets uuid[])
returns table (member_id uuid, dob date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- An empty ask is not an error; it is nothing to answer.
  if viewer is null or targets is null or array_length(targets, 1) is null then
    return;
  end if;

  -- ⚠ REFUSE, NEVER TRUNCATE. Silently answering the first 500 of a larger ask
  -- would render as "these members have no age", a claim this function would not
  -- have checked. The route caps too; this is the copy that cannot be skipped.
  if array_length(targets, 1) > 500 then
    raise exception 'member_dobs_for_viewer: % ids requested, maximum is 500', array_length(targets, 1)
      using errcode = '22023';
  end if;

  return query
    select p.id, p.date_of_birth
    from public.profiles p
    where p.id = any (targets)
      and p.date_of_birth is not null       -- absence answers exactly like refusal
      and (
        p.id = viewer
        or p.age_public = true
        or exists (
          select 1
          from public.subscriptions s
          left join public.trainers      t on t.id = s.provider_id and s.provider_role = 'trainer'
          left join public.nutritionists n on n.id = s.provider_id and s.provider_role = 'nutritionist'
          where s.client_id = p.id
            and s.status = any (array['active','trialing'])
            and (t.owner_id = viewer or n.owner_id = viewer)
        )
      );
end;
$$;

-- ⚠ NO BROWSER IDENTITY MAY HOLD THIS. `authenticated` is every signed-in
-- member, and that grant was the defect. `anon` and `public` are revoked for the
-- same reason they always are — Supabase grants EXECUTE to `public` on a new
-- function by default and `anon` inherits it.
revoke all on function public.member_dobs_for_viewer(uuid, uuid[]) from public;
revoke all on function public.member_dobs_for_viewer(uuid, uuid[]) from anon;
revoke all on function public.member_dobs_for_viewer(uuid, uuid[]) from authenticated;
grant execute on function public.member_dobs_for_viewer(uuid, uuid[]) to service_role;

-- The one-argument form is the browser-callable one. It has no callers left
-- (/api/members/ages now passes the viewer explicitly) and must not survive as a
-- second door with a weaker grant.
drop function if exists public.member_dobs_for_viewer(uuid[]);

-- ⚠ AND THE SCALAR DOOR FROM 2026-08-22-age-visibility.sql, WHICH RETURNED A
-- `date` TO `authenticated`. The create is removed from that file so no replay can
-- reintroduce it; this drop cleans any environment provisioned before that change.
drop function if exists public.member_dob_for_viewer(uuid);

commit;

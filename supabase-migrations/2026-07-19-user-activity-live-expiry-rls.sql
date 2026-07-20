-- Live-cooking hardening (spec 2026-07-19): titles raise the sensitivity of
-- user_activity_live, so expiry moves INTO the audience read path — an expired
-- row can no longer be fetched by a DIRECT select before cleanup runs. The v1
-- policy deliberately left expiry to the calling code (the
-- get_active_activities pattern); with a meal title on the row that is no
-- longer a good enough bound, because any authenticated client can query the
-- table directly rather than through our filtered helpers.
--
-- The OWNER leg stays UNFILTERED on purpose: a member must always be able to
-- see and clear their own stale row, expired or not.
--
-- Idempotent — safe to re-run.
drop policy if exists "live read" on public.user_activity_live;
create policy "live read" on public.user_activity_live
  for select to authenticated using (
    user_id = auth.uid()
    or (expires_at > now() and (
      visibility = 'public'
      or (visibility = 'followers' and exists (
            select 1 from public.user_follows
            where follower_id = auth.uid() and following_id = user_id and status = 'accepted'))
    ))
  );

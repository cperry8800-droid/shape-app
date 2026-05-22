-- 2026-05-22 — Let providers (trainer / nutritionist) read their
-- active/trialing subscribers' client_profiles rows.
--
-- Mirrors the daily_health_snapshot "providers_read_subscriber_snapshots"
-- policy. Without this, the Live Console can only show real clients'
-- name + status (from sessions/subscriptions) — never age, fitness goal,
-- or any of the JSONB profile fields the client filled out at signup.
--
-- The whole JSONB row is selectable; the Console route reads only safe
-- fields (dob -> age, goal -> focus) and never forwards the raw object.
-- If you ever need finer-grained gating, swap this for a server-side
-- service-role endpoint that whitelists specific keys.
--
-- Idempotent, safe to re-run.

drop policy if exists "providers_read_subscriber_profiles" on public.client_profiles;
create policy "providers_read_subscriber_profiles"
  on public.client_profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = client_profiles.user_id
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

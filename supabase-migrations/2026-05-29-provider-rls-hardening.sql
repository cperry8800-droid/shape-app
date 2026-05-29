-- 2026-05-29 — Provider-dashboard RLS hardening
--
-- Audit follow-up to the 2026-04-14 owner_id work. Two changes, both safe
-- and idempotent:
--
--   1. Provider read on public.profiles (subscriber names).
--      The trainer/nutritionist dashboards + analytics read a subscriber's
--      display name from public.profiles (select id, full_name … in clientIds).
--      Every OTHER table a provider reads — subscriptions, sessions,
--      daily_health_snapshot, client_profiles — has a policy that chains
--      provider access through owner_id = auth.uid(); public.profiles did
--      not. This adds the same subscription-scoped read policy so the roster
--      resolves real names AND the access is properly scoped (rather than
--      depending on a possibly-overbroad blanket read).
--
--      IMPORTANT: we deliberately do NOT run `alter table … enable row level
--      security` on profiles. If RLS is currently disabled there, enabling it
--      here would instantly revoke everyone's existing access (including a
--      user reading their own profile) and break sign-in. Creating a policy
--      while RLS is disabled is a harmless no-op; if RLS is (or later gets)
--      enabled, this policy is already in place. Toggling RLS on profiles, if
--      desired, should be a separate, deliberate migration that also ships the
--      "user reads own profile" + public-display policies.
--
--   2. Tighten provider_update_sessions WITH CHECK.
--      The original policy (2026-04-18) used `with check (true)`, so a provider
--      updating one of their own sessions could rewrite ownership columns
--      (provider_id / client_id) to arbitrary values. The USING clause already
--      restricts WHICH rows can be updated to the provider's own; mirroring it
--      in WITH CHECK ensures the row still belongs to that provider AFTER the
--      update. The app only ever updates status / meeting_url / notes, so this
--      does not affect any legitimate write.
--
-- Safe to re-run.

-- ===== 1. profiles: providers read their subscribers' rows =====

drop policy if exists "providers_read_subscriber_profiles_base" on public.profiles;
create policy "providers_read_subscriber_profiles_base"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.subscriptions s
      left join public.trainers t
        on t.id = s.provider_id and s.provider_role = 'trainer'
      left join public.nutritionists n
        on n.id = s.provider_id and s.provider_role = 'nutritionist'
      where s.client_id = profiles.id
        and s.status in ('active','trialing')
        and (t.owner_id = auth.uid() or n.owner_id = auth.uid())
    )
  );

-- ===== 2. sessions: providers can only keep their own rows on update =====

drop policy if exists "provider_update_sessions" on public.sessions;
create policy "provider_update_sessions"
  on public.sessions for update
  to authenticated
  using (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = sessions.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = sessions.provider_id and n.owner_id = auth.uid()
    ))
  )
  with check (
    (provider_role = 'trainer' and exists (
      select 1 from public.trainers t
      where t.id = sessions.provider_id and t.owner_id = auth.uid()
    ))
    or
    (provider_role = 'nutritionist' and exists (
      select 1 from public.nutritionists n
      where n.id = sessions.provider_id and n.owner_id = auth.uid()
    ))
  );

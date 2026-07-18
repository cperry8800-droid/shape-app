-- Live set-by-set workout progress, broadcast by the session player so a boost
-- sender (and a coach passing the same audience test) can see the session as it
-- happens. One row per member; the OWNER'S OWN CLIENT stamps `visibility` from
-- its resolved share rule (bsWorkoutSharePrivacy): 'public' | 'followers'.
-- A private member's row is ABSENT by design — there is no 'private' value, so
-- absence can never leak a setting choice. Payload carries names + set counts
-- ONLY (never loads/RPE — spec 2026-07-18, owner decision 2).
-- Idempotent — safe to re-run.

create table if not exists public.user_activity_live (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  visibility text not null check (visibility in ('public','followers')),
  payload    jsonb not null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);

alter table public.user_activity_live enable row level security;

drop policy if exists "live owner write" on public.user_activity_live;
create policy "live owner write" on public.user_activity_live
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Audience read: self, public, or followers-tier + an ACCEPTED follow.
-- Realtime postgres_changes enforces this per subscriber, so a followers-tier
-- row is never pushed to a non-follower. (DELETE events carry only the PK —
-- replica identity — which is equivalent to the already-public dot going out.)
drop policy if exists "live read" on public.user_activity_live;
create policy "live read" on public.user_activity_live
  for select to authenticated using (
    user_id = auth.uid()
    or visibility = 'public'
    or (visibility = 'followers' and exists (
          select 1 from public.user_follows
          where follower_id = auth.uid() and following_id = user_id and status = 'accepted'))
  );

-- Reads filter `expires_at > now()` in code (the get_active_activities pattern);
-- RLS deliberately does not.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_activity_live'
  ) then
    alter publication supabase_realtime add table public.user_activity_live;
  end if;
end $$;

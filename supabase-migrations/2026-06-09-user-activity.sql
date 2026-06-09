-- Live "doing right now" activity that PERSISTS across screen changes / app
-- backgrounding, so the avatar corner dot keeps showing while someone is in a
-- workout (teal) or cooking (amber) through Shape — and only stops when they
-- end it. A safety `expires_at` prevents an abandoned/crashed session from
-- showing forever. Idempotent — safe to re-run.

create table if not exists public.user_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('workout','cooking')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours'
);

alter table public.user_activity enable row level security;

-- read: any signed-in user (so others can see the dot); write: only your own row.
drop policy if exists "user_activity read" on public.user_activity;
create policy "user_activity read" on public.user_activity
  for select to authenticated using (true);

drop policy if exists "user_activity owner write" on public.user_activity;
create policy "user_activity owner write" on public.user_activity
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- realtime so others see start/stop live (idempotent add to the publication).
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_activity'
  ) then
    alter publication supabase_realtime add table public.user_activity;
  end if;
end $$;

-- Batch read of currently-active users (excludes expired). SECURITY DEFINER so
-- the client can hydrate the map in one call.
create or replace function public.get_active_activities()
returns table (user_id uuid, kind text, started_at timestamptz)
language sql stable security definer set search_path = public as $$
  select user_id, kind, started_at from public.user_activity where expires_at > now();
$$;
grant execute on function public.get_active_activities() to authenticated, anon;

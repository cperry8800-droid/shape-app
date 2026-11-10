-- A free week of assistant Nora after a free account's first workouts (owner, 2026-11-10: "a free
-- week of assistant Nora after someone's first few workouts, with no card… It wouldn't be a trial
-- in the billing sense").
--
-- WHAT THIS ADDS.
--   nora_previews   one row per account, ever: when its free week started and when it ends. Written
--                   only by the trigger below; an account reads its own row (the app and website say
--                   how many days are left), and nothing can write one through the API.
--   shape_start_nora_preview()   AFTER INSERT OR UPDATE OF status on workout_sessions: when a
--                   session becomes completed (or reviewed) and the account has at least
--                   NORA_PREVIEW_WORKOUTS (3) such sessions, no preview yet, and no paid membership
--                   (an active newest platform plan, a coach role, or an active coach subscription),
--                   its week starts now. Once per account: a second run of the week never starts.
--
-- The server reads the row (src/lib/membership-core.ts readNoraPreview): while `ends_at` is ahead,
-- assistant Nora's routes answer as for a member (her action cards, voice, the weekly readout, her
-- notices and her lookups in the chat). Radio, the Store, the full leaderboard and the AI drafting
-- stay the membership's.
--
-- Idempotent, one transaction, lock_timeout 10 s.

begin;
set local lock_timeout = '10s';

create table if not exists public.nora_previews (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  workouts integer not null default 0,
  check (ends_at > started_at)
);

alter table public.nora_previews enable row level security;
revoke all on public.nora_previews from anon, authenticated;
grant select on public.nora_previews to authenticated;
grant all on public.nora_previews to service_role;
drop policy if exists "read own nora preview" on public.nora_previews;
create policy "read own nora preview" on public.nora_previews
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.shape_start_nora_preview()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_needed constant integer := 3;    -- NORA_PREVIEW_WORKOUTS
  v_days constant integer := 7;      -- NORA_PREVIEW_DAYS
  v_done integer;
begin
  if new.client_id is null or new.status not in ('completed', 'reviewed') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('completed', 'reviewed') then
    return new;
  end if;
  if exists (select 1 from public.nora_previews p where p.user_id = new.client_id) then
    return new;
  end if;
  -- A paid account has assistant Nora already: no week is spent on it.
  if exists (
       select 1 from public.profiles pr
       where pr.id = new.client_id
         and (pr.role in ('trainer', 'nutritionist', 'dietitian')
              or coalesce(pr.roles, '{}'::text[]) && array['trainer', 'nutritionist', 'dietitian']::text[])
     )
     or exists (
       select 1 from (
         select s.status from public.platform_subscriptions s
         where s.client_id = new.client_id
         order by s.current_period_end desc nulls last
         limit 1
       ) newest
       where newest.status = 'active'
     )
     or exists (
       select 1 from public.subscriptions c
       where c.client_id = new.client_id and c.status = 'active'
     ) then
    return new;
  end if;
  select count(*) into v_done
  from public.workout_sessions w
  where w.client_id = new.client_id and w.status in ('completed', 'reviewed');
  if v_done >= v_needed then
    insert into public.nora_previews (user_id, started_at, ends_at, workouts)
    values (new.client_id, now(), now() + make_interval(days => v_days), v_done)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.shape_start_nora_preview() from public, anon, authenticated;

drop trigger if exists workout_sessions_start_nora_preview on public.workout_sessions;
create trigger workout_sessions_start_nora_preview
  after insert or update of status on public.workout_sessions
  for each row execute function public.shape_start_nora_preview();

commit;

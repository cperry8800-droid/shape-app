-- Shared habits: a member picks, per habit, the people who are told when it isn't done.
--
-- Owner, 2026-10-20: "habits can be public so that friends on app will be notified if you don't
-- complete a habit". Decided with the owner the same day:
--   • the member picks the people PER HABIT, from those they're connected to: an ACCEPTED follow
--     in either direction (user_follows.status = 'accepted');
--   • the notice goes at 8 pm in the member's own timezone if the habit isn't checked off yet,
--     so a friend can still nudge them before the day ends (/api/cron/habit-watch).
--
-- habit_watchers holds one row per (habit, person). Members never write it directly: every write
-- goes through set_habit_watchers, which checks the habit is the caller's and every person is
-- connected to them, and keeps user_habits.visibility in step ('friends' with anyone picked,
-- 'private' with no one). The owner reads their habits' rows; a person reads the rows that name
-- them, and either side can delete a row (the owner stops sharing; the person stops watching).
-- habit_watch_candidates lists who the caller may pick. Because a watcher can now read a habit's
-- id, the completions insert policy is replaced with one that also checks the habit is the
-- caller's.
--
-- Until this runs, the app's share button answers "not switched on yet" and the cron finds no
-- table and stops. Idempotent, safe to re-run.

create table if not exists public.habit_watchers (
  habit_id   uuid not null references public.user_habits(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  watcher_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (habit_id, watcher_id),
  constraint habit_watchers_not_self check (owner_id <> watcher_id)
);
create index if not exists habit_watchers_owner_idx on public.habit_watchers (owner_id);
create index if not exists habit_watchers_watcher_idx on public.habit_watchers (watcher_id);

alter table public.habit_watchers enable row level security;

drop policy if exists habit_watchers_read on public.habit_watchers;
create policy habit_watchers_read on public.habit_watchers
  for select to authenticated
  using (owner_id = auth.uid() or watcher_id = auth.uid());

drop policy if exists habit_watchers_delete on public.habit_watchers;
create policy habit_watchers_delete on public.habit_watchers
  for delete to authenticated
  using (owner_id = auth.uid() or watcher_id = auth.uid());

-- No insert or update policy: with RLS on, a direct write is refused. Writes go through
-- set_habit_watchers below. The table grants are trimmed to what the policies allow.
revoke all on public.habit_watchers from anon;
revoke insert, update, truncate, references, trigger on public.habit_watchers from authenticated;
grant select, delete on public.habit_watchers to authenticated;

-- ⚠ A CHECK-OFF IS WRITTEN ONLY ON THE CALLER'S OWN HABIT. habit_watchers shows a watcher the
-- habit's id, and the completions insert policy checked only user_id, so a watcher could write a
-- completion on someone else's habit: it would silence that evening's notice and, since
-- (habit_id, done_on) is unique, stop the owner checking the habit off that day (Codex on
-- #2413). The table has no update policy, so an insert is the only way in.
drop policy if exists "completions insertable by owner" on public.user_habit_completions;
create policy "completions insertable by owner" on public.user_habit_completions
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.user_habits h where h.id = habit_id and h.user_id = auth.uid())
  );

-- The people the caller may share a habit with: everyone joined to them by an accepted follow,
-- either way round. A signed-out caller (NULL uid) matches no follow row and gets nothing. No
-- limit: the sheet offers only these people, so one left out could never be picked (Codex on
-- #2413). The app reads it in pages, since PostgREST's Max rows caps a single request.
create or replace function public.habit_watch_candidates()
returns table (user_id uuid, full_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, p.full_name
  from public.profiles p
  where p.id in (
    select f.following_id from public.user_follows f where f.follower_id = auth.uid() and f.status = 'accepted'
    union
    select f.follower_id from public.user_follows f where f.following_id = auth.uid() and f.status = 'accepted'
  )
  and p.id <> auth.uid()
  order by p.full_name nulls last, p.id;
$$;
revoke all on function public.habit_watch_candidates() from public, anon;
grant execute on function public.habit_watch_candidates() to authenticated;

-- Replace who watches one of the caller's habits with exactly p_watchers. Refuses a signed-out
-- caller, a habit that is not theirs (or is archived), more than 20 people, and anyone not
-- connected to them, before changing anything. Returns the people now watching.
create or replace function public.set_habit_watchers(p_habit uuid, p_watchers uuid[])
returns uuid[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_me uuid := auth.uid();
  v_wanted uuid[];
begin
  if v_me is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  -- The habit's row is locked for the rest of the call, so two saves for one habit (two devices)
  -- run one after the other: each leaves exactly its own list, never the two merged (Codex on
  -- #2413).
  perform 1 from public.user_habits h
  where h.id = p_habit and h.user_id = v_me and h.archived_at is null
  for update;
  if not found then
    raise exception 'Habit not found.' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct w), '{}') into v_wanted
  from unnest(coalesce(p_watchers, '{}'::uuid[])) as w
  where w is not null;
  if cardinality(v_wanted) > 20 then
    raise exception 'Pick 20 people or fewer.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_wanted) as w
    where w = v_me
       or not exists (
         select 1 from public.user_follows f
         where f.status = 'accepted'
           and ((f.follower_id = v_me and f.following_id = w)
             or (f.following_id = v_me and f.follower_id = w))
       )
  ) then
    raise exception 'You can only share a habit with people you follow or who follow you.' using errcode = '42501';
  end if;

  delete from public.habit_watchers hw
  where hw.habit_id = p_habit and not (hw.watcher_id = any (v_wanted));
  insert into public.habit_watchers (habit_id, owner_id, watcher_id)
  select p_habit, v_me, w from unnest(v_wanted) as w
  on conflict (habit_id, watcher_id) do nothing;
  update public.user_habits
  set visibility = case when cardinality(v_wanted) > 0 then 'friends' else 'private' end
  where id = p_habit and user_id = v_me;
  return v_wanted;
end;
$$;
revoke all on function public.set_habit_watchers(uuid, uuid[]) from public, anon;
grant execute on function public.set_habit_watchers(uuid, uuid[]) to authenticated;

comment on table public.habit_watchers is
  'Who is told at 8 pm (the owner''s time) when a shared habit is not done. Written only by set_habit_watchers.';

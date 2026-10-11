-- Coach playlists for their clients (owner, 2026-10-11: "they should be
-- seperate playlists" · "for nutritionists that send playlists for cooking").
--
-- A coach's saved soundtrack (coach_soundtracks) can be sent to their clients:
-- one client at a time ({ kind: 'client', clientId }) or every client they have
-- ({ kind: 'all_clients' }), as entries in the row's existing `attached` array.
-- The member's app reads them back through one function: the trainer's on the
-- Train page, the nutritionist's (cooking playlists) on the Eat page — two
-- separate lists, told apart by the role the coach sent it as.
--
-- ⚠ THE TABLE STAYS OWNER-ONLY. coach_soundtracks' RLS lets a coach read their
-- own rows and nobody else's; this file adds no policy. A member reads through
-- get_my_coach_playlists, a security-definer function that answers only for
-- the caller, only from coaches the caller actually has (an active or trialing
-- subscription, or a published plan that coach assigned them), and only rows
-- that coach sent to them or to all their clients. Signed out, it returns
-- nothing.
--
-- Re-runnable: add column if not exists, create or replace, the grants
-- restated, and a guard at the end.

begin;

-- The role a playlist is sent as. Null on rows saved before this file: such a
-- row reads as the role of the coach row that owns it (a trainer's on Train, a
-- nutritionist's on Eat).
alter table public.coach_soundtracks
  add column if not exists role text check (role in ('trainer', 'nutritionist'));

create index if not exists coach_soundtracks_owner_role_idx
  on public.coach_soundtracks (owner_id, role);

create or replace function public.get_my_coach_playlists(p_role text)
returns table (
  id uuid,
  name text,
  provider text,
  url text,
  tracks integer,
  duration text,
  bpm text,
  tag text,
  coach_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select auth.uid() as uid
  ),
  -- The caller's coaches of this role, by the account that owns the coach row.
  coaches as (
    select t.owner_id, t.name
      from public.trainers t, me
     where p_role = 'trainer'
       and me.uid is not null
       and t.owner_id is not null
       and (
         exists (select 1 from public.subscriptions s
                  where s.client_id = me.uid and s.provider_role = 'trainer'
                    and s.provider_id = t.id and s.status in ('active', 'trialing'))
         or exists (select 1 from public.client_workouts w
                     where w.client_id = me.uid and w.trainer_id = t.id and w.status = 'published')
       )
    union
    select n.owner_id, n.name
      from public.nutritionists n, me
     where p_role = 'nutritionist'
       and me.uid is not null
       and n.owner_id is not null
       and (
         exists (select 1 from public.subscriptions s
                  where s.client_id = me.uid and s.provider_role = 'nutritionist'
                    and s.provider_id = n.id and s.status in ('active', 'trialing'))
         or exists (select 1 from public.client_meal_plans m
                     where m.client_id = me.uid and m.nutritionist_id = n.id and m.status = 'published')
       )
  )
  select cs.id, cs.name, cs.provider, cs.url, cs.tracks, cs.duration, cs.bpm, cs.tag,
         c.name as coach_name, cs.created_at
    from public.coach_soundtracks cs
    join coaches c on c.owner_id = cs.owner_id
    cross join me
   where (cs.role is null or cs.role = p_role)
     and cs.url is not null and cs.url <> ''
     and (
       cs.attached @> '[{"kind": "all_clients"}]'::jsonb
       or cs.attached @> jsonb_build_array(jsonb_build_object('kind', 'client', 'clientId', me.uid::text))
     )
   order by cs.created_at desc
   limit 20
$$;

-- Signed-in members only. Revoked from anon explicitly as well as from PUBLIC:
-- Supabase's default privileges grant EXECUTE to anon directly, so a revoke
-- from PUBLIC alone leaves it callable by a visitor.
revoke all on function public.get_my_coach_playlists(text) from public;
revoke all on function public.get_my_coach_playlists(text) from anon;
grant execute on function public.get_my_coach_playlists(text) to authenticated;

-- Guard: the column exists, the function is pinned, and a visitor cannot call it.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'coach_soundtracks' and column_name = 'role'
  ) then
    raise exception 'coach_soundtracks.role is missing';
  end if;
  if has_function_privilege('anon', 'public.get_my_coach_playlists(text)', 'execute') then
    raise exception 'get_my_coach_playlists is executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.get_my_coach_playlists(text)', 'execute') then
    raise exception 'get_my_coach_playlists is not executable by authenticated';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_my_coach_playlists'
       and p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=public, pg_temp%'
  ) then
    raise exception 'get_my_coach_playlists is not a pinned security definer';
  end if;
end $$;

commit;

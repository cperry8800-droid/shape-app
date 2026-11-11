-- A client's pause: "away until <date>" (owner, 2026-11-11, with the coach-alerts review: a pause
-- with a return date, set by the member or any of their coaches; billing continues).
--
-- While a client is paused, the alerts that read their absence (no food logs, no check-in, gone quiet,
-- missed sessions) stay quiet for every coach on them, their own reminders pause, and the Shape Score
-- takes no penalty for the days. When it ends, each coach sees "Back from a break" for three days, and
-- the gaps count from the day they came back. The engine reads it from the client's overview
-- (src/lib/shared-overview.ts → public/newdesign/dashSignals.js pauseOf).
--
-- ⚠ ITS OWN TABLE, NOT THE MEMBER'S SETTINGS DOCUMENT. user_goals('client_settings') already carries a
-- `paused_until` the Score penalty reads, but the member's app saves that document whole (read →
-- spread → save), so a coach's write into it would be lost to the member's next save of any setting.
-- One row per client, written only through set_client_pause; read only through get_client_pause.
--
-- set_client_pause(client, until): the member, or a coach on the client (is_coach_on_client: an
-- active, trialing or past-due subscription from them), sets a return date from yesterday (a member a
-- day behind UTC) to 90 days on, or ends the pause (null). Anyone else is refused.
-- get_client_pause(client): the same people read the pause, and who set it (the role, and whether it was
-- the caller), while it holds and for 15 days after it ends (the engine's three days of "Back" and its
-- count from the return day). Never the setter's id.
--
-- Called by: src/lib/shared-overview.ts (each client's `pause`), mobile-app/src/services/shapeBackend.js
-- (the member's Settings and a coach's client file), and the crons that quiet a paused member
-- (src/lib/client-pause.mjs, with the service role).
--
-- Re-runnable: "if not exists", "create or replace", policies dropped first; a guard checks the result.

begin;

create table if not exists public.client_pauses (
  client_id   uuid primary key references auth.users (id) on delete cascade,
  until_on    date not null,
  set_by      uuid references auth.users (id) on delete set null,
  set_by_role text not null check (set_by_role in ('member', 'trainer', 'nutritionist')),
  set_at      timestamptz not null default now()
);

alter table public.client_pauses enable row level security;
-- No policy: nobody reads or writes the table directly. The two functions below are the only way in,
-- and the service role (the crons) reads it as it reads every table.
revoke all on table public.client_pauses from public, anon, authenticated;
grant select on table public.client_pauses to service_role;

create or replace function public.set_client_pause(p_client_id uuid, p_until date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null or p_client_id is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_uid = p_client_id then
    v_role := 'member';
  elsif public.is_coach_on_client(p_client_id) then
    -- The coach's listing on this client: a trainer's when they hold one on it, else a nutritionist's.
    v_role := case when exists (
      select 1 from public.subscriptions s join public.trainers t on t.id = s.provider_id
      where s.client_id = p_client_id and s.provider_role = 'trainer'
        and s.status in ('active', 'trialing', 'past_due') and t.owner_id = v_uid
    ) then 'trainer' else 'nutritionist' end;
  else
    raise exception 'not this client''s member or coach' using errcode = '42501';
  end if;

  if p_until is null then
    delete from public.client_pauses where client_id = p_client_id;
    return jsonb_build_object('paused', false);
  end if;
  if p_until < current_date - 1 or p_until > current_date + 90 then
    raise exception 'a pause ends between today and 90 days from now' using errcode = '22023';
  end if;

  insert into public.client_pauses (client_id, until_on, set_by, set_by_role, set_at)
  values (p_client_id, p_until, v_uid, v_role, now())
  on conflict (client_id) do update
    set until_on = excluded.until_on, set_by = excluded.set_by,
        set_by_role = excluded.set_by_role, set_at = excluded.set_at;
  return jsonb_build_object('paused', true, 'until', p_until, 'by', v_role);
end;
$$;

-- ⚠ ITS COLUMNS ARE ITS SIGNATURE: "create or replace" cannot change a table function's columns, so a
-- run of an older draft of this file is dropped first (no caller exists before this migration).
drop function if exists public.get_client_pause(uuid);
create or replace function public.get_client_pause(p_client_id uuid)
returns table (until_on date, set_by_role text, set_at timestamptz, set_by_me boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.until_on, p.set_by_role, p.set_at, p.set_by is not distinct from auth.uid()
  from public.client_pauses p
  where auth.uid() is not null
    and p_client_id is not null
    and p.client_id = p_client_id
    and (auth.uid() = p_client_id or public.is_coach_on_client(p_client_id))
    and p.until_on >= current_date - 15;
$$;

revoke all on function public.set_client_pause(uuid, date) from public, anon;
grant execute on function public.set_client_pause(uuid, date) to authenticated;
revoke all on function public.get_client_pause(uuid) from public, anon;
grant execute on function public.get_client_pause(uuid) to authenticated, service_role;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.client_pauses'::regclass) then
    raise exception 'client_pauses must have row level security on';
  end if;
  if has_table_privilege('authenticated', 'public.client_pauses', 'select')
     or has_table_privilege('anon', 'public.client_pauses', 'select')
     or has_table_privilege('authenticated', 'public.client_pauses', 'insert') then
    raise exception 'client_pauses must be reached only through its functions';
  end if;
  if has_function_privilege('anon', 'public.set_client_pause(uuid, date)', 'execute')
     or has_function_privilege('anon', 'public.get_client_pause(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.set_client_pause(uuid, date)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_client_pause(uuid)', 'execute') then
    raise exception 'the pause functions must be executable by signed-in callers only';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('set_client_pause', 'get_client_pause')
      and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'))
  ) then
    raise exception 'the pause functions must be definers with a pinned search_path';
  end if;
  -- Signed out (no auth.uid() here), it answers nothing.
  if exists (select 1 from public.get_client_pause((select client_id from public.client_pauses limit 1))) then
    raise exception 'get_client_pause answered with no caller';
  end if;
end
$guard$;

commit;

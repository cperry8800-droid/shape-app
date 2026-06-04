-- Live weigh-ins — a dedicated table (instead of riding inside the user_goals
-- 'client_goals' JSONB). Drives the body-comp goal's now/down/%/to-go + the
-- weight trend chart, and is surfaced to the client's coach (share-gated) via
-- get_client_goals, which now merges the series into overall.weighIns.
--
-- Reuses is_coach_on_client(uuid) from 2026-05-26-shared-clients.sql. Idempotent.

create table if not exists public.client_weigh_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  logged_on date not null default current_date,
  weight numeric not null,
  unit text not null default 'kg',
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)            -- one weigh-in per day; latest wins (upsert)
);

create index if not exists client_weigh_ins_user_date_idx on public.client_weigh_ins (user_id, logged_on);

alter table public.client_weigh_ins enable row level security;

-- The client owns their weigh-ins (read + write).
drop policy if exists "weigh_self" on public.client_weigh_ins;
create policy "weigh_self" on public.client_weigh_ins for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A coach actively linked to the client can read (the share-flag gate lives in
-- get_client_goals, which is what the coach UI calls).
drop policy if exists "weigh_coach_read" on public.client_weigh_ins;
create policy "weigh_coach_read" on public.client_weigh_ins for select
  to authenticated
  using (public.is_coach_on_client(user_id));

-- Extend the coach read RPC: merge the live weigh-in series (and the latest
-- weight as overall.now) into the goals document, still gated on share.
create or replace function public.get_client_goals(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_data jsonb;
  v_weigh jsonb;
  v_latest numeric;
begin
  if not public.is_coach_on_client(p_user_id) then
    return null;
  end if;

  select g.data into v_data
  from public.user_goals g
  where g.user_id = p_user_id and g.kind = 'client_goals'
  limit 1;

  if v_data is null then
    v_data := jsonb_build_object('share', true);
  end if;

  if coalesce(v_data->>'share', 'true') = 'false' then
    return jsonb_build_object('share', false);
  end if;

  -- Live weigh-ins from the dedicated table → overall.weighIns + overall.now.
  select coalesce(jsonb_agg(jsonb_build_object('d', to_char(logged_on, 'YYYY-MM-DD'), 'kg', weight) order by logged_on), '[]'::jsonb)
    into v_weigh
  from public.client_weigh_ins
  where user_id = p_user_id;

  if jsonb_array_length(v_weigh) > 0 then
    if not (v_data ? 'overall') then
      v_data := jsonb_set(v_data, '{overall}', '{}'::jsonb, true);
    end if;
    v_data := jsonb_set(v_data, '{overall,weighIns}', v_weigh, true);
    select weight into v_latest from public.client_weigh_ins where user_id = p_user_id order by logged_on desc limit 1;
    v_data := jsonb_set(v_data, '{overall,now}', to_jsonb(v_latest), true);
  end if;

  return v_data;
end;
$$;

grant execute on function public.get_client_goals(uuid) to authenticated;

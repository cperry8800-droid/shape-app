-- Shared-coach visibility between trainers and nutritionists.
--
-- When a single client has an active subscription with both a trainer and a
-- nutritionist, both coaches should be able to see each other and view (but
-- not edit) the other side's plan + calendar items for that client.
--
-- This migration adds:
--   1. is_coach_on_client(client_id) — caller has an active sub to this client
--      via a trainer or nutritionist row they own.
--   2. shared_client_acks — per-coach dismissal of the "shared client" banner
--      for a specific (client, counterpart) pair.
--   3. Extended SELECT policy on sessions so the counterpart coach can read
--      confirmed / upcoming / completed sessions (never declined/cancelled
--      "noise"). Notes column readable too — UI is responsible for hiding it.
--
-- Idempotent. Safe to re-run.

-- ===== is_coach_on_client =====
create or replace function public.is_coach_on_client(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active', 'trialing')
      and (
        (s.provider_role = 'trainer' and exists (
          select 1 from public.trainers t
          where t.id = s.provider_id and t.owner_id = auth.uid()
        ))
        or
        (s.provider_role = 'nutritionist' and exists (
          select 1 from public.nutritionists n
          where n.id = s.provider_id and n.owner_id = auth.uid()
        ))
      )
  );
$$;

grant execute on function public.is_coach_on_client(uuid) to authenticated;

-- ===== shared_client_acks =====
-- One row per (coach owner_id, client, counterpart owner_id). When the coach
-- dismisses the banner for that shared-client pair, we insert a row. The
-- banner reappears if a *different* counterpart joins later.
create table if not exists public.shared_client_acks (
  coach_user_id uuid not null references auth.users on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  counterpart_user_id uuid not null references auth.users on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (coach_user_id, client_id, counterpart_user_id)
);

alter table public.shared_client_acks enable row level security;

drop policy if exists "coach_reads_own_acks" on public.shared_client_acks;
create policy "coach_reads_own_acks"
  on public.shared_client_acks for select
  to authenticated
  using (coach_user_id = auth.uid());

drop policy if exists "coach_writes_own_acks" on public.shared_client_acks;
create policy "coach_writes_own_acks"
  on public.shared_client_acks for insert
  to authenticated
  with check (coach_user_id = auth.uid());

drop policy if exists "coach_deletes_own_acks" on public.shared_client_acks;
create policy "coach_deletes_own_acks"
  on public.shared_client_acks for delete
  to authenticated
  using (coach_user_id = auth.uid());

-- ===== sessions: extend SELECT to shared coaches =====
-- The existing read_own_sessions policy stays in place (client + provider on
-- the row). This adds a second permissive policy so a coach sharing the same
-- client can read confirmed/upcoming/completed sessions of the other coach.
drop policy if exists "shared_coach_reads_sessions" on public.sessions;
create policy "shared_coach_reads_sessions"
  on public.sessions for select
  to authenticated
  using (
    status in ('confirmed', 'requested', 'completed')
    and sessions.client_id is not null
    and public.is_coach_on_client(sessions.client_id)
  );

-- ===== coach-to-coach conversation bootstrap =====
-- The existing conversations table only allows clients to create direct
-- threads. This function lets two coaches who share a client open (or reuse)
-- a private thread about that client. Both coaches are added as participants;
-- existing RLS on conversations / messages then handles read/write.
--
-- Conversation shape:
--   kind         = 'direct'
--   client_id    = the shared client (so it's discoverable in queries)
--   provider_*   = null (this is coach↔coach, not coach↔client)
--   participants = both coach user_ids
create or replace function public.get_or_create_coach_coach_conversation(
  p_other_user_id uuid,
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conversation_id uuid;
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Invalid counterpart.';
  end if;

  -- Both users must be active coaches on this client. We check by looking
  -- for an owner_id match against an active subscription.
  if not exists (
    select 1 from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active','trialing')
      and (
        (s.provider_role = 'trainer' and exists (
          select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = v_me
        ))
        or
        (s.provider_role = 'nutritionist' and exists (
          select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = v_me
        ))
      )
  ) then
    raise exception 'Caller is not a coach on this client.';
  end if;

  if not exists (
    select 1 from public.subscriptions s
    where s.client_id = p_client_id
      and s.status in ('active','trialing')
      and (
        (s.provider_role = 'trainer' and exists (
          select 1 from public.trainers t where t.id = s.provider_id and t.owner_id = p_other_user_id
        ))
        or
        (s.provider_role = 'nutritionist' and exists (
          select 1 from public.nutritionists n where n.id = s.provider_id and n.owner_id = p_other_user_id
        ))
      )
  ) then
    raise exception 'Counterpart is not a coach on this client.';
  end if;

  -- Reuse an existing coach↔coach conversation for this client if any.
  select c.id into v_conversation_id
  from public.conversations c
  where c.kind = 'direct'
    and c.client_id = p_client_id
    and c.provider_role is null
    and c.provider_id is null
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = v_me
    )
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = p_other_user_id
    )
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  insert into public.conversations (kind, client_id, title)
  values ('direct', p_client_id, 'Care team')
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id, role)
  values
    (v_conversation_id, v_me, 'member'),
    (v_conversation_id, p_other_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

grant execute on function public.get_or_create_coach_coach_conversation(uuid, uuid) to authenticated;

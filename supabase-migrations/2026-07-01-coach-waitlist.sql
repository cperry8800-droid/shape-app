-- Per-coach waiting list. When a coach is at_capacity, signed-in members join
-- to be first in line; the coach invites them back with first-dibs booking.
--
-- Security model (RLS-authoritative, per .coderabbit.yaml / AGENTS.md):
--   * Clients act on their OWN rows through the caller-scoped (authenticated)
--     Supabase client, gated by the RLS policies below — never the service role.
--   * FIFO position (needs peer rows) and the coach room read / invite (cross-user
--     + 2-hop provider ownership + profile-name join) go through SECURITY DEFINER
--     RPCs that verify auth.uid() internally — the same pattern the rest of Shape
--     uses for coach-reads-client-data (get_roster_weekend_split, get_client_stats).
--   * The service-role/admin client is used ONLY for system writes (the coach
--     notification, the Stripe-webhook booked-flip) — the documented exception.
--
-- Idempotent, safe to re-run.

create table if not exists public.coach_waitlist (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_role text not null check (provider_role in ('trainer','nutritionist')),
  provider_id bigint not null,
  client_id uuid not null references auth.users on delete cascade,
  note text,
  status text not null default 'waiting'
    check (status in ('waiting','invited','booked','declined','left')),
  invited_at timestamptz,
  responded_at timestamptz,
  invite_expires_at timestamptz
);

-- One ACTIVE spot per client per coach (waiting or invited).
create unique index if not exists coach_waitlist_active_uniq
  on public.coach_waitlist (provider_role, provider_id, client_id)
  where status in ('waiting','invited');

-- Coach-room listing + FIFO ordering.
create index if not exists coach_waitlist_provider_idx
  on public.coach_waitlist (provider_role, provider_id, status, created_at);

-- "My waitlists" lookup.
create index if not exists coach_waitlist_client_idx
  on public.coach_waitlist (client_id, status);

alter table public.coach_waitlist enable row level security;

-- ── Row-level security: clients act only on their OWN rows ───────────────────
-- SELECT: a client reads only their own rows (also backs the first-dibs check).
drop policy if exists "clients read own waitlist" on public.coach_waitlist;
create policy "clients read own waitlist" on public.coach_waitlist
  for select
  to authenticated
  using (auth.uid() = client_id);

-- INSERT: a client may only enqueue THEMSELVES, only as 'waiting', and only
-- into a REAL coach room that is ACTUALLY at capacity — the EXISTS check mirrors
-- isEffectivelyAtCapacity (at_capacity true AND no/future resume date), so a
-- direct Supabase write can't insert into an arbitrary/nonexistent provider_id
-- OR queue for a coach who is currently accepting clients (RLS is authoritative,
-- enforcing the same gate the API route applies rather than trusting the route).
drop policy if exists "clients join own waitlist" on public.coach_waitlist;
create policy "clients join own waitlist" on public.coach_waitlist
  for insert
  to authenticated
  with check (
    auth.uid() = client_id and status = 'waiting'
    and (
      (provider_role = 'trainer' and exists (
        select 1 from public.trainers t
        where t.id = provider_id and t.at_capacity is true
          and (t.capacity_resume_at is null or t.capacity_resume_at > now())))
      or (provider_role = 'nutritionist' and exists (
        select 1 from public.nutritionists n
        where n.id = provider_id and n.at_capacity is true
          and (n.capacity_resume_at is null or n.capacity_resume_at > now())))
    )
  );

-- UPDATE: a client may move only their OWN row, and only FROM an active state
-- (waiting|invited). The USING clause pins the OLD status to the active set so a
-- terminal/booked row can NEVER be flipped back to 'waiting'. WITH CHECK bounds
-- the NEW state: withdraw → left/declined; 'waiting' is allowed ONLY for a fresh
-- row (invite_expires_at null) or the re-activation of an EXPIRED invite — a LIVE
-- invite can't be reverted to 'waiting' (which would hold the slot without
-- accepting/declining and block the next member). WITH CHECK sees the trigger-
-- preserved invite_expires_at, and the trigger freezes the identity/position
-- columns so this can't jump the queue or self-grant 'invited'/'booked'.
drop policy if exists "clients update own waitlist" on public.coach_waitlist;
create policy "clients update own waitlist" on public.coach_waitlist
  for update
  to authenticated
  using (auth.uid() = client_id and status in ('waiting','invited'))
  with check (
    auth.uid() = client_id and (
      status in ('left','declined')
      or (status = 'waiting' and (invite_expires_at is null or invite_expires_at <= now()))
    )
  );

-- Guard immutable/position-defining columns. RLS WITH CHECK cannot reference the
-- OLD row, so the client UPDATE policy alone can't stop a client from rewriting
-- provider_id (to jump into another coach's queue at their old created_at),
-- client_id, created_at, or the invite timestamps. This trigger pins them:
--   * created_at: forced to now() on INSERT, preserved on UPDATE (no queue jump).
--   * provider_role / provider_id / client_id: immutable after INSERT (no moving
--     a spot to another coach or another user).
--   * invited_at / invite_expires_at: changeable ONLY on the transition to
--     'invited' (the SECURITY DEFINER invite RPC) — a client-scoped write can
--     never fabricate invite timing to spoof first-dibs.
create or replace function public.coach_waitlist_guard_cols()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  elsif tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.provider_role := old.provider_role;
    new.provider_id := old.provider_id;
    new.client_id := old.client_id;
    if new.status is distinct from 'invited' then
      new.invited_at := old.invited_at;
      new.invite_expires_at := old.invite_expires_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists coach_waitlist_freeze_created_at_t on public.coach_waitlist;
drop trigger if exists coach_waitlist_guard_cols_t on public.coach_waitlist;
create trigger coach_waitlist_guard_cols_t
  before insert or update on public.coach_waitlist
  for each row execute function public.coach_waitlist_guard_cols();

-- ── RPC: my active waitlists + FIFO position ─────────────────────────────────
-- The caller can only read their own rows via RLS, so position (which needs the
-- whole active queue per coach) is computed here as auth.uid()-scoped definer.
-- An expired invite no longer counts as active, so it never occupies a slot.
create or replace function public.get_my_waitlists()
returns table (
  id uuid,
  provider_role text,
  provider_id bigint,
  status text,
  note text,
  invited_at timestamptz,
  invite_expires_at timestamptz,
  created_at timestamptz,
  queue_position integer  -- "position" is a reserved word; aliased in the routes
)
language sql
security definer
set search_path = public
as $$
  with active_ranked as (
    select
      w.id, w.provider_role, w.provider_id, w.status, w.note,
      w.invited_at, w.invite_expires_at, w.created_at, w.client_id,
      row_number() over (
        partition by w.provider_role, w.provider_id
        order by w.created_at asc, w.id asc
      )::integer as queue_position
    from public.coach_waitlist w
    where w.status = 'waiting'
       or (w.status = 'invited' and w.invite_expires_at > now())
  )
  select id, provider_role, provider_id, status, note,
         invited_at, invite_expires_at, created_at, queue_position
  from active_ranked
  where client_id = auth.uid()
  order by created_at asc, id asc;
$$;

-- ── RPC: coach room roster (ownership-checked) ───────────────────────────────
-- Returns every row for a coach's waiting room with the client's display name
-- and FIFO position (position is null for terminal rows). Raises 42501 if the
-- caller does not own the provider row.
create or replace function public.get_coach_waitroom(p_role text, p_provider_id bigint)
returns table (
  id uuid,
  client_id uuid,
  client_name text,
  note text,
  status text,
  created_at timestamptz,
  invited_at timestamptz,
  invite_expires_at timestamptz,
  queue_position integer  -- "position" is a reserved word; aliased in the routes
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_owns boolean := false;
begin
  if p_role = 'trainer' then
    select exists(
      select 1 from public.trainers t
      where t.id = p_provider_id and t.owner_id = auth.uid()
    ) into v_owns;
  elsif p_role = 'nutritionist' then
    select exists(
      select 1 from public.nutritionists n
      where n.id = p_provider_id and n.owner_id = auth.uid()
    ) into v_owns;
  end if;

  if not v_owns then
    raise exception 'not your waiting room' using errcode = '42501';
  end if;

  return query
  with active_ranked as (
    select w.id,
      row_number() over (order by w.created_at asc, w.id asc)::integer as queue_position
    from public.coach_waitlist w
    where w.provider_role = p_role and w.provider_id = p_provider_id
      and (w.status = 'waiting' or (w.status = 'invited' and w.invite_expires_at > now()))
  )
  select
    w.id, w.client_id, p.full_name, w.note, w.status,
    w.created_at, w.invited_at, w.invite_expires_at, ar.queue_position
  from public.coach_waitlist w
  left join public.profiles p on p.id = w.client_id
  left join active_ranked ar on ar.id = w.id
  where w.provider_role = p_role and w.provider_id = p_provider_id
  order by w.created_at asc, w.id asc;
end;
$$;

-- ── RPC: coach invites a waitlisted client (ownership-checked, atomic) ────────
-- Coach discretion: any invitable entry (waiting, previously declined, or an
-- invite that has since expired) can be invited. Returns the target client +
-- provider name so the caller can send the notification via the system client.
-- Raises 42501 (not owner), P0002 (entry missing), P0001 (not invitable).
create or replace function public.invite_from_waitlist(p_entry_id uuid)
returns table (
  client_id uuid,
  provider_role text,
  provider_id bigint,
  provider_name text,
  invite_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_role text;
  v_pid bigint;
  v_client uuid;
  v_owns boolean := false;
  v_name text;
  v_expires timestamptz := now() + interval '7 days';  -- WAITLIST_INVITE_TTL_DAYS
begin
  select w.provider_role, w.provider_id, w.client_id
    into v_role, v_pid, v_client
  from public.coach_waitlist w
  where w.id = p_entry_id;
  if not found then
    raise exception 'entry not found' using errcode = 'P0002';
  end if;

  if v_role = 'trainer' then
    select (t.owner_id = auth.uid()), t.name into v_owns, v_name
    from public.trainers t where t.id = v_pid;
  elsif v_role = 'nutritionist' then
    select (n.owner_id = auth.uid()), n.name into v_owns, v_name
    from public.nutritionists n where n.id = v_pid;
  end if;
  if v_owns is not true then
    raise exception 'not your waiting room' using errcode = '42501';
  end if;

  -- If the client already holds a DIFFERENT active row for this coach (e.g. they
  -- re-joined after declining, leaving a stale 'declined' ghost), this stale
  -- entry isn't invitable — inviting it would create a second active row and
  -- collide with coach_waitlist_active_uniq (23505). Treat as not-invitable.
  if exists (
    select 1 from public.coach_waitlist w2
    where w2.provider_role = v_role and w2.provider_id = v_pid
      and w2.client_id = v_client and w2.id <> p_entry_id
      and (w2.status = 'waiting' or (w2.status = 'invited' and w2.invite_expires_at > now()))
  ) then
    raise exception 'client already active' using errcode = 'P0001';
  end if;

  update public.coach_waitlist w
    set status = 'invited',
        invited_at = now(),
        invite_expires_at = v_expires,
        responded_at = null
  where w.id = p_entry_id
    and (w.status in ('waiting','declined')
         or (w.status = 'invited' and w.invite_expires_at <= now()));
  if not found then
    raise exception 'not invitable' using errcode = 'P0001';
  end if;

  return query select v_client, v_role, v_pid, v_name, v_expires;
end;
$$;

-- Execute grants: authenticated callers only (functions are auth.uid()-scoped).
revoke all on function public.get_my_waitlists() from public;
revoke all on function public.get_coach_waitroom(text, bigint) from public;
revoke all on function public.invite_from_waitlist(uuid) from public;
grant execute on function public.get_my_waitlists() to authenticated;
grant execute on function public.get_coach_waitroom(text, bigint) to authenticated;
grant execute on function public.invite_from_waitlist(uuid) to authenticated;

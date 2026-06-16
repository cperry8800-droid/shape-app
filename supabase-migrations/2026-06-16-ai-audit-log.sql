-- AI audit log — every AI-initiated change in the app records exactly one row
-- here on the human-confirmed execution, and the row carries everything needed
-- to read it back and to UNDO it:
--   actor (auth.uid) + actor_role, source (nora|engine|notification),
--   action (the tool name), target (the client/entity the change is about),
--   the AI `suggestion`, the human-`confirmed_payload`, and a
--   before->after snapshot (plus an optional `reversal` handle) so the change
--   can be reversed. `status` flips executed -> undone when reversed.
--
-- Read model (RLS): a user sees their OWN entries; a coach additionally sees
-- entries that target a client they are actively coaching (is_coach_on_client).
-- WRITES go ONLY through the SECURITY DEFINER RPCs below — there is no direct
-- insert/update policy — so `actor_user_id` is always auth.uid() and the audit
-- trail can't be forged or back-dated from the client.
--
-- Depends on is_coach_on_client(uuid) (2026-05-26-shared-clients.sql).
-- Idempotent. Safe to re-run.

-- ===== table =====
create table if not exists public.ai_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  actor_role text not null,
  source text not null check (source in ('nora', 'engine', 'notification')),
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_kind text,
  target_id text,
  suggestion jsonb,
  confirmed_payload jsonb,
  before_state jsonb,
  after_state jsonb,
  reversal jsonb,
  status text not null default 'executed' check (status in ('executed', 'undone')),
  undone_at timestamptz,
  undone_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_audit_log_actor_idx on public.ai_audit_log (actor_user_id, created_at desc);
create index if not exists ai_audit_log_target_idx on public.ai_audit_log (target_user_id, created_at desc);

alter table public.ai_audit_log enable row level security;

-- Read: your own entries, or (for a coach) entries targeting a client you're on.
drop policy if exists "ai_audit_read_own_or_coach" on public.ai_audit_log;
create policy "ai_audit_read_own_or_coach"
  on public.ai_audit_log for select
  to authenticated
  using (
    actor_user_id = auth.uid()
    or (target_user_id is not null and public.is_coach_on_client(target_user_id))
  );

-- Deliberately NO insert/update/delete policies: all writes go through the
-- SECURITY DEFINER RPCs below, which stamp the actor as auth.uid().

-- ===== log_ai_action: append one row as the calling human =====
-- Called after the human confirms a previewed change and it executes. The
-- actor is always auth.uid(); a coach may only log against a client they're
-- active on, otherwise the target must be the actor themselves (or null).
create or replace function public.log_ai_action(
  p_source text,
  p_action text,
  p_actor_role text,
  p_target_user_id uuid,
  p_target_kind text,
  p_target_id text,
  p_suggestion jsonb,
  p_confirmed_payload jsonb,
  p_before_state jsonb,
  p_after_state jsonb,
  p_reversal jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;
  if p_source not in ('nora', 'engine', 'notification') then
    raise exception 'Invalid AI source: %', p_source;
  end if;
  if p_target_user_id is not null
     and p_target_user_id <> v_me
     and not public.is_coach_on_client(p_target_user_id) then
    raise exception 'Not permitted to act on this target.';
  end if;

  insert into public.ai_audit_log (
    actor_user_id, actor_role, source, action,
    target_user_id, target_kind, target_id,
    suggestion, confirmed_payload, before_state, after_state, reversal
  ) values (
    v_me, coalesce(nullif(p_actor_role, ''), 'client'), p_source, p_action,
    p_target_user_id, p_target_kind, p_target_id,
    p_suggestion, p_confirmed_payload, p_before_state, p_after_state, p_reversal
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.log_ai_action(text, text, text, uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ===== mark_ai_action_undone: record that a change was reversed =====
-- The route reverses the underlying data via the action's own undo executor
-- (RLS-scoped, as the user); this flips the audit row so the history shows the
-- undo. Only the actor, or a coach on the target client, may undo. Idempotent.
create or replace function public.mark_ai_action_undone(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row public.ai_audit_log;
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_row from public.ai_audit_log where id = p_id;
  if not found then
    return false;
  end if;

  if v_row.actor_user_id <> v_me
     and not (v_row.target_user_id is not null and public.is_coach_on_client(v_row.target_user_id)) then
    raise exception 'Not permitted to undo this action.';
  end if;

  if v_row.status = 'undone' then
    return true; -- idempotent
  end if;

  update public.ai_audit_log
     set status = 'undone', undone_at = now(), undone_by = v_me
   where id = p_id;
  return true;
end;
$$;

grant execute on function public.mark_ai_action_undone(uuid) to authenticated;

-- One-shot undo claim on ai_audit_log (2026-07-10).
--
-- undoChange used to read the row's status, reverse the underlying data via
-- the action's own undo, THEN flip the row to 'undone'. Two concurrent undo
-- requests could both pass the status read and both apply the reversal —
-- log_water's accumulator-inverse delta would subtract twice. (Spec #1652's
-- deferred follow-up: "a transition-reporting guarded-claim RPC on
-- ai_audit_log for a true one-shot water undo".)
--
-- claim_ai_action_undo makes the executed→undone transition ATOMIC and
-- REPORTS whether the caller won it (the guarded UPDATE's FOUND), so exactly
-- one request ever applies the data reversal. release_ai_action_undo hands a
-- claim back when the data reversal then fails, so the ledger never records
-- an undo that didn't happen — only the claimer may release, mirroring the
-- consume/release contract on ai_proposal_nonces.
--
-- mark_ai_action_undone (2026-06-16) is left untouched: the app falls back to
-- the legacy read→reverse→mark order until this migration is applied.
--
-- Permission model is identical to mark_ai_action_undone: the actor, or a
-- coach on the target client. Depends on is_coach_on_client(uuid)
-- (2026-05-26-shared-clients.sql). Idempotent. Safe to re-run.

-- ===== claim_ai_action_undo: atomically win the right to reverse =====
create or replace function public.claim_ai_action_undo(p_id uuid)
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

  -- The guarded transition: of any number of concurrent callers, exactly one
  -- sees FOUND here — that caller (and only that caller) applies the reversal.
  update public.ai_audit_log
     set status = 'undone', undone_at = now(), undone_by = v_me
   where id = p_id and status = 'executed';
  return found;
end;
$$;

revoke all on function public.claim_ai_action_undo(uuid) from public;
revoke all on function public.claim_ai_action_undo(uuid) from anon;
grant execute on function public.claim_ai_action_undo(uuid) to authenticated;

-- ===== release_ai_action_undo: hand a claim back after a failed reversal =====
create or replace function public.release_ai_action_undo(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Authentication is required.';
  end if;

  -- Only the claimer may release, and only a row still marked by them —
  -- a completed undo (or someone else's claim) can never be flipped back.
  update public.ai_audit_log
     set status = 'executed', undone_at = null, undone_by = null
   where id = p_id and status = 'undone' and undone_by = v_me;
  return found;
end;
$$;

revoke all on function public.release_ai_action_undo(uuid) from public;
revoke all on function public.release_ai_action_undo(uuid) from anon;
grant execute on function public.release_ai_action_undo(uuid) to authenticated;

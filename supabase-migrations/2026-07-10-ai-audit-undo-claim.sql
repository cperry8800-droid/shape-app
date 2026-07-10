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
-- undo_claimed_at is the IN-FLIGHT marker (Codex P2 on the PR): these RPCs
-- are granted to authenticated, so without it the same user who COMPLETED an
-- undo could later call release_ai_action_undo directly, flip the row back to
-- 'executed', and undo again — double-applying the reversal (exactly what
-- the claim exists to prevent). Claim sets it; a successful reversal
-- FINALIZES (clears it — finalize_ai_action_undo); release works ONLY while
-- it is still set. A finalized undo can never be reopened.
--
-- mark_ai_action_undone (2026-06-16) is left untouched: the app falls back to
-- the legacy read→reverse→mark order until this migration is applied.
--
-- Permission model is identical to mark_ai_action_undone: the actor, or a
-- coach on the target client. Depends on is_coach_on_client(uuid)
-- (2026-05-26-shared-clients.sql). Idempotent. Safe to re-run.

-- ===== the in-flight claim marker =====
alter table public.ai_audit_log add column if not exists undo_claimed_at timestamptz;

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
  -- undo_claimed_at marks the claim in-flight until finalize/release.
  update public.ai_audit_log
     set status = 'undone', undone_at = now(), undone_by = v_me, undo_claimed_at = now()
   where id = p_id and status = 'executed';
  return found;
end;
$$;

revoke all on function public.claim_ai_action_undo(uuid) from public;
revoke all on function public.claim_ai_action_undo(uuid) from anon;
grant execute on function public.claim_ai_action_undo(uuid) to authenticated;

-- ===== finalize_ai_action_undo: the reversal succeeded — close the claim =====
create or replace function public.finalize_ai_action_undo(p_id uuid)
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

  -- Clearing the in-flight marker permanently closes the release door for
  -- this undo. Claimer-only; a no-op on anything not their in-flight claim.
  update public.ai_audit_log
     set undo_claimed_at = null
   where id = p_id and status = 'undone' and undone_by = v_me
     and undo_claimed_at is not null;
  return found;
end;
$$;

revoke all on function public.finalize_ai_action_undo(uuid) from public;
revoke all on function public.finalize_ai_action_undo(uuid) from anon;
grant execute on function public.finalize_ai_action_undo(uuid) to authenticated;

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

  -- Only the claimer may release, and ONLY while the claim is still
  -- in-flight (undo_claimed_at set — never finalized). A completed undo,
  -- a finalized one, or someone else's claim can never be flipped back —
  -- calling this RPC directly after a successful undo is a no-op and cannot
  -- re-open the action for a second reversal (Codex P2).
  update public.ai_audit_log
     set status = 'executed', undone_at = null, undone_by = null, undo_claimed_at = null
   where id = p_id and status = 'undone' and undone_by = v_me
     and undo_claimed_at is not null;
  return found;
end;
$$;

revoke all on function public.release_ai_action_undo(uuid) from public;
revoke all on function public.release_ai_action_undo(uuid) from anon;
grant execute on function public.release_ai_action_undo(uuid) to authenticated;

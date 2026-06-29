-- Atomic client_programs.detail merge — fix the JSONB whole-document lost-update RACE.
--
-- client_programs.detail is one JSONB doc { training, nutrition, goals, directive }.
-- FOUR writers each did read-modify-write of the WHOLE doc, non-atomically:
--   1. /api/clients/[id]/goals POST            -> { ...detail, goals }
--   2. /api/ai/directive/override (writeOverride) -> { ...detail, directive }
--   3. the client self-write (ShapeProgramApi.set) -> { ...existing, ...selfDetail }
--   4. set_program_detail() itself: SELECT * INTO (NOT for update) then INSERT
--      ON CONFLICT DO UPDATE SET detail = the stale, JS/plpgsql-computed value.
-- A trainer + nutritionist on the same client (the care team), or one coach firing
-- overlapping requests, could each read the baseline doc and write back their section
-- over a sibling section a concurrent writer just committed -> a SILENT lost update.
--
-- Fix: every writer merges only its OWN top-level key(s) inside ONE statement, so the
-- `ON CONFLICT DO UPDATE` reads the existing doc under the upsert's row lock. Concurrent
-- writers to DIFFERENT keys no longer clobber; same-key writers serialize (last wins,
-- which is the intended set-semantics — these are not accumulators). Idempotent.

-- ── Generic atomic shallow-merge (goals / directive / self detail). SECURITY INVOKER:
--    runs under the caller's RLS + the discipline-guard trigger, so authorization is
--    unchanged — a wrong-discipline or non-coach write is still rejected exactly as
--    before; this only makes the WRITE atomic. ──
create or replace function public.merge_program_detail(p_client_id uuid, p_patch jsonb)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  insert into public.client_programs as cp (user_id, detail, updated_by, updated_at)
    values (p_client_id, coalesce(p_patch, '{}'::jsonb), auth.uid(), now())
  on conflict (user_id) do update
    set detail = coalesce(cp.detail, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb),
        updated_by = auth.uid(),
        updated_at = now()
  returning detail;
$$;

grant execute on function public.merge_program_detail(uuid, jsonb) to authenticated;

-- ── Atomic rewrite of the sanctioned discipline-split writer. Same auth + merge
--    semantics as 2026-06-17, but the section merge now happens inside the single
--    upsert (referencing cp.detail under the row lock) instead of a separate SELECT. ──
create or replace function public.set_program_detail(
  p_client_id uuid,
  p_discipline text,
  p_phase text,
  p_detail jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := case p_discipline when 'training' then 'trainer'
                                   when 'nutrition' then 'nutritionist' end;
  v_row public.client_programs;
begin
  if v_role is null then
    raise exception 'invalid discipline %, expected training or nutrition', p_discipline
      using errcode = '22023';
  end if;
  if not (auth.uid() = p_client_id or public.is_discipline_coach_on_client(p_client_id, v_role)) then
    raise exception 'Not authorized to set the % program for this client.', p_discipline
      using errcode = '42501';
  end if;

  insert into public.client_programs as cp (user_id, training_phase, nutrition_phase, detail, updated_by, updated_at)
  values (
    p_client_id,
    case when p_discipline = 'training'  then p_phase else null end,
    case when p_discipline = 'nutrition' then p_phase else null end,
    case when p_detail is null then '{}'::jsonb
         else jsonb_set('{}'::jsonb, array[p_discipline], p_detail, true) end,
    auth.uid(), now()
  )
  on conflict (user_id) do update set
    training_phase  = case when p_discipline = 'training'  then coalesce(p_phase, cp.training_phase)  else cp.training_phase  end,
    nutrition_phase = case when p_discipline = 'nutrition' then coalesce(p_phase, cp.nutrition_phase) else cp.nutrition_phase end,
    detail = case when p_detail is null then cp.detail
                  else jsonb_set(coalesce(cp.detail, '{}'::jsonb), array[p_discipline],
                                 coalesce(cp.detail -> p_discipline, '{}'::jsonb) || p_detail, true) end,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'trainingPhase', v_row.training_phase,
    'nutritionPhase', v_row.nutrition_phase,
    'detail', v_row.detail
  );
end;
$$;

grant execute on function public.set_program_detail(uuid, text, text, jsonb) to authenticated;

-- ── Harden the discipline guard so detail.directive + detail.goals are COACH-ONLY on
--    EVERY write path (the new merge_program_detail RPC AND any direct upsert). Without
--    this, a client could patch their own detail.directive (the coach's authoritative
--    override the engine trusts) or detail.goals (coach-set, client-viewed) — RLS scopes
--    rows, not JSONB subfields, and the prior guard only covered training/nutrition.
--    The directive/goals check runs BEFORE the self-bypass; training/nutrition keep the
--    existing self-or-discipline-coach rule. ──
create or replace function public.client_programs_discipline_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_training_changed boolean;
  v_nutrition_changed boolean;
  v_directive_changed boolean;
  v_goals_changed boolean;
begin
  -- A non-request context (no JWT: migrations / service role) is trusted.
  if v_uid is null then return new; end if;

  if tg_op = 'INSERT' then
    v_training_changed  := (new.training_phase is not null) or (new.detail ? 'training');
    v_nutrition_changed := (new.nutrition_phase is not null) or (new.detail ? 'nutrition');
    v_directive_changed := new.detail ? 'directive';
    v_goals_changed     := new.detail ? 'goals';
  else
    v_training_changed  := (new.training_phase  is distinct from old.training_phase)
                           or ((new.detail -> 'training')  is distinct from (old.detail -> 'training'));
    v_nutrition_changed := (new.nutrition_phase is distinct from old.nutrition_phase)
                           or ((new.detail -> 'nutrition') is distinct from (old.detail -> 'nutrition'));
    v_directive_changed := (new.detail -> 'directive') is distinct from (old.detail -> 'directive');
    v_goals_changed     := (new.detail -> 'goals')     is distinct from (old.detail -> 'goals');
  end if;

  -- directive + goals are coach-only — even the client themself may not set them.
  if v_directive_changed and not public.is_coach_on_client(new.user_id) then
    raise exception 'Only a coach may set the directive.' using errcode = '42501';
  end if;
  if v_goals_changed and not public.is_coach_on_client(new.user_id) then
    raise exception 'Only a coach may set goals.' using errcode = '42501';
  end if;

  -- The client editing their OWN training/nutrition is fine.
  if v_uid = new.user_id then
    return new;
  end if;

  if v_training_changed and not public.is_discipline_coach_on_client(new.user_id, 'trainer') then
    raise exception 'Only the client''s trainer can change the training program.'
      using errcode = '42501';
  end if;
  if v_nutrition_changed and not public.is_discipline_coach_on_client(new.user_id, 'nutritionist') then
    raise exception 'Only the client''s nutritionist can change the nutrition program.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

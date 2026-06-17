-- Program detail/phase write-scope by discipline.
--
-- client_programs holds per-client program state: training_phase, nutrition_phase
-- and a detail jsonb with { training:{…}, nutrition:{…}, goals:[…] }. The coach
-- RLS (2026-06-04) lets ANY coach on the client (is_coach_on_client, not
-- discipline-scoped) write the whole row — so a trainer could rewrite the
-- nutrition phase/section and a nutritionist the training side. The discipline
-- split was only enforced client-side (the merge in ShapeProgramApi.set + which
-- UI calls it). This makes it real:
--
--   1. set_program_detail(client, discipline, phase, detail) — the sanctioned
--      write path. SECURITY DEFINER, authorizes self OR the matching-discipline
--      coach, and writes ONLY that discipline's phase column + detail section
--      (merging over what's stored, never touching the other discipline).
--   2. A BEFORE INSERT/UPDATE trigger that enforces the same rule on ANY write
--      (covers the direct-Supabase upsert path too): a coach changing the
--      training section must be the client's trainer; changing nutrition must be
--      the nutritionist. The client (self) and goal-only writes (detail.goals,
--      coach-set by either discipline — still gated by is_coach_on_client via the
--      existing RLS) are unaffected.
--
-- Reuses is_discipline_coach_on_client (2026-06-17-coach-write-scope.sql).
-- Idempotent. Safe to re-run.

-- ===== the sanctioned discipline-split writer =====
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
  v_detail jsonb;
begin
  if v_role is null then
    raise exception 'invalid discipline %, expected training or nutrition', p_discipline
      using errcode = '22023';
  end if;
  if not (auth.uid() = p_client_id or public.is_discipline_coach_on_client(p_client_id, v_role)) then
    raise exception 'Not authorized to set the % program for this client.', p_discipline
      using errcode = '42501';
  end if;

  select * into v_row from public.client_programs where user_id = p_client_id;
  v_detail := coalesce(v_row.detail, '{}'::jsonb);
  if p_detail is not null then
    -- shallow-merge the incoming section over the stored one; leave the other
    -- discipline (and goals) exactly as they are.
    v_detail := jsonb_set(
      v_detail,
      array[p_discipline],
      coalesce(v_detail -> p_discipline, '{}'::jsonb) || p_detail,
      true
    );
  end if;

  insert into public.client_programs as cp (user_id, training_phase, nutrition_phase, detail, updated_by, updated_at)
  values (
    p_client_id,
    case when p_discipline = 'training'  then coalesce(p_phase, v_row.training_phase)  else v_row.training_phase  end,
    case when p_discipline = 'nutrition' then coalesce(p_phase, v_row.nutrition_phase) else v_row.nutrition_phase end,
    v_detail, auth.uid(), now()
  )
  on conflict (user_id) do update set
    training_phase  = excluded.training_phase,
    nutrition_phase = excluded.nutrition_phase,
    detail          = excluded.detail,
    updated_by      = excluded.updated_by,
    updated_at      = excluded.updated_at
  returning * into v_row;

  return jsonb_build_object(
    'trainingPhase', v_row.training_phase,
    'nutritionPhase', v_row.nutrition_phase,
    'detail', v_row.detail
  );
end;
$$;

grant execute on function public.set_program_detail(uuid, text, text, jsonb) to authenticated;

-- ===== discipline-enforcement trigger (covers the direct-write path) =====
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
begin
  -- The client editing their own row, or a non-request context (no JWT), is fine.
  if v_uid is null or v_uid = new.user_id then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_training_changed  := (new.training_phase is not null) or (new.detail ? 'training');
    v_nutrition_changed := (new.nutrition_phase is not null) or (new.detail ? 'nutrition');
  else
    v_training_changed  := (new.training_phase  is distinct from old.training_phase)
                           or ((new.detail -> 'training')  is distinct from (old.detail -> 'training'));
    v_nutrition_changed := (new.nutrition_phase is distinct from old.nutrition_phase)
                           or ((new.detail -> 'nutrition') is distinct from (old.detail -> 'nutrition'));
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

drop trigger if exists client_programs_discipline_guard on public.client_programs;
create trigger client_programs_discipline_guard
  before insert or update on public.client_programs
  for each row execute function public.client_programs_discipline_guard();

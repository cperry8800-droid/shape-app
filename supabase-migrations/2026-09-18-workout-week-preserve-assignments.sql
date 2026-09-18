-- Preserve assignment identity when publishing a merged week. Run after
-- 2026-08-01-client-schedule-serialize.sql and 2026-09-18-workout-session-atomic-save.sql.
-- Idempotent. The service-only signature and existing guardrail boundary stay intact.
-- Deploy before the server that sends assignmentId / expectedAssignments metadata.
begin;

create or replace function public.publish_client_week(
  p_coach_user_id uuid,
  p_idempotency_key uuid,
  p_client_id uuid,
  p_week_start date,
  p_request_hash text,
  p_outcome jsonb,
  p_rows jsonb default '[]',
  p_ack jsonb default null,
  p_expected_row_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainer_id bigint;
  v_existing public.coach_week_publishes%rowtype;
  v_assignment public.client_workouts%rowtype;
  v_row jsonb;
  v_sched date;
  v_title text;
  v_description text;
  v_kind text;
  v_payload jsonb;
  v_assignment_id uuid;
  v_used_ids uuid[] := '{}';
  v_current_ids uuid[];
  v_expected_ids uuid[];
  v_current_snapshot jsonb;
  v_expected_snapshot jsonb;
  v_inserted int := 0;
  v_updated int := 0;
  v_deleted int := 0;
  v_preserved int := 0;
  v_audited boolean := false;
begin
  if p_coach_user_id is null then
    raise exception 'coach is required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_client_id is null or p_week_start is null
      or nullif(trim(p_request_hash), '') is null then
    raise exception 'idempotency key, client, week and request hash are required' using errcode = '22023';
  end if;
  select t.id into v_trainer_id
    from public.subscriptions s join public.trainers t on t.id = s.provider_id
   where s.client_id = p_client_id and s.status in ('active', 'trialing')
     and s.provider_role = 'trainer' and t.owner_id = p_coach_user_id
   limit 1;
  if v_trainer_id is null then
    raise exception 'not this client''s training coach' using errcode = '42501';
  end if;

  -- The same client-wide lock as regenerate_client_workouts, before row locks.
  perform pg_advisory_xact_lock(hashtext('shape_client_schedule'), hashtext(p_client_id::text));
  select * into v_existing from public.coach_week_publishes
   where idempotency_key = p_idempotency_key and client_id = p_client_id;
  if found then
    if v_existing.coach_user_id is distinct from p_coach_user_id then
      raise exception 'idempotency key belongs to another coach' using errcode = '42501';
    end if;
    if v_existing.request_hash is distinct from p_request_hash then
      raise exception 'idempotency key reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'already_delivered', 'outcome', v_existing.outcome);
  end if;
  if jsonb_typeof(coalesce(p_rows, '[]')) <> 'array'
      or jsonb_array_length(coalesce(p_rows, '[]')) > 40 then
    raise exception 'invalid week size' using errcode = '22023';
  end if;

  -- save_workout_session takes this same row lock before inserting its log.
  -- Check logs in a LATER statement so a saver that held the lock first has
  -- committed and is visible under READ COMMITTED. FK inserts also take a
  -- conflicting key-share lock. Stable ordering avoids multi-row deadlocks.
  perform cw.id from public.client_workouts cw
   where cw.client_id = p_client_id and cw.trainer_id = v_trainer_id
     and cw.status = 'published'
     and cw.scheduled_date between p_week_start and (p_week_start + 6)
   order by cw.id for update;

  if p_expected_row_ids is not null then
    select coalesce(array_agg(cw.id order by cw.id), '{}'::uuid[]),
      coalesce(jsonb_agg(jsonb_build_object('id', cw.id, 'title', cw.title,
        'description', cw.description, 'kind', cw.kind, 'scheduled_date', cw.scheduled_date,
        'payload', cw.payload) order by cw.id), '[]'::jsonb)
      into v_current_ids, v_current_snapshot
      from public.client_workouts cw
     where cw.client_id = p_client_id and cw.trainer_id = v_trainer_id
       and cw.status = 'published'
       and cw.scheduled_date between p_week_start and (p_week_start + 6);
    select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
      into v_expected_ids from unnest(p_expected_row_ids) as x;
    if v_current_ids is distinct from v_expected_ids then
      raise exception 'the week changed since it was read' using errcode = '40001';
    end if;
    -- IDs alone no longer detect a changed prescription because updates keep
    -- those IDs. The scoped server read supplies the complete content snapshot.
    if jsonb_typeof(p_rows -> 0 -> 'expectedAssignments') is distinct from 'array' then
      raise exception 'a merged week requires its read snapshot' using errcode = '40001';
    end if;
    select coalesce(jsonb_agg(x order by (x ->> 'id')::uuid), '[]'::jsonb)
      into v_expected_snapshot from jsonb_array_elements(p_rows -> 0 -> 'expectedAssignments') x;
    if v_current_snapshot is distinct from v_expected_snapshot then
      raise exception 'the week content changed since it was read' using errcode = '40001';
    end if;
  end if;

  begin
    insert into public.coach_week_publishes
      (idempotency_key, client_id, coach_user_id, week_start, request_hash, outcome)
    values (p_idempotency_key, p_client_id, p_coach_user_id, p_week_start, p_request_hash, p_outcome);
  exception when unique_violation then
    select * into v_existing from public.coach_week_publishes
     where idempotency_key = p_idempotency_key and client_id = p_client_id;
    if v_existing.request_hash is distinct from p_request_hash
       or v_existing.coach_user_id is distinct from p_coach_user_id then
      raise exception 'idempotency key reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'already_delivered', 'outcome', v_existing.outcome);
  end;
  perform set_config('shape.adjust_regen', '1', true);

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    v_sched := (v_row ->> 'scheduled_date')::date;
    if v_sched is null or v_sched < p_week_start or v_sched > (p_week_start + 6) then
      raise exception 'every session needs a date in the submitted week' using errcode = '22023';
    end if;
    if v_sched < current_date then
      raise exception 'cannot publish into the past' using errcode = '22023';
    end if;
    v_title := coalesce(nullif(trim(v_row ->> 'title'), ''), 'Workout');
    v_description := v_row ->> 'description';
    v_kind := case when v_row ->> 'kind' = 'template' then 'template' else 'custom' end;
    v_payload := coalesce(v_row -> 'payload', '{}'::jsonb);
    v_assignment_id := null;

    if nullif(v_row ->> 'assignmentId', '') is not null then
      v_assignment_id := (v_row ->> 'assignmentId')::uuid;
      select * into v_assignment from public.client_workouts cw
       where cw.id = v_assignment_id and cw.client_id = p_client_id
         and cw.trainer_id = v_trainer_id and cw.status = 'published'
         and cw.scheduled_date between p_week_start and (p_week_start + 6)
         and cw.scheduled_date >= current_date;
      if not found or v_assignment_id = any(v_used_ids) then
        raise exception 'the bound assignment changed or was repeated' using errcode = '40001';
      end if;
    else
      -- Whole-week authors do not read-merge. Reuse exact assignments first,
      -- then the same canonical template day or legacy same-day/title slot.
      select * into v_assignment from public.client_workouts cw
       where cw.client_id = p_client_id and cw.trainer_id = v_trainer_id
         and cw.status = 'published' and cw.scheduled_date = v_sched
         and not (cw.id = any(v_used_ids)) and (
           (cw.title = v_title and cw.description is not distinct from v_description
             and cw.kind = v_kind and cw.payload = v_payload)
           or (cw.payload #>> '{template,id}' = v_payload #>> '{template,id}' and (
             (cw.payload #>> '{template,dayId}' = v_payload #>> '{template,dayId}'
               and cw.payload #> '{template,week}' = v_payload #> '{template,week}')
             or (cw.payload #>> '{template,dayId}' is null
               and v_payload #>> '{template,dayId}' is null
               and cw.payload #> '{template,week}' = v_payload #> '{template,week}'
               and cw.payload #> '{template,day}' = v_payload #> '{template,day}')))
           or (cw.title = v_title and cw.payload #>> '{template,id}' is null
             and v_payload #>> '{template,id}' is null))
       order by (cw.title = v_title and cw.description is not distinct from v_description
         and cw.kind = v_kind and cw.payload = v_payload) desc, cw.id limit 1;
      if found then v_assignment_id := v_assignment.id; end if;
    end if;

    if v_assignment_id is not null then
      v_used_ids := array_append(v_used_ids, v_assignment_id);
      if v_assignment.title = v_title and v_assignment.description is not distinct from v_description
          and v_assignment.kind = v_kind and v_assignment.payload = v_payload
          and v_assignment.scheduled_date = v_sched then
        v_preserved := v_preserved + 1;
        continue;
      end if;
      if exists (select 1 from public.workout_sessions ws where ws.client_workout_id = v_assignment_id) then
        raise exception 'cannot change an assignment that has workout logs' using errcode = '55000';
      end if;
      update public.client_workouts set title = v_title, description = v_description,
        kind = v_kind, payload = v_payload, scheduled_date = v_sched
       where id = v_assignment_id;
      v_updated := v_updated + 1;
    else
      insert into public.client_workouts
        (trainer_id, client_id, title, description, kind, payload, scheduled_date, status)
      values (v_trainer_id, p_client_id, v_title, v_description, v_kind, v_payload, v_sched, 'published')
      returning id into v_assignment_id;
      v_used_ids := array_append(v_used_ids, v_assignment_id);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- Explicit whole-week removal hides omitted rows from the published schedule.
  -- Archive rather than delete: an offline client draft may still need this
  -- assignment ID when it finishes. Logged assignments remain unchanged.
  -- Merged requests carry every row and never remove an unrelated assignment.
  update public.client_workouts cw set status = 'archived'
   where cw.client_id = p_client_id and cw.trainer_id = v_trainer_id and cw.status = 'published'
     and cw.scheduled_date between p_week_start and (p_week_start + 6)
     and cw.scheduled_date >= current_date and not (cw.id = any(v_used_ids))
     and not exists (select 1 from public.workout_sessions ws where ws.client_workout_id = cw.id);
  get diagnostics v_deleted = row_count;

  if v_inserted + v_updated > 0 then
    insert into public.notifications (user_id, type, title, body, route, data)
    values (p_client_id, 'workout', 'Your week from your coach',
      (v_inserted + v_updated) || ' sessions updated for the week of ' || to_char(p_week_start, 'Mon DD'),
      'train', jsonb_build_object('weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'),
        'sessions', v_inserted + v_updated));
  end if;
  if p_ack is not null and jsonb_typeof(p_ack) = 'object' then
    insert into public.ai_audit_log (actor_user_id, actor_role, source, action,
      target_user_id, target_kind, target_id, suggestion, confirmed_payload, before_state, after_state)
    values (p_coach_user_id, 'trainer', 'engine', 'guardrail_red_ack', p_client_id,
      'training_week', to_char(p_week_start, 'YYYY-MM-DD'), p_ack -> 'suggestion',
      jsonb_build_object('acknowledged', true) || coalesce(p_ack -> 'acknowledgment', '{}'::jsonb),
      jsonb_build_object('weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'), 'replaced', v_deleted + v_updated),
      jsonb_build_object('weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'),
        'sessions', v_inserted + v_updated + v_preserved));
    v_audited := true;
  end if;
  return jsonb_build_object('status', 'accepted', 'outcome', p_outcome,
    'inserted', v_inserted, 'replaced', v_deleted + v_updated,
    'preserved', v_preserved, 'updated', v_updated, 'audited', v_audited);
end;
$$;

revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) to service_role;

-- Adjust is the other schedule writer. Keep retired assignment rows addressable
-- so paused sessions, delayed saves, and existing logs retain their ownership
-- reference. The legacy `deleted` response/audit count means rows retired.
create or replace function public.regenerate_client_workouts(
  p_coach_user_id uuid,
  p_client_id uuid,
  p_delete_ids uuid[] default '{}',
  p_inserts jsonb default '[]',
  p_repeat_patches jsonb default '[]',
  p_ack jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_trainer_id bigint;
  v_expected int;
  v_found int;
  v_ins jsonb;
  v_patch jsonb;
  v_title text;
  v_sched date;
  v_dow jsonb;
  v_inserted int := 0;
  v_patched int := 0;
  v_deleted int := 0;
  v_audited boolean := false;
begin
  if p_coach_user_id is null then
    raise exception 'coach identity required' using errcode = '42501';
  end if;
  select t.id into v_trainer_id
  from public.subscriptions s join public.trainers t on t.id = s.provider_id
  where s.client_id = p_client_id and s.provider_role = 'trainer'
    and s.status in ('active', 'trialing') and t.owner_id = p_coach_user_id limit 1;
  if v_trainer_id is null then
    raise exception 'not this client''s training coach' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('shape_client_schedule'), hashtext(p_client_id::text));
  if coalesce(array_length(p_delete_ids, 1), 0) > 400
     or jsonb_array_length(coalesce(p_inserts, '[]')) > 200
     or jsonb_array_length(coalesce(p_repeat_patches, '[]')) > 50 then
    raise exception 'regeneration set too large' using errcode = '22023';
  end if;

  -- Lock in the same order as publishing, before any mutation. The atomic
  -- session saver takes these row locks too; retiring never removes the row.
  perform w.id from public.client_workouts w
  where w.client_id = p_client_id and w.trainer_id = v_trainer_id
    and (w.id = any(p_delete_ids) or w.id in (
      select (value->>'id')::uuid from jsonb_array_elements(coalesce(p_repeat_patches, '[]'))
    )) order by w.id for update;
  v_expected := coalesce(array_length(p_delete_ids, 1), 0);
  if v_expected > 0 then
    select count(*) into v_found from public.client_workouts w
    where w.id = any(p_delete_ids) and w.client_id = p_client_id
      and w.trainer_id = v_trainer_id and w.status = 'published'
      and (w.scheduled_date is null or w.scheduled_date > current_date);
    if v_found <> v_expected then
      raise exception 'delete set contains rows outside the regeneration scope' using errcode = '42501';
    end if;
  end if;
  perform set_config('shape.adjust_regen', '1', true);
  for v_ins in select * from jsonb_array_elements(coalesce(p_inserts, '[]')) loop
    v_title := nullif(btrim(coalesce(v_ins->>'title', '')), '');
    if v_title is null then raise exception 'insert missing a title' using errcode = '22023'; end if;
    v_sched := null;
    if coalesce(v_ins->>'scheduled_date', '') <> '' then
      v_sched := (v_ins->>'scheduled_date')::date;
      if v_sched <= current_date then
        raise exception 'inserts must be strictly future-dated' using errcode = '22023';
      end if;
    end if;
    insert into public.client_workouts
      (trainer_id, client_id, title, description, kind, payload, playlist_id, scheduled_date, status)
    values (v_trainer_id, p_client_id, left(v_title, 200), left(coalesce(v_ins->>'description', ''), 2000),
      case when v_ins->>'kind' = 'template' then 'template' else 'custom' end,
      coalesce(v_ins->'payload', '{}'::jsonb), nullif(v_ins->>'playlist_id', '')::uuid, v_sched, 'published');
    v_inserted := v_inserted + 1;
  end loop;
  for v_patch in select * from jsonb_array_elements(coalesce(p_repeat_patches, '[]')) loop
    v_dow := coalesce(v_patch->'repeatDow', '[]'::jsonb);
    if jsonb_typeof(v_dow) <> 'array' then
      raise exception 'repeat patch needs a repeatDow array' using errcode = '22023';
    end if;
    update public.client_workouts w
      set payload = jsonb_set(coalesce(w.payload, '{}'::jsonb), '{repeatDow}', v_dow)
    where w.id = (v_patch->>'id')::uuid and w.client_id = p_client_id
      and w.trainer_id = v_trainer_id and w.scheduled_date is null and w.status = 'published';
    if not found then
      raise exception 'repeat patch targets a row outside the regeneration scope' using errcode = '42501';
    end if;
    v_patched := v_patched + 1;
  end loop;
  if v_expected > 0 then
    update public.client_workouts w set status = 'archived'
    where w.id = any(p_delete_ids) and w.client_id = p_client_id
      and w.trainer_id = v_trainer_id and w.status = 'published';
    get diagnostics v_deleted = row_count;
    if v_deleted <> v_expected then
      raise exception 'the plan changed since it was read' using errcode = '40001';
    end if;
  end if;
  if p_ack is not null and jsonb_typeof(p_ack) = 'object' then
    insert into public.ai_audit_log (
      actor_user_id, actor_role, source, action, target_user_id, target_kind, target_id,
      suggestion, confirmed_payload, before_state, after_state
    ) values (
      p_coach_user_id, 'trainer', 'engine', 'guardrail_red_ack', p_client_id, 'training_regeneration',
      nullif(btrim(coalesce(p_ack->>'weekStartISO', '')), ''), p_ack -> 'suggestion',
      jsonb_build_object('acknowledged', true) || coalesce(p_ack -> 'acknowledgment', '{}'::jsonb),
      jsonb_build_object('weeks', coalesce(p_ack -> 'weeks', '[]'::jsonb),
        'adjustMode', p_ack ->> 'adjustMode', 'deleteCount', v_expected),
      jsonb_build_object('inserted', v_inserted, 'patched', v_patched, 'deleted', v_deleted)
    );
    v_audited := true;
  end if;
  return jsonb_build_object('inserted', v_inserted, 'patched', v_patched,
    'deleted', v_deleted, 'audited', v_audited);
end;
$$;
revoke execute on function public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb) to service_role;
commit;

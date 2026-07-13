-- Adjust → full program regeneration (spec #1707,
-- docs/superpowers/specs/2026-07-13-adjust-regeneration-design.md).
--
-- 1. regenerate_client_workouts(p_client_id, p_delete_ids, p_inserts,
--    p_repeat_patches) — SECURITY DEFINER. The coach Adjust page's Apply calls
--    this ONCE per regeneration so the deletes + inserts + repeat patches
--    commit in a single transaction (separate client-side legs could strand
--    BOTH the old and the new plan when one leg fails — the spec's "no
--    duplicates on failure" needs a real transaction). The body is the guard:
--      · caller must be the client's active TRAINING coach
--        (is_discipline_coach_on_client(p_client_id, 'trainer'))
--      · every delete/patch id must belong to the CALLER's own trainer row,
--        this client, and be strictly future-dated (or an undated repeat) —
--        today's row (possibly in progress / already logged) is untouchable
--      · inserts are FORCED onto the caller's trainer row + this client
--        (client-supplied trainer/client ids are never trusted) and must be
--        strictly future-dated or undated
--    Sets the transaction-local shape.adjust_regen flag so the per-row
--    "New workout from your coach" trigger stays quiet — the coach's ONE
--    adjustment note (the existing DM) is the only client-facing message.
--
-- 2. notify_on_client_workout() — amended (otherwise VERBATIM from
--    2026-07-08-self-authored-workouts.sql) to skip while shape.adjust_regen
--    is set.
--
-- Idempotent (create or replace). EXECUTE revoked from PUBLIC and anon and
-- re-granted to authenticated only — a bare `revoke from public` is NOT
-- enough under Supabase's default grants (the #1459 lesson).

create or replace function public.regenerate_client_workouts(
  p_client_id uuid,
  p_delete_ids uuid[] default '{}',
  p_inserts jsonb default '[]',
  p_repeat_patches jsonb default '[]'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_discipline_coach_on_client(p_client_id, 'trainer') then
    raise exception 'not this client''s training coach' using errcode = '42501';
  end if;
  select t.id into v_trainer_id from public.trainers t where t.owner_id = v_uid limit 1;
  if v_trainer_id is null then
    raise exception 'no trainer profile for this account' using errcode = '42501';
  end if;

  -- Bounds: deletes match the client's 400-row read (every survivor's old id
  -- lands here, so the delete leg legitimately outnumbers the inserts);
  -- inserts stay at the Assign flow's materialization cap.
  if coalesce(array_length(p_delete_ids, 1), 0) > 400
     or jsonb_array_length(coalesce(p_inserts, '[]')) > 200
     or jsonb_array_length(coalesce(p_repeat_patches, '[]')) > 50 then
    raise exception 'regeneration set too large' using errcode = '22023';
  end if;

  -- Every delete id must be the caller's own row, this client, and strictly
  -- future-dated or an undated repeat. A single foreign/backdated id aborts
  -- the whole call — never a partial regeneration.
  v_expected := coalesce(array_length(p_delete_ids, 1), 0);
  if v_expected > 0 then
    select count(*) into v_found
    from public.client_workouts w
    where w.id = any(p_delete_ids)
      and w.client_id = p_client_id
      and w.trainer_id = v_trainer_id
      and (w.scheduled_date is null or w.scheduled_date > current_date);
    if v_found <> v_expected then
      raise exception 'delete set contains rows outside the regeneration scope' using errcode = '42501';
    end if;
  end if;

  -- Quiet the per-row assignment notification for this transaction only.
  perform set_config('shape.adjust_regen', '1', true);

  -- Inserts first (atomic-in-effect ordering; the transaction makes it moot,
  -- but keep the spec's land-then-retire order for readability).
  for v_ins in select * from jsonb_array_elements(coalesce(p_inserts, '[]'))
  loop
    v_title := nullif(btrim(coalesce(v_ins->>'title', '')), '');
    if v_title is null then
      raise exception 'insert missing a title' using errcode = '22023';
    end if;
    v_sched := null;
    if coalesce(v_ins->>'scheduled_date', '') <> '' then
      v_sched := (v_ins->>'scheduled_date')::date;
      if v_sched <= current_date then
        raise exception 'inserts must be strictly future-dated' using errcode = '22023';
      end if;
    end if;
    insert into public.client_workouts
      (trainer_id, client_id, title, description, kind, payload, playlist_id, scheduled_date, status)
    values
      (v_trainer_id,
       p_client_id,
       left(v_title, 200),
       left(coalesce(v_ins->>'description', ''), 2000),
       case when v_ins->>'kind' = 'template' then 'template' else 'custom' end,
       coalesce(v_ins->'payload', '{}'::jsonb),
       nullif(v_ins->>'playlist_id', '')::uuid,
       v_sched,
       'published');
    v_inserted := v_inserted + 1;
  end loop;

  -- Repeat patches: rewrite an undated weekly-repeat row's repeatDow so a
  -- coach-set rest weekday can never be re-materialized.
  for v_patch in select * from jsonb_array_elements(coalesce(p_repeat_patches, '[]'))
  loop
    v_dow := coalesce(v_patch->'repeatDow', '[]'::jsonb);
    if jsonb_typeof(v_dow) <> 'array' then
      raise exception 'repeat patch needs a repeatDow array' using errcode = '22023';
    end if;
    update public.client_workouts w
      set payload = jsonb_set(coalesce(w.payload, '{}'::jsonb), '{repeatDow}', v_dow)
    where w.id = (v_patch->>'id')::uuid
      and w.client_id = p_client_id
      and w.trainer_id = v_trainer_id
      and w.scheduled_date is null;
    if not found then
      raise exception 'repeat patch targets a row outside the regeneration scope' using errcode = '42501';
    end if;
    v_patched := v_patched + 1;
  end loop;

  -- Retire the superseded rows (validated above).
  if v_expected > 0 then
    delete from public.client_workouts w where w.id = any(p_delete_ids);
    get diagnostics v_deleted = row_count;
  end if;

  return jsonb_build_object('inserted', v_inserted, 'patched', v_patched, 'deleted', v_deleted);
end;
$$;

revoke execute on function public.regenerate_client_workouts(uuid, uuid[], jsonb, jsonb) from public;
revoke execute on function public.regenerate_client_workouts(uuid, uuid[], jsonb, jsonb) from anon;
grant execute on function public.regenerate_client_workouts(uuid, uuid[], jsonb, jsonb) to authenticated;

-- ── The notify trigger learns to stay quiet during a regeneration ───────────
-- VERBATIM from 2026-07-08-self-authored-workouts.sql plus only the
-- shape.adjust_regen early-return. The client_workouts_notify trigger keeps
-- pointing at this function.
create or replace function public.notify_on_client_workout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'published' then
    return new;
  end if;
  -- Self-authored rows (no coach) must not fire the coach-content notification.
  if new.trainer_id is null then
    return new;
  end if;
  -- An Adjust regeneration rewrites a block of rows in one transaction — the
  -- coach's single note is the client-facing message, not one notification
  -- per regenerated row.
  if coalesce(current_setting('shape.adjust_regen', true), '') = '1' then
    return new;
  end if;
  insert into public.notifications (user_id, type, title, body, route, data)
  values (new.client_id, 'workout', 'New workout from your coach',
          coalesce(new.title, ''), 'train', jsonb_build_object('workoutId', new.id));
  return new;
end;
$$;

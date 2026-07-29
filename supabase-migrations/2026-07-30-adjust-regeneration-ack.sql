-- Deploy 2b — the Adjust regeneration carries its acknowledgment IN-TRANSACTION.
--
-- SPEC-guardrails.md §9.4: "regeneration producing a red week is handled by the
-- same acknowledgment path". §10.1 makes `ai_audit_log` authoritative for
-- anything coach-facing, and `publish_client_week` already honours that by
-- taking `p_ack` and writing the audit row inside the publish transaction:
-- there is no published week without its audit entry.
--
-- `regenerate_client_workouts` had no such argument, so an overridden red on
-- Adjust could only be audited from the route BEFORE the RPC (recording an
-- override that might then fail to land) or AFTER it (a crash in between leaves
-- an overridden red written with NO record that anyone overrode it — precisely
-- what §10.1 forbids). Owner ruling 2026-07-29: neither. The wave's whole value
-- is ONE gate with ONE set of rules, and two gated paths with different audit
-- guarantees is exactly the drift this codebase keeps paying for.
--
-- ⚠ WHY A DROP AND RECREATE, NOT `create or replace`. All four existing
-- parameters are defaulted. Adding a fifth produces a DIFFERENT signature, so
-- `create or replace` would leave the 4-arg function in place and create a
-- second, 5-arg one beside it — two overloads, and a call naming only the
-- shared four becomes ambiguous (42725). The old signature must go first.
--
-- ⚠ DROPPING A FUNCTION DROPS ITS GRANTS. The revoke/grant block below is not
-- ceremonial: without it the recreated function falls back to Supabase's
-- default grants and `anon` regains EXECUTE (the #1459 lesson).
--
-- ⚠ RUN ORDER: apply `2026-07-29-guardrail-week-publish.sql` FIRST. The two are
-- independent at the database level — this one touches only
-- `regenerate_client_workouts` and `ai_audit_log` — but the Adjust route needs
-- both, and the week boundary is the wave's primary path.
--
-- ⚠ BACKWARD COMPATIBILITY ACROSS THE RECREATE — verified, and it matters
-- because the shipped mobile Adjust path calls this function live:
--   · `p_ack` is DEFAULTED, so an existing 4-named-argument call still resolves
--     and behaves exactly as before (no ack, no audit row, same return keys plus
--     `audited:false`).
--   · The drop and the create run in ONE transaction, so there is no instant at
--     which the function is missing.
--   · The one real window is PostgREST's schema cache reloading after the DDL.
--     During it a call can return PGRST202/42883 — which `applyAdjustRegeneration`
--     ALREADY handles by degrading to detail+note rather than erroring. That is
--     the honest failure mode, and it self-heals on reload.

begin;

drop function if exists public.regenerate_client_workouts(uuid, uuid[], jsonb, jsonb);

create function public.regenerate_client_workouts(
  p_client_id uuid,
  p_delete_ids uuid[] default '{}',
  p_inserts jsonb default '[]',
  p_repeat_patches jsonb default '[]',
  p_ack jsonb default null
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
  v_audited boolean := false;
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

  -- §10.1 — THE ACKNOWLEDGMENT RIDES IN THIS TRANSACTION.
  -- The regeneration's rows and the record of who overrode the red commit or
  -- roll back together: there is no regeneration without its audit entry.
  --
  -- Written directly rather than via log_ai_action for the same reason
  -- publish_client_week does: ai_audit_log has no INSERT policy by design, and
  -- this function is SECURITY DEFINER, so the write is reachable only from here.
  -- Unlike publish_client_week (service-role, coach passed explicitly) this
  -- function runs on the CALLER's connection, so auth.uid() is the coach — the
  -- same identity the guards above already validated.
  --
  -- ONE row per regeneration, not one per week: the coach performed ONE
  -- acknowledgment. `target_id` is the week they acknowledged (the earliest
  -- blocking one, which is what the interstitial showed them); `before_state`
  -- carries every week the regeneration touched, so the record still describes
  -- the full scope of what the override let through.
  if p_ack is not null and jsonb_typeof(p_ack) = 'object' then
    insert into public.ai_audit_log (
      actor_user_id, actor_role, source, action,
      target_user_id, target_kind, target_id,
      suggestion, confirmed_payload, before_state, after_state
    ) values (
      v_uid, 'trainer', 'engine', 'guardrail_red_ack',
      p_client_id, 'training_regeneration',
      nullif(btrim(coalesce(p_ack->>'weekStartISO', '')), ''),
      p_ack -> 'suggestion',
      jsonb_build_object('acknowledged', true) || coalesce(p_ack -> 'acknowledgment', '{}'::jsonb),
      jsonb_build_object(
        'weeks', coalesce(p_ack -> 'weeks', '[]'::jsonb),
        'adjustMode', p_ack ->> 'adjustMode',
        'deleteCount', v_expected
      ),
      jsonb_build_object('inserted', v_inserted, 'patched', v_patched, 'deleted', v_deleted)
    );
    v_audited := true;
  end if;

  return jsonb_build_object(
    'inserted', v_inserted,
    'patched', v_patched,
    'deleted', v_deleted,
    'audited', v_audited
  );
end;
$$;

-- Grants are recreated from scratch — the drop took the old ones with it.
revoke execute on function public.regenerate_client_workouts(uuid, uuid[], jsonb, jsonb, jsonb) from public;
revoke execute on function public.regenerate_client_workouts(uuid, uuid[], jsonb, jsonb, jsonb) from anon;
grant execute on function public.regenerate_client_workouts(uuid, uuid[], jsonb, jsonb, jsonb) to authenticated;

-- Fail the migration rather than leave a silently wrong deployment: exactly one
-- overload must survive, and it must be the 5-argument one.
do $$
declare v_count int;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'regenerate_client_workouts';
  if v_count <> 1 then
    raise exception 'expected exactly 1 regenerate_client_workouts, found %', v_count;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'regenerate_client_workouts'
      and pg_get_function_identity_arguments(p.oid)
          = 'p_client_id uuid, p_delete_ids uuid[], p_inserts jsonb, p_repeat_patches jsonb, p_ack jsonb'
  ) then
    raise exception 'regenerate_client_workouts does not carry the p_ack signature';
  end if;

  if has_function_privilege('anon', 'public.regenerate_client_workouts(uuid, uuid[], jsonb, jsonb, jsonb)', 'EXECUTE') then
    raise exception 'anon regained EXECUTE on regenerate_client_workouts';
  end if;
end $$;

commit;

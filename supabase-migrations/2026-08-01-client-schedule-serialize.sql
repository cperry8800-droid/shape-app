-- Deploy 2b - BOTH writers of a client's schedule serialize on ONE lock.
--
-- SPEC-guardrails.md 9.4. Idempotent; safe to re-run. Run AFTER
-- 2026-07-31-week-publish-serialize.sql and 2026-07-30-adjust-regeneration-ack.sql
-- - it REPLACES the functions those create, at the same signatures, so there is
-- no overload to drop and nothing else in the wave changes.
--
-- WARNING: A LOCK ONLY ONE WRITER TAKES IS NOT A LOCK.
--
-- 2026-07-31 gave `publish_client_week` a transaction-scoped advisory lock over
-- (client, week) and closed the publish-vs-publish lost update. It left the
-- sibling writer - `regenerate_client_workouts`, the Adjust apply - taking no
-- lock at all, so the two never conflicted with each other.
--
-- Two silent corruptions followed from that, and neither raises:
--
--   1. Two Adjust applies for one client both validate the same delete set
--      against a pre-commit snapshot, both pass, and the second deletes zero
--      rows without aborting - leaving BOTH replacement programs committed.
--   2. An Adjust apply commits inside the window between a publish's
--      precondition comparison and its replacement, so one of the two writes is
--      wiped or duplicated purely on statement timing.
--
-- The remedy is one key both functions take, before they read anything they
-- intend to write. It is keyed on the CLIENT rather than the client-week
-- because a regeneration spans many weeks plus undated weekly-repeat rows and
-- has no single week to name; the widening subsumes the old guarantee and costs
-- only that two weeks of one client publish in sequence.
--
-- The regeneration also gains a delete-rowcount precondition, so if the
-- serialization is ever bypassed the transaction fails loudly instead of
-- doubling a program.
--
-- Found by review (Codex, 2026-07-30) on the head that shipped the publish lock.
-- Nothing else in either function body changes.

begin;

create or replace function public.publish_client_week(
  p_coach_user_id   uuid,
  p_idempotency_key uuid,
  p_client_id       uuid,
  p_week_start      date,
  p_request_hash    text,
  p_outcome         jsonb,
  p_rows            jsonb default '[]',
  p_ack             jsonb default null,
  p_expected_row_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_trainer_id bigint;
  v_existing   public.coach_week_publishes%rowtype;
  v_row        jsonb;
  v_sched      date;
  v_inserted   int := 0;
  v_deleted    int := 0;
  v_audited    boolean := false;
  v_current_ids  uuid[];
  v_expected_ids uuid[];
begin
  if p_coach_user_id is null then
    raise exception 'coach is required' using errcode = '42501';
  end if;
  if p_idempotency_key is null or p_client_id is null or p_week_start is null then
    raise exception 'idempotency key, client and week are required' using errcode = '22023';
  end if;

  -- (4) The originating-coach scope. Checked BEFORE the ledger read so a
  -- different account replaying a queued payload is REJECTED rather than served
  -- the original coach's outcome.
  select t.id into v_trainer_id
    from public.subscriptions s
    join public.trainers t on t.id = s.provider_id
   where s.client_id = p_client_id
     and s.status in ('active', 'trialing')
     and s.provider_role = 'trainer'
     and t.owner_id = p_coach_user_id
   limit 1;
  if v_trainer_id is null then
    raise exception 'not this client''s training coach' using errcode = '42501';
  end if;

  -- WARNING: THE PRECONDITION ALONE DOES NOT CLOSE THE RACE. SERIALIZE HERE.
  --
  -- Under READ COMMITTED two concurrent publishes compare the expected id set
  -- against a snapshot taken BEFORE either mutates. Both pass, and the later
  -- replace deletes the earlier one's freshly inserted rows. A transaction-scoped
  -- lock is what makes the comparison MEAN something: the second transaction
  -- blocks until the first commits, then its comparison sees the first's rows,
  -- raises 40001, and the route re-reads, re-merges and RE-EVALUATES.
  --
  -- ⚠ THE KEY IS THE CLIENT, NOT THE CLIENT-WEEK, AND THAT WIDENING IS THE POINT.
  --
  -- 2026-07-31 keyed this (client, week), which is exactly right for publish vs
  -- publish and useless against the OTHER writer of these rows.
  -- `regenerate_client_workouts` rewrites a client's whole upcoming program in
  -- one transaction: it spans many weeks AND undated weekly-repeat rows, so
  -- there is no single week key it could take. With the two on different keys
  -- they never conflicted, and an Adjust apply interleaving with a week publish
  -- could leave the client holding BOTH replacement sets, or silently wipe one —
  -- the same lost update the precondition was added to prevent, one writer over.
  --
  -- Widening to the client subsumes the week guarantee (any pair that would have
  -- collided on (client, week) still collides on client) and costs only that two
  -- weeks of one client publish in sequence. The mobile Assign loop already
  -- awaits each week in turn, so in practice it costs nothing at all.
  --
  -- Taken before the replay read so one lock covers every path that can mutate
  -- this client's schedule. Transaction-scoped by construction, so it cannot leak
  -- onto the next statement of a pooled connection.
  perform pg_advisory_xact_lock(
    hashtext('shape_client_schedule'),
    hashtext(p_client_id::text)
  );

  -- (2)+(3) Replay. A completed record wins outright: no re-evaluation, no
  -- second set of rows, and the caller is told it was ALREADY DELIVERED.
  select * into v_existing
  from public.coach_week_publishes
  where idempotency_key = p_idempotency_key and client_id = p_client_id;

  if found then
    if v_existing.coach_user_id <> p_coach_user_id then
      raise exception 'idempotency key belongs to another coach' using errcode = '42501';
    end if;
    if v_existing.request_hash <> p_request_hash then
      -- Same key, different week. NEVER serve the first outcome for the second
      -- body — that would report a week as delivered that was never written.
      raise exception 'idempotency key reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'already_delivered', 'outcome', v_existing.outcome);
  end if;

  -- ⚠ THE PRECONDITION. Checked AFTER the replay branch on purpose: a genuine
  -- replay of a request that already landed must still report already_delivered,
  -- not a conflict — by then the week legitimately no longer matches what that
  -- caller read, because that caller is what changed it.
  --
  -- Compared as a SET over the coach's own published rows across the WHOLE week,
  -- deliberately NOT the delete predicate's future-only slice. Filtering by
  -- current_date here would put this transaction and the caller on two clocks:
  -- near the UTC date boundary they would disagree about whether today's row
  -- counts, and the disagreement would be silent. Comparing the whole week means
  -- any skew raises a conflict, and a conflict retries — it can never drop a row.
  --
  -- Sorted + de-duplicated on both sides so the comparison is about CONTENT, not
  -- about the order or shape the caller happened to send.
  if p_expected_row_ids is not null then
    select coalesce(array_agg(distinct cw.id order by cw.id), '{}'::uuid[])
      into v_current_ids
      from public.client_workouts cw
     where cw.client_id = p_client_id
       and cw.trainer_id = v_trainer_id
       and cw.status = 'published'
       and cw.scheduled_date between p_week_start and (p_week_start + 6);

    select coalesce(array_agg(distinct x order by x), '{}'::uuid[])
      into v_expected_ids
      from unnest(p_expected_row_ids) as x;

    if v_current_ids is distinct from v_expected_ids then
      -- 40001 (serialization_failure) is the honest class: nothing is wrong with
      -- the request, it was simply computed against a week that has since moved.
      -- The caller re-reads, re-merges, re-evaluates and retries.
      raise exception 'the week changed since it was read' using errcode = '40001';
    end if;
  end if;

  -- Bounds. A week cannot legitimately carry more than this; a caller that does
  -- is malformed, not ambitious.
  if jsonb_array_length(coalesce(p_rows, '[]')) > 40 then
    raise exception 'week too large' using errcode = '22023';
  end if;

  -- Claim FIRST, in this transaction. A concurrent drain racing a retry tap
  -- loses the insert and re-reads the winner's outcome below.
  begin
    insert into public.coach_week_publishes
      (idempotency_key, client_id, coach_user_id, week_start, request_hash, outcome)
    values
      (p_idempotency_key, p_client_id, p_coach_user_id, p_week_start, p_request_hash, p_outcome);
  exception when unique_violation then
    select * into v_existing
    from public.coach_week_publishes
    where idempotency_key = p_idempotency_key and client_id = p_client_id;
    if v_existing.request_hash <> p_request_hash or v_existing.coach_user_id <> p_coach_user_id then
      raise exception 'idempotency key reused with different content' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'already_delivered', 'outcome', v_existing.outcome);
  end;

  -- ⚠ ONE PUBLISH IS ONE MESSAGE, NOT ONE PER ROW.
  --
  -- `notify_on_client_workout` fires per INSERTED ROW, and a week-replace
  -- re-inserts every session it carried forward. So a coach assigning ONE
  -- session into a week that already held three sent the client FOUR "New
  -- workout from your coach" notifications — three of them for sessions the
  -- client had already been told about days ago. That is a regression the
  -- week-shaped boundary introduced: before it, one assignment was one insert.
  --
  -- Same remedy as the Adjust regeneration (2026-07-13-adjust-regeneration.sql):
  -- quiet the per-row trigger for this transaction only, then emit ONE summary
  -- after the loop. The GUC is transaction-local (`true`), so it cannot leak to
  -- the next statement on a pooled connection.
  perform set_config('shape.adjust_regen', '1', true);

  -- ⚠ WEEK-REPLACE, NOT APPEND. A week-shaped contract that only ever inserts
  -- duplicates the whole week on republish — and republish is exactly what
  -- Adjust does. Scoped to THIS coach's own published rows, in THIS week, and
  -- NEVER a row already in the past: a past-dated session may already have been
  -- logged against. Same rule, same reason, as regenerate_client_workouts.
  delete from public.client_workouts cw
  where cw.client_id = p_client_id
    and cw.trainer_id = v_trainer_id
    and cw.status = 'published'
    and cw.scheduled_date between p_week_start and (p_week_start + 6)
    and cw.scheduled_date >= current_date;
  get diagnostics v_deleted = row_count;

  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'))
  loop
    v_sched := (v_row ->> 'scheduled_date')::date;
    if v_sched is null then
      raise exception 'every session needs a scheduled date' using errcode = '22023';
    end if;
    if v_sched < p_week_start or v_sched > (p_week_start + 6) then
      raise exception 'session falls outside the submitted week' using errcode = '22023';
    end if;
    if v_sched < current_date then
      raise exception 'cannot publish into the past' using errcode = '22023';
    end if;

    insert into public.client_workouts
      (trainer_id, client_id, title, description, kind, payload, scheduled_date, status)
    values (
      v_trainer_id,
      p_client_id,
      coalesce(nullif(trim(v_row ->> 'title'), ''), 'Workout'),
      coalesce(v_row ->> 'description', ''),
      case when (v_row ->> 'kind') = 'template' then 'template' else 'custom' end,
      coalesce(v_row -> 'payload', '{}'::jsonb),
      v_sched,
      'published'
    );
    v_inserted := v_inserted + 1;
  end loop;

  -- The ONE client-facing message for this publish, replacing the per-row storm
  -- the GUC above suppressed. An exact replay never reaches here (it returned
  -- already_delivered), so this fires only when the week genuinely changed.
  --
  -- A week that lands EMPTY sends nothing, matching what the per-row trigger did
  -- before this migration: a delete fires no insert trigger. Announcing a
  -- cleared week is a product decision, not a bug fix, and is not made here.
  if v_inserted > 0 then
    insert into public.notifications (user_id, type, title, body, route, data)
    values (
      p_client_id,
      'workout',
      'Your week from your coach',
      v_inserted || case when v_inserted = 1 then ' session' else ' sessions' end
        || ' for the week of ' || to_char(p_week_start, 'Mon DD'),
      'train',
      jsonb_build_object(
        'weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'),
        'sessions', v_inserted
      )
    );
  end if;

  -- §10.1 — THE ACKNOWLEDGMENT RIDES IN THIS TRANSACTION.
  -- Writing it from the route after the RPC returned meant a crash, a timeout or
  -- an RLS refusal between the two calls left an overridden red PUBLISHED WITH NO
  -- RECORD THAT ANYONE OVERRODE IT — the one thing §10.1 calls authoritative for
  -- anything legal. Here the ack row and the week's rows commit or roll back
  -- together: there is no publish without its audit entry.
  --
  -- Written directly rather than via log_ai_action, which stamps the actor from
  -- auth.uid() (null on a service-role connection). ai_audit_log has no INSERT
  -- policy by design and this function is SECURITY DEFINER, so the write is
  -- reachable only from here. `replaced`/`sessions` are the RPC's own counts —
  -- the route cannot know them before the delete runs.
  if p_ack is not null and jsonb_typeof(p_ack) = 'object' then
    insert into public.ai_audit_log (
      actor_user_id, actor_role, source, action,
      target_user_id, target_kind, target_id,
      suggestion, confirmed_payload, before_state, after_state
    ) values (
      p_coach_user_id, 'trainer', 'engine', 'guardrail_red_ack',
      p_client_id, 'training_week', to_char(p_week_start, 'YYYY-MM-DD'),
      p_ack -> 'suggestion',
      jsonb_build_object('acknowledged', true) || coalesce(p_ack -> 'acknowledgment', '{}'::jsonb),
      jsonb_build_object('weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'), 'replaced', v_deleted),
      jsonb_build_object('weekStartISO', to_char(p_week_start, 'YYYY-MM-DD'), 'sessions', v_inserted)
    );
    v_audited := true;
  end if;

  return jsonb_build_object(
    'status',   'accepted',
    'outcome',  p_outcome,
    'inserted', v_inserted,
    'replaced', v_deleted,
    'audited',  v_audited
  );
end;
$$;

create or replace function public.regenerate_client_workouts(
  p_coach_user_id uuid,
  p_client_id uuid,
  p_delete_ids uuid[] default '{}',
  p_inserts jsonb default '[]',
  p_repeat_patches jsonb default '[]',
  p_ack jsonb default null
)
returns jsonb
language plpgsql
security definer
-- ⚠ pg_temp MUST BE LISTED (CWE-426). Left out, it is not merely omitted — it is
-- searched FIRST, ahead of even pg_catalog. This body calls unqualified
-- catalog functions (`jsonb_array_elements`, aggregates, operators), so a caller
-- could plant `pg_temp.jsonb_array_elements(jsonb)` and have it run as the
-- function's OWNER. Naming pg_temp last puts it after `public`, where it can
-- shadow nothing. Every table reference in here is already schema-qualified and
-- the grant is service_role-only, so the practical exposure today is small — but
-- it becomes live the moment that grant widens, and `public, pg_temp` is the
-- house pin on every other definer in this wave.
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := p_coach_user_id;
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
    raise exception 'coach identity required' using errcode = '42501';
  end if;

  -- The discipline gate AND the trainer row resolved in ONE join, from the
  -- subscription that actually grants access. `is_discipline_coach_on_client`
  -- cannot be used here: it reads auth.uid(), which is NULL on the service-role
  -- connection this function now runs on, so it would fail OPEN.
  select t.id into v_trainer_id
  from public.subscriptions s
  join public.trainers t on t.id = s.provider_id
  where s.client_id = p_client_id
    and s.provider_role = 'trainer'
    and s.status in ('active', 'trialing')
    and t.owner_id = v_uid
  limit 1;
  if v_trainer_id is null then
    raise exception 'not this client''s training coach' using errcode = '42501';
  end if;

  -- ⚠ THE SAME LOCK `publish_client_week` TAKES. THE SAME KEY, DELIBERATELY.
  --
  -- This function and the week publish are the only two writers of a client's
  -- coach-authored `client_workouts`, and until now only one of them serialized.
  -- Two failure modes, both silent, both live before this line existed:
  --
  --   (a) TWO ADJUST APPLIES. Both validate the same `p_delete_ids` against a
  --       pre-commit snapshot and pass. A inserts its replacement set and deletes
  --       the originals. B inserts ITS replacement set and deletes zero rows —
  --       they are already gone — and commits anyway. The client's program now
  --       holds both regenerations. Neither coach is told.
  --
  --   (b) AN APPLY RACING A WEEK PUBLISH. The publish's precondition is checked
  --       inside its own lock, but a regeneration holding no lock can commit in
  --       the window between that comparison and the replace — so the publish
  --       either sweeps the regeneration away or lands beside it, depending only
  --       on statement timing. Both outcomes are wrong and neither raises.
  --
  -- Taken BEFORE the delete-set validation, so the rows this transaction
  -- validates are the rows it will still be looking at when it deletes them.
  -- One lock, taken first, before any row is touched: no ordering rule to keep
  -- and no deadlock to reason about.
  perform pg_advisory_xact_lock(
    hashtext('shape_client_schedule'),
    hashtext(p_client_id::text)
  );

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
    -- ⚠ THE DELETE IS A PRECONDITION, NOT A CLEANUP.
    --
    -- The lock above makes the double-apply ordering impossible; this check is
    -- what makes the impossibility ENFORCED rather than assumed. A delete that
    -- moves fewer rows than the scope check counted means the world changed
    -- under this transaction — so it rolls back whole (inserts included) and
    -- the caller re-reads and re-plans, rather than committing a replacement
    -- set on top of rows it believed it had retired.
    --
    -- 40001 is the honest class: nothing is wrong with the request, it was
    -- computed against a plan that has since moved.
    if v_deleted <> v_expected then
      raise exception 'the plan changed since it was read' using errcode = '40001';
    end if;
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

-- Grants re-asserted rather than assumed. `create or replace` preserves the
-- existing ACL, but a future bare `create` inherits Supabase's default of
-- EXECUTE to public - and on SECURITY DEFINER functions that take arbitrary
-- rows and a fabricated outcome, that default IS the guardrail bypass
-- (CWE-862). Cheap to restate, catastrophic to omit.
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from public;
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from anon;
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from authenticated;
grant  execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) to service_role;

revoke execute on function public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb) from public;
revoke execute on function public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb) from anon;
revoke execute on function public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb) from authenticated;
grant  execute on function public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb) to service_role;

-- Fail the migration rather than leave a half-serialized deployment.
do $guard$
declare v_count int;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('publish_client_week', 'regenerate_client_workouts');
  if v_count <> 2 then
    raise exception 'expected exactly 2 schedule writers, found % - an ambiguous overload breaks every publish', v_count;
  end if;

  -- WARNING: THE POINT OF THIS MIGRATION, ASSERTED ON BOTH SIDES. A future
  -- `create or replace` that drops the lock from EITHER function re-opens the
  -- race in total silence - the precondition and the rowcount check are both
  -- still there, still comparing, and still passing for both racers, because
  -- they can only compare what their own snapshot shows. There is no runtime
  -- symptom to notice; a coach's program simply doubles or disappears. So the
  -- lock's presence, on both, with the SAME key, is a deployment invariant.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'publish_client_week'
      and pg_get_functiondef(p.oid) like '%hashtext(''shape_client_schedule'')%'
  ) then
    raise exception 'publish_client_week does not take the shared client-schedule lock';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'regenerate_client_workouts'
      and pg_get_functiondef(p.oid) like '%hashtext(''shape_client_schedule'')%'
  ) then
    raise exception 'regenerate_client_workouts does not take the shared client-schedule lock - the Adjust apply is not serialized against the week publish';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'regenerate_client_workouts'
      and pg_get_functiondef(p.oid) like '%v_deleted <> v_expected%'
  ) then
    raise exception 'regenerate_client_workouts does not check its delete rowcount';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'publish_client_week'
      and pg_get_function_identity_arguments(p.oid)
          = 'p_coach_user_id uuid, p_idempotency_key uuid, p_client_id uuid, p_week_start date, p_request_hash text, p_outcome jsonb, p_rows jsonb, p_ack jsonb, p_expected_row_ids uuid[]'
  ) then
    raise exception 'publish_client_week does not carry the p_expected_row_ids signature';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'regenerate_client_workouts'
      and pg_get_function_identity_arguments(p.oid)
          = 'p_coach_user_id uuid, p_client_id uuid, p_delete_ids uuid[], p_inserts jsonb, p_repeat_patches jsonb, p_ack jsonb'
  ) then
    raise exception 'regenerate_client_workouts does not carry the p_coach_user_id + p_ack signature';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('publish_client_week', 'regenerate_client_workouts')
      and 'search_path=public, pg_temp' = any(p.proconfig)
    having count(*) = 2
  ) then
    raise exception 'a schedule writer does not pin search_path to public, pg_temp';
  end if;

  if has_function_privilege('anon', 'public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb)', 'EXECUTE') then
    raise exception 'anon holds EXECUTE on a schedule writer';
  end if;
  if has_function_privilege('authenticated', 'public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.regenerate_client_workouts(uuid, uuid, uuid[], jsonb, jsonb, jsonb)', 'EXECUTE') then
    raise exception 'authenticated holds EXECUTE on a schedule writer - the gate is open';
  end if;
end $guard$;

commit;

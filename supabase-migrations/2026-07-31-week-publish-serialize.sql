-- Deploy 2b - the week publish SERIALIZES its precondition with its replacement.
--
-- SPEC-guardrails.md 9.4. Idempotent; safe to re-run. Run AFTER
-- 2026-07-30-week-publish-precondition.sql - this REPLACES the function that one
-- creates, at the same nine-argument signature, so there is no overload to drop
-- and nothing else in the wave changes.
--
-- WARNING: WHAT THIS FIXES, AND WHY THE PREVIOUS MIGRATION WAS NOT ENOUGH.
--
-- 2026-07-30 added a precondition: the caller declares the row ids it read, and
-- this function refuses to replace a week that is no longer that week. Its header
-- reasoned that a lock could not help, because the caller's read and this RPC are
-- two round trips on a pooled connection. That reasoning is correct as far as it
-- goes, and it left the race half open - the surviving half is INSIDE this
-- transaction rather than across the caller's two calls.
--
-- Under READ COMMITTED, two concurrent publishes both run the id comparison
-- against a snapshot taken before either mutates. Both pass. The later one then
-- deletes the earlier one's freshly inserted replacement rows and publishes its
-- own stale merge. The two keys differ, so the ledger records two legitimate
-- publishes; both callers are the same authorized coach; and the loss lands after
-- the first write, so neither caller can detect it. The coach is told both
-- assignments landed and one silently did not - the exact failure the
-- precondition was added to prevent.
--
-- The remedy is a transaction-scoped advisory lock over (client, week), taken
-- BEFORE the comparison and therefore held through the replacement.
--
-- Found by review (Codex, 2026-07-30) on the head that shipped the precondition.
-- Nothing else in the function body changes.

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
  -- The 2026-07-30 migration argued "the fix is a precondition, not a lock."
  -- That is right about the CALLER's gap: a lock cannot span the caller's read
  -- and this RPC, because they are two round trips on a pooled connection. It is
  -- wrong about the inside of THIS transaction, and that is where the rest of the
  -- race lived:
  --
  --     A: compare ids [X]  ok           B: compare ids [X]  ok
  --     A: delete + insert [X, A]
  --                                      B: delete + insert [X, B]   <- A is GONE
  --
  -- Under READ COMMITTED both comparisons run against a snapshot taken BEFORE
  -- either transaction mutates, so both preconditions pass and the later replace
  -- deletes the earlier one's freshly inserted rows. The two keys differ, so the
  -- idempotency ledger sees two legitimate publishes and nothing raises.
  --
  -- A transaction-scoped lock over (client, week) makes the comparison MEAN
  -- something: the second transaction blocks until the first commits, then its
  -- comparison sees the first's rows, raises 40001, and the route re-reads,
  -- re-merges and RE-EVALUATES. The lock does not replace the precondition - it is
  -- what makes the precondition true.
  --
  -- Taken before the replay read so one lock covers every path that can mutate
  -- this client-week. Transaction-scoped by construction, so it cannot leak onto
  -- the next statement of a pooled connection.
  perform pg_advisory_xact_lock(
    hashtext('shape_week_publish'),
    hashtext(p_client_id::text || ':' || to_char(p_week_start, 'YYYY-MM-DD'))
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

-- Grants re-asserted rather than assumed. `create or replace` preserves the
-- existing ACL, but a future bare `create` inherits Supabase's default of
-- EXECUTE to public - and on a SECURITY DEFINER function taking arbitrary
-- p_rows and a fabricated p_outcome, that default IS the guardrail bypass
-- (CWE-862). Cheap to restate, catastrophic to omit.
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from public;
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from anon;
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from authenticated;
grant  execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) to service_role;

-- Fail the migration rather than leave a silently wrong deployment.
do $guard$
declare v_count int;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'publish_client_week';
  if v_count <> 1 then
    raise exception 'expected exactly 1 publish_client_week, found % - an ambiguous overload breaks every publish', v_count;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'publish_client_week'
      and pg_get_function_identity_arguments(p.oid)
          = 'p_coach_user_id uuid, p_idempotency_key uuid, p_client_id uuid, p_week_start date, p_request_hash text, p_outcome jsonb, p_rows jsonb, p_ack jsonb, p_expected_row_ids uuid[]'
  ) then
    raise exception 'publish_client_week does not carry the p_expected_row_ids signature';
  end if;

  -- WARNING: THE POINT OF THIS MIGRATION, ASSERTED. A future `create or replace`
  -- that drops the lock re-opens the lost-update race in total silence: the
  -- precondition is still there, still comparing, and still passing for BOTH
  -- racers. There is no runtime symptom to notice - only a coach's session
  -- quietly disappearing - so the lock's presence is a deployment invariant.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'publish_client_week'
      and pg_get_functiondef(p.oid) like '%pg_advisory_xact_lock%'
  ) then
    raise exception 'publish_client_week does not serialize on an advisory lock - the precondition is not enforceable without it';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'publish_client_week'
      and 'search_path=public, pg_temp' = any(p.proconfig)
  ) then
    raise exception 'publish_client_week does not pin search_path to public, pg_temp';
  end if;

  if has_function_privilege('anon', 'public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[])', 'EXECUTE') then
    raise exception 'anon holds EXECUTE on publish_client_week';
  end if;
  if has_function_privilege('authenticated', 'public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[])', 'EXECUTE') then
    raise exception 'authenticated holds EXECUTE on publish_client_week - the gate is open';
  end if;
end $guard$;

commit;

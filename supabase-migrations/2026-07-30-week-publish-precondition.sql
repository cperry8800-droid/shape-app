-- Deploy 2b — the week publish refuses to replace a week that moved under it.
--
-- SPEC-guardrails.md §9.4. Idempotent; safe to re-run. Run AFTER
-- 2026-07-29-guardrail-week-publish.sql (this recreates the function that one
-- creates).
--
-- ⚠ A WEEK-REPLACE OVER A READ-MERGE IS A LOST-UPDATE RACE.
--
-- The boundary REPLACES a client-week, which is correct for the whole-week route
-- (/api/trainer/week): a coach authoring a week means that week and no other.
-- But the session-shaped route (/api/trainer/workout) cannot send a whole week —
-- a coach assigns ONE session — so it reads the client-week, folds the session
-- in, and publishes the merged result. Two assignments into the same client-week
-- interleave like this:
--
--     A reads [X]  →  merges  →  publishes [X, A]
--     B reads [X]  →  merges  →  publishes [X, B]     ← A's session is DELETED
--
-- Nothing existing catches it. Both keys are content-derived, so they differ and
-- the idempotency ledger sees two legitimate publishes; both callers are the
-- same authorized coach, so every authz check passes; and the loss happens
-- AFTER A's write, so A cannot detect it either. The coach is told both
-- assignments landed, and one silently did not.
--
-- The fix is a precondition, not a lock. A lock cannot span the two calls: the
-- read is a PostgREST select and the publish is a separate RPC, on a pooled
-- connection, so a session-level advisory lock is not reliably the same backend.
-- So the caller DECLARES WHAT IT READ and this transaction refuses to replace a
-- week that is no longer that week; the route re-reads, re-merges, RE-EVALUATES
-- the guardrail against the week it is actually about to write, and retries.
-- Re-evaluating is the point — a stale verdict for a changed week would be the
-- same class of bug one level up.
--
-- NULL = no precondition. That is the whole-week route's contract, unchanged.

begin;

-- ── The atomic publish, with the precondition ───────────────────────────────
--
-- Recreated in full rather than patched: a ninth parameter is a NEW SIGNATURE,
-- not a replacement, so the eight-argument form is dropped below. Leaving both
-- would be worse than either — PostgREST resolves overloads by the argument
-- names supplied, and an eight-argument call matches BOTH candidates (the ninth
-- defaults), which is ambiguous and fails at the database.
--
-- Everything other than the precondition block is verbatim from
-- 2026-07-29-guardrail-week-publish.sql. In particular the security posture is
-- unchanged: SERVICE-ROLE ONLY, coach re-verified here against the explicit
-- argument, discipline predicate inlined because auth.uid() is NULL on a
-- service-role connection and would fail OPEN.
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

comment on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) is
  'Atomic week-shaped publish: claims the idempotency key, refuses a week that moved since the caller read it (p_expected_row_ids; NULL = no precondition), replaces the coach''s own future rows in the target week, inserts the submitted sessions, and writes the guardrail acknowledgment — all in one transaction. SERVICE-ROLE ONLY; the coach is an explicit, re-verified argument. Returns accepted | already_delivered. SPEC-guardrails.md §9.4.';

-- The eight-argument form is REMOVED, not left beside the new one. Two reasons,
-- and the second is the one that bites: an eight-argument call matches BOTH
-- overloads once the ninth parameter defaults, so PostgREST cannot resolve it
-- and EVERY publish fails; and the older form carries no precondition, so any
-- caller still reaching it would silently keep the lost-update race.
drop function if exists public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb);

-- Grants recreated from scratch — the drop takes the old ones with it, and
-- without this block the recreated function falls back to Supabase's default
-- grants and `anon` regains EXECUTE (the #1459 lesson).
--
-- ⚠ `authenticated` IS DELIBERATELY NOT GRANTED. The grant is the whole gate:
-- SECURITY DEFINER bypasses RLS, so a signed-in trainer calling this directly
-- would skip the guardrail entirely and rewrite any client's week.
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from public;
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from anon;
revoke execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) from authenticated;
grant  execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[]) to service_role;

-- Fail the migration rather than leave a silently wrong deployment: exactly one
-- overload must survive, it must carry the precondition argument, and NEITHER
-- anon nor authenticated may hold EXECUTE.
do $$
declare v_count int;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'publish_client_week';
  if v_count <> 1 then
    raise exception 'expected exactly 1 publish_client_week, found % — an ambiguous overload breaks every publish', v_count;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'publish_client_week'
      and pg_get_function_identity_arguments(p.oid)
          = 'p_coach_user_id uuid, p_idempotency_key uuid, p_client_id uuid, p_week_start date, p_request_hash text, p_outcome jsonb, p_rows jsonb, p_ack jsonb, p_expected_row_ids uuid[]'
  ) then
    raise exception 'publish_client_week does not carry the p_expected_row_ids signature';
  end if;

  if has_function_privilege('anon', 'public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[])', 'EXECUTE') then
    raise exception 'anon holds EXECUTE on publish_client_week';
  end if;
  if has_function_privilege('authenticated', 'public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb, uuid[])', 'EXECUTE') then
    raise exception 'authenticated holds EXECUTE on publish_client_week — the gate is open';
  end if;
end $$;

commit;

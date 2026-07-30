-- Deploy 2b — the week-shaped publish boundary.
--
-- SPEC-guardrails.md §9.4. Idempotent; safe to re-run.
--
-- ⚠ THE KEY MUST SERVE OFFLINE REPLAY, NOT ONLY ONLINE PUBLISH. All four:
--   (1) minted at AUTHORING time and carried in the payload — never derived at
--       send time, so it survives the device going offline, the app being
--       killed, and the coach re-authenticating before transmission;
--   (2) re-submitting the same week returns the SAME OUTCOME, not a second set
--       of rows — whether the repeat is a retry tap, a background drain, or both
--       racing;
--   (3) the response distinguishes `accepted` from `already_delivered`, so a
--       replay reports honestly instead of re-inserting or claiming work is held;
--   (4) scoped to the ORIGINATING COACH — a queued payload replayed under a
--       different signed-in account is REJECTED here, never silently
--       re-attributed. The client-side owner guard is a courtesy, not the
--       boundary.

-- ── (1) The ledger ──────────────────────────────────────────────────────────
create table if not exists public.coach_week_publishes (
  idempotency_key uuid        not null,
  client_id       uuid        not null references auth.users(id) on delete cascade,
  coach_user_id   uuid        not null references auth.users(id) on delete cascade,
  week_start      date        not null,
  -- The normalized request digest. A repeat with the SAME key and a DIFFERENT
  -- body is a caller bug, not a replay — it is rejected rather than silently
  -- returning the first week's outcome for the second week's content.
  request_hash    text        not null,
  -- The exact response body we returned. A replay re-serves this verbatim so a
  -- background drain and a retry tap cannot disagree about what happened.
  outcome         jsonb       not null,
  created_at      timestamptz not null default now(),
  primary key (idempotency_key, client_id)
);

comment on table public.coach_week_publishes is
  'Server-side idempotency ledger for the week-shaped publish boundary. One row per (idempotency_key, client_id). SPEC-guardrails.md §9.4.';

-- Writes go ONLY through publish_client_week (SECURITY DEFINER). RLS on with NO
-- policies = deny-all for anon/authenticated, which is the intent: the ledger is
-- never read or written directly by a client. (Same deliberate shape as
-- app_config in 2026-07-27-guardrail-load-history.sql — a security advisor
-- reporting "RLS enabled, no policies" here is describing the design.)
alter table public.coach_week_publishes enable row level security;
revoke all on public.coach_week_publishes from public, anon, authenticated;

create index if not exists coach_week_publishes_coach_idx
  on public.coach_week_publishes (coach_user_id, created_at desc);

-- ── (2) The atomic publish ──────────────────────────────────────────────────
--
-- ⚠ SERVICE-ROLE ONLY, AND THE COACH IS AN EXPLICIT ARGUMENT (CWE-862).
-- The first cut granted this to `authenticated` and read the actor from
-- auth.uid(). That is a privilege-escalation surface: a signed-in trainer could
-- call it directly with any client id, any week, any rows, bypassing the route's
-- own scope check and the shaped contract in week-publish.mjs — the RPC deletes
-- and inserts a whole week of a client's training. The route is now the ONLY
-- caller (it runs an admin client and passes the id it has already authenticated
-- and scoped), and the authz below is re-verified HERE against that id, so the
-- boundary does not depend on the route being correct.
--
-- Because a service-role connection carries no auth.uid(), the discipline check
-- cannot delegate to is_discipline_coach_on_client (which reads auth.uid()); the
-- same predicate is inlined against p_coach_user_id. Resolving the trainer row
-- from the SUBSCRIPTION that grants access — rather than "any trainer row this
-- account owns" — also pins the write to the provider row the client actually
-- pays, which the old `limit 1` did not.
create or replace function public.publish_client_week(
  p_coach_user_id   uuid,
  p_idempotency_key uuid,
  p_client_id       uuid,
  p_week_start      date,
  p_request_hash    text,
  p_outcome         jsonb,
  p_rows            jsonb default '[]',
  p_ack             jsonb default null
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

comment on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb) is
  'Atomic week-shaped publish: claims the idempotency key, replaces the coach''s own future rows in the target week, inserts the submitted sessions, and writes the guardrail acknowledgment — all in one transaction. SERVICE-ROLE ONLY; the coach is an explicit, re-verified argument. Returns accepted | already_delivered. SPEC-guardrails.md §9.4.';

-- The auth.uid()-based 6-arg form is REMOVED, not left beside the new one: an
-- overload reachable by `authenticated` would leave the escalation path open.
drop function if exists public.publish_client_week(uuid, uuid, date, text, jsonb, jsonb);

revoke all on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.publish_client_week(uuid, uuid, uuid, date, text, jsonb, jsonb, jsonb) to service_role;

-- ── (3) The telemetry whitelist — HALF ONE OF TWO ──────────────────────────
--
-- ⚠ VERIFIED AGAINST PRODUCTION 2026-07-29: track_event did NOT accept
-- `guardrail_evaluated`. The event would have written NOTHING and reported NO
-- ERROR — §10.2 sets this trap twice and warns that the second time is the
-- easier one to miss. It was missed; the pre-flight probe caught it.
--
-- The other half is ANALYTICS_EVENTS in src/lib/funnel.mjs. BOTH must carry the
-- name. Recreated verbatim from the deployed definition with one name added, so
-- re-running this file is a no-op rather than a revert.
create or replace function public.track_event(p_event text, p_props jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_event not in (
    'onboarding_started','app_opened','workout_started','paywall_viewed','checkout_started',
    'session_rpe_prompted','session_rpe_dropped',
    -- guardrail_evaluated { state, regime, redPath, axes, baselineAu, proposedAu,
    -- ceilingPct, overridden, reasonCode, unknownReason, excludedSessionRate,
    -- redSuppressed, adjustMode }. Written SERVER-SIDE AT PUBLISH ONLY, one row
    -- per publish regardless of session count. Carries NO client identifier.
    'guardrail_evaluated'
  ) then
    return; -- silently ignore non-whitelisted names (defensive)
  end if;
  insert into public.analytics_events (user_id, event, props)
  values (auth.uid(), p_event, coalesce(p_props, '{}'::jsonb));
end;
$function$;

-- Post-condition. If this raises, the addition above did not take and the event
-- is dead on arrival — which is the whole failure mode this section exists to
-- prevent, so it fails loudly rather than shipping quiet.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'track_event'
      and pg_get_functiondef(p.oid) like '%guardrail_evaluated%'
  ) then
    raise exception 'track_event still does not accept guardrail_evaluated';
  end if;
end $$;

-- ── (4) §9.3 client visibility — NO CHANGE NEEDED, and here is why ─────────
--
-- ⚠ SPEC-guardrails.md §11 lists a change to `ai_audit_read_own_or_coach`,
-- reasoning that a `guardrail_red_ack` row sets `target_user_id` to the CLIENT,
-- so the policy's "own entries" arm would expose the coach's acknowledgment —
-- and the reason they typed — to the client it is about.
--
-- THAT ARM DOES NOT EXIST. Read from production 2026-07-29, the one and only
-- policy on ai_audit_log is:
--
--   SELECT to authenticated USING (
--     actor_user_id = auth.uid()
--     OR (target_user_id IS NOT NULL AND is_coach_on_client(target_user_id))
--   )
--
-- A client is not a coach on themselves, so being the TARGET grants nothing.
-- Guardrail acknowledgments are already coach-readable only, which is §9.3's
-- requirement, and no migration is needed.
--
-- ⚠ AND WRITING THE SPEC'S CHANGE WOULD HAVE BEEN A PRIVACY REGRESSION, not a
-- no-op: adding a `target_user_id = auth.uid()` arm (even with guardrail rows
-- excluded) would newly grant clients read access to every OTHER audit row
-- about them, which they do not have today. The spec was describing a policy
-- shape that was never deployed. Recorded in §13 rather than silently skipped.
--
-- Known and deliberately NOT changed here: `is_coach_on_client` is
-- discipline-agnostic, so a client's NUTRITIONIST can read a trainer's
-- guardrail acknowledgment. That is cross-discipline care-team visibility, the
-- existing platform norm, and it is not this wave's to narrow.

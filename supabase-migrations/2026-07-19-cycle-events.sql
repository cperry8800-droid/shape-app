-- The Cycle — foundation migration (spec 2026-07-19-cycle-awareness-design.md,
-- owner-approved; PR A of builds 6–9). Member-logged period starts + the
-- consent machinery for the coach view. WA MHMD purpose: cycle events are
-- consumer health data — owner-only at the table, share gated on BOTH member
-- flags, opt-out is one transaction that deletes everything and records the
-- withdrawal. Idempotent throughout. ⚠ OWNER runs it.

create table if not exists public.cycle_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_date date not null,
  kind       text not null default 'period_start' check (kind in ('period_start')),
  created_at timestamptz not null default now(),
  unique (user_id, event_date, kind)
);

alter table public.cycle_events enable row level security;

-- Owner-only. Deliberately NO coach policy on the table — coach access exists
-- ONLY through the definer RPC below, which checks the member's share flag.
drop policy if exists "cycle owner all" on public.cycle_events;
create policy "cycle owner all" on public.cycle_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Storage-boundary guard: no future-dated starts, judged in the MEMBER'S OWN
-- timezone (shape_user_tz — the 2026-07-06 helper). A calendar-UI bug or a
-- direct write can't seed the engine with a future "latest start" and a
-- negative day-of-cycle. Historical + same-day rows pass untouched.
create or replace function public.cycle_events_no_future()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tz text; v_today date;
begin
  -- shape_user_tz can be NULL for a member whose zone was never captured; a
  -- NULL comparison would make the IF unknown and SKIP the guard. Fail SAFE,
  -- not closed: fall back to UTC today + 1 day of slack (the award-clamp
  -- precedent) — a Tokyo member's local "today" is never rejected, a genuine
  -- future date still is. With a captured tz the bound is exact local today.
  v_tz := public.shape_user_tz(new.user_id);
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date
             + (case when v_tz is null then 1 else 0 end);
  if new.event_date > v_today then
    raise exception 'future_event_date';
  end if;
  return new;
end $$;
drop trigger if exists cycle_events_no_future on public.cycle_events;
create trigger cycle_events_no_future before insert or update on public.cycle_events
  for each row execute function public.cycle_events_no_future();

-- Coach read: the get_client_goals pattern. Gated on an active coach link AND
-- BOTH member flags — optIn AND share (a share flag on a non-opted-in doc is
-- inconsistent state and reads as not shared). Returns share:false (and
-- nothing else) otherwise — the caller renders absence. Returns RAW recent
-- starts, not derived phase: consumers derive via the ONE pure module
-- (cyclePhase.mjs) so SQL and JS can never drift. search_path pinned with
-- pg_temp LAST + every reference schema-qualified (definer shadowing guard).
create or replace function public.get_client_cycle(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ok boolean; v_starts jsonb;
begin
  if not public.is_coach_on_client(p_user_id) then return null; end if;
  select coalesce((data->>'optIn')::boolean, false)
     and coalesce((data->>'share')::boolean, false) into v_ok
    from public.user_goals where user_id = p_user_id and kind = 'cycle_settings';
  if not coalesce(v_ok, false) then return jsonb_build_object('share', false); end if;
  select coalesce(jsonb_agg(event_date order by event_date desc), '[]'::jsonb)
    into v_starts
    from (select event_date from public.cycle_events
          where user_id = p_user_id and kind = 'period_start'
          order by event_date desc limit 13) s;
  return jsonb_build_object('share', true, 'starts', v_starts);
end $$;

revoke execute on function public.get_client_cycle(uuid) from public, anon;
grant  execute on function public.get_client_cycle(uuid) to authenticated;

-- ⚠ DISCOVERED AT BUILD TIME (live-schema check, not in the spec/plan):
-- user_goals carries NO DELETE policy — insert/select/update only (a known
-- repo fact; the account-delete route documents it). The spec's INVOKER
-- cycle_opt_out() would therefore delete its cycle_settings doc as a SILENT
-- ZERO-ROW no-op, leaving optIn/share standing after "delete everything" —
-- the coach RPC would read share:true over empty starts instead of absence.
-- The narrowest fix that preserves both spec choices (invoker on purpose;
-- the doc is DELETED, not zeroed): a DELETE policy scoped to THIS kind only.
-- Every other user_goals kind stays undeletable, exactly as before.
drop policy if exists user_goals_delete_cycle on public.user_goals;
create policy user_goals_delete_cycle on public.user_goals
  for delete to authenticated
  using (user_id = auth.uid() and kind = 'cycle_settings');

-- ── RPC-only settings/consent writes (GUC-guard, the #1707 shape.adjust_regen
--    pattern): a direct owner upsert of the cycle settings doc, or a direct
--    insert of a cycle consent receipt, raises — flag and receipt can only
--    move together, inside the RPCs below.
create or replace function public.cycle_settings_guard()
returns trigger language plpgsql as $$
begin
  if new.kind = 'cycle_settings'
     and coalesce(current_setting('shape.cycle_rpc', true), '') <> '1' then
    raise exception 'cycle_settings_rpc_only';
  end if;
  return new;
end $$;
drop trigger if exists cycle_settings_guard on public.user_goals;
create trigger cycle_settings_guard before insert or update on public.user_goals
  for each row execute function public.cycle_settings_guard();

create or replace function public.cycle_consent_guard()
returns trigger language plpgsql as $$
begin
  if new.kind in ('cycle_tracking', 'cycle_share')
     and coalesce(current_setting('shape.cycle_rpc', true), '') <> '1' then
    raise exception 'cycle_consent_rpc_only';
  end if;
  return new;
end $$;
drop trigger if exists cycle_consent_guard on public.consent_log;
create trigger cycle_consent_guard before insert on public.consent_log
  for each row execute function public.cycle_consent_guard();

-- ── Settings flip + its receipt, ONE transaction. INVOKER: owner RLS on
--    user_goals + consent_log is the scope. p_consent_kind names which receipt
--    this flip records ('cycle_tracking' | 'cycle_share'); p_granted false =
--    a withdrawal receipt (share-off / opt-out path records its own).
create or replace function public.cycle_set_settings(
  p_opt_in boolean, p_share boolean,
  p_consent_kind text, p_granted boolean, p_consent_text text
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_consent_kind not in ('cycle_tracking', 'cycle_share') then
    raise exception 'bad_consent_kind';
  end if;
  -- Invariants (review round): the flags and the receipt must describe ONE
  -- coherent transition. Sharing requires opt-in; the receipt's granted value
  -- must match the flag it records (tracking receipt ↔ p_opt_in, share
  -- receipt ↔ p_share). Anything else is an incoherent audit row.
  if p_share and not p_opt_in then raise exception 'share_requires_opt_in'; end if;
  if p_consent_kind = 'cycle_tracking' and p_granted <> p_opt_in then
    raise exception 'receipt_flag_mismatch';
  end if;
  if p_consent_kind = 'cycle_share' and p_granted <> p_share then
    raise exception 'receipt_flag_mismatch';
  end if;
  perform set_config('shape.cycle_rpc', '1', true);
  insert into public.user_goals (user_id, kind, data)
  values (auth.uid(), 'cycle_settings',
          jsonb_build_object('optIn', p_opt_in, 'share', p_share))
  on conflict (user_id, kind) do update
    set data = jsonb_build_object('optIn', p_opt_in, 'share', p_share);
  insert into public.consent_log (user_id, kind, granted, consent_text, source)
  values (auth.uid(), p_consent_kind, p_granted, p_consent_text, 'settings');
end $$;
revoke all on function public.cycle_set_settings(boolean, boolean, text, boolean, text) from public, anon;
grant execute on function public.cycle_set_settings(boolean, boolean, text, boolean, text) to authenticated;

-- ── Opt-out: delete EVERYTHING + the withdrawal receipt, one transaction.
--    Idempotent: deletes are no-ops on repeat; a re-run just re-records the
--    withdrawal. Partial state (events outliving consent) is unrepresentable.
create or replace function public.cycle_opt_out()
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_was_sharing boolean;
begin
  perform set_config('shape.cycle_rpc', '1', true);
  select coalesce((data->>'share')::boolean, false) into v_was_sharing
    from public.user_goals where user_id = auth.uid() and kind = 'cycle_settings';
  delete from public.cycle_events where user_id = auth.uid();
  delete from public.user_goals where user_id = auth.uid() and kind = 'cycle_settings';
  -- Withdrawal receipts for EVERY scope that was granted (review round): a
  -- member who was sharing gets a cycle_share withdrawal too, so the ledger
  -- never shows a share grant outliving its tracking basis.
  if coalesce(v_was_sharing, false) then
    insert into public.consent_log (user_id, kind, granted, consent_text, source)
    values (auth.uid(), 'cycle_share', false, 'Coach sharing ended — cycle tracking stopped.', 'settings');
  end if;
  insert into public.consent_log (user_id, kind, granted, consent_text, source)
  values (auth.uid(), 'cycle_tracking', false, 'Stopped cycle tracking — all cycle data deleted.', 'settings');
end $$;
revoke all on function public.cycle_opt_out() from public, anon;
grant execute on function public.cycle_opt_out() to authenticated;

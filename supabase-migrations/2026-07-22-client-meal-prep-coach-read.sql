-- Coach read of a client's meal-prep signal (Cook Mode wave PR C, spec §5).
-- SECURITY DEFINER, gated on the COACH LINK ALONE (owner ruling §13.1 — plan
-- adherence, the get_client_stats precedent; deliberately NOT the cycle RPC's
-- optIn/share gate, which guards a different consent class).
--
-- Returns a COMPACT PROJECTION ONLY — never the document: the count of FRESH
-- prep entries (the 4-day display window, ruling §13.3), the latest preppedAt,
-- and the covered day labels. No recipe titles, no servings, no history.
-- Absence (no row / nothing fresh / not their coach) returns NULL — the UI
-- renders nothing, never a padlock.
--
-- Idempotent: CREATE OR REPLACE + guarded grants.

create or replace function public.get_client_meal_prep(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc jsonb;
  v_count int := 0;
  v_last bigint := null;
  v_days text[] := '{}';
  v_entry jsonb;
  v_at bigint;
  v_day int;
  v_label text;
  v_labels constant text[] := array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  -- The freshness window in ms — KEEP IN SYNC with BS_PREP_WINDOW_MS in
  -- mobile-app/src/services/mealPrep.mjs (4 days).
  v_window_ms constant bigint := 4 * 24 * 60 * 60 * 1000;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.is_coach_on_client(p_user_id) then
    return null;
  end if;

  select data into v_doc from public.user_goals
    where user_id = p_user_id and kind = 'meal_prep';
  if v_doc is null or jsonb_typeof(v_doc->'entries') <> 'array' then
    return null;
  end if;

  for v_entry in select * from jsonb_array_elements(v_doc->'entries') loop
    -- preppedAt must be a real epoch-ms number inside the window; anything
    -- malformed simply doesn't count (mirror of bsPrunePrep).
    begin
      v_at := (v_entry->>'preppedAt')::bigint;
    exception when others then
      continue;
    end;
    if v_at is null or v_at <= 0 or v_now_ms - v_at < 0 or v_now_ms - v_at >= v_window_ms then
      continue;
    end if;
    v_count := v_count + 1;
    if v_last is null or v_at > v_last then v_last := v_at; end if;
    begin
      v_day := (v_entry->>'dayIdx')::int;
    exception when others then
      v_day := null;
    end;
    if v_day is not null and v_day between 0 and 6 then
      v_label := v_labels[v_day + 1];
      if not (v_label = any(v_days)) then v_days := v_days || v_label; end if;
    end if;
  end loop;

  if v_count = 0 then
    return null;   -- nothing fresh = absence, not a zero
  end if;

  return jsonb_build_object('count', v_count, 'lastAt', v_last, 'days', to_jsonb(v_days));
end;
$$;

-- Privilege hygiene (the 2026-07-20 cycle-coach-today pattern): never
-- anon-callable; the in-body coach gate is the authorization.
revoke execute on function public.get_client_meal_prep(uuid) from public, anon;
grant execute on function public.get_client_meal_prep(uuid) to authenticated;

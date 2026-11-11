-- The flag settings of a client's other coaches, for joint attention (owner, 2026-11-10: "yes fix
-- this please", on joint attention reading the co-coach's side at Shape's house line).
--
-- Joint attention (findJointAttention in public/newdesign/dashSignals.js) is the note a trainer and a
-- nutritionist get when a client they share is slipping on both sides. Each side is read at its own
-- coach's line, and until now the co-coach's line was Shape's house default: a coach's tuning lives in
-- their own user_goals row (kind 'coach_settings', data.thresholds), and RLS on user_goals is
-- read-own. So a nutritionist who moved their food-log gap to 4 days saw a joint case the trainer, who
-- read that side at 3, did not, or the reverse.
--
-- get_care_team_flag_lines(client): one row per other coach on this client (every coach with an
-- active, trialing or past-due subscription from them, the caller left out), with that coach's flag
-- tuning. Only a coach on this client reads it (is_coach_on_client); the member, a former coach, an
-- unrelated coach and a signed-out caller read nothing. Of the settings document it returns only the
-- thresholds: each key a capitalised policy name and each value a number (FOOD_GAP_DAYS: 4). Nothing
-- else in the document, and no other row, leaves it. The care team already shows these coaches by name.
--
-- Called by: src/lib/shared-overview.ts (each care-team member's flagLines), the overview the website
-- and the app build a client's record from before reading joint attention off it.
--
-- Re-runnable: "create or replace", and a guard that checks the result.

begin;

create or replace function public.get_care_team_flag_lines(p_client_id uuid)
returns table (owner_id uuid, provider_role text, thresholds jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.owner_id,
         c.provider_role,
         coalesce((
           select jsonb_object_agg(e.key, e.value)
           from public.user_goals ug,
                jsonb_each(case when jsonb_typeof(ug.data -> 'thresholds') = 'object'
                                then ug.data -> 'thresholds' else '{}'::jsonb end) as e(key, value)
           where ug.user_id = c.owner_id
             and ug.kind = 'coach_settings'
             and jsonb_typeof(e.value) = 'number'
             and e.key ~ '^[A-Z][A-Z_]{0,39}$'
         ), '{}'::jsonb) as thresholds
  from (
    select distinct s.provider_role, coalesce(t.owner_id, n.owner_id) as owner_id
    from public.subscriptions s
    left join public.trainers      t on s.provider_role = 'trainer'      and t.id = s.provider_id
    left join public.nutritionists n on s.provider_role = 'nutritionist' and n.id = s.provider_id
    where auth.uid() is not null
      and p_client_id is not null
      and s.client_id = p_client_id
      and s.status in ('active', 'trialing', 'past_due')
      and public.is_coach_on_client(p_client_id)
  ) c
  where c.owner_id is not null
    and c.owner_id is distinct from auth.uid()
  order by c.provider_role, c.owner_id;
$$;

revoke all on function public.get_care_team_flag_lines(uuid) from public, anon;
grant execute on function public.get_care_team_flag_lines(uuid) to authenticated, service_role;

-- ── The gate: a migration that cannot prove it worked is not a gate ──────────────────────────
do $guard$
begin
  if has_function_privilege('anon', 'public.get_care_team_flag_lines(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.get_care_team_flag_lines(uuid)', 'execute') then
    raise exception 'get_care_team_flag_lines must be executable by signed-in callers only';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_care_team_flag_lines'
      and (not p.prosecdef or not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) c where c like 'search_path=%'))
  ) then
    raise exception 'get_care_team_flag_lines must be a definer with a pinned search_path';
  end if;
  -- Signed out (no auth.uid() here), it answers nothing.
  if exists (select 1 from public.get_care_team_flag_lines((select client_id from public.subscriptions limit 1))) then
    raise exception 'get_care_team_flag_lines answered with no caller';
  end if;
end
$guard$;

commit;

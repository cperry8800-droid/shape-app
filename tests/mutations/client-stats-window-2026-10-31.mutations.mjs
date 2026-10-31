// Mutation spec for the coach's client stats counting seven days as seven
// (supabase-migrations/2026-10-31-client-stats-window.sql). What every coach page says about a
// client's logging reads these figures, so every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/client-stats-window-2026-10-31.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-10-31-client-stats-window.sql';

export default {
  test: 'node --test tests/client-stats-window.test.mjs tests/dietary-kcal.test.mjs tests/definer-grants.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    { name: 'seven days hold eight again', file: SQL,
      find: 'select count(*) filter (where snapshot_date between v_today - 6 and v_today),',
      replace: 'select count(*) filter (where snapshot_date between v_today - 7 and v_today),' },
    { name: 'thirty days hold 31', file: SQL,
      find: '         count(*) filter (where snapshot_date between v_today - 29 and v_today)\n',
      replace: '         count(*) filter (where snapshot_date between v_today - 30 and v_today)\n' },
    { name: 'a day ahead counts', file: SQL,
      find: 'select count(*) filter (where snapshot_date between v_today - 6 and v_today),',
      replace: 'select count(*) filter (where snapshot_date >= v_today - 6),' },
    { name: 'the average reads eight days', file: SQL,
      find: '    and dietary_kcal is not null\n    and snapshot_date between v_today - 6 and v_today;',
      replace: '    and dietary_kcal is not null\n    and snapshot_date between v_today - 7 and v_today;' },
    { name: 'workout minutes over 31 days', file: SQL,
      find: '    and snapshot_date between v_today - 29 and v_today;\n',
      replace: '    and snapshot_date between v_today - 30 and v_today;\n' },
    { name: "every member on the UTC day", file: SQL,
      find: '  v_today := coalesce((now() at time zone public.shape_user_tz(p_user_id))::date, current_date);',
      replace: '  v_today := current_date;' },
    { name: 'the coach gate is gone', file: SQL,
      find: '  if not public.is_coach_on_client(p_user_id) then\n    return null;\n  end if;\n',
      replace: '' },
    { name: 'a watch day is a logged day', file: SQL,
      find: '  where user_id = p_user_id and dietary_kcal is not null;\n',
      replace: '  where user_id = p_user_id;\n' },
    { name: 'the guard accepts eight days', file: SQL,
      find: "  if v_src like '%current_date - 7%' or v_src like '%current_date - 30%'\n     or v_src not like '%snapshot_date between v_today - 6 and v_today%' then",
      replace: "  if false then" },
    { name: 'the guard skips the gate', file: SQL,
      find: "  if v_src not like '%if not public.is_coach_on_client(p_user_id) then%' then\n    raise exception 'get_client_stats lost its coach gate';\n  end if;\n",
      replace: '' },
  ],
};

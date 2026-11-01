// Mutation spec for the coach analytics' 30 days being each client's own 30, ending on their own
// today (src/lib/roster-days.ts): the nutritionist roster's days logged, protein and weight, and the
// trainer roster's weight trend. The Business pages read these rows, so every mutation must be
// killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/roster-window-2026-11-01.mutations.mjs --fail-on-skipped
const LIB = 'src/lib/roster-days.ts';
const ROUTE = 'src/app/api/nutritionist/analytics/route.ts';
const TRAINER = 'src/app/api/trainer/analytics/route.ts';

export default {
  test: 'node --test tests/coach-analytics-routes.test.mjs tests/dietary-kcal.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    { name: 'thirty days hold 31', file: LIB,
      find: '  return { first: shiftDay(last, 1 - n), last };',
      replace: '  return { first: shiftDay(last, -n), last };' },
    { name: 'every client on the UTC day', file: LIB,
      find: '  const last = (memberDay(now, zone || null) ?? memberDay(now, null)) as string;',
      replace: '  const last = memberDay(now, null) as string;' },
    { name: 'the read stops at the UTC date', file: LIB,
      find: '  return { first: shiftDay(utc, -n), last: shiftDay(utc, 1) };',
      replace: '  return { first: shiftDay(utc, -n), last: utc };' },
    { name: 'the read starts a day late', file: LIB,
      find: '  return { first: shiftDay(utc, -n), last: shiftDay(utc, 1) };',
      replace: '  return { first: shiftDay(utc, 1 - n), last: shiftDay(utc, 1) };' },
    { name: 'a zone on file is dropped', file: LIB,
      find: '      if (zone) zones.set(String(r.user_id), zone);',
      replace: '' },
    { name: 'a failed zone read fails the roster', file: LIB,
      find: '      continue;\n    }\n    for (const r of (data ?? [])',
      replace: '      throw new Error(error.message);\n    }\n    for (const r of (data ?? [])' },
    { name: 'the rows are not cut to the window', file: ROUTE,
      find: "      const rows = (byClient.get(cid) || []).filter((r) => r.snapshot_date >= win.first && r.snapshot_date <= win.last);",
      replace: "      const rows = byClient.get(cid) || [];" },
    { name: 'a day ahead counts', file: ROUTE,
      find: "      const rows = (byClient.get(cid) || []).filter((r) => r.snapshot_date >= win.first && r.snapshot_date <= win.last);",
      replace: "      const rows = (byClient.get(cid) || []).filter((r) => r.snapshot_date >= win.first);" },
    { name: 'the read has no upper bound', file: ROUTE,
      find: "          .gte('snapshot_date', readSpan.first)\n          .lte('snapshot_date', readSpan.last);",
      replace: "          .gte('snapshot_date', readSpan.first);" },
    { name: 'the zones are read for nobody', file: ROUTE,
      find: '      rosterZones(supabase, clientIds),',
      replace: '      rosterZones(supabase, []),' },
    { name: "the trainer's weigh-ins are not cut to the window", file: TRAINER,
      find: '      if (r.snapshot_date < win.first || r.snapshot_date > win.last) continue;\n',
      replace: '' },
    { name: "a trainer client's weigh-in ahead counts", file: TRAINER,
      find: '      if (r.snapshot_date < win.first || r.snapshot_date > win.last) continue;',
      replace: '      if (r.snapshot_date < win.first) continue;' },
    { name: "the trainer's weigh-in read has no upper bound", file: TRAINER,
      find: "          .gte('snapshot_date', weighSpan.first)\n          .lte('snapshot_date', weighSpan.last)\n",
      replace: "          .gte('snapshot_date', weighSpan.first)\n" },
    { name: "the trainer's weigh-in read starts at 30 days less one", file: TRAINER,
      find: "          .gte('snapshot_date', weighSpan.first)\n",
      replace: "          .gte('snapshot_date', weighSpan.last)\n" },
    { name: 'the trainer reads no zones', file: TRAINER,
      find: '      rosterZones(supabase, clientIds),',
      replace: '      rosterZones(supabase, []),' },
  ],
};

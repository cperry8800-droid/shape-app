// Mutation spec for the nutritionist analytics route reading every row (#2394's open item): each
// mutation undoes one guard; tests/coach-analytics-routes.test.mjs must fail on every one. The
// shared cursor walk (src/lib/read-all-by-id.ts) is mutated by the trainer spec, whose test run
// now drives both routes.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nutritionist-analytics-2026-10-18.mutations.mjs --fail-on-skipped
const ROUTE = 'src/app/api/nutritionist/analytics/route.ts';
const BIZ = 'public/newdesign/dashBusiness.jsx';

export default {
  test: 'node --test tests/coach-analytics-routes.test.mjs',
  timeoutMs: 60_000,
  mutations: [
    // ── The active subscriptions ──
    { name: 'the active subscriptions are one read again', file: ROUTE,
      find: "    if (after) q = q.gt('id', after);\n    // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.\n    return q.order('id', { ascending: true }).limit(ROW_PAGE);\n  });",
      replace: '    return q;\n  });' },
    { name: 'a subscriptions read at the ceiling leaves the logs at 0', file: ROUTE,
      find: '  let snapsUnknown = subsUnknown;',
      replace: '  let snapsUnknown = false;' },
    // ── The 30-day snapshots ──
    { name: 'the snapshots are one read in date order again', file: ROUTE,
      find: "        if (after) q = q.gt('id', after);\n        // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.\n        return q.order('id', { ascending: true }).limit(ROW_PAGE);\n      }),",
      replace: "        return q.order('snapshot_date', { ascending: true });\n      })," },
    { name: 'the snapshots are taken in id order', file: ROUTE,
      find: '    const snaps = (snapRes.data || []).slice().sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));',
      replace: '    const snaps = snapRes.data || [];' },
    { name: 'a failed snapshots read is a roster that logged nothing', file: ROUTE,
      find: '    snapsUnknown = !!snapRes.error;',
      replace: '    snapsUnknown = false;' },
    { name: 'a client whose logs could not be read logged 0 days', file: ROUTE,
      find: '      if (snapsUnknown) {\n        roster.push(',
      replace: '      if (false) {\n        roster.push(' },
    { name: 'unread total log days are 0', file: ROUTE,
      find: '      totalDaysLogged: snapsUnknown ? null : totalDaysLogged,',
      replace: '      totalDaysLogged,' },
    { name: 'unread average log days are 0', file: ROUTE,
      find: '  const avgLogsPerClient = snapsUnknown ? null : clientIds.length ? Math.round(totalDaysLogged / clientIds.length) : 0;',
      replace: '  const avgLogsPerClient = clientIds.length ? Math.round(totalDaysLogged / clientIds.length) : 0;' },
    { name: 'the weight panel is not told the snapshots went unread', file: ROUTE,
      find: '      weightsUnknown: snapsUnknown,',
      replace: '      weightsUnknown: false,' },
    // ── The consult counts ──
    { name: 'consult counts read rows', file: ROUTE,
      find: "    .from('sessions')\n    .select('id', { count: 'exact', head: true })",
      replace: "    .from('sessions')\n    .select('id')" },
    { name: 'the completed count is the total', file: ROUTE,
      find: "    countSessions().eq('status', 'completed'),",
      replace: '    countSessions(),' },
    { name: 'a failed consult count is 0', file: ROUTE,
      find: '      totalSessions: sessErr ? null : totalSessions,',
      replace: '      totalSessions,' },
    { name: 'a failed count is 0 consults today', file: ROUTE,
      find: '      consultsToday: sessErr ? null : bookedToday,',
      replace: '      consultsToday: bookedToday,' },
    // ── The page ──
    { name: 'a nutritionist card prints an unread figure as 0', file: BIZ,
      find: '      { k: dbzFig(cp.avgLogsPerClient), l: "Avg log days", sub: "per client, last 30d" },',
      replace: '      { k: String(cp.avgLogsPerClient ?? 0), l: "Avg log days", sub: "per client, last 30d" },' },
    { name: 'the most consistent logger reads 0 for unread logs', file: BIZ,
      find: '    consistentValue: (r) => ({ n: dbzFig(r.daysLogged30d), unit: "days" }),',
      replace: '    consistentValue: (r) => ({ n: r.daysLogged30d || 0, unit: "days" }),' },
  ],
};

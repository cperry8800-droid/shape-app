// Mutation spec for the restored trainer analytics route and the Codex findings on it (#2324):
// each mutation undoes one guard; tests/coach-analytics-routes.test.mjs must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/trainer-analytics-2026-10-13.mutations.mjs --fail-on-skipped
const ROUTE = 'src/app/api/trainer/analytics/route.ts';
const BIZ = 'public/newdesign/dashBusiness.jsx';

export default {
  test: 'node --test tests/coach-analytics-routes.test.mjs',
  timeoutMs: 60_000,
  mutations: [
    { name: 'the trainer route reads the nutritionists again', file: ROUTE,
      find: "    .from('trainers')\n",
      replace: "    .from('nutritionists')\n" },
    { name: 'a failed purchases read is zeroed', file: ROUTE,
      find: '      oneTimeUnknown: !!purchasesRes.error,\n',
      replace: '' },
    { name: 'one client with two rows is two clients', file: ROUTE,
      find: 'const clientIds = [...new Set(subs.map((r: { client_id: string }) => r.client_id).filter(Boolean))] as string[];',
      replace: 'const clientIds = subs.map((r: { client_id: string }) => r.client_id).filter(Boolean) as string[];' },
    { name: 'a reviewed session is not a workout', file: ROUTE,
      find: ".in('status', ['completed', 'reviewed'])",
      replace: ".eq('status', 'completed')" },
    { name: 'the sessions read stops at the first 1,000', file: ROUTE,
      find: '    if (got.length < SESSION_PAGE) return { data: rows, error: null };',
      replace: '    return { data: rows, error: null };' },
    { name: 'each page reads from the start again', file: ROUTE,
      find: "    if (after) q = q.gt('id', after);",
      replace: '' },
    { name: 'a read at the ceiling is reported as complete', file: ROUTE,
      find: "  return { data: null, error: { message: `more than ${SESSION_PAGE * SESSION_PAGES} sessions in 30 days` } };",
      replace: '  return { data: rows, error: null };' },
    { name: 'a failed workouts read is a roster that did nothing', file: ROUTE,
      find: '    const workoutsUnknown = !!workoutRes.error;',
      replace: '    const workoutsUnknown = false;' },
    { name: 'a client whose PRs could not be read counts 0', file: ROUTE,
      find: '      const prs = prsByClient.get(cid) ?? null;',
      replace: '      const prs = prsByClient.get(cid) ?? 0;' },
    { name: 'a failed get_client_lifts call is a count', file: ROUTE,
      find: '      prs.set(id, !error && Number.isInteger(n) && n >= 0 ? n : null);',
      replace: '      prs.set(id, Number.isInteger(n) && n >= 0 ? n : 0);' },
    { name: 'one client unread leaves the total short instead of unknown', file: ROUTE,
      find: '      totalPrs30d = prs == null || totalPrs30d == null ? null : totalPrs30d + prs;',
      replace: '      totalPrs30d = (totalPrs30d ?? 0) + (prs ?? 0);' },
    { name: 'the Business card prints an unread figure as 0', file: BIZ,
      find: 'const dbzFig = (v, suffix = "") => (v == null ? "—" : String(v) + suffix);',
      replace: 'const dbzFig = (v, suffix = "") => String(v ?? 0) + suffix;' },
  ],
};

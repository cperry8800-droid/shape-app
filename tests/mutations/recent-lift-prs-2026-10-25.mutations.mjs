// Mutation spec for the profile feed's newest PRs (owner, 2026-10-25: "fix it", of Codex's P2
// on #2445: get_my_lift_prs stops at the 100 heaviest moves, so a member past 100 moves could
// lose a new light record). The migration's function and the progress route's two reads.
// Every mutation must be killed. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/recent-lift-prs-2026-10-25.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-10-25-my-recent-lift-prs.sql';
const PROG = 'src/app/api/client/progress/route.ts';

export default {
  test: 'node --test tests/recent-lift-prs.test.mjs tests/set-load-units.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The function ──
    { name: 'the newest are cut by load, as before', file: SQL,
      find: '  order by best_at desc, load_lb desc\n', replace: '  order by load_lb desc\n' },
    { name: 'the best per move is the newest set, not the heaviest', file: SQL,
      find: '    order by move, load_lb desc, created_at desc\n', replace: '    order by move, created_at desc\n' },
    { name: 'kilograms rank as pounds', file: SQL,
      find: "(case when lower(unit) = 'kg' then load * 2.20462 else load end) as load_lb", replace: 'load as load_lb' },
    { name: 'an incomplete set counts', file: SQL,
      find: '      and sl.completed is distinct from false\n', replace: '' },
    { name: 'every member\'s sets are read', file: SQL,
      find: '    where sl.client_id = auth.uid()\n      and ', replace: '    where ' },
    { name: 'the search path is not pinned', file: SQL,
      find: 'set search_path = public, pg_temp\n', replace: 'set search_path = public\n' },
    { name: 'anon keeps EXECUTE', file: SQL,
      find: 'from public, anon;', replace: 'from public;' },
    { name: 'the default is no longer six', file: SQL,
      find: 'least(coalesce(p_limit, 6), 100)', replace: 'least(coalesce(p_limit, 12), 100)' },

    // ── The route ──
    { name: 'the new function is never read', file: PROG,
      find: '  if (newest) recentPrs = newest;\n', replace: '' },
    { name: 'the new function is asked for the heaviest list\'s count', file: PROG,
      find: "rpcPrs('get_my_recent_lift_prs', 6)", replace: "rpcPrs('get_my_recent_lift_prs', 100)" },
    { name: 'the heaviest function answers for the newest', file: PROG,
      find: "rpcPrs('get_my_recent_lift_prs', 6)", replace: "rpcPrs('get_my_lift_prs', 6)" },
    { name: 'before the migration the newest are not picked from the heaviest rows', file: PROG,
      find: '    recentPrs = [...heaviest].sort(newestFirst).slice(0, 6);\n', replace: '' },
    { name: 'the heaviest list stops at twelve again', file: PROG,
      find: "rpcPrs('get_my_lift_prs', 100)", replace: "rpcPrs('get_my_lift_prs', 12)" },
    { name: 'a function that throws fails the route', file: PROG,
      find: '      return null; // not yet applied, or a transient error: the fallback stands\n', replace: '      throw new Error(\'rpc\');\n' },
    { name: 'a function\'s rows are relabelled pounds', file: PROG,
      find: "      unit: String(r.unit ?? 'lb'),", replace: "      unit: 'lb'," },
  ],
};

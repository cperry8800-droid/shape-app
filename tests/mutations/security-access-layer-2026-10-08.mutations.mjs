// Mutation spec for the 2026-10-08 access-layer migration's anon revokes and the audit's
// `fixedAfterCapture` mechanism. Each mutation breaks one clause; every one must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/security-access-layer-2026-10-08.mutations.mjs --fail-on-skipped
//
// What this round can and cannot see: the definer audit replays the migrations, so it sees
// function bodies and grants. It does not run Postgres, so the policy, trigger and check-constraint
// halves of the migration are not mutated here; they were exercised on a local replica of the
// production catalog (before and after, as anon, members, coaches and the service role).
const MIG = 'supabase-migrations/2026-10-08-security-review-access-layer.sql';
const ALLOW = 'tests/helpers/definer-allowlist.mjs';
const LIVE = 'tests/helpers/definer-live.mjs';
const DIFF = 'scripts/definer-live-diff.mjs';

export default {
  test: 'node --test tests/definer-grants.test.mjs tests/definer-live-agreement.test.mjs tests/definer-live-diff.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    // ── the migration ──
    { name: 'get_health_sources loses the anonymous reject', file: MIG,
      find: '  if auth.uid() is null then return null; end if;\n',
      replace: '' },
    { name: 'get_health_sources stays executable by anon', file: MIG,
      find: 'revoke execute on function public.get_health_sources(uuid, integer) from public, anon;',
      replace: 'revoke execute on function public.get_health_sources(uuid, integer) from public;' },
    { name: 'the leaderboard revoke names PUBLIC only (the classic mistake)', file: MIG,
      find: 'revoke execute on function public.shape_leaderboard(text, integer) from public, anon;',
      replace: 'revoke execute on function public.shape_leaderboard(text, integer) from public;' },
    { name: 'shape_leaderboard_me stays executable by anon', file: MIG,
      find: 'revoke execute on function public.shape_leaderboard_me(text) from public, anon;',
      replace: '-- (revoke dropped)' },
    // ── the static checker ──
    { name: 'a fix that did not land is accepted', file: ALLOW,
      find: '      if (reachable.includes(f.name)) problems.push(',
      replace: '      if (false && reachable.includes(f.name)) problems.push(' },
    { name: 'fixedBy is not checked against the tree', file: ALLOW,
      find: '      if (!isText(f.fixedBy, 3) || !model.files.includes(f.fixedBy))',
      replace: '      if (!isText(f.fixedBy, 3))' },
    { name: 'an item may carry both or neither of wasEntry and wasFinding', file: ALLOW,
      find: '      if (!!f.wasEntry === !!f.wasFinding)',
      replace: '      if (false)' },
    // ── reading the list as of the capture ──
    { name: 'a fix after the capture is not restored', file: LIVE,
      find: '    if (!f || files.has(f.fixedBy)) { if (f) stillFixed.push(f); continue; }',
      replace: '    if (!f || true) { if (f) stillFixed.push(f); continue; }' },
    { name: 'a fix the capture already holds is restored too', file: LIVE,
      find: '    if (!f || files.has(f.fixedBy)) { if (f) stillFixed.push(f); continue; }',
      replace: '    if (!f) { continue; }' },
    // ── the live diff ──
    { name: 'an item awaiting apply is counted as unaccounted', file: DIFF,
      find: '  const awaiting = fixed.filter((f) => anonNames.has(f.name));',
      replace: '  const awaiting = [];' },
    { name: 'an applied fix is never named', file: DIFF,
      find: '    appliedLive: names(fixed.filter((f) => !anonNames.has(f.name)).map((f) => f.name)),',
      replace: '    appliedLive: [],' },
    { name: 'strict ignores an applied fix', file: DIFF,
      find: '  if (strict && (d.stale.length || d.stalePins.length || (d.appliedLive ?? []).length)) return 1;',
      replace: '  if (strict && (d.stale.length || d.stalePins.length)) return 1;' },
    { name: 'a former entry awaiting apply is counted as a finding', file: DIFF,
      find: '  const entries = new Set([...rawEntries, ...awaiting.filter((f) => f.wasEntry).map((f) => f.name)]);',
      replace: '  const entries = new Set([...rawEntries]);' },
  ],
};

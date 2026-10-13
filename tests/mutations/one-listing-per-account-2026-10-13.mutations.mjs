// Mutation spec for one listing per role per account (2026-10-13): each mutation undoes one
// guard; the tests below must fail on every one. (The index itself was probed on a PostgreSQL 16
// copy; the runner does not run Postgres.)
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/one-listing-per-account-2026-10-13.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-10-13-one-listing-per-account.sql';
const ACTIONS = 'src/app/dashboard/applications/actions.ts';

export default {
  test: 'node --test tests/one-listing-per-account.test.mjs tests/coach-application-review.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    { name: 'the trainer index is not unique', file: SQL,
      find: 'create unique index if not exists trainers_one_per_owner',
      replace: 'create index if not exists trainers_one_per_owner' },
    { name: 'the nutritionist index covers ownerless listings', file: SQL,
      find: '  on public.nutritionists (owner_id) where owner_id is not null;',
      replace: '  on public.nutritionists (owner_id);' },
    { name: 'duplicates are not refused first', file: SQL,
      find: '  if v_trainers > 0 or v_nutritionists > 0 then',
      replace: '  if false then' },
    { name: 'the guard accepts a half-built index', file: SQL,
      find: "where c.relname = 'trainers_one_per_owner' and i.indisvalid and i.indisready), '')",
      replace: "where c.relname = 'trainers_one_per_owner'), '')" },
    { name: 'approval fails on the listing that won', file: ACTIONS,
      find: "    if ((error as { code?: string }).code === '23505') {",
      replace: '    if (false) {' },
    { name: 'approval takes any listing after a unique violation', file: ACTIONS,
      find: "        .eq('owner_id', ownerId)\n        .order('id', { ascending: true })\n        .limit(1);\n      if (againError) throw againError;",
      replace: "        .order('id', { ascending: true })\n        .limit(1);\n      if (againError) throw againError;" },
  ],
};

// Mutation spec for the #2285 follow-up (Codex's findings on it, read after the merge): the
// expiry before the check, the role in the check and the index, the fallback scoped to the
// caller's own rows, the sweep on the daily cron, and the replay constraint that lets the audit
// see the new body. tests/lead-boost-redemption.test.mjs and the definer audit must notice every
// one. The Postgres half (the rebuilt index under a real insert) is not mutated: the runner does
// not run Postgres.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/lead-boost-follow-up-2026-10-09.mutations.mjs --fail-on-skipped
const MIG = 'supabase-migrations/2026-10-09-lead-boost-active-key-and-expiry.sql';
const MODEL = 'tests/helpers/definer-model.mjs';
const ROUTE = 'src/app/api/lead-boosts/route.ts';
const CRON = 'src/app/api/cron/score-accountability/route.ts';

export default {
  test: 'node --test tests/lead-boost-redemption.test.mjs tests/definer-grants.test.mjs tests/capped-reads.test.mjs',
  timeoutMs: 600_000,
  mutations: [
    { name: 'an elapsed boost is never expired by the function', file: MIG,
      find: "  update public.coach_lead_boosts\n  set status = 'expired'\n  where provider_role = p_role and provider_id = v_provider_id and status = 'active' and ends_at <= v_now;\n",
      replace: '' },
    { name: 'the expiry runs after the refusal (too late to help)', file: MIG,
      find: "  update public.coach_lead_boosts\n  set status = 'expired'\n  where provider_role = p_role and provider_id = v_provider_id and status = 'active' and ends_at <= v_now;\n\n  -- Checked before any points move: a refused redemption costs nothing. The index below is\n  -- what holds under a race; this is what keeps the ledger clean in the ordinary case. A\n  -- provider is (provider_role, provider_id): trainer and nutritionist ids come from separate\n  -- tables, so a check on the id alone let trainer 12's boost refuse nutritionist 12's.\n  if exists (select 1 from public.coach_lead_boosts\n             where provider_role = p_role and provider_id = v_provider_id and status = 'active') then\n    raise exception 'boost_active' using errcode = 'P0001';\n  end if;\n",
      replace: "  if exists (select 1 from public.coach_lead_boosts\n             where provider_role = p_role and provider_id = v_provider_id and status = 'active') then\n    raise exception 'boost_active' using errcode = 'P0001';\n  end if;\n  update public.coach_lead_boosts\n  set status = 'expired'\n  where provider_role = p_role and provider_id = v_provider_id and status = 'active' and ends_at <= v_now;\n" },
    { name: 'the active check drops the role again', file: MIG,
      find: "  if exists (select 1 from public.coach_lead_boosts\n             where provider_role = p_role and provider_id = v_provider_id and status = 'active') then",
      replace: "  if exists (select 1 from public.coach_lead_boosts\n             where provider_id = v_provider_id and status = 'active') then" },
    { name: 'the index keys on provider_id alone again', file: MIG,
      find: "create unique index coach_lead_boosts_active_uniq\n  on public.coach_lead_boosts (provider_role, provider_id) where status = 'active';",
      replace: "create unique index coach_lead_boosts_active_uniq\n  on public.coach_lead_boosts (provider_id) where status = 'active';" },
    { name: 'elapsed rows are not expired before the rebuild', file: MIG,
      find: "update public.coach_lead_boosts set status = 'expired' where status = 'active' and ends_at <= now();\n",
      replace: '' },
    { name: 'the replay has no constraint, so the audit keeps the old body', file: MODEL,
      find: "  { before: '2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql', after: '2026-10-09-lead-boost-active-key-and-expiry.sql',",
      replace: "  { before: '2026-10-09-lead-boost-active-key-and-expiry.sql', after: '2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql'," },
    { name: 'the fallback reads any active boost of the role', file: ROUTE,
      find: "            .in('provider_id', ownedIds)\n",
      replace: '' },
    { name: 'a named provider the caller does not own is read anyway', file: ROUTE,
      find: "        .filter((id) => Number.isFinite(id) && id > 0 && (wanted === null || id === wanted));",
      replace: "        .filter((id) => Number.isFinite(id) && id > 0);" },
    { name: 'an elapsed row is handed back as the active one', file: ROUTE,
      find: "            .gt('ends_at', new Date().toISOString())\n",
      replace: '' },
    { name: 'the trainers table is read for a nutritionist', file: ROUTE,
      find: "        .from(role === 'trainer' ? 'trainers' : 'nutritionists')",
      replace: "        .from('trainers')" },
    { name: 'the cron no longer sweeps', file: CRON,
      find: "  const { data: sweptCount, error: sweepErr } = await admin.rpc('sweep_store_credit_reservations', { p_user_id: null, p_older_than: '48 hours' });\n  if (sweepErr) console.error('[cron] store credit reservation sweep failed', sweepErr.message);\n  else swept = Number(sweptCount ?? 0) || 0;\n",
      replace: '' },
  ],
};

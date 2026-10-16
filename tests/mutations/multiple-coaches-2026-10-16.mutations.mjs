// Mutation spec for a member paying more than one coach of the same role (owner, 2026-10-16):
// each mutation undoes one guard; the tests below must fail on every one. (get_client_coaches was
// probed on a PostgreSQL 16 copy; the runner does not run Postgres, so its text is pinned instead.)
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/multiple-coaches-2026-10-16.mutations.mjs --fail-on-skipped
const LEGS = 'src/lib/coach-client-legs.mjs';
const MEMBER = 'src/lib/member-onboarding.mjs';
const ONBOARD = 'src/app/api/client/onboarding/route.ts';
const PLAN = 'src/app/api/client/plan/route.ts';
const OVERVIEW = 'src/lib/shared-overview.ts';
const SQL = 'supabase-migrations/2026-10-16-client-coaches.sql';
const DATA = 'public/newdesign/dashData.jsx';
const DCL = 'public/newdesign/dashClient.jsx';

export default {
  test: 'node --test tests/onboarding-board.test.mjs tests/member-onboarding.test.mjs tests/client-coaches.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── The shared week-one rule ──
    { name: 'a target from a coach the member no longer pays counts', file: LEGS,
      find: '  if (!setter) return null;\n  const read = weekOneOf(programDetail, discipline, setter.providerId, since);',
      replace: '  if (!setter) return weekOneOf(programDetail, discipline, w.providerId, since) && { ...weekOneOf(programDetail, discipline, w.providerId, since), providerId: w.providerId };\n  const read = weekOneOf(programDetail, discipline, setter.providerId, since);' },
    { name: 'a target set before the setter\'s own subscription counts', file: LEGS,
      find: '  if (setterSince != null && setAt != null && setAt < setterSince) return null;',
      replace: '  if (false) return null;' },
    { name: 'a target set before this board\'s day 1 counts', file: LEGS,
      find: '  const read = weekOneOf(programDetail, discipline, setter.providerId, since);',
      replace: '  const read = weekOneOf(programDetail, discipline, setter.providerId, null);' },
    { name: 'the coach board never says a co-coach set it', file: LEGS,
      find: '        if (String(setterId) !== String(providerId)) {',
      replace: '        if (false) {' },
    { name: 'a failed co-coach read reads as "not set"', file: LEGS,
      find: '      if (!weekOne && coaches === null && stored',
      replace: '      if (false && stored' },
    // ── The member board ──
    { name: 'the member board reads only the first trainer', file: MEMBER,
      find: '  const everyOf = (list, one) => (Array.isArray(list) ? list.map(obj).filter(Boolean) : one ? [one] : []);',
      replace: '  const everyOf = (list, one) => (one ? [one] : []);' },
    { name: 'the member board does not name who set it', file: MEMBER,
      find: '        setByName = who ? text(who.name) : null;',
      replace: '        setByName = null;' },
    { name: 'the onboarding route sends only the first trainer', file: ONBOARD,
      find: '    coaching = { training: trainers[0] ?? null, nutrition: nutritionists[0] ?? null, trainers, nutritionists };',
      replace: '    coaching = { training: trainers[0] ?? null, nutrition: nutritionists[0] ?? null, trainers: trainers.slice(0, 1), nutritionists };' },
    { name: 'the onboarding route counts a listing once per row, not once', file: ONBOARD,
      find: "    if (!prev || String(r.created_at || '') < String(prev.created_at || '')) byListing.set(String(r.provider_id), r);\n  }\n  return [...byListing.values()]",
      replace: "    byListing.set(String(r.provider_id) + Math.random(), r);\n  }\n  return [...byListing.values()]" },
    // ── The plan read ──
    { name: 'the plan names only the first coach of a role', file: PLAN,
      find: '    const coaches = subs.map((sub) => ({',
      replace: '    const coaches = subs.slice(0, 1).map((sub) => ({' },
    { name: 'every workout is credited to nobody', file: PLAN,
      find: '    w.coach = id != null ? trainerName.get(String(id)) ?? null : null;',
      replace: '    w.coach = null;' },
    { name: 'every coach gets the first thread', file: PLAN,
      find: '      .find((c) => c.provider_role === role && String(c.provider_id) === String(providerId))?.id ?? null;',
      replace: '      .find((c) => c.provider_role === role)?.id ?? null;' },
    { name: 'the shared target is credited to the first coach', file: PLAN,
      find: '        ? { count: w.count, startsOn: w.startsOn, setBy: coaches.find((c) => String(c.providerId) === String(w.providerId))?.name ?? null }',
      replace: '        ? { count: w.count, startsOn: w.startsOn, setBy: coaches[0].name }' },
    { name: 'the plan reads only the first coach\'s target', file: PLAN,
      find: '      subs.map((sub) => ({ providerId: sub.provider_id, since: sub.created_at })), null);',
      replace: '      subs.slice(0, 1).map((sub) => ({ providerId: sub.provider_id, since: sub.created_at })), null);' },
    // ── The overview ──
    { name: 'a same-role co-coach is left out of the care team', file: OVERVIEW,
      find: '  const careTeam = [...trainers, ...nutritionists, ...counterparts, ...sameRole];',
      replace: '  const careTeam = [...trainers, ...nutritionists, ...counterparts];' },
    { name: 'a failed co-coach read leaves the team "complete"', file: OVERVIEW,
      find: '  const careTeamPartial = Boolean(cpRes.error) || clientCoaches === null;',
      replace: '  const careTeamPartial = Boolean(cpRes.error);' },
    { name: 'a failed co-coach read is handed to the board as "no co-coaches"', file: OVERVIEW,
      find: '      coaches: clientCoaches === null\n        ? null',
      replace: '      coaches: clientCoaches === null\n        ? []' },
    { name: 'the board gets every coach, not this discipline\'s', file: OVERVIEW,
      find: '          .filter((c) => c.provider_role === role)',
      replace: '          .filter(() => true)' },
    // ── The migration ──
    { name: 'anyone signed in reads a member\'s coaches', file: SQL,
      find: '    and (auth.uid() = p_client_id or public.is_coach_on_client(p_client_id))',
      replace: '    and true' },
    { name: 'a cancelled subscription is a coach', file: SQL,
      find: "    and s.status in ('active', 'trialing')\n    and (auth.uid()",
      replace: "    and (auth.uid()" },
    { name: 'anon can run it', file: SQL,
      find: 'revoke all on function public.get_client_coaches(uuid) from public, anon;',
      replace: 'revoke all on function public.get_client_coaches(uuid) from public;' },
    { name: 'the function is not pinned', file: SQL,
      find: 'security definer\nset search_path = public, pg_temp\nas $$',
      replace: 'security definer\nas $$' },
    // ── The website ──
    { name: 'two names read as one coach', file: DATA,
      find: '  return { text, many: true };\n}',
      replace: '  return { text, many: false };\n}' },
    { name: 'a nameless coach among several leaves a hole in the list', file: DATA,
      find: '  if (list.some((n) => !n)) return { text: several, many: true };',
      replace: '' },
    { name: 'the website card credits the first trainer with the target', file: DCL,
      find: '"set by " + (board.setByName || trainer || "your trainer")',
      replace: '"set by " + (trainer || "your trainer")' },
  ],
};

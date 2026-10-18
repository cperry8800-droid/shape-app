// Mutation spec for "a client whose renewal payment is retrying keeps their coach" (owner,
// 2026-10-18: "They stay normal clients until Stripe gives up"). Each mutation undoes one piece:
// a server status list back at active and trialing, the roster's flag or its rows, the website's
// and the app's mark, the Clients pages' count, or a part of the migration the tests can read.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-access-past-due-2026-10-18.mutations.mjs --fail-on-skipped
const SQL = 'supabase-migrations/2026-10-18-coach-access-past-due.sql';
const ROSTER = 'src/lib/coach-roster.ts';
const DATA = 'public/newdesign/dashData.jsx';
const DROSTER = 'public/newdesign/dashRoster.jsx';
const PROS = 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx';
const SIGNALS = 'mobile-app/src/services/shapeSignals.js';

const IN3 = ".in('status', OPEN_SUB_STATUSES)";
const IN2 = ".in('status', ['active', 'trialing'])";
// One mutation per server read: that read alone goes back to active and trialing.
const READS = [
  'src/app/api/trainer/adjust/route.ts',
  'src/app/api/trainer/week/route.ts',
  'src/app/api/trainer/workout/route.ts',
  'src/app/api/program-tools/templates/route.ts',
  'src/app/api/sessions/request/route.ts',
  'src/app/api/sessions/manage/route.ts',
  'src/app/api/clients/[id]/week-one/route.ts',
  'src/app/api/client/team/route.ts',
  'src/app/api/client/plan/route.ts',
  'src/app/api/client/onboarding/route.ts',
  'src/app/api/client/dashboard/route.ts',
  'src/app/api/nutritionist/meal-plan/route.ts',
  'src/app/api/nutrition/meal-note/route.ts',
  'src/app/api/leaderboard/route.ts',
  'src/lib/shared-overview.ts',
  'src/lib/session-emails.ts',
  ROSTER,
  'src/app/api/trainer/analytics/route.ts',
  'src/app/api/nutritionist/analytics/route.ts',
].map((file) => ({ name: `${file}: back to active and trialing`, file, find: IN3, replace: IN2 }));

export default {
  test: 'node --test tests/coach-access-past-due.test.mjs tests/coach-roster-revenue-unknown.test.mjs tests/dash-roster-columns.test.mjs tests/app-roster-payment-retrying.test.mjs tests/app-roster-loading.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── src/: every relationship read ──
    ...READS,
    { name: "Nora's member read: back to active and trialing", file: 'src/lib/ai/memberReads.mjs',
      find: ".eq('client_id', uid).in('status', OPEN_SUB_STATUSES)),",
      replace: ".eq('client_id', uid).in('status', ['active', 'trialing'])),"},
    { name: "Nora's coach roster: back to active and trialing", file: 'src/lib/ai/memberReads.mjs',
      find: ".eq('provider_id', p.id).in('status', OPEN_SUB_STATUSES).limit(READ_CAPS.roster)",
      replace: ".eq('provider_id', p.id).in('status', ['active', 'trialing']).limit(READ_CAPS.roster)" },
    ...['trainer', 'nutritionist'].map((role) => ({
      name: `${role} console: a retrying client is no longer current`, file: `src/app/api/${role}/console/route.ts`,
      find: "    if (OPEN_SUB_STATUSES.includes(sub.status)) e.status = 'current';",
      replace: "    if (sub.status === 'active' || sub.status === 'trialing') e.status = 'current';" })),
    { name: "the member's coach team reads every plan RLS shows, a coach's clients' among them", file: 'src/app/api/client/dashboard/route.ts',
      find: "    .eq('client_id', user.id)\n    .in('status', OPEN_SUB_STATUSES);",
      replace: "    .in('status', OPEN_SUB_STATUSES);" },
    // ── Codex on #2400: the roster reads every page, and the route's unread count reaches the page ──
    { name: 'codex-2400: the roster is one read again (cut at 1,000)', file: ROSTER,
      find: 'await readAllById<{ id: string }>((after) => {', replace: 'await ((page) => page(null))((after) => {' },
    { name: 'codex-2400: the roster walk never moves past its first page', file: ROSTER,
      find: "    if (after) q = q.gt('id', after);\n", replace: '' },
    { name: 'codex-2400: the Clients count ignores the route\'s unread count', file: 'public/newdesign/dashData.jsx',
      find: '  if (planCount === null) return null;\n', replace: '' },
    { name: 'codex-2400: useDashboard drops the route\'s count', file: 'public/newdesign/dashData.jsx',
      find: 'source: state.source, tuning, planCount: state.planCount };', replace: 'source: state.source, tuning };' },
    { name: 'codex-2400: the Clients page counts rows alone again', file: 'public/newdesign/trainerClientsPage.jsx',
      find: 'const activeCount = dashPlanClientCount(clients, planCount);', replace: 'const activeCount = dashPlanClientCount(clients);' },
    { name: 'the shared list drops past_due', file: 'src/lib/coach-trajectory.mjs',
      find: "export const OPEN_SUB_STATUSES = ['active', 'trialing', 'past_due'];",
      replace: "export const OPEN_SUB_STATUSES = ['active', 'trialing'];" },
    { name: 'a route writes its own third list', file: 'src/app/api/client/team/route.ts',
      find: IN3, replace: ".in('status', ['active', 'trialing', 'past_due'])" },

    // ── The roster ──
    { name: 'roster: a retrying client is never flagged', file: ROSTER,
      find: "    if (sub.status === 'past_due') e.retrying = true;\n", replace: '' },
    { name: 'roster: the flag is not sent', file: ROSTER,
      find: '        paymentRetrying: e.retrying,', replace: '        paymentRetrying: false,' },
    { name: 'roster: every row the read returns is a plan, not the rows the badge counts', file: ROSTER,
      find: '  for (const sub of openSubsAt(subRows ?? [], Date.now())) {', replace: '  for (const sub of subRows ?? []) {' },
    { name: 'roster: a session-only person is on a plan', file: ROSTER,
      find: '        onPlan: subsUnknown ? null : e.plans > 0,', replace: '        onPlan: subsUnknown ? null : true,' },
    { name: 'roster: an unread plan reads as no plan', file: ROSTER,
      find: '        onPlan: subsUnknown ? null : e.plans > 0,', replace: '        onPlan: e.plans > 0,' },
    { name: 'roster: the count is the list', file: ROSTER,
      find: '      onPlan: subsUnknown ? null : clients.filter((c) => c.onPlan).length,', replace: '      onPlan: subsUnknown ? null : clients.length,' },

    // ── The website ──
    { name: 'website: the record never says past_due', file: DATA,
      find: 'status: row.paymentRetrying === true ? "past_due" : "active"', replace: 'status: "active"' },
    { name: 'website: an unread plan is counted', file: DATA,
      find: '    if (on === null) return null;\n', replace: '' },
    { name: 'website: a session-only person is an active client', file: DATA,
      find: '    if (on !== false) n += 1;', replace: '    n += 1;' },
    { name: 'website: the row draws no mark', file: DROSTER,
      find: '              {dashPaymentRetrying(rec) && <DashPill c={DASH_SEV_COLORS.unknown}>Payment retrying</DashPill>}\n', replace: '' },
    { name: 'website: every row is marked', file: DROSTER,
      find: '  return !!(rec && rec.payments && rec.payments.status === "past_due");', replace: '  return !!(rec && rec.payments);' },
    { name: 'website: the mark is a severity colour', file: DROSTER,
      find: '<DashPill c={DASH_SEV_COLORS.unknown}>Payment retrying</DashPill>', replace: '<DashPill c={DASH_SEV_COLORS.amber}>Payment retrying</DashPill>' },
    ...[['public/newdesign/trainerClientsPage.jsx', 'trainer'], ['public/newdesign/nutritionistClientsPage.jsx', 'nutritionist']].map(([file, role]) => ({
      name: `website: the ${role} Clients page counts the list`, file,
      find: '  const activeCount = dashPlanClientCount(clients);', replace: '  const activeCount = clients.length;' })),

    // ── The app ──
    { name: 'app: the roster read drops the flag', file: 'mobile-app/src/services/shapeBackend.js',
      find: "joinedAt: c.joinedAt || null, paymentRetrying: c.paymentRetrying === true }));", replace: 'joinedAt: c.joinedAt || null }));' },
    { name: 'app: the roster read trusts any truthy flag', file: 'mobile-app/src/services/shapeBackend.js',
      find: "joinedAt: c.joinedAt || null, paymentRetrying: c.paymentRetrying === true }));", replace: 'joinedAt: c.joinedAt || null, paymentRetrying: !!c.paymentRetrying }));' },
    { name: 'app: the triage list drops the flag', file: SIGNALS,
      find: ", joinedAt: c.joinedAt || null, paymentRetrying: c.paymentRetrying === true })).filter((c) => c.id);", replace: ', joinedAt: c.joinedAt || null })).filter((c) => c.id);' },
    { name: 'app: the record builder is not handed the flag', file: SIGNALS,
      find: 'checkins, screening, paymentRetrying: c.paymentRetrying,', replace: 'checkins, screening,' },
    { name: 'app: the record drops the flag', file: 'mobile-app/src/services/signalsMap.mjs',
      find: '  if (paymentRetrying === true) rec.profile.paymentRetrying = true;', replace: '' },
    { name: 'app: every record carries the flag', file: 'mobile-app/src/services/signalsMap.mjs',
      find: '  if (paymentRetrying === true) rec.profile.paymentRetrying = true;', replace: '  rec.profile.paymentRetrying = !!paymentRetrying;' },
    { name: 'app: the row drops the flag', file: PROS,
      find: '    paymentRetrying: p.paymentRetrying === true,', replace: '    paymentRetrying: false,' },
    { name: 'app: the NEEDS YOU row draws no mark', file: PROS,
      find: '                      <BSProPayRetryMark c={c} />\n', replace: '' },
    { name: 'app: the ON TRACK row draws no mark', file: PROS,
      find: "minWidth: 0 }}>\n                    <BSProPayRetryMark c={c} />\n", replace: 'minWidth: 0 }}>\n' },
    { name: 'app: every row is marked', file: PROS,
      find: '  if (!c || c.paymentRetrying !== true) return null;', replace: '  if (!c) return null;' },
    { name: 'app: the mark ignores the catalog', file: PROS,
      find: "{tr('coach:roster.paymentRetrying', { defaultValue: 'Payment retrying' })}", replace: "{'Payment retrying'}" },
    { name: 'app: German shows the English', file: 'mobile-app/src/i18n/catalogs/de/coach.json',
      find: '  "roster.paymentRetrying": "Zahlung wird wiederholt",', replace: '  "roster.paymentRetrying": "Payment retrying",' },
    { name: 'app: the Vietnamese key is missing', file: 'mobile-app/src/i18n/catalogs/vi/coach.json',
      find: '  "roster.paymentRetrying": "Đang thử lại thanh toán",\n', replace: '' },

    // ── The migration ──
    { name: 'sql: is_coach_on_client stops at trialing', file: SQL,
      find: "    where s.client_id = p_client_id\n      and s.status in ('active', 'trialing', 'past_due')\n      and (\n        (s.provider_role = 'trainer' and exists (\n          select 1 from public.trainers t\n          where t.id = s.provider_id and t.owner_id = auth.uid()\n        ))\n        or\n        (s.provider_role = 'nutritionist' and exists (\n          select 1 from public.nutritionists n\n          where n.id = s.provider_id and n.owner_id = auth.uid()\n        ))\n      )\n  );\n$$;\n\n-- ── is_discipline_coach_on_client",
      replace: "    where s.client_id = p_client_id\n      and s.status in ('active', 'trialing')\n      and (\n        (s.provider_role = 'trainer' and exists (\n          select 1 from public.trainers t\n          where t.id = s.provider_id and t.owner_id = auth.uid()\n        ))\n        or\n        (s.provider_role = 'nutritionist' and exists (\n          select 1 from public.nutritionists n\n          where n.id = s.provider_id and n.owner_id = auth.uid()\n        ))\n      )\n  );\n$$;\n\n-- ── is_discipline_coach_on_client" },
    { name: 'sql: publish_client_week stops at trialing', file: SQL,
      find: "   where s.client_id = p_client_id and s.status in ('active', 'trialing', 'past_due')",
      replace: "   where s.client_id = p_client_id and s.status in ('active', 'trialing')" },
    { name: 'sql: get_roster_weekend_split loses its pg_temp pin', file: SQL,
      find: "  weekend_den numeric\n)\nlanguage sql\nsecurity definer\nset search_path = public, pg_temp\n",
      replace: "  weekend_den numeric\n)\nlanguage sql\nsecurity definer\nset search_path = public\n" },
    { name: 'sql: is_coach_on_client turns volatile', file: SQL,
      find: "create or replace function public.is_coach_on_client(p_client_id uuid)\nreturns boolean\nlanguage sql\nstable\n",
      replace: "create or replace function public.is_coach_on_client(p_client_id uuid)\nreturns boolean\nlanguage sql\n" },
    { name: 'sql: a plan write gets another change', file: SQL,
      find: "    and s.status in ('active', 'trialing', 'past_due') and t.owner_id = p_coach_user_id limit 1;",
      replace: "    and s.status in ('active', 'trialing', 'past_due') limit 1;" },
    { name: 'sql: the profiles policy stops at trialing', file: SQL,
      find: "      where s.client_id = profiles.id\n        and s.status in ('active','trialing','past_due')",
      replace: "      where s.client_id = profiles.id\n        and s.status in ('active','trialing')" },
    { name: 'sql: the guard forgets a function', file: SQL,
      find: "    'public.shape_pr_wall(integer, text, text)'\n  ] loop",
      replace: "    'public.shape_member_board(text, text, integer)'\n  ] loop" },
    { name: 'sql: the guard accepts a list left at two', file: SQL,
      find: '    if v_past_due = 0 or v_past_due <> v_trialing then', replace: '    if v_past_due = 0 then' },
    { name: 'sql: the guard stops checking the pin', file: SQL,
      find: "        and p.prosecdef\n        and p.proconfig @> array['search_path=public, pg_temp']\n",
      replace: '        and p.prosecdef\n' },
    { name: 'sql: the guard reads the policy without its past_due', file: SQL,
      find: "    if v_qual is null or position('past_due' in v_qual) = 0 then", replace: '    if v_qual is null then' },
  ],
};

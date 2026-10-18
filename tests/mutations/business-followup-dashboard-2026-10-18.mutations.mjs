// Mutation spec for the coach dashboards' figures after #2395: the trainer and nutritionist dashboard
// routes read today's open subscriptions in one select (cut at 1,000 rows, no error) and dropped its
// error, so a failed read sent 0 clients and $0 net, and the other pages' sidebar printed an unread
// count as "0 clients". Each mutation undoes one guard; the tests must fail on every one.
//
// ⚠ "ONE READ AGAIN" MEANS ONE READ, as in the nutritionist analytics spec: the walk is swapped for a
// single call of its page. A mutant that keeps readAllById and only drops the cursor re-reads the first
// page until the walk's ceiling and reports unknown; it is kept under the name of what it does.
// ⚠ fakeSupabase caps a list read at maxRows (1,000 in the paging test) whatever `.limit()` says, so a
// page with no limit reads the same rows: that mutant is killed by the paging test's by-name
// assertions, which pin each page's filters, order, limit and cursor.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/business-followup-dashboard-2026-10-18.mutations.mjs --fail-on-skipped
const TODAY = 'public/newdesign/dashToday.jsx';
const SIDEBAR = 'public/newdesign/trainerDashboard.jsx';
const SIG = 'public/newdesign/dashSignals.js';

// The two routes are twins, read alike: the same guards, each mutated in its own file.
const route = (role) => {
  const file = `src/app/api/${role}/dashboard/route.ts`;
  const walkPage = "      if (after) q = q.gt('id', after);\n      // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.\n      return q.order('id', { ascending: true }).limit(ROW_PAGE);";
  return [
    // ── The paged read ──
    { name: `${role}: today's practice is one read again (cut at 1,000, no error)`, file,
      find: 'await readAllById<{ id: string }>((after) => {',
      replace: 'await ((page) => page(null))((after) => {' },
    { name: `${role}: the walk never moves past its first page`, file,
      find: walkPage,
      replace: "      // capped-read-ok: one page of a cursor walk over every row (readAllById), not a cap.\n      return q.order('id', { ascending: true }).limit(ROW_PAGE);" },
    { name: `${role}: the pages come in no order`, file,
      find: "      return q.order('id', { ascending: true }).limit(ROW_PAGE);",
      replace: '      return q.limit(ROW_PAGE);' },
    { name: `${role}: a page is not held to the walk's page size`, file,
      find: "      return q.order('id', { ascending: true }).limit(ROW_PAGE);",
      replace: "      return q.order('id', { ascending: true });" },
    { name: `${role}: the walk reads every coach's rows`, file,
      find: `        .eq('provider_role', '${role}')\n        .eq('provider_id', providerId)\n        .in('status', OPEN_SUB_STATUSES);`,
      replace: `        .eq('provider_role', '${role}')\n        .in('status', OPEN_SUB_STATUSES);` },
    { name: `${role}: the walk reads both roles' rows`, file,
      find: `        .eq('provider_role', '${role}')\n        .eq('provider_id', providerId)\n        .in('status', OPEN_SUB_STATUSES);`,
      replace: "        .eq('provider_id', providerId)\n        .in('status', OPEN_SUB_STATUSES);" },
    { name: `${role}: the walk's page carries no capped-read marker`, file,
      find: walkPage,
      replace: "      if (after) q = q.gt('id', after);\n      return q.order('id', { ascending: true }).limit(ROW_PAGE);" },
    // ── A failed read is null, not 0 ──
    { name: `${role}: a failed read is today's practice again (0 clients, $0)`, file,
      find: '    const practice = subErr ? null : practiceToday(subRows ?? [], {',
      replace: '    const practice = practiceToday(subRows ?? [], {' },
    { name: `${role}: a failed read sends 0 clients`, file,
      find: '    activeClients = practice ? practice.clients : null;',
      replace: '    activeClients = practice ? practice.clients : 0;' },
    { name: `${role}: a failed read sends $0 net`, file,
      find: '    monthlyNetCents = practice ? practice.mrrNetCents : null;',
      replace: '    monthlyNetCents = practice ? practice.mrrNetCents : 0;' },
    { name: `${role}: a failed read is not logged`, file,
      find: `      console.warn('[shape-app] ${role} dashboard: subscriptions read failed — clients and monthly net render "couldn\\'t be read":', subErr.message);\n`,
      replace: '' },
  ];
};

export default {
  test: 'node --test tests/coach-growth.test.mjs tests/dash-kpi-picker.test.mjs tests/capped-reads.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    ...route('trainer'),
    ...route('nutritionist'),
    // ── Every other page's sidebar (trainerDashboard.jsx useDashSidebarLive) ──
    { name: 'sidebar: an unread count is "0 clients" again', file: SIDEBAR,
      find: '        sub: k.activeClients == null ? "clients couldn\'t be read just now" : (k.activeClients === 1 ? "1 client" : k.activeClients + " clients") + " · payouts connect soon",',
      replace: '        sub: (k.activeClients === 1 ? "1 client" : (k.activeClients != null ? k.activeClients : 0) + " clients") + " · payouts connect soon",' },
    { name: 'sidebar: an unread count is a bare dash', file: SIDEBAR,
      find: '        sub: k.activeClients == null ? "clients couldn\'t be read just now" : (k.activeClients === 1 ? "1 client" : k.activeClients + " clients") + " · payouts connect soon",',
      replace: '        sub: (k.activeClients == null ? "—" : k.activeClients === 1 ? "1 client" : k.activeClients + " clients") + " · payouts connect soon",' },
    { name: 'sidebar: a measured 0 clients is said as unread', file: SIDEBAR,
      find: '        sub: k.activeClients == null ? "clients couldn\'t be read just now"',
      replace: '        sub: !k.activeClients ? "clients couldn\'t be read just now"' },
    { name: 'sidebar: an unread net is $0', file: SIDEBAR,
      find: '        amount: k.monthlyNetCents != null ? dsbMoney(k.monthlyNetCents) : "—",',
      replace: '        amount: dsbMoney(k.monthlyNetCents),' },
    { name: 'sidebar: an unread count puts 0 on Clients', file: SIDEBAR,
      find: '      setState({ kind: "live", count: k.activeClients, card: {',
      replace: '      setState({ kind: "live", count: k.activeClients != null ? k.activeClients : 0, card: {' },
    // ── Today's card (dashToday.jsx dashLivePayoutCard; Workouts and Meal plans pass it on) ──
    { name: "Today's card: an unread count is a bare dash again", file: TODAY,
      find: '    sub: n == null ? "clients couldn\'t be read just now" : (n === 1 ? "1 client" : n + " clients") + " · payouts connect soon",',
      replace: '    sub: (n == null ? "—" : n === 1 ? "1 client" : n + " clients") + " · payouts connect soon",' },
    { name: "Today's card: an unread count is \"0 clients\"", file: TODAY,
      find: '  const n = k ? k.activeClients : null;',
      replace: '  const n = k && k.activeClients != null ? k.activeClients : 0;' },
    { name: "Today's card: a measured 0 clients is said as unread", file: TODAY,
      find: '    sub: n == null ? "clients couldn\'t be read just now"',
      replace: '    sub: !n ? "clients couldn\'t be read just now"' },
    { name: "Today's card: an unread net is $0", file: TODAY,
      find: '    amount: k && k.monthlyNetCents != null ? dashMoney(k.monthlyNetCents) : "—",',
      replace: '    amount: dashMoney(k && k.monthlyNetCents),' },
    // ── Today's summary (dashToday.jsx DashBusinessSummary) ──
    { name: "Today's summary: an unread net is \"no subscription data\" again", file: TODAY,
      find: '"today\'s clients · after Shape\'s fee" : "couldn\'t be read just now")}',
      replace: '"today\'s clients · after Shape\'s fee" : "no subscription data")}' },
    { name: "Today's summary: an unread net is $0", file: TODAY,
      find: '    ? (live.kpis && live.kpis.monthlyNetCents != null ? live.kpis.monthlyNetCents : null)',
      replace: '    ? (live.kpis ? live.kpis.monthlyNetCents || 0 : 0)' },
    // ── The KPI strip (dashSignals.js) ──
    { name: 'the strip: an unread client count is a bare dash', file: SIG,
      find: '          return n == null ? { value: null, unit: "count", why: UNREAD } : { value: n, unit: "count" };',
      replace: '          return { value: n, unit: "count" };' },
    { name: 'the strip: an unread client count is 0', file: SIG,
      find: '          var n = kpiNum(live.kpis.activeClients);',
      replace: '          var n = kpiNum(live.kpis.activeClients) || 0;' },
    { name: 'the strip: a measured 0 clients is said as unread', file: SIG,
      find: '          return n == null ? { value: null, unit: "count", why: UNREAD }',
      replace: '          return !n ? { value: null, unit: "count", why: UNREAD }' },
    { name: 'the strip: an unread net is a bare dash', file: SIG,
      find: '          return net == null ? { value: null, unit: "money", why: UNREAD } : { value: net, unit: "money", sub: "after the platform fee" };',
      replace: '          return { value: net, unit: "money", sub: "after the platform fee" };' },
    { name: 'the strip: an unread net is $0', file: SIG,
      find: '          var net = kpiNum(live.kpis.monthlyNetCents);',
      replace: '          var net = kpiNum(live.kpis.monthlyNetCents) || 0;' },
    { name: 'the strip: a measured $0 is said as unread', file: SIG,
      find: '          return net == null ? { value: null, unit: "money", why: UNREAD }',
      replace: '          return !net ? { value: null, unit: "money", why: UNREAD }' },
  ],
};

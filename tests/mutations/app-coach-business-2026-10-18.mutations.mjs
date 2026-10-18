// The coach app's Business page (mobile-app/src/broadsheet/BSCoachBusiness.jsx): guards the app
// carries on its own, beside the shared coachForecast.js functions the business-plan spec covers.
// Run: node scripts/mutate.mjs --spec tests/mutations/app-coach-business-2026-10-18.mutations.mjs --fail-on-skipped
const APP = 'mobile-app/src/broadsheet/BSCoachBusiness.jsx';
const CF = 'public/newdesign/coachForecast.js';
const TRAJ = 'src/lib/coach-trajectory.mjs';

export default {
  test: 'node --test tests/app-coach-business.test.mjs',
  timeoutMs: 240_000,
  mutations: [
    // ── The waiting list is valued at the listing price alone (the website's Codex round 7, #2394) ──
    { name: "waiting list: valued at the Plan's starting rate again", file: APP,
      find: "  const waitRate = biz.kind === 'demo' ? (base.state === 'ready' ? base.rateCents : null) : F.listedCents(biz.listingMonthly);",
      replace: "  const waitRate = base.state === 'ready' ? base.rateCents : null;" },
    { name: 'waiting list: a failed listing read reads as no price yet', file: APP,
      find: "      : biz.listingFailed ? tr('coach:business.clients.waitPriceUnread',",
      replace: "      : false ? tr('coach:business.clients.waitPriceUnread'," },
    { name: 'waiting list: no word on why there is no figure', file: APP,
      find: " : why ? ' ' + why : null}",
      replace: ' : null}' },
    { name: 'waiting list: the shared listing price takes a zero price as a price', file: CF,
      find: '    return listingMonthly != null && Number(listingMonthly) > 0 ? Math.round(Number(listingMonthly) * 100) : null;',
      replace: '    return listingMonthly != null ? Math.round(Number(listingMonthly) * 100) : null;' },
    // ── People, not plans (the website's Codex round 8, #2394) ──
    // ── The Plan's rate for new clients (the website's sweep after #2394 round 10) ──
    { name: 'plan rate: the shared start rounds the rate to $5 again', file: CF,
      find: '      rate: base.rateCents > 0 ? base.rateCents / 100 : 5,',
      replace: '      rate: Math.max(5, Math.round((base.rateCents || 0) / 500) * 5),' },
    { name: "plan rate: the app's slider keeps its old $5 range", file: APP,
      find: '          min={rateRange.min} max={rateRange.max} step={rateRange.step} onChange={setRate}',
      replace: '          min={Math.min(20, start.rate)} max={Math.max(500, start.rate * 2)} step={5} onChange={setRate}' },
    { name: "plan rate: the app's note always says your listing price", file: APP,
      find: "today's clients keep their price\", from: rateFromNote(base, tr) });",
      replace: "today's clients keep their price\", from: rateFromNote({ rateFrom: 'listing' }, tr) });" },
    { name: "plan rate: the app's What clients earn you rounds the rate to the dollar again", file: APP,
      find: '  const [rate, setRate] = React.useState(String(base.rateCents / 100));',
      replace: '  const [rate, setRate] = React.useState(String(Math.round(base.rateCents / 100)));' },
    { name: 'plan rate: the app prints a cent rate as whole dollars', file: APP,
      find: '  const digits = Number.isInteger(r) ? 0 : 2;',
      replace: '  const digits = 0;' },
    { name: "plan rate: the app prints a cent rate in English in every language", file: APP,
      find: "  try { return '$' + new Intl.NumberFormat(intlLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(r); } catch (e) { return '$' + (digits ? r.toFixed(2) : String(r)); }",
      replace: "  return '$' + (digits ? r.toFixed(2) : String(r));" },
    // ── The preview agrees with itself (the sweep after #2394 round 10) ──
    { name: 'preview: its weeks net everyone at 15%, beside an origin list with brought clients', file: APP,
      find: 'mrrNetCents: Math.round(active * 17500 * (1 - 0.75 * 0.15))',
      replace: 'mrrNetCents: Math.round(active * 17500 * (1 - 0.15))' },
    { name: 'preview: its origin list brings a different share than its net', file: APP,
      find: "feeBps: i % 4 === 0 ? 0 : 1500",
      replace: "feeBps: i % 3 === 0 ? 0 : 1500" },
    // ── Departures, decided when each plan ended, over the pace's window (the website's Codex round 8
    // and the sweep after #2394 round 10; re-anchors round 8/9) ──
    { name: 'who left · left: the list counts the last 90 days whatever the pace', file: APP,
      find: "    const gone = F.departures(extra.churn, { pace: churnPace, now, cap: BS_BIZ_CHURN_LIST });",
      replace: "    const gone = F.departures(extra.churn, { pace: null, now, cap: BS_BIZ_CHURN_LIST });" },
    { name: "who left · left: the heading says 90 days over the pace's window", file: APP,
      find: "  const leftHead = churnWin.paced\n",
      replace: "  const leftHead = false\n" },
    { name: "who left · left: no one left is said as 90 days over the pace's window", file: APP,
      find: "      const none = churnWin.paced\n",
      replace: "      const none = false\n" },
    { name: "who left · left: more may have left is said as 90 days over the pace's window", file: APP,
      find: "      const more = churnWin.paced\n",
      replace: "      const more = false\n" },
    { name: 'who left · left: the list is plans, not departures', file: APP,
      find: "      const recent = gone.inWindow;",
      replace: "      const recent = extra.churn.filter((r) => r.departed !== false && r.endedAt && new Date(r.endedAt).getTime() >= churnWin.from);" },
    { name: 'who left · left: a full list is said to be whole', file: APP,
      find: "      const full = biz.kind === 'live' && gone.floor;",
      replace: "      const full = false;" },
    { name: 'who left · left: a plan ended while another was held is listed as gone', file: CF,
      find: '      if (r.departed === false) return;\n',
      replace: '' },
    { name: 'who left · left: an unread history lists people as gone', file: CF,
      find: '    if (all.some((r) => r.departed === null)) return null;\n',
      replace: '' },
    // Its review: decided at the close of the week each plan ended in, one client once a week, as
    // "Joined and left" (the pace) counts them.
    { name: 'who left · week: the list groups one client by the exact moment again, not the week', file: CF,
      find: '(Number.isFinite(t) ? mondayOf(t) : "row:" + i)',
      replace: '(Number.isFinite(t) ? t : "row:" + i)' },
    { name: 'who left · week: the route judges each plan at the instant it ended again', file: TRAJ,
      find: '  const close = weekEnd(mondayUTC(end), now) - 1;',
      replace: '  const close = end;' },
  ],
};

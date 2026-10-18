// The coach app's Business page (mobile-app/src/broadsheet/BSCoachBusiness.jsx): guards the app
// carries on its own, beside the shared coachForecast.js functions the business-plan spec covers.
// Run: node scripts/mutate.mjs --spec tests/mutations/app-coach-business-2026-10-18.mutations.mjs --fail-on-skipped
const APP = 'mobile-app/src/broadsheet/BSCoachBusiness.jsx';
const CF = 'public/newdesign/coachForecast.js';

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
    { name: 'left: a current client is listed as gone', file: APP,
      find: "    const gone = extra.churn.filter((r) => r.stillClient !== true);",
      replace: "    const gone = extra.churn;" },
    { name: 'left: an unread membership lists people as gone', file: APP,
      find: "  else if (extra.churn.some((r) => r.stillClient === null)) left =",
      replace: "  else if (false) left =" },
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
  ],
};

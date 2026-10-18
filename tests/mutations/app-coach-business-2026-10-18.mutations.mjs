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
  ],
};

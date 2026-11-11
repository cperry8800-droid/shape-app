// Mutation spec for the coach page's Summit in the app (owner, 2026-11-11: "The Summit becomes the one
// place to buy: monthly coaching first, then each program as its card with preview and Buy, then the
// workouts, then Message. The separate Programs section and the duplicate price list go away."):
// BSTrainerProfile.jsx builds the Summit and its doors, BSCoachClimb.jsx draws the cards,
// BSCoachStudio.jsx the workouts, and the client module's BSCoachCoachingBlock the storefront without its
// price list. The tests named below must notice every one. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/coach-summit-2026-11-11.mutations.mjs --fail-on-skipped
const PAGE = 'mobile-app/src/broadsheet/BSTrainerProfile.jsx';
const CLIMB = 'mobile-app/src/broadsheet/BSCoachClimb.jsx';
const STUDIO = 'mobile-app/src/broadsheet/BSCoachStudio.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/coach-climb.test.mjs tests/nutritionist-profile.test.mjs tests/coach-work-sheet.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── money: a meal plan's Start ──
    { name: 'page: a meal plan sold without a live listing', file: PAGE,
      find: 'paid: listed && !demo && bsWorkPaid(pl.price) && pl.id != null && !!pl.providerId,', replace: 'paid: !demo && bsWorkPaid(pl.price) && pl.id != null && !!pl.providerId,' },
    { name: 'page: a free meal plan offered to buy', file: PAGE,
      find: 'paid: listed && !demo && bsWorkPaid(pl.price) && pl.id != null && !!pl.providerId,', replace: 'paid: listed && !demo && pl.id != null && !!pl.providerId,' },
    { name: 'page: a meal plan\'s Start buys nothing', file: PAGE,
      find: "onStart={(pl) => buyPlan(pl)} />", replace: 'onStart={() => {}} />' },
    { name: 'page: a failed meal-plan checkout is quiet', file: PAGE,
      find: "    } catch (e) { W.__bsToast?.((e && e.message) || tr('profile:coach.checkoutError', { defaultValue: 'Could not start checkout.' }), 'err'); }",
      replace: '    } catch (e) {}' },
    { name: 'climb: Start on the coach\'s own card', file: CLIMB,
      find: '        const start = !isSelf && !!onStart && !!p.paid;', replace: '        const start = !!onStart && !!p.paid;' },
    // ── the price list goes ──
    { name: 'page: the Summit\'s storefront keeps its price list', file: PAGE,
      find: 'ownZero c={ACC} noPlans desc={coachingDesc} />', replace: 'ownZero c={ACC} desc={coachingDesc} />' },
    { name: 'page: the no-monthly storefront keeps its price list', file: PAGE,
      find: 'ownZero c={ACC} noMonthly noPlans />', replace: 'ownZero c={ACC} noMonthly />' },
    { name: 'block: noPlans ignored', file: CLIENT,
      find: '          {noPlans ? null : <div style={{ marginTop: 28 }}>', replace: '          {false ? null : <div style={{ marginTop: 28 }}>' },
    { name: 'studio: the coaching card drawn in the Summit as well', file: STUDIO,
      find: '        {showCoaching && (coaching || isSelf) ? (', replace: '        {(coaching || isSelf) ? (' },
    // ── what the coaching says, and Message ──
    { name: 'page: the coach\'s line about their coaching is not handed over', file: PAGE,
      find: 'ownZero c={ACC} noPlans desc={coachingDesc} />', replace: 'ownZero c={ACC} noPlans desc="" />' },
    { name: 'page: no Message with the monthly coaching', file: PAGE,
      find: 'ownZero c={ACC} noPlans desc={coachingDesc} />\n          {summitMessage}', replace: 'ownZero c={ACC} noPlans desc={coachingDesc} />' },
    // ── the doors ──
    { name: 'page: Work with leaves a sheet open', file: PAGE,
      find: "  const toSummit = () => { setSheet(null); toCamp('summit'); };", replace: "  const toSummit = () => { toCamp('summit'); };" },
    { name: 'page: Work with climbs to Book', file: PAGE,
      find: "  const toSummit = () => { setSheet(null); toCamp('summit'); };", replace: "  const toSummit = () => { setSheet(null); toCamp('day'); };" },
    // ── unread is not empty ──
    { name: 'page: the coach told to publish while the plans are read', file: PAGE,
      find: '  const plansUnread = !demo && salePlans === null;', replace: '  const plansUnread = false;' },
  ],
};

// Shared trainer dashboard sidebar config
function trainerNavItems(active) {
  // 'Clients' hosts Roster + Console as sub-tabs; Business absorbs Analytics.
  
  // Tabs route into the single-page trainer dashboard (TrainerApp.html). On the
  // shell, #slug is an instant same-document switch; from a legacy page it's a
  // normal nav into the shell (the old pages self-redirect).
  const items = [
    { label: "Today",     slug: "today" },
    { label: "Week",      slug: "week" },      // the end-of-week review (review 2026-09-09, R3)
    { label: "Schedule",  slug: "schedule" },
    { label: "Clients",   slug: "clients" },   // the live count is overlaid by DashSidebar (was a literal 34)
    { label: "Programs",  slug: "programs" },
    { label: "Business",  slug: "business" },
    { label: "Playlists", slug: "playlists" },
    { label: "Community", slug: "community" },
    { label: "Goal",      slug: "goal" },
    { label: "Score",     slug: "score" },
    { label: "Profile",   slug: "profile" },
    { label: "Settings",  slug: "settings" },  // the office panel (review 2026-09-09, R14)
  ];
  // Treat Console as part of Clients for sidebar highlight.
  const map = { console: 'Clients' }; // 'business' matches its own item now
  const norm = map[active.toLowerCase()] || active;
  return items.map(n => ({ ...n, href: "TrainerApp.html#" + n.slug, active: n.label.toLowerCase() === norm.toLowerCase() }));
}
// `demo: true` MARKS THE DATA, so DashSidebar can tell a demo card from a real
// one without depending on object identity (a spread or a clone would slip an
// invented payout past an identity check and show it to a live coach).
//
// ⚠ AND ITS FIGURES ARE DERIVED, NOT PICKED (review 2026-09-09, V5). The card said
// "$18,420 · Month to date" beside a practice strip reading "$1,820 monthly recurring"
// — from the SAME ten demo clients, a tenfold disagreement on one screen — under a
// label frozen at "PAYOUT APR 30" while the page's own dateline rendered today. The
// preview is what a prospective coach evaluates the product on, so it has to agree
// with itself.
//
// ⚠ LAZY, BECAUSE THIS FILE LOADS BEFORE THE ENGINE IT DERIVES FROM. coachNav.jsx is
// script #55 and dashSignals.js is #56, so a module-scope call would read undefined.
// Getters evaluate at render, by which time it is up; a spread copies the evaluated
// values, so `{...card}` still behaves exactly as it did.
//
// ⚠ AND IT REACHES INTO EXACTLY ONE MODULE NOW, WHICH IS THE WHOLE POINT. The first
// cut of this card called `DashSignals.buildMockClients` AND `dashDemoPayouts`
// (dashData.jsx) AND `dashMoney` (dashToday.jsx) — and TEN pages that render this card
// load none of the three. The getters threw, the catch below turned a missing script
// into "PAYOUTS · —", and a page that was simply built wrong reported itself as a page
// with nothing to show. The whole derivation lives in `dashSignals.js` now, which is a
// plain <script> those pages can afford; the catch is back to meaning what it says.
let _coachDemoPayout = null;
function coachDemoPayoutCard() {
  const now = new Date();
  // Keyed on the DAY: a dashboard left open across midnight must not keep quoting
  // yesterday's month-to-date, and the payout countdown moves with it.
  const key = now.toDateString();
  if (_coachDemoPayout && _coachDemoPayout.key === key) return _coachDemoPayout.v;
  let v;
  try {
    v = DashSignals.demoPayoutCard(now);
  } catch (e) {
    // Nothing to derive from yet — say so rather than falling back to an invented figure.
    v = { label: "PAYOUTS", amount: "—", sub: "Month to date" };
  }
  _coachDemoPayout = { key, v };
  return v;
}
// ⚠ ONE SET OF FIGURES FOR BOTH ROLES, because there is one demo roster:
// `buildMockClients` takes no role and `useDashboard` hands the same ten clients to a
// trainer and a nutritionist alike. Two different payout numbers off one roster was
// part of what made the preview incoherent. The two names stay so the nine call sites
// that pick by role do not have to change.
const coachPayoutCardDemo = {
  demo: true,
  get label() { return coachDemoPayoutCard().label; },
  get amount() { return coachDemoPayoutCard().amount; },
  get sub() { return coachDemoPayoutCard().sub; },
};
const trainerPayoutCard = coachPayoutCardDemo;

// Shared nutritionist dashboard sidebar config
function nutriNavItems(active) {
  // 'Clients' hosts Roster + Console as sub-tabs; Business absorbs Analytics.
  // Tabs route into the single-page nutritionist dashboard (NutritionistApp.html).
  const items = [
    { label: "Today",     slug: "today" },
    { label: "Week",      slug: "week" },      // the end-of-week review (review 2026-09-09, R3)
    { label: "Schedule",  slug: "schedule" },
    { label: "Clients",   slug: "clients" },   // the live count is overlaid by DashSidebar (was a literal 28)
    { label: "Plans",     slug: "plans" },
    { label: "Business",  slug: "business" },
    { label: "Playlists", slug: "playlists" },
    { label: "Community", slug: "community" },
    { label: "Goal",      slug: "goal" },
    { label: "Score",     slug: "score" },
    { label: "Profile",   slug: "profile" },
    { label: "Settings",  slug: "settings" },  // the office panel (review 2026-09-09, R14)
  ];
  const map = { console: 'Clients' }; // 'business' matches its own item now
  const norm = map[active.toLowerCase()] || active;
  return items.map(n => ({ ...n, href: "NutritionistApp.html#" + n.slug, active: n.label.toLowerCase() === norm.toLowerCase() }));
}
const nutriPayoutCard = coachPayoutCardDemo;

Object.assign(window, { trainerNavItems, trainerPayoutCard, nutriNavItems, nutriPayoutCard });

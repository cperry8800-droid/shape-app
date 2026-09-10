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
const trainerPayoutCard = { demo: true, label: "PAYOUT APR 30", amount: "$18,420", sub: "Month to date · +22%" };

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
const nutriPayoutCard = { demo: true, label: "PAYOUT APR 30", amount: "$11,240", sub: "Month to date · +14%" };

Object.assign(window, { trainerNavItems, trainerPayoutCard, nutriNavItems, nutriPayoutCard });

// Shared client dashboard sidebar config. Pass `active` string to get the
// navItems array with the correct item marked active.
function clientNavItems(active) {
  // Tabs now route into the single-page client dashboard (ClientApp.html). On the
  // shell, clicking #slug is a same-document hash change → instant client-side
  // switch (no reload/recompile). From a legacy standalone page it's a normal nav
  // into the shell. The old per-tab .html files still resolve (they self-redirect).
  const items = [
    { label: "Today",     slug: "today" },
    { label: "Progress",  slug: "progress" },
    { label: "Workouts",  slug: "workouts" },
    { label: "Nutrition", slug: "nutrition" },
    { label: "Library",   slug: "library" },
    { label: "Team",      slug: "team", count: 2 },
    { label: "Community", slug: "community" },
    { label: "Score",     slug: "score" },
    { label: "Habits",    slug: "habits" },
    { label: "Goal",      slug: "goal" },
    { label: "Profile",   slug: "profile" },
    { label: "Settings",  slug: "settings" },
  ];
  return items.map(n => ({ ...n, href: "ClientApp.html#" + n.slug, active: n.label.toLowerCase() === active.toLowerCase() }));
}
const clientPayoutCard = { label: "SHAPE SCORE", amount: "1,284", sub: "Tempo · 716 to Form" };

Object.assign(window, { clientNavItems, clientPayoutCard });

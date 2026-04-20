// Shared client dashboard sidebar config. Pass `active` string to get the
// navItems array with the correct item marked active.
function clientNavItems(active) {
  const items = [
    { label: "Today",     href: "ClientDashboard.html" },
    { label: "Progress",  href: "ClientProgress.html" },
    { label: "Train",     href: "ClientTrain.html" },
    { label: "Nutri",     href: "ClientNutri.html" },
    { label: "Library",   href: "ClientLibrary.html" },
    { label: "Team",      href: "ClientTeam.html", count: 2 },
    { label: "Community", href: "ClientCommunity.html" },
    { label: "Score",     href: "ClientScore.html" },
    { label: "Goal",      href: "ClientGoal.html" },
    { label: "Me",        href: "ClientMe.html" },
  ];
  return items.map(n => ({ ...n, active: n.label.toLowerCase() === active.toLowerCase() }));
}
const clientPayoutCard = { label: "SHAPE SCORE", amount: "1,284", sub: "Tempo · 3,716 to Peak" };

Object.assign(window, { clientNavItems, clientPayoutCard });

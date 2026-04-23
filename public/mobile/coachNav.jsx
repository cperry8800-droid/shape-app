// Shared trainer dashboard sidebar config
function trainerNavItems(active) {
  const items = [
    { label: "Today",     href: "TrainerDashboard.html" },
    { label: "Clients",   href: "TrainerClients.html", count: 34 },
    { label: "Programs",  href: "TrainerPrograms.html" },
    { label: "Playlists", href: "TrainerPlaylists.html" },
    { label: "Messages",  href: "TrainerMessages.html", count: 3 },
    { label: "Community", href: "TrainerCommunity.html" },
    { label: "Goal",      href: "TrainerGoal.html" },
    { label: "Score",     href: "TrainerScore.html" },
    { label: "Profile",   href: "TrainerProfile.html" },
  ];
  return items.map(n => ({ ...n, active: n.label.toLowerCase() === active.toLowerCase() }));
}
const trainerPayoutCard = { label: "PAYOUT APR 30", amount: "$18,420", sub: "Month to date · +22%" };

// Shared nutritionist dashboard sidebar config
function nutriNavItems(active) {
  const items = [
    { label: "Today",     href: "NutritionistDashboard.html" },
    { label: "Clients",   href: "NutritionistClients.html", count: 28 },
    { label: "Plans",     href: "NutritionistPlans.html" },
    { label: "Playlists", href: "NutritionistPlaylists.html" },
    { label: "Messages",  href: "NutritionistMessages.html", count: 5 },
    { label: "Community", href: "NutritionistCommunity.html" },
    { label: "Goal",      href: "NutritionistGoal.html" },
    { label: "Score",     href: "NutritionistScore.html" },
    { label: "Profile",   href: "NutritionistProfile.html" },
  ];
  return items.map(n => ({ ...n, active: n.label.toLowerCase() === active.toLowerCase() }));
}
const nutriPayoutCard = { label: "PAYOUT APR 30", amount: "$11,240", sub: "Month to date · +14%" };

Object.assign(window, { trainerNavItems, trainerPayoutCard, nutriNavItems, nutriPayoutCard });

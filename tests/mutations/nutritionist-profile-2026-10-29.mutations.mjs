// Mutation spec for the nutritionist profile (owner, 2026-10-27: "lets do something different for
// nutritionists"): the kitchen doc's normalizer (public-read, owner-written), the page's reads and
// bookings as a nutritionist, its kitchen and plate notes, the staples a member saves, the editor,
// and the routes that open it. Every mutation must be killed.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nutritionist-profile-2026-10-29.mutations.mjs --fail-on-skipped
const DOC = 'public/newdesign/profileCustom.mjs';
const PAGE = 'mobile-app/src/broadsheet/BSTrainerProfile.jsx';
const MINE = 'mobile-app/src/broadsheet/BSMakeItYours.jsx';
const APP = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const MKT = 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx';
const DISHES = 'mobile-app/src/broadsheet/kitchenDishes.js';

export default {
  test: 'node --test tests/nutritionist-profile.test.mjs tests/marketplace-trainer-profile.test.mjs tests/search-recent-listing.test.mjs tests/trainer-profile.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the kitchen doc ──
    { name: 'doc: a plate that does not add up to 100 is kept', file: DOC,
      find: '  if (parts[0] + parts[1] + parts[2] !== 100) return null;\n', replace: '' },
    { name: 'doc: a plate off the steps of five is kept', file: DOC,
      find: 'n >= 0 && n <= 100 && n % 5 === 0', replace: 'n >= 0 && n <= 100' },
    { name: 'doc: rules past four are kept', file: DOC,
      find: '    if (rules.length >= BS_KITCHEN_RULES_MAX) break;\n', replace: '' },
    { name: 'doc: a staple named twice is kept twice', file: DOC,
      find: '    if (!n || seenStaple.has(n.toLowerCase())) continue;', replace: '    if (!n) continue;' },
    { name: 'doc: a staple keeps any place it was given', file: DOC,
      find: "staples.push({ n, g: BS_STAPLE_GROUPS.includes(it.g) ? it.g : 'pantry' });", replace: 'staples.push({ n, g: it.g });' },
    { name: 'doc: a recipe slug of any shape is kept', file: DOC,
      find: ' || !DISH_SLUG_RE.test(r)', replace: '' },
    { name: 'doc: the scan of a long array is not capped', file: DOC,
      find: 'const BS_KITCHEN_SCAN = 24;', replace: 'const BS_KITCHEN_SCAN = 100000;' },
    { name: 'doc: an empty kitchen is stored', file: DOC,
      find: '  if (kitchen) base.kitchen = kitchen; else delete base.kitchen;', replace: '  if (kitchen) base.kitchen = kitchen;' },
    // ── the page ──
    { name: 'page: a nutritionist\'s listing is read as a trainer\'s', file: PAGE,
      find: "W.ShapeCoachListing.publicByOwner(role, ownerId)", replace: "W.ShapeCoachListing.publicByOwner('trainer', ownerId)" },
    { name: 'page: a nutritionist\'s hours are read as a trainer\'s', file: PAGE,
      find: 'W.ShapeCoachAvailability.get(role, providerId,', replace: "W.ShapeCoachAvailability.get('trainer', providerId," },
    { name: 'page: a nutritionist\'s intro is booked with a trainer', file: PAGE,
      find: 'submitConsultationBooking({ coach, role, slot,', replace: "submitConsultationBooking({ coach, role: 'trainer', slot," },
    { name: 'page: a nutritionist starts teal', file: PAGE,
      find: "accentKey={look.accent || (nutri ? 'amber' : 'teal')}", replace: "accentKey={look.accent || 'teal'}" },
    { name: 'page: a recipe the catalog lacks is drawn', file: PAGE,
      find: '.map((d) => ({ ...d, recipe: bsKitchenRecipe(d.r) })).filter((d) => d.recipe)', replace: '.map((d) => ({ ...d, recipe: bsKitchenRecipe(d.r) || { title: d.r } }))' },
    { name: 'page: the coach is offered their own staples', file: PAGE,
      find: '                    return isSelf ? (', replace: '                    return false ? (' },
    { name: 'page: a guest saves staples without an account', file: PAGE,
      find: "    if (!picked.size || saving === 'busy') return;\n    if (window.bsRequireAccount && !window.bsRequireAccount(tr('profile:nutri.staplesAsk', { defaultValue: 'add to your grocery list' }))) return;\n",
      replace: "    if (!picked.size || saving === 'busy') return;\n" },
    { name: 'page: the same staples make a new list each time', file: PAGE,
      find: ".sort().join('\\n'))}`;", replace: ".sort().join('\\n'))}-${Date.now()}`;" },
    { name: 'page: the staples list id is cut from the names, so a bigger pick reads as the same list', file: PAGE,
      find: "    const id = `kitchen-${shortHash(ownerKey || 'sample')}-${shortHash(items.map((i) => i.n.toLowerCase()).sort().join('\\n'))}`;",
      replace: "    const id = `kitchen-${ownerKey || 'sample'}-${items.map((i) => i.n.toLowerCase()).sort().join('|')}`.replace(/[^a-z0-9|-]+/gi, '-').slice(0, 120);" },
    { name: 'page: the recipe page\'s grocery button does nothing', file: PAGE,
      find: 'onAddGrocery={addGrocery} groceryAdded={added}', replace: 'onAddGrocery={() => {}} groceryAdded={false}' },
    { name: 'page: a guest saves a recipe\'s list without an account', file: PAGE,
      find: "    if (added || busy) return;\n    if (window.bsRequireAccount && !window.bsRequireAccount(tr('profile:nutri.staplesAsk', { defaultValue: 'add to your grocery list' }))) return;\n",
      replace: "    if (added || busy) return;\n" },
    { name: 'dishes: a recipe\'s list takes another id than Eat gives it', file: DISHES,
      find: "  const id = 'sk-' + String(", replace: "  const id = 'kitchen-sk-' + String(" },
    { name: 'dishes: a recipe\'s list drops the amounts', file: DISHES,
      find: "q: typeof ing.n === 'string' ? ing.n : ''", replace: "q: ''" },
    { name: 'page: plate notes run oldest day first', file: PAGE,
      find: '.sort((a, b) => b.at - a.at)', replace: '.sort((a, b) => a.at - b.at)' },
    { name: 'page: protein so far counts a meal with none logged as 0', file: PAGE,
      find: "  for (const x of meals.slice(0, at + 1)) { const p = num(x.meal && x.meal.p); if (p == null) known = false; else so += p; }",
      replace: "  for (const x of meals.slice(0, at + 1)) { const p = num(x.meal && x.meal.p); if (p != null) so += p; }" },
    { name: 'page: a day\'s energy counts a meal with none logged as 0', file: PAGE,
      find: 'const k = num(m.meal && m.meal.kcal); if (k == null) kcalAll = false; else kcal += k;', replace: 'const k = num(m.meal && m.meal.kcal); if (k != null) kcal += k;' },
    { name: 'page: an energy split from a meal missing a macro', file: PAGE,
      find: '  if (p == null || c == null || f == null) return null;\n  const e = [', replace: '  if (p == null) return null;\n  const e = [' },
    // ── the editor ──
    { name: 'mine: the kitchen is never written', file: MINE,
      find: '    if (kitchenChanged) doc.kitchen =', replace: '    if (false) doc.kitchen =' },
    { name: 'mine: a nutritionist starts teal', file: MINE,
      find: "accent: look.accent || (nutri ? 'amber' : 'teal')", replace: "accent: look.accent || 'teal'" },
    { name: 'mine: more protein takes from carbs before vegetables', file: MINE,
      find: "protein: ['veg', 'carbs'],", replace: "protein: ['carbs', 'veg']," },
    { name: 'mine: the recipe picker has no limit', file: MINE,
      find: "    if (dishes.length >= BS_KITCHEN_DISHES_MAX) { setMsg(tr('profile:mine.dishesFull'", replace: "    if (false) { setMsg(tr('profile:mine.dishesFull'" },
    // ── the ways in ──
    { name: 'app: a nutritionist opens the Signal page', file: APP,
      find: "  if (person.kind === 'TRAINER' || person.kind === 'NUTRI') {\n    return <BSTrainerProfile", replace: "  if (person.kind === 'TRAINER') {\n    return <BSTrainerProfile" },
    { name: 'app: Recent forgets a seeded nutritionist\'s listing', file: APP,
      find: "  if ((role === 'trainer' || role === 'nutritionist') && !person.userId && person.providerId) {", replace: "  if (role === 'trainer' && !person.userId && person.providerId) {" },
    { name: 'marketplace: a nutritionist opens the listing, not the profile', file: MKT,
      find: "    const isCoach = openRole === 'trainer' || openRole === 'nutritionist';", replace: "    const isCoach = openRole === 'trainer';" },
    { name: 'marketplace: a nutritionist is handed as a trainer', file: MKT,
      find: "who: c.name, kind: nutri ? 'NUTRI' : 'TRAINER',", replace: "who: c.name, kind: 'TRAINER'," },
  ],
};

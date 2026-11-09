// Mutation spec for coach dashboard step 6c, part 2 (the owner's coach review, 4 Nov 2026: "One day
// at a time, with Shape Kitchen out of reach"): the meal-plan builder as the week on one screen.
// Covers the row-is-the-meal rule (the review's Lunch bug), the weekdays a day is served on, a day's
// status against its own target, the rest-day target and the note riding the assignment, the version
// a plan stamps, Shape Kitchen's catalog, filters and exclusions, the coach's own kitchen read, the
// projection, and ShapeConfirm on a day. A survivor is a missing test, or a proven no-op marked
// expectSurvive with its proof.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/builders-6c-meal-2026-11-09.mutations.mjs --fail-on-skipped
const WEEK = 'public/newdesign/dashMealWeek.js';
const UI = 'public/newdesign/dashMealBuilder.jsx';

export default {
  test: 'node --test tests/builders-6c-meal.test.mjs tests/coach-dashboard-fixes.test.mjs tests/coach-builder-layouts.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── The row is the meal (the Lunch bug) ──
    // placeMeal sets the slot twice (newMeal's argument, then m.slot), so only breaking both is a fault.
    { name: 'placing a meal ignores its row', file: WEEK, find: '    var m = newMeal(food, slot);\n    m.slot = slot;\n', replace: '    var m = newMeal(food, "Lunch");\n' },
    { name: 'the week module brings back Lunch after Lunch', file: WEEK, find: '    for (var i = 0; i < MAIN.length; i++) if (!taken[MAIN[i]]) return MAIN[i];\n    return "Snack";', replace: '    return (Array.isArray(meals) && meals.length) ? "Lunch" : "Breakfast";' },
    { name: 'a rest day\'s extra is a Snack again', file: UI, find: 'const added = DashMeals.newMeal(f, dmbNextSlot(DashMeals.resolveDay(day, cur)));', replace: 'const added = DashMeals.newMeal(f, "Snack");' },
    { name: 'the Kitchen adds to the first row, full or not', file: WEEK, find: '    for (var i = 0; i < ROWS.length; i++) if (!mealsIn(meals, ROWS[i]).length) return ROWS[i];', replace: '    return ROWS[0];' },
    { name: 'a dropped recipe lands on the picked cell, not the one it was dropped on', file: UI, find: 'if (drag && drag.food) place(drag.food, c.index, slot);', replace: 'if (drag && drag.food && kitchenTarget) place(drag.food, kitchenTarget.day, kitchenTarget.slot);' },
    { name: 'a Kitchen meal loses its recipe id', file: WEEK, find: '    if (food && typeof food.recipeId === "string" && food.recipeId) m.recipeId = food.recipeId;\n', replace: '' },
    // ── The week ──
    { name: 'a day is served on one weekday only', file: WEEK, find: '    for (var dow = 0; dow < 7; dow++) if (dow % n === index) out.push(dow);', replace: '    if (index < 7) out.push(index);' },
    { name: 'a seven-day plan reads "Every day"', file: WEEK, find: '    if (days.length === 7) return "Every day";', replace: '    if (days.length >= 1 && count >= 7) return "Every day";' },
    // ── A day's status ──
    { name: 'the band is 10%', file: WEEK, find: '  var BAND = 0.05;', replace: '  var BAND = 0.1;' },
    { name: 'protein is never Low', file: WEEK, find: '    if (t.p < floor) { out.key = "lowp";', replace: '    if (false) { out.key = "lowp";' },
    { name: 'the protein floor is ignored', file: WEEK, find: 'var floor = proteinFloor != null && isFinite(Number(proteinFloor)) ? Number(proteinFloor) : num(target.p) * 0.9;', replace: 'var floor = num(target.p) * 0.9;' },
    { name: 'an empty day reads Under', file: WEEK, find: '    if (!list.length) { out.key = "empty"; out.label = "Empty"; return out; }\n', replace: '' },
    { name: 'the brief leads with protein over calories', file: WEEK, find: '    var rank = function (c) { return c.status.key === "lowp" ? 0 : 1; };', replace: '    var rank = function (c) { return c.status.key === "lowp" ? 1 : 0; };' },
    { name: 'the projection drops the food', file: WEEK, find: '    return { from: from, to: Math.round(from + num(food && food.kcal)) };', replace: '    return { from: from, to: from };' },
    // ── Training and rest days ──
    { name: 'a rest day is measured against the training target', file: WEEK, find: '    if (kind === "rest" && doc && validTargets(doc.restTargets)) return doc.restTargets;', replace: '' },
    { name: 'the assignment sends a rest day the training target', file: WEEK, find: 'if ((d.tag === "REST" || training.indexOf(d.dow) < 0) && validTargets(plan.restTargets)) {', replace: 'if (false) {' },
    { name: 'a weekday the client doesn\'t train on is sent as a training day', file: WEEK, find: '        d.tag = "REST";\n', replace: '' },
    { name: 'the rest target ships unscaled', file: WEEK, find: "d.targets = { cal: Math.round(num(r.kcal) * scale)", replace: "d.targets = { cal: Math.round(num(r.kcal))" },
    { name: 'the note to the client never rides', file: WEEK, find: '        if (note) m.coachNote = note;', replace: '' },
    { name: 'the rest day reads the training day\'s meals for its notes', file: WEEK, find: 'var served = d.tag === "REST" ? "rest" : "training";', replace: 'var served = "training";' },
    { name: 'the assign sheet skips the week module', file: UI, find: '? DashMealWeek.buildAssignment(DashMeals, doc, opts) : DashMeals.buildMealAssignment(doc, opts);', replace: '? DashMeals.buildMealAssignment(doc, opts) : DashMeals.buildMealAssignment(doc, opts);' },
    // ── The version a plan stamps ──
    { name: 'a library plan never takes its next version', file: WEEK, find: 'var want = opened.persisted && contentKey(next) !== opened.key ? opened.version + 1 : opened.version;', replace: 'var want = opened.version;' },
    { name: 'a new plan takes a version too', file: WEEK, find: 'var want = opened.persisted && contentKey(next) !== opened.key', replace: 'var want = contentKey(next) !== opened.key' },
    { name: 'edits skip the version stamp', file: UI, find: 'const setDoc = (next) => setDocRaw((prev) => W.stampVersion(typeof next === "function" ? next(prev) : next, opened.current));', replace: 'const setDoc = (next) => setDocRaw((prev) => (typeof next === "function" ? next(prev) : next));' },
    // ── Shape Kitchen ──
    { name: 'High protein lets every recipe through', file: WEEK, find: '    if (on.protein && !(k ?', replace: '    if (false && !(k ?' },
    { name: 'Vegetarian is the vegetarian diet only', file: WEEK, find: '  var VEGETARIAN = ["Vegetarian", "Vegan", "Plant-based"];', replace: '  var VEGETARIAN = ["Vegetarian"];' },
    { name: 'Under 20 min takes 20', file: WEEK, find: 'if (on.quick && !(food.prepMin != null && food.prepMin < 20)) return false;', replace: 'if (on.quick && !(food.prepMin != null && food.prepMin <= 20)) return false;' },
    { name: 'dairy is read from the name, not the catalog', file: WEEK, find: '    if (allergen === "dairy") return k.needs.indexOf("Dairy-free") < 0;\n', replace: '' },
    { name: 'the exclusions skip the Kitchen', file: WEEK, find: '      if (k ? kitchenContains(food, a) :', replace: '      if (k ? false :' },
    { name: 'an ingredient stays per recipe, not per serving', file: WEEK, find: '    return { name: name, qty: Math.round((qty / per) * 100) / 100, unit: unit };', replace: '    return { name: name, qty: Math.round(qty * 100) / 100, unit: unit };' },
    { name: 'the coach\'s unwritten macros become a guess', file: WEEK, find: '      kcal: has("kcal") ? r.kcal : 0,', replace: '      kcal: has("kcal") ? r.kcal : 400,' },
    // ── The coach's own kitchen ──
    { name: 'a failed kitchen read reads as none', file: UI, find: '        if (doc == null || typeof doc !== "object") { setRecipes(null); return; }', replace: '        if (doc == null || typeof doc !== "object") { setRecipes([]); return; }' },
    { name: 'the kitchen read ignores Nora\'s setup', file: UI, find: '  }, [live, ownerId, rev]);', replace: '  }, [live, ownerId]);' },
    { name: 'a Kitchen recipe on the plan is listed as the coach\'s own', file: UI, find: '.filter((f) => !shapes.has(String(f.name).toLowerCase()));', replace: ';' },
    { name: 'the preview reads a kitchen', file: UI, find: '    if (!live || !ownerId) return undefined;\n    let on = true;\n    setRecipes(undefined);', replace: '    let on = true;\n    setRecipes(undefined);' },
    // ── Chrome and confirms ──
    { name: 'a whole day goes without asking', file: UI, find: '    if (!ok) return;\n    setDoc((prev) => ({ ...prev, days: prev.days.filter((_, j) => j !== i) }));', replace: '    setDoc((prev) => ({ ...prev, days: prev.days.filter((_, j) => j !== i) }));' },
    { name: 'Assign names nobody', file: UI, find: '  const assignLabel = first ? "Assign to " + first : "Assign to clients";', replace: '  const assignLabel = "Assign to clients";' },
    { name: 'spreading the week loses the served day', file: WEEK, find: '      var copy = clone(days[dow % days.length]);', replace: '      var copy = clone(days[0]);' },
  ],
};

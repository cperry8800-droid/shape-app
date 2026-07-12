// mealShare.mjs — the share-by-choice meal post (spec 2026-07-12).
//
// Pure builders, no IO, unit-tested (tests/meal-share.test.mjs):
//   bsMealSharePayload — the createCommunityPost payload for a shared meal.
//   bsMealMenuLines    — the card's dot-leader macro rows (P / C / F; the
//                        kcal figure rides the card hero, never duplicated).
//
// Contract (owner-locked): the plate, not the ledger — the payload carries
// the meal's own macros ONLY, never day totals/deficit/targets. Attribution
// AND macros are honest-absent: a missing/malformed value is OMITTED, never
// posted as a fabricated 0 ("0 g protein" is a claim, not a blank — review
// round). skipAward is always true — the meal LOG earns (award_meal_log);
// the share never does (the RPC guard migration covers the web route too).

// Whole-number gram/kcal, or null when the input isn't a real number.
function bsMealNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function bsMealSharePayload({
  name = '',
  kcal, p, c, f,
  portion = 1,
  planned = false,
  note = '',
  recipeId = '',
  coach = '',
  privacy = 'community',
} = {}) {
  const metrics = { kind: 'meal', planned: !!planned };
  const kcalN = bsMealNum(kcal), pN = bsMealNum(p), cN = bsMealNum(c), fN = bsMealNum(f);
  if (kcalN != null) metrics.kcal = kcalN;
  if (pN != null) metrics.p = pN;
  if (cN != null) metrics.c = cN;
  if (fN != null) metrics.f = fN;
  const mult = Number(portion);
  if (Number.isFinite(mult) && mult > 0 && mult !== 1) metrics.portion = Math.round(mult * 100) / 100;
  const rid = String(recipeId || '').trim();
  if (rid) metrics.recipeId = rid;
  const ch = String(coach || '').trim();
  if (ch) metrics.coach = ch;
  return {
    title: String(name || '').trim() || 'Meal',
    activityType: 'meal',
    privacy,
    note: String(note || '').trim(),
    metrics,
    skipAward: true,
  };
}

// The plate's menu rows — label/value pairs for the dot-leader lines. Grams
// render as whole numbers, and a missing/malformed macro DROPS its row
// (honest-absent — never a fabricated "0 g").
export function bsMealMenuLines(meal) {
  const m = meal || {};
  return [['Protein', bsMealNum(m.p)], ['Carbs', bsMealNum(m.c)], ['Fat', bsMealNum(m.f)]]
    .filter((r) => r[1] != null)
    .map(([l, v]) => [l, `${v} g`]);
}

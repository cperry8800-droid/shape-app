// mealShare.mjs — the share-by-choice meal post (spec 2026-07-12).
//
// Pure builders, no IO, unit-tested (tests/meal-share.test.mjs):
//   bsMealSharePayload — the createCommunityPost payload for a shared meal.
//   bsMealMenuLines    — the card's dot-leader macro rows (P / C / F; the
//                        kcal figure rides the card hero, never duplicated).
//
// Contract (owner-locked): the plate, not the ledger — the payload carries
// the meal's own macros ONLY, never day totals/deficit/targets. Attribution
// is honest-absent: recipeId/coach ride ONLY when truthy (no empty strings).
// skipAward is always true — the meal LOG earns (award_meal_log); the share
// never does (the RPC guard migration covers the web route too).

export function bsMealSharePayload({
  name = '',
  kcal = 0, p = 0, c = 0, f = 0,
  portion = 1,
  planned = false,
  note = '',
  recipeId = '',
  coach = '',
  privacy = 'community',
} = {}) {
  const round = (v) => Math.round(Number(v) || 0);
  const metrics = {
    kind: 'meal',
    kcal: round(kcal),
    p: round(p),
    c: round(c),
    f: round(f),
    planned: !!planned,
  };
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
// render as whole numbers (the logger stores integers; a stray float never
// prints ".00000001 g" on a card).
export function bsMealMenuLines(meal) {
  const m = meal || {};
  const g = (v) => `${Math.round(Number(v) || 0)} g`;
  return [
    ['Protein', g(m.p)],
    ['Carbs', g(m.c)],
    ['Fat', g(m.f)],
  ];
}

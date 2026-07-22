// Meal-prep RECORDS — the canonical PREPPED-state semantics (Cook Mode wave
// PR C). ONE implementation for both surfaces (the varianceBand/liveProgress
// precedent): the website loads this as a native ES module
// (window.ShapeMealPrepLib), mobile re-exports it from
// mobile-app/src/services/mealPrep.mjs, Node tests import through the mobile
// module. Dependency-free on purpose — the mise-merge/session-order half
// (which needs cookable.mjs, not web-servable) stays mobile-side.
//
// The PREPPED doctrine: entries live in user_goals('meal_prep') as
// { entries: [{ weekKey, dayIdx?, slot?, recipeTitle, mealTitle?, recipeId?,
//   mealId?, servings, preppedAt }] }; a record is FRESH for 4 days (owner
// ruling §13.3 — a stale "PREPPED ✓" on spoiled food is worse than none);
// matching is mealId first, else EXACT normalized title — never fuzzy, so a
// stamp can never land on the wrong meal.

export const BS_PREP_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;

const normTitle = (s) => String(s || '').trim().toLowerCase();

export const bsPrepWeekKey = (d) => {
  const dt = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  const dow = (dt.getDay() + 6) % 7;              // 0 = Monday, local calendar
  dt.setDate(dt.getDate() - dow);
  const p = (x) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
};

export const bsPrunePrep = (entries, now) => (Array.isArray(entries) ? entries : [])
  .filter((e) => {
    const at = e && Number(e.preppedAt);
    return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < BS_PREP_WINDOW_MS;
  });

// Exact matching only: mealId wins, else the title must equal (normalized) the
// entry's mealTitle OR recipeTitle. Returns the freshest matching entry or null.
export const bsPrepMatch = (entries, { mealId, title } = {}, now) => {
  const fresh = bsPrunePrep(entries, now);
  const t = normTitle(title);
  let best = null;
  fresh.forEach((e) => {
    const hit = (mealId && e.mealId && String(e.mealId) === String(mealId))
      || (t && (normTitle(e.mealTitle) === t || normTitle(e.recipeTitle) === t));
    if (hit && (!best || Number(e.preppedAt) > Number(best.preppedAt))) best = e;
  });
  return best;
};

// Compact read for the wrap screen + the coach register mirror:
// { count, lastAt, days: ['Mon','Thu'] } over the FRESH entries only.
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const bsPrepSummary = (entries, now) => {
  const fresh = bsPrunePrep(entries, now);
  if (!fresh.length) return null;
  const days = [];
  fresh.forEach((e) => {
    const i = Number(e.dayIdx);
    if (Number.isInteger(i) && i >= 0 && i <= 6 && !days.includes(DAY_LABELS[i])) days.push(DAY_LABELS[i]);
  });
  days.sort((a, b) => DAY_LABELS.indexOf(a) - DAY_LABELS.indexOf(b));
  const lastAt = fresh.reduce((m, e) => Math.max(m, Number(e.preppedAt) || 0), 0);
  return { count: fresh.length, lastAt, days };
};

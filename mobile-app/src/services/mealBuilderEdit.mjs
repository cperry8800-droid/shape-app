// A nutritionist's meal plan as the website builder keeps it (coach_plans.detail.mealBuilder, the
// document public/newdesign/dashMealCore.js describes), edited and assigned in the app. Owner,
// 2026-11-04, of Nora's meal-plan drafts: "can only be edited and assigned on the website, not in the
// app … can you fix these and make them possible?".
//
// PURE, and every change goes through the builder's own functions (`M` is window.DashMeals, handed
// in so node tests can pass the same module): the app and the website edit a plan the same way, and
// Assign sends the menu the website's Assign would (DashMeals.buildMealAssignment).
//
// The app edits a day as it is served on a training day, its base meals. A plan's rest-day and
// travel-day versions are kept as they are: they follow the base meals they do not override, so a
// swapped meal flows into them, and a removed one leaves them with it.

const clone = (o) => JSON.parse(JSON.stringify(o));

/** The builder's document on a plan's detail, or null when the plan is not one. */
export function mealBuilderDoc(detail) {
  const doc = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail.mealBuilder : null;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  if (!Array.isArray(doc.days) || !doc.days.length) return null;
  if (!doc.days.every((d) => d && typeof d === 'object' && Array.isArray(d.slots))) return null;
  if (!doc.targets || typeof doc.targets !== 'object') return null;
  return doc;
}

/** A day's meals as served on a training day, and their totals. */
export function dayMeals(M, day) { return M.resolveDay(day, 'training'); }
export function dayTotals(M, day) { return M.mealsTotals(dayMeals(M, day)); }

/** Whether any day has its own rest-day or travel-day version (the app edits the base only). */
export function hasVariants(doc) {
  return !!(doc && Array.isArray(doc.days) && doc.days.some((d) => d && d.variants && Object.keys(d.variants).some((k) => d.variants[k])));
}

/** Shape's foods that fit the plan's own rules (what it leaves out, its longest prep). */
export function foodsFor(M, doc, query) { return M.searchFoods(query, doc && doc.constraints); }

/** One meal swapped for a library food, in the same slot. */
export function swapMeal(M, doc, dayIdx, mealId, food) {
  const day = doc && doc.days && doc.days[dayIdx];
  const cur = day && day.slots.find((m) => m && m.id === mealId);
  if (!cur || !food) return doc;
  const next = clone(doc);
  // applyToVariants: a rest or travel day that still follows this meal takes the new one; one that
  // overrides it keeps its own.
  next.days[dayIdx] = M.editBaseMeal(next.days[dayIdx], mealId, { ...M.newMeal(food, cur.slot), id: mealId }, true);
  return next;
}

/** One meal taken off a day; a variant's override of it goes with it, since it overrides nothing. */
export function removeMeal(doc, dayIdx, mealId) {
  const day = doc && doc.days && doc.days[dayIdx];
  if (!day || !day.slots.some((m) => m && m.id === mealId)) return doc;
  const next = clone(doc);
  const d = next.days[dayIdx];
  d.slots = d.slots.filter((m) => !m || m.id !== mealId);
  Object.keys(d.variants || {}).forEach((k) => { const v = d.variants[k]; if (v && v.overrides) delete v.overrides[mealId]; });
  return next;
}

/** A library food added to a day, after the day's last meal of the same slot or earlier. */
export function addMeal(M, doc, dayIdx, food, slot) {
  const day = doc && doc.days && doc.days[dayIdx];
  if (!day || !food) return doc;
  const next = clone(doc);
  const d = next.days[dayIdx];
  const order = M.SLOTS || ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const rank = (s) => { const i = order.indexOf(s); return i < 0 ? order.length : i; };
  const meal = M.newMeal(food, slot);
  let at = d.slots.length;
  for (let i = d.slots.length - 1; i >= 0; i -= 1) {
    if (rank(d.slots[i] && d.slots[i].slot) <= rank(slot)) { at = i + 1; break; }
    at = i;
  }
  d.slots.splice(at, 0, meal);
  return next;
}

// A target is a whole number in a sane range; anything else leaves the one there.
const TARGET_RANGE = { kcal: [800, 6000], p: [0, 600], c: [0, 900], f: [0, 400] };
/** The day's targets with one changed, or the document as it was for a value out of range. */
export function setTarget(doc, key, value) {
  const range = TARGET_RANGE[key];
  const n = typeof value === 'number' ? value : String(value == null ? '' : value).trim() === '' ? NaN : Number(value);
  if (!range || !Number.isFinite(n)) return doc;
  const v = Math.round(n);
  if (v < range[0] || v > range[1] || (doc.targets && doc.targets[key] === v)) return doc;
  const next = clone(doc);
  next.targets = { ...next.targets, [key]: v };
  return next;
}

/** The plan's line in the library, as the website builder writes it ("1900 kcal · Cut"). */
export function mealPlanMeta(M, doc) {
  const phase = (M.GOAL_PHASES || []).find((g) => g.key === doc.goalPhase);
  return `${doc.targets.kcal} kcal · ${phase ? phase.label : 'Maintain'}`;
}

/** The week Assign sends, as the website's Assign builds it (training days Mon, Wed, Fri). */
export function assignmentDays(M, doc) {
  const edits = doc.groceryEdits && typeof doc.groceryEdits === 'object' && Object.keys(doc.groceryEdits).length ? doc.groceryEdits : null;
  return M.buildMealAssignment(doc, { scale: 1, groceryEdits: edits }).days;
}

// ── The unsaved draft, kept on this device (Codex on #2594) ──
// Whatever takes the coach away (a tab, a swipe, a notification, a page opened over Plans), nothing is
// lost: the editor keeps its unsaved document here, per account and plan, as the workout editor keeps
// its own (coachWorkoutDraftKey), with the revision it was made on. Opening the plan again restores it;
// a save, or leaving without saving, drops it.

/** Where a plan's unsaved draft is kept on this device. */
export function mealDraftKey(uid, planId) {
  return `shape.coach.meal-draft.v1:${encodeURIComponent(uid || 'preview')}:${encodeURIComponent(planId || '')}`;
}

const DRAFT_TARGETS = ['kcal', 'p', 'c', 'f'];
/**
 * A kept draft read back: { name, doc, revision, targets? }, or null when there is none or it is not
 * one. `targets` is the text of targets still being typed, as the boxes hold it (digits, four at most).
 */
export function readMealDraft(raw) {
  try {
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || typeof d.name !== 'string') return null;
    const doc = mealBuilderDoc({ mealBuilder: d.doc });
    if (!doc) return null;
    const typed = d.targets && typeof d.targets === 'object' && !Array.isArray(d.targets)
      ? Object.entries(d.targets).filter(([k, v]) => DRAFT_TARGETS.includes(k) && (typeof v === 'string' || typeof v === 'number'))
        .map(([k, v]) => [k, String(v).replace(/[^\d]/g, '').slice(0, 4)])
      : [];
    return { name: d.name, doc, revision: Number(d.revision) || 0, ...(typed.length ? { targets: Object.fromEntries(typed) } : {}) };
  } catch (e) { return null; }
}

// Whether a nutritionist's DIET can go on a client's Eat tab (Codex on #2594).
//
// A diet is a guide: options for each meal and the foods to favour and avoid ("Breakfast options —
// Oats, eggs", "Foods to avoid — Fried food"). That is the shape the app's builder starts one with
// and the one Nora drafts. Assign turns every line it serves into a meal, so a guide would put
// "Fried food, sugary drinks" on the client's Eat tab as a meal, and assigning archives the menu
// they had. A diet is a week of meals only when the coach has written a menu for every day in the
// editor (its day tabs). A diet that would serve its option lines on any day is a guide, and is
// not assigned.
//
// PURE. A plan in the website builder's document is a meal plan, never a diet.

import { bsPlanWeek } from './planOutline.mjs';

/** True when Assign would serve a diet's guide lines (or nothing) on some day. */
export function dietIsGuide(detail) {
  const d = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : null;
  if (!d || d.buildType !== 'diet' || d.mealBuilder) return false;
  // bsPlanWeek hands a day with no menu of its own the plan's lines (the same array).
  return bsPlanWeek(d).days.some((day) => day.blocks === d.blocks || !Array.isArray(day.blocks) || !day.blocks.length);
}

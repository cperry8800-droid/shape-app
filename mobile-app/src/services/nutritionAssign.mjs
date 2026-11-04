// Whether a nutritionist's plan can go on a client's Eat tab as a week of meals (Codex on #2594).
//
// Assign turns every line a nutrition plan serves into a meal, and assigning archives the menu the
// client had. Two of the Plans page's kinds are not menus:
//
//   program  what to work on each week ("Week 1 — Reset & habits"). It holds no meals, ever: an
//            edited one with fewer than two week lines left is still a program, not a menu of one.
//   diet     a guide: options for each meal and foods to favour and avoid ("Breakfast options —
//            Oats, eggs", "Foods to avoid — Fried food"), the shape the app's builder starts one
//            with and the one Nora drafts. It is a week of meals only when the coach has written a
//            menu for every day in the editor (its day tabs).
//
// PURE. A plan in the website builder's document is a meal plan, whatever else its detail says.

import { bsPlanWeek } from './planOutline.mjs';

const detailOf = (detail) => (detail && typeof detail === 'object' && !Array.isArray(detail) && !detail.mealBuilder ? detail : null);

/** True when Assign would serve a diet's guide lines (or nothing) on some day. */
export function dietIsGuide(detail) {
  const d = detailOf(detail);
  if (!d || d.buildType !== 'diet') return false;
  // bsPlanWeek hands a day with no menu of its own the plan's lines (the same array).
  return bsPlanWeek(d).days.some((day) => day.blocks === d.blocks || !Array.isArray(day.blocks) || !day.blocks.length);
}

/** Why a nutrition plan is not a menu to assign: 'program', 'diet' (a guide), or null when it is one. */
export function nutritionNotAMenu(detail) {
  const d = detailOf(detail);
  if (!d) return null;
  if (d.buildType === 'program') return 'program';
  return dietIsGuide(d) ? 'diet' : null;
}

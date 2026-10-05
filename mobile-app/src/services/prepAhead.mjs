// Night-before prep (owner, 2026-10-04: "if anything that needs to be prepped the night before,
// that should be a notification to the user to remind them if it is part of a meal plan"; the
// review's suggestions taken 2026-10-05). A meal on the member's plan whose recipe has to be
// prepped the night before (a catalog step marked `makeAhead`, the overnight oats) reaches them
// as one reminder the evening before, and as a card on Eat.
//
// ⚠ ONE RULE FOR BOTH. The server's hourly job (src/app/api/cron/prep-reminders) and the app's
// Eat card import this file, so they agree on which meals need prepping and which a prep already
// covers. They differ in one way, on purpose: the reminder names a day once (`reminded`), while
// the card stays until the prep is recorded, so a member who made the jars without telling the
// app still sees it, and "Already done" clears it.
//
// Dates are 'YYYY-MM-DD' strings in the MEMBER's calendar. Nothing here reads a clock or a
// timezone: callers pass `today`, `now` and `dayOf(ms)`, which turns an instant into the member's
// date. No React, no window, so Node tests and the server run it as written.
import { bsCookableFromRecipe, bsCookSlug } from './cookable.mjs';
import { bsPrepWeekKey, bsPrunePrep } from './mealPrep.mjs';

const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const norm = (s) => String(s || '').trim().toLowerCase();

export const bsYmdAdd = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// 0 = Monday, the plan's own numbering (client_meal_plans.payload.days[].dow).
export const bsYmdDow = (ymd) => (new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7;

// An instant as a calendar date: in `tz` when given (the server, per member), else the device's.
// A zone Intl refuses reads as UTC rather than throwing the whole run.
export const bsYmdIn = (ms, tz) => {
  const d = new Date(ms);
  if (tz) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch (e) { return d.toISOString().slice(0, 10); }
  }
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// A plan's days by weekday, exactly as Eat lays them out (buildMealProgram reads this): a day
// with a valid `dow` takes its weekday, and days without one fill the empty weekdays in order.
// A plan is a weekly template, so the same seven days repeat every week.
export function bsPlanByDow(days) {
  const byDow = [null, null, null, null, null, null, null];
  const seq = [];
  for (const d of (Array.isArray(days) ? days : [])) {
    if (!d || typeof d !== 'object') continue;
    if (Number.isInteger(d.dow) && d.dow >= 0 && d.dow <= 6 && !byDow[d.dow]) byDow[d.dow] = d;
    else seq.push(d);
  }
  for (let i = 0; i < 7 && seq.length; i++) if (!byDow[i]) byDow[i] = seq.shift();
  return byDow;
}

// The planned meals on one date, with the member's swaps applied. A swap is stored by the meal's
// own title (Eat's `client_meal_swaps`, which applies it to that meal on every day), so it is
// applied the same way here. `mealId` is Eat's: the meal's id, else `live-<weekday>-<index>`.
// A swapped meal is matched to the catalog by its new title; otherwise by its recipeId, then its
// title, as bsCookableFromMeal maps it.
export function bsPlanMealsOn(byDow, ymd, swaps) {
  if (!isYmd(ymd) || !Array.isArray(byDow)) return [];
  const dow = bsYmdDow(ymd);
  const day = byDow[dow];
  const meals = day && Array.isArray(day.meals) ? day.meals : [];
  return meals.map((meal, j) => {
    if (!meal || typeof meal !== 'object') return null;
    const baseTitle = String(meal.title || '');
    const swap = swaps && typeof swaps === 'object' && baseTitle && swaps[baseTitle] && typeof swaps[baseTitle] === 'object' ? swaps[baseTitle] : null;
    const title = swap && swap.title ? String(swap.title) : baseTitle;
    const slug = swap ? bsCookSlug(title) : bsCookSlug(meal.recipeId ? String(meal.recipeId) : title);
    return {
      date: ymd, dow,
      mealId: meal.id != null && meal.id !== '' ? String(meal.id) : `live-${dow}-${j}`,
      slot: String(meal.slot || 'MEAL').toUpperCase(),
      title, slug,
    };
  }).filter((m) => m && m.title);
}

// The catalog recipes that have to be prepped the night before, by slug. A recipe qualifies only
// when its method is cut at a make-ahead step AND steps follow for later (`laterSteps`): the
// batido's "refrigerate up to 4 hours" is marked too, but it is a storage limit on its last step,
// so nothing is left for the morning and no reminder is owed. `keeps` is how many days one prep
// lasts (the step's `keepsDays`, else 1): the oats keep 3, so one evening can cover three
// breakfasts.
export function bsMakeAheadIndex(recipes) {
  const out = new Map();
  for (const r of (Array.isArray(recipes) ? recipes : [])) {
    const c = r && r.title ? bsCookableFromRecipe(r) : null;
    if (!c || !Array.isArray(c.laterSteps) || !c.laterSteps.length) continue;
    const cut = (c.stepMeta || []).find((m) => m && m.finishesLater === true) || {};
    const keeps = Number.isInteger(cut.keepsDays) && cut.keepsDays >= 1 && cut.keepsDays <= 7 ? cut.keepsDays : 1;
    const slug = bsCookSlug(r.title);
    out.set(slug, { slug, title: r.title, keeps });
  }
  return out;
}

// Whether a prep record covers a made-ahead meal ON ITS DAY.
// ⚠ STRICTER THAN bsPrepMatch, ON PURPOSE. bsPrepMatch stamps any fresh record whose title
// matches, which is right for a box of curry but wrong for a jar made for one morning: oats
// prepped on Sunday for Monday to Wednesday would still read as prepped for Thursday (Sunday is
// inside the 4-day freshness window), so Thursday's reminder would never go out. A record covers
// a meal only when it is that meal (its mealId, else its title when the record has no mealId) and
// either names the meal's date (`forDate`, written by this feature) or was made before that date
// and no more than `keeps` days before it.
export function bsPrepCovers(entries, meal, keeps, dayOf, now) {
  if (!meal || !isYmd(meal.date)) return false;
  const k = Number.isInteger(keeps) && keeps >= 1 ? keeps : 1;
  return bsPrunePrep(entries, now).some((e) => {
    const same = e.mealId
      ? String(e.mealId) === String(meal.mealId)
      : !!norm(meal.title) && (norm(e.mealTitle) === norm(meal.title) || norm(e.recipeTitle) === norm(meal.title));
    if (!same) return false;
    if (isYmd(e.forDate)) return e.forDate === meal.date;
    const on = dayOf(Number(e.preppedAt));
    return isYmd(on) && on < meal.date && on >= bsYmdAdd(meal.date, -k);
  });
}

// What to prep TONIGHT (`today` is the member's date): every made-ahead meal planned for tomorrow
// that no record covers and no earlier reminder named, grouped by recipe. Each group then takes
// in the same recipe on the following days that one prep still covers (`keeps`), so one evening
// and one reminder cover them all: oats on Monday to Wednesday is one Sunday reminder to make 3.
// A day already named by an earlier reminder (`reminded`, 'YYYY-MM-DD|mealId' keys) is never
// named again, so Monday night does not ask again for the Tuesday that Sunday's batch covered.
export function bsPrepDueTonight({ days, swaps, entries, reminded, today, index, dayOf, now }) {
  if (!isYmd(today) || !(index instanceof Map) || !index.size || typeof dayOf !== 'function') return [];
  const byDow = bsPlanByDow(days);
  const seen = new Set(Array.isArray(reminded) ? reminded : []);
  const open = (meal, info) => !seen.has(`${meal.date}|${meal.mealId}`) && !bsPrepCovers(entries, meal, info.keeps, dayOf, now);
  const tomorrow = bsYmdAdd(today, 1);
  const groups = new Map();
  for (const meal of bsPlanMealsOn(byDow, tomorrow, swaps)) {
    const info = index.get(meal.slug);
    if (!info || !open(meal, info)) continue;
    if (!groups.has(info.slug)) groups.set(info.slug, { ...info, meals: [] });
    groups.get(info.slug).meals.push(meal);
  }
  for (const g of groups.values()) {
    for (let k = 1; k < g.keeps; k++) {
      for (const meal of bsPlanMealsOn(byDow, bsYmdAdd(tomorrow, k), swaps)) {
        if (meal.slug === g.slug && open(meal, g)) g.meals.push(meal);
      }
    }
  }
  return [...groups.values()];
}

// The prep records one finished (or "Already done") group writes to user_goals('meal_prep'),
// one per meal it covers. `forDate` is what makes the cover exact (bsPrepCovers); the rest is
// the PREPPED record every other reader already understands. `weekKey` is the week the prep was
// made in, as BSPrepSession writes it.
export function bsPrepRecordsFor(group, now) {
  if (!group || !Array.isArray(group.meals)) return [];
  return group.meals.map((m) => ({
    weekKey: bsPrepWeekKey(new Date(now)),
    dayIdx: m.dow, slot: m.slot,
    recipeTitle: group.title, mealTitle: m.title, recipeId: group.slug,
    mealId: m.mealId, servings: 1,
    preppedAt: now, forDate: m.date,
  }));
}

// The server's words for the reminder. ⚠ ENGLISH ONLY, like every server-written notification
// today (/api/cron/reminders): the notifications table has no locale to write in. The app's own
// card is translated.
const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT = { BFAST: 'breakfast', BREAKFAST: 'breakfast', LUNCH: 'lunch', SNACK: 'snack', DINNER: 'dinner', DINR: 'dinner' };
const andList = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export function bsPrepReminderText(groups) {
  const gs = (Array.isArray(groups) ? groups : []).filter((g) => g && Array.isArray(g.meals) && g.meals.length);
  if (!gs.length) return null;
  if (gs.length > 1) {
    return {
      title: 'Prep tonight for tomorrow',
      body: andList(gs.map((g) => (g.meals.length > 1 ? `${g.title} (make ${g.meals.length})` : g.title))) + '.',
    };
  }
  const g = gs[0];
  const slots = [...new Set(g.meals.map((m) => SLOT[m.slot] || 'meal'))];
  const slot = slots.length === 1 ? slots[0] : 'meals';
  if (g.meals.length === 1) return { title: `Prep tonight: ${g.title}`, body: `For tomorrow's ${slot}. Make it tonight so it is ready.` };
  const days = andList([...new Set(g.meals.map((m) => DAY[m.dow]))]);
  return { title: `Prep tonight: ${g.title}`, body: `Make ${g.meals.length} tonight, for ${slot} on ${days}.` };
}

// The notification's route: the in-app list and a tapped push open the cook screen on this
// recipe (bsRouteNotification), and the website's bell opens its cook page.
export const bsPrepRoute = (slug) => `prep:${slug}`;

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
//
// PHASE 2 (the owner-approved review's "Second" phase; 2026-11-01). Four more ways in, all through
// this one rule:
//   - a nutritionist ticks "prep the night before" on any meal of a plan (`prepNightBefore: true` on
//     the plan's own meal JSON), so a dish they typed, which no catalog recipe matches, is owed a
//     reminder like the oats (bsMakeAheadInfo);
//   - the member chooses the hour it comes at (bsPrepHourOf; 7 pm until they do);
//   - the member plans a meal for a day themselves (mealDays.mjs, user_goals `client_meal_days`), and
//     a planned dish that needs the night before is owed one like a plan's;
//   - a meal that was not prepped last night is offered a quick swap that morning (bsMorningSwapFor),
//     kept as the member's own swap for that day only.
import { bsCookableFromRecipe, bsCookSlug } from './cookable.mjs';
import { bsPrepWeekKey, bsPrunePrep } from './mealPrep.mjs';
import { np, phrase, listOf, weekdayOf } from './noticeCopy.mjs';
import { bsMealDayOf } from './mealDays.mjs';

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
// `mine` is the member's own day document (mealDays.mjs). The meals they planned for this date come
// after the plan's (`own-<id>`, matched by their recipe id; a title swap never touches them, since
// the member chose them), and that day's swap of a meal (by its meal id) replaces it, title swap or
// not. `nightBefore` is the nutritionist's tick on the plan's meal; a swap of either kind takes it
// away, since the tick was for the dish that is no longer on the plate. `kcal` is what the meal
// counts (its swap's when swapped), for the morning swap's pick.
export function bsPlanMealsOn(byDow, ymd, swaps, mine) {
  if (!isYmd(ymd) || !Array.isArray(byDow)) return [];
  const dow = bsYmdDow(ymd);
  const day = byDow[dow];
  const meals = day && Array.isArray(day.meals) ? day.meals : [];
  const own = bsMealDayOf(mine, ymd);
  const kcalOf = (v) => (Number(v) > 0 ? Number(v) : null);
  const fromPlan = meals.map((meal, j) => {
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
      nightBefore: !swap && meal.prepNightBefore === true,
      kcal: kcalOf(swap ? swap.kcal : meal.kcal),
    };
  });
  const fromMember = own.add.map((a) => ({
    date: ymd, dow, mealId: `own-${a.id}`, slot: a.slot, title: a.title,
    slug: bsCookSlug(a.recipeId || a.title), nightBefore: false, kcal: kcalOf(a.kcal), own: true,
  }));
  return [...fromPlan, ...fromMember].filter((m) => m && m.title).map((m) => {
    const ds = own.swap[m.mealId];
    return ds ? { ...m, title: ds.title, slug: bsCookSlug(ds.recipeId || ds.title), nightBefore: false, kcal: kcalOf(ds.kcal), daySwap: true } : m;
  });
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

// A plan meal's name without the calories the app's outline writes after it: the coach's line
// "Breakfast — Overnight oats, three ways · 480 kcal" is the meal "Overnight oats, three ways".
export function bsMealNameCore(name) {
  return String(name == null ? '' : name).replace(/\s*[·•|–—-]?\s*\d{1,5}\s*kcal\s*$/i, '').trim();
}
// The catalog recipe a meal's name is when it has to be made the night before, or null: what the
// nutritionist's builders mark as "Prepped the night before" without a tick, and what the app's
// Assign maps the meal to (its recipe id), so the reminder and the cook screen find it.
export function bsMadeAheadByName(name, index) {
  const slug = bsCookSlug(bsMealNameCore(name));
  return slug && index instanceof Map ? index.get(slug) || null : null;
}

// What one planned meal needs the night before, or null: a catalog recipe the index knows (with its
// own keep), else a meal the nutritionist ticked, which keeps one day (a dish typed into a plan says
// nothing of how long it lasts, so each evening covers the next day only). `catalog` says which:
// only a catalog recipe has a method to walk, so only it is offered Start and a `prep:` route.
export function bsMakeAheadInfo(meal, index) {
  if (!meal || !meal.slug) return null;
  const known = index instanceof Map ? index.get(meal.slug) : null;
  if (known) return { ...known, catalog: true };
  if (meal.nightBefore === true) return { slug: meal.slug, title: meal.title, keeps: 1, catalog: false };
  return null;
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
// `mine` is the member's own day document (mealDays.mjs): a meal they planned is owed like a plan's,
// and a dish the nutritionist ticked is owed like a catalog recipe (bsMakeAheadInfo).
export function bsPrepDueTonight({ days, swaps, mine, entries, reminded, today, index, dayOf, now }) {
  if (!isYmd(today) || !(index instanceof Map) || typeof dayOf !== 'function') return [];
  const byDow = bsPlanByDow(days);
  const seen = new Set(Array.isArray(reminded) ? reminded : []);
  const open = (meal, info) => !seen.has(`${meal.date}|${meal.mealId}`) && !bsPrepCovers(entries, meal, info.keeps, dayOf, now);
  const tomorrow = bsYmdAdd(today, 1);
  const groups = new Map();
  for (const meal of bsPlanMealsOn(byDow, tomorrow, swaps, mine)) {
    const info = bsMakeAheadInfo(meal, index);
    if (!info || !open(meal, info)) continue;
    if (!groups.has(info.slug)) groups.set(info.slug, { ...info, meals: [] });
    groups.get(info.slug).meals.push(meal);
  }
  for (const g of groups.values()) {
    for (let k = 1; k < g.keeps; k++) {
      for (const meal of bsPlanMealsOn(byDow, bsYmdAdd(tomorrow, k), swaps, mine)) {
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

// The server's words for the reminder, in English: the notifications table keeps the English, and the
// bell and the push say it in the reader's language from bsPrepReminderCopy (below, noticeCopy.mjs).
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

// The same reminder as copy (noticeCopy.mjs), said in the reader's language: each recipe's name as
// written, the meal slot and the weekdays from the catalog. It says what bsPrepReminderText says, from
// the same groups.
export function bsPrepReminderCopy(groups) {
  const gs = (Array.isArray(groups) ? groups : []).filter((g) => g && Array.isArray(g.meals) && g.meals.length);
  if (!gs.length) return null;
  if (gs.length > 1) {
    return {
      title: np('prep.many.title'),
      body: np('prep.many.body', { list: listOf(gs.map((g) => (g.meals.length > 1 ? phrase('prep.itemMany', { title: g.title, count: g.meals.length }) : g.title))) }),
    };
  }
  const g = gs[0];
  const slots = [...new Set(g.meals.map((m) => SLOT[m.slot] || 'meal'))];
  const slot = phrase('prep.slot.' + (slots.length === 1 ? slots[0] : 'meals'));
  if (g.meals.length === 1) return { title: np('prep.one.title', { recipe: g.title }), body: np('prep.one.body', { slot }) };
  const days = [...new Set(g.meals.map((m) => m.dow))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return { title: np('prep.one.title', { recipe: g.title }), body: np('prep.days.body', { count: g.meals.length, slot, days: listOf(days.map(weekdayOf)) }) };
}

// The notification's route: the in-app list and a tapped push open the cook screen on this
// recipe (bsRouteNotification), and the website's bell opens its cook page.
export const bsPrepRoute = (slug) => `prep:${slug}`;
// A reminder's route, by its first group: a catalog recipe opens its cook screen; a dish the
// nutritionist ticked has no catalog method to walk, so it opens Eat, where tonight's card is.
export const bsPrepRouteFor = (group) => (group && group.catalog !== false && group.slug ? bsPrepRoute(group.slug) : 'eat');

// ── The hour the reminder comes at (Phase 2) ───────────────────────────────────────────────────
// The member's choice, kept in user_goals (kind `meal_prep_reminder`, { hour }) as their other
// preferences are, so it needs no migration and the server reads it with the rest. 7 pm until they
// choose: after a usual dinner and before the default quiet hours (22:00). The hours offered run from
// 3 pm, when Eat's card for tonight appears, to 11 pm; a stored hour outside them (another build, a
// hand edit) reads as the default, never as a reminder at 4 am.
export const BS_PREP_REMINDER_KIND = 'meal_prep_reminder';
export const BS_PREP_HOUR = 19;
export const BS_PREP_HOURS = Object.freeze([15, 16, 17, 18, 19, 20, 21, 22, 23]);
export function bsPrepHourOf(doc) {
  const h = doc && typeof doc === 'object' ? doc.hour : null;
  return BS_PREP_HOURS.includes(h) ? h : BS_PREP_HOUR;
}

// ── The morning swap (Phase 2) ─────────────────────────────────────────────────────────────────
// A meal that needed the night before and was not prepped cannot be made in time now ("Not prepped
// last night"). What can: a catalog recipe that needs no night before and no chilling (`prep`),
// ready in a quarter of an hour, that fits the meal's slot: a breakfast for a breakfast, a snack for
// a snack, and a main for anything else. The oats' (breakfast, 480 kcal) is the Greek yogurt power
// bowl (breakfast, 480 kcal, 5 min). Ranked by the closest kcal to the meal it stands in for (its
// own, else its catalog recipe's), then the same diet, then the quickest, then the title, so the
// pick is stable. null when nothing fits: the note stays and nothing is offered.
export const BS_MORNING_SWAP_MAX_MIN = 15;
const SWAP_SLOT_TAGS = { BREAKFAST: ['Breakfast', 'Brunch'], BFAST: ['Breakfast', 'Brunch'], SNACK: ['Snack'] };
const NOT_A_MAIN = ['Breakfast', 'Brunch', 'Snack', 'Side'];
export function bsRecipeMinutes(time) {
  const s = String(time || '');
  const h = /(\d+)\s*hr/.exec(s);
  const m = /(\d+)\s*min/.exec(s);
  if (!h && !m) return null;
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}
export function bsMorningSwapFor(meal, recipes, index) {
  if (!meal || !meal.slug) return null;
  const list = Array.isArray(recipes) ? recipes : [];
  const own = list.find((r) => r && r.title && bsCookSlug(r.title) === meal.slug) || null;
  const target = Number(meal.kcal) > 0 ? Number(meal.kcal) : (own && Number(own.kcal) > 0 ? Number(own.kcal) : null);
  const want = SWAP_SLOT_TAGS[String(meal.slot || '').toUpperCase()] || null;
  const fits = (tags) => (want ? want.some((x) => tags.includes(x)) : !tags.some((x) => NOT_A_MAIN.includes(x)));
  const picks = [];
  for (const r of list) {
    if (!r || !r.title || r.prep) continue;
    const slug = bsCookSlug(r.title);
    if (!slug || slug === meal.slug || (index instanceof Map && index.has(slug))) continue;
    const min = bsRecipeMinutes(r.time);
    if (min == null || min > BS_MORNING_SWAP_MAX_MIN || !fits(Array.isArray(r.tags) ? r.tags : [])) continue;
    picks.push({
      r, min,
      gap: target != null && Number(r.kcal) > 0 ? Math.abs(Number(r.kcal) - target) : Infinity,
      diet: own && own.diet && r.diet === own.diet ? 0 : 1,
    });
  }
  picks.sort((a, b) => a.gap - b.gap || a.diet - b.diet || a.min - b.min || String(a.r.title).localeCompare(String(b.r.title)));
  return picks.length ? picks[0].r : null;
}

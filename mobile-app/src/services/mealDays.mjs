// The member's own changes to a DAY of meals (night-before prep, Phase 2; owner, 2026-10-05: "a time
// the member chooses, members planning tomorrow's meals, and a morning swap").
//
// A nutritionist's plan is a weekly template (client_meal_plans.payload.days) and a member's swap
// (`client_meal_swaps`) is kept by the meal's title, so it applies on every day the meal comes round.
// Neither can say "on Tuesday I am having the oats" or "this morning, the yogurt bowl instead". This
// document can: it lives in user_goals like the swaps (kind `client_meal_days`, one jsonb document,
// no migration), keyed by the MEMBER's calendar date.
//
//   { v: 1, days: { 'YYYY-MM-DD': {
//       add:  [{ id, slot, title, recipeId?, kcal, p, c, f, time? }],   meals the member planned
//       swap: { '<Eat meal id>': { title, recipeId?, kcal, p, c, f } }, that day's swap of one meal
//   } } }
//
// ⚠ READ BY THE SERVER TOO. The hourly prep reminder (src/app/api/cron/prep-reminders) reads this
// document through prepAhead.mjs, so everything here is validated as it is read: a row the app
// never wrote (another build, a hand edit) is dropped, never trusted. No React, no window, no clock.
import { bsCookSlug } from './cookable.mjs';

export const BS_MEAL_DAYS_KIND = 'client_meal_days';
// The four slots a member can plan into, and where each sits on a day with no time of its own (the
// website builder's SLOT_TIMES, so a planned breakfast lands where a plan's would).
export const BS_OWN_SLOTS = Object.freeze(['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER']);
export const BS_OWN_SLOT_TIME = Object.freeze({ BREAKFAST: '08:00', LUNCH: '12:30', SNACK: '16:00', DINNER: '19:00' });
// A day holds at most this many planned meals, and the document at most this many days, so a
// document is small whatever writes it.
export const BS_OWN_PER_DAY = 12;
export const BS_OWN_DAYS = 31;

const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const MEAL_ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const SLUG_RE = /^[a-z0-9-]{1,120}$/;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
const title = (v) => (typeof v === 'string' ? v.trim().slice(0, 120) : '');
const SLOT_ALIAS = { BFAST: 'BREAKFAST', DINR: 'DINNER' };

// One slot word as Eat and the plans write it, upper case; anything else is a plain MEAL.
export function bsOwnSlot(v) {
  const s = String(v || '').trim().toUpperCase();
  const k = SLOT_ALIAS[s] || s;
  return BS_OWN_SLOTS.includes(k) ? k : 'MEAL';
}

function cleanAdd(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const t = title(a.title);
  if (!t || typeof a.id !== 'string' || !ID_RE.test(a.id)) return null;
  const out = { id: a.id, slot: bsOwnSlot(a.slot), title: t, kcal: num(a.kcal), p: num(a.p), c: num(a.c), f: num(a.f) };
  if (typeof a.recipeId === 'string' && SLUG_RE.test(a.recipeId)) out.recipeId = a.recipeId;
  if (typeof a.time === 'string' && /^\d{1,2}:\d{2}$/.test(a.time)) out.time = a.time;
  return out;
}
function cleanSwap(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const t = title(s.title);
  if (!t) return null;
  const out = { title: t, kcal: num(s.kcal), p: num(s.p), c: num(s.c), f: num(s.f) };
  if (typeof s.recipeId === 'string' && SLUG_RE.test(s.recipeId)) out.recipeId = s.recipeId;
  return out;
}

// One day of the document, validated: { add: [...], swap: { mealId: {...} } }, empty when the
// document, the day or the date is not there. Ids repeat once at most (the first wins).
export function bsMealDayOf(doc, ymd) {
  const empty = { add: [], swap: {} };
  if (!isYmd(ymd) || !doc || typeof doc !== 'object' || !doc.days || typeof doc.days !== 'object') return empty;
  const day = doc.days[ymd];
  if (!day || typeof day !== 'object' || Array.isArray(day)) return empty;
  const seen = new Set();
  const add = [];
  for (const raw of (Array.isArray(day.add) ? day.add : [])) {
    const a = cleanAdd(raw);
    if (!a || seen.has(a.id)) continue;
    seen.add(a.id);
    add.push(a);
    if (add.length >= BS_OWN_PER_DAY) break;
  }
  const swap = {};
  if (day.swap && typeof day.swap === 'object' && !Array.isArray(day.swap)) {
    for (const [mealId, raw] of Object.entries(day.swap)) {
      if (!MEAL_ID_RE.test(mealId)) continue;
      const s = cleanSwap(raw);
      if (s) swap[mealId] = s;
    }
  }
  return { add, swap };
}

// The document with every day validated, the days before `today` dropped (a day gone by is not
// planned any more) and empty days left out, newest kept when there are too many.
export function bsMealDaysPrune(doc, today) {
  const days = {};
  const src = doc && typeof doc === 'object' && doc.days && typeof doc.days === 'object' ? doc.days : {};
  const dates = Object.keys(src).filter((d) => isYmd(d) && (!isYmd(today) || d >= today)).sort().slice(-BS_OWN_DAYS);
  for (const d of dates) {
    const day = bsMealDayOf(doc, d);
    if (day.add.length || Object.keys(day.swap).length) days[d] = day;
  }
  return { v: 1, days };
}

const withDay = (doc, ymd, today, fn) => {
  const base = bsMealDaysPrune(doc, today);
  const day = bsMealDayOf(base, ymd);
  const next = fn(day);
  const days = { ...base.days };
  if (next.add.length || Object.keys(next.swap).length) days[ymd] = next;
  else delete days[ymd];
  return { v: 1, days };
};

// A meal planned for `ymd`. `meal` is { id, slot, title, recipeId?, kcal, p, c, f, time? }; one that
// does not validate, or a day already full, leaves the document as it was (pruned).
export function bsMealDaysAdd(doc, ymd, meal, today) {
  if (!isYmd(ymd)) return bsMealDaysPrune(doc, today);
  const a = cleanAdd(meal);
  return withDay(doc, ymd, today, (day) => (!a || day.add.length >= BS_OWN_PER_DAY || day.add.some((x) => x.id === a.id)
    ? day
    : { ...day, add: [...day.add, a] }));
}

// A planned meal taken off `ymd`, with any swap that day made of it.
export function bsMealDaysRemove(doc, ymd, id, today) {
  if (!isYmd(ymd)) return bsMealDaysPrune(doc, today);
  return withDay(doc, ymd, today, (day) => {
    const swap = { ...day.swap };
    delete swap[`own-${id}`];
    return { add: day.add.filter((x) => x.id !== id), swap };
  });
}

// That day's swap of one meal (Eat's meal id), or, with `swap` null, the swap undone.
export function bsMealDaysSwap(doc, ymd, mealId, swap, today) {
  if (!isYmd(ymd) || typeof mealId !== 'string' || !MEAL_ID_RE.test(mealId)) return bsMealDaysPrune(doc, today);
  const s = swap == null ? null : cleanSwap(swap);
  return withDay(doc, ymd, today, (day) => {
    const next = { ...day.swap };
    if (s) next[mealId] = s;
    else delete next[mealId];
    return { add: day.add, swap: next };
  });
}

// ── Writing the document (Codex P1s on #2563) ────────────────────────────────────────────────
// The document is written whole, so two devices (or Eat and a recipe's page) that read the same copy
// and each change a day would leave only the later write. And getUserGoals and saveUserGoals each
// resolve the signed-in account on their own, so an account switch between the read and the write
// would put one member's whole plan in another's row. So a write is bound to the account that started
// it, from the read to the save, and is compare-and-set on the document's revision (user_goals'
// saveUserGoalsIfRev, as clientRecipes.mjs writes recipes): a conflict re-reads and re-applies the
// change to the newer copy.
export const BS_MEAL_DAYS_CAS_TRIES = 4;

// The revision a document carries (0 when it has none), and the raw value to compare-and-set on:
// `data->>'rev'` as Postgres reads it, null when the key is absent.
export function bsMealDaysRev(raw) {
  const r = raw && typeof raw === 'object' ? raw.rev : null;
  return typeof r === 'number' && Number.isFinite(r) && r >= 0 ? Math.floor(r) : 0;
}
export function bsMealDaysRevToken(raw) {
  if (!raw || typeof raw !== 'object' || raw.rev == null) return null;
  return String(raw.rev);
}

// Read, change and write the member's day plan. `change(doc, today)` returns the new document (one
// of bsMealDaysAdd / Remove / Swap). Resolves { ok: true, doc } with the document saved, or
// { ok: false, reason }: 'signed-out', 'unreadable' (a read that failed writes nothing: an empty
// document saved over a real one would lose every meal planned), 'account-changed', 'write-failed'
// or 'contended' (every try lost to another device; nothing was written, nothing lost).
export async function bsMealDaysWrite(db, change, today) {
  try {
    if (!db || !db.getUser || !db.getUserGoals || !(db.saveUserGoalsIfRev || db.saveUserGoals)) return { ok: false, reason: 'write-failed' };
    const u = await db.getUser();
    const uid = u && u.id;
    if (!uid) return { ok: false, reason: 'signed-out' };
    for (let i = 0; i < BS_MEAL_DAYS_CAS_TRIES; i += 1) {
      // Bound to `uid`: with another account signed in the read comes back null, never theirs.
      const cur = await db.getUserGoals(BS_MEAL_DAYS_KIND, { expectedUserId: uid });
      if (!cur || typeof cur !== 'object') return { ok: false, reason: 'unreadable' };
      const next = { ...change(cur, today), rev: bsMealDaysRev(cur) + 1 };
      // The writer checks the account itself (it resolves the user on its own, so only it can close
      // that window) and the revision the read saw. A build without the compare-and-set falls back to
      // the account-bound upsert.
      const res = db.saveUserGoalsIfRev
        ? await db.saveUserGoalsIfRev(BS_MEAL_DAYS_KIND, next, bsMealDaysRevToken(cur), uid)
        : await db.saveUserGoals(BS_MEAL_DAYS_KIND, next, { expectedUserId: uid });
      if (res && res.conflict) continue;
      if (res && res.accountChanged) return { ok: false, reason: 'account-changed' };
      if (!res || !res.ok) return { ok: false, reason: 'write-failed' };
      return { ok: true, doc: next };
    }
    return { ok: false, reason: 'contended' };
  } catch (e) { return { ok: false, reason: 'write-failed' }; }
}

// A Shape Kitchen recipe as a meal the member plans into `slot`: its title, its catalog slug as the
// recipe id (the prep rule matches on it) and its own amounts.
export function bsOwnMealOf(recipe, slot, id) {
  if (!recipe || !recipe.title) return null;
  const m = recipe.macros || {};
  const s = bsOwnSlot(slot);
  const slug = bsCookSlug(recipe.title);
  const out = { id, slot: s, title: String(recipe.title), kcal: num(recipe.kcal), p: num(m.p), c: num(m.c), f: num(m.f) };
  if (SLUG_RE.test(slug)) out.recipeId = slug;
  if (BS_OWN_SLOT_TIME[s]) out.time = BS_OWN_SLOT_TIME[s];
  return out;
}

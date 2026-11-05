// "✓ Logged" on a planned meal, kept in the account (website ↔ app parity, P7; the client audit's B3).
//
// A planned meal was ticked per device: the website kept `shape.dashMealLog.<date>` in localStorage
// (and ticked even when the log failed), the app in React state for the session. So the app never
// showed a meal logged on the website, a reload snapped the website's ledger back while its ✓ stayed,
// and a meal could be logged once on each surface and counted twice. Now the meal-log route records
// which planned meal was logged, on the member's own day, in one user_goals document read by both:
//
//   { v: 1, rev, days: { 'YYYY-MM-DD': { '<meal key>': { at, title?, kcal, p, c, f } } } }
//
// written by the server only after it has claimed the meal for that day, so a meal is counted once
// whichever surface logs it, and a failed log leaves no ✓. The meal key is Eat's own id for a plan
// meal (bsPlanMealKey): the plan's id, else `live-<weekday>-<index>`, so the website, Home, Eat and
// the prep rule all name the same meal the same way. Validated as it is read: a row nothing here wrote
// is dropped. No React, no window, no clock.

export const BS_MEAL_LOGGED_KIND = 'client_meal_logged';
// The document keeps this many days (the newest), so it stays small whatever writes it.
export const BS_MEAL_LOGGED_DAYS = 14;
// A day holds at most this many logged meals.
export const BS_MEAL_LOGGED_PER_DAY = 24;

const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
// The same id shape mealDays.mjs accepts for a meal (Eat's ids, `own-<id>`, `live-<d>-<j>`).
const MEAL_KEY_RE = /^[A-Za-z0-9_.:-]{1,80}$/;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

/** Whether `key` can name a meal in the document. */
export function bsIsMealKey(key) {
  return typeof key === 'string' && MEAL_KEY_RE.test(key);
}

/**
 * A plan meal's key: the plan's own id when it has one, else Eat's `live-<weekday>-<index>` (weekday
 * Monday 0, as the plan's `dow`). null when neither makes a key.
 */
export function bsPlanMealKey(meal, dow, index) {
  const id = meal && meal.id != null && meal.id !== '' ? String(meal.id) : `live-${dow}-${index}`;
  return bsIsMealKey(id) ? id : null;
}

function cleanEntry(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
  const at = typeof e.at === 'string' && Number.isFinite(Date.parse(e.at)) ? e.at : null;
  if (!at) return null;
  const out = { at, kcal: num(e.kcal), p: num(e.p), c: num(e.c), f: num(e.f) };
  if (typeof e.title === 'string' && e.title.trim()) out.title = e.title.trim().slice(0, 120);
  return out;
}

/** One day's logged meals, validated: { '<meal key>': { at, … } }, {} when there are none. */
export function bsMealLoggedOn(doc, ymd) {
  const out = {};
  if (!isYmd(ymd) || !doc || typeof doc !== 'object' || !doc.days || typeof doc.days !== 'object') return out;
  const day = doc.days[ymd];
  if (!day || typeof day !== 'object' || Array.isArray(day)) return out;
  let n = 0;
  for (const [key, raw] of Object.entries(day)) {
    if (!bsIsMealKey(key)) continue;
    const e = cleanEntry(raw);
    if (!e) continue;
    out[key] = e;
    n += 1;
    if (n >= BS_MEAL_LOGGED_PER_DAY) break;
  }
  return out;
}

/** Whether `key` is logged on `ymd`. */
export function bsMealIsLogged(doc, ymd, key) {
  return bsIsMealKey(key) && Object.prototype.hasOwnProperty.call(bsMealLoggedOn(doc, ymd), key);
}

/**
 * The document validated and kept to the newest BS_MEAL_LOGGED_DAYS days, none after `today` + 1 (a
 * member ahead of the server's clock writes their own tomorrow; nothing later is real), empty days left
 * out. `rev` is not carried: the writer sets it.
 */
export function bsMealLoggedPrune(doc, today) {
  const days = {};
  const src = doc && typeof doc === 'object' && doc.days && typeof doc.days === 'object' ? doc.days : {};
  let ceiling = null;
  if (isYmd(today)) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    ceiling = d.toISOString().slice(0, 10);
  }
  const dates = Object.keys(src).filter((d) => isYmd(d) && (!ceiling || d <= ceiling)).sort().slice(-BS_MEAL_LOGGED_DAYS);
  for (const d of dates) {
    const day = bsMealLoggedOn(doc, d);
    if (Object.keys(day).length) days[d] = day;
  }
  return { v: 1, days };
}

/** The document with `key` logged on `ymd` (`entry` its macros and title). Unchanged when it can't be. */
export function bsMealLoggedMark(doc, ymd, key, entry, today) {
  const base = bsMealLoggedPrune(doc, today);
  if (!isYmd(ymd) || !bsIsMealKey(key)) return base;
  const e = cleanEntry(entry);
  if (!e) return base;
  const day = { ...(base.days[ymd] || {}) };
  if (!Object.prototype.hasOwnProperty.call(day, key) && Object.keys(day).length >= BS_MEAL_LOGGED_PER_DAY) return base;
  day[key] = e;
  return { v: 1, days: { ...base.days, [ymd]: day } };
}

/** The document with `key` no longer logged on `ymd` (a log that was claimed and then failed). */
export function bsMealLoggedUnmark(doc, ymd, key, today) {
  const base = bsMealLoggedPrune(doc, today);
  if (!isYmd(ymd) || !bsIsMealKey(key) || !base.days[ymd]) return base;
  const day = { ...base.days[ymd] };
  delete day[key];
  const days = { ...base.days };
  if (Object.keys(day).length) days[ymd] = day; else delete days[ymd];
  return { v: 1, days };
}

/** `{ '<meal key>': true }` for a day, the shape the ledgers tick from. */
export function bsMealLoggedTicks(doc, ymd) {
  const out = {};
  for (const k of Object.keys(bsMealLoggedOn(doc, ymd))) out[k] = true;
  return out;
}

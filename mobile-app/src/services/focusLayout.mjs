// Pure helpers for the Focus layout of Home, Train, Eat and the Grocery page
// (owner, 2026-10-11: "impliment focus layout for home train eat and grocery
// with shop by aisle and shop by meal"). No React, no window, no theme, so the
// rules the screens lean on stay unit-tested:
//
//   · the arrival bar only draws between two real, ordered stops;
//   · a countdown only counts down to a stop that is still ahead;
//   · an item is "skipped" only when EVERY meal it is for was skipped, so a
//     shared ingredient never leaves the list while one of its meals remains;
//   · the shop-by choice and the skipped meals are remembered per device and
//     read back defensively (private mode and cleared storage both throw).

// "HH:MM" (24-hour) → minutes since midnight. Anything else → null, which every
// caller treats as "untimed" rather than inventing a slot.
export function bsFocusMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm == null ? '' : hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Where NOW sits between the stop before and the next stop, as 0..100. null when
// either end is untimed or the two are not in order: the bar is then left out,
// never drawn with a guessed start.
export function bsFocusArrival(prevMin, nextMin, nowMin) {
  if (![prevMin, nextMin, nowMin].every(Number.isFinite)) return null;
  if (nextMin <= prevMin) return null;
  const pct = ((nowMin - prevMin) / (nextMin - prevMin)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}

// Time left until a stop: { h, m, total } in minutes, or null when the stop is
// untimed, now, or already past (a countdown never reads zero or negative).
export function bsFocusUntil(nextMin, nowMin) {
  if (!Number.isFinite(nextMin) || !Number.isFinite(nowMin)) return null;
  const total = nextMin - nowMin;
  if (total <= 0) return null;
  return { h: Math.floor(total / 60), m: total % 60, total };
}

// The stop an arrival bar starts from: the latest timed stop strictly before
// `nextMin`. `stops` are { min, ... }; untimed ones (min null) never anchor it.
export function bsFocusPrevStop(stops, nextMin) {
  if (!Number.isFinite(nextMin)) return null;
  let best = null;
  for (const s of stops || []) {
    if (!s || !Number.isFinite(s.min) || s.min >= nextMin) continue;
    if (!best || s.min >= best.min) best = s;
  }
  return best;
}

// A meal's slot: 'breakfast' | 'lunch' | 'snack' | 'dinner', from its plan tag
// first, else from its hour. null when neither says (an untimed custom meal).
export function bsFocusSlot(tag, min) {
  const t = String(tag || '').toUpperCase();
  if (t.startsWith('BFAST') || t.startsWith('BREAK')) return 'breakfast';
  if (t.startsWith('LUNCH')) return 'lunch';
  if (t.startsWith('SNACK')) return 'snack';
  if (t.startsWith('DIN')) return 'dinner';
  if (!Number.isFinite(min)) return null;
  const h = Math.floor(min / 60);
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : 'dinner';
}

// ── Grocery ────────────────────────────────────────────────────────────────

// The meals an item is for, from its `meals` line: "A · B +2" → ['A', 'B'].
// The "+N" tail counts meals the line does not name, so it adds no group, and
// the plan list's "—" (no meal) is no meal.
export function bsGroceryMealNames(meals) {
  return String(meals == null ? '' : meals)
    .replace(/\s*\+\d+\s*$/, '')
    .split(' · ')
    .map((s) => s.trim())
    .filter((s) => s && s !== '—');
}

// Every meal an item is for. The plan's list carries the whole set in
// `mealList`; its `meals` line names two and counts the rest, so an item for
// three meals would otherwise be missing from the third.
export function bsGroceryItemMeals(item) {
  if (item && Array.isArray(item.mealList)) return item.mealList.filter((s) => typeof s === 'string' && s.trim() && s !== '—');
  return bsGroceryMealNames(item && item.meals);
}

// An item comes off the list only when it is for at least one named meal and
// every one of them was skipped.
export function bsGrocerySkipped(item, skipped) {
  const names = bsGroceryItemMeals(item);
  if (!names.length || !skipped || !skipped.size) return false;
  return names.every((n) => skipped.has(n));
}

// Shop by meal: one group per named meal, in the order `rank` gives (lower
// first; meals it does not know keep first-seen order, after the known ones).
// An item for several meals appears under each, keyed by its aisle/index so a
// tick in one group is the same tick in the other. Items with no named meal
// gather under `null` at the end, so nothing on the list goes missing.
export function bsGroceryByMeal(aisles, rank = () => null) {
  const groups = new Map();
  const loose = [];
  (aisles || []).forEach((a, ai) => (a.items || []).forEach((item, ii) => {
    const names = bsGroceryItemMeals(item);
    if (!names.length) { loose.push({ ai, ii, item }); return; }
    names.forEach((n) => {
      if (!groups.has(n)) groups.set(n, { name: n, items: [], seen: groups.size });
      groups.get(n).items.push({ ai, ii, item });
    });
  }));
  const out = [...groups.values()].sort((x, y) => {
    const rx = rank(x.name);
    const ry = rank(y.name);
    const kx = Number.isFinite(rx) ? rx : Infinity;
    const ky = Number.isFinite(ry) ? ry : Infinity;
    return kx === ky ? x.seen - y.seen : kx - ky;
  }).map(({ name, items }) => ({ name, items }));
  if (loose.length) out.push({ name: null, items: loose });
  return out;
}

// Shop by aisle: the aisles that still hold anything once skipped items are
// gone, each with how many are got and left.
export function bsGroceryAisleStops(aisles, isGot, skipped) {
  const out = [];
  (aisles || []).forEach((a, ai) => {
    const live = (a.items || []).map((item, ii) => ({ item, ii })).filter((x) => !bsGrocerySkipped(x.item, skipped));
    if (!live.length) return;
    const got = live.filter((x) => isGot(ai, x.ii)).length;
    out.push({ ai, aisle: a.aisle, total: live.length, got, left: live.length - got });
  });
  return out;
}

// ── The shop list on each meal (Eat, option A · On the line) ─────────────────

// An item's identity across the Eat page and the Grocery page: its name, so a
// tick survives the list being rebuilt in a different order.
export function bsGroceryItemKey(item) {
  return String((item && item.n) || '').trim().toLowerCase();
}

// The items one meal needs: [{ ai, ii, item, also }] where `also` names the
// other meals the same item is for (a shared ingredient shows under each).
export function bsMealShopItems(aisles, mealTitle) {
  const want = String(mealTitle || '').trim();
  const out = [];
  if (!want) return out;
  (aisles || []).forEach((a, ai) => (a.items || []).forEach((item, ii) => {
    const names = bsGroceryItemMeals(item);
    if (!names.includes(want)) return;
    out.push({ ai, ii, item, also: names.filter((n) => n !== want) });
  }));
  return out;
}

// Whether an item is got: the remembered ticks when there are any, else the
// list's own default (a pantry staple starts got).
export function bsGroceryIsGot(item, got) {
  if (got) return got.has(bsGroceryItemKey(item));
  return !!(item && item.have);
}

// ── Remembered choices (per device) ────────────────────────────────────────

export const BS_SHOP_BY_KEY = 'shape.grocery.shopBy';
const SKIP_PREFIX = 'shape.grocery.skippedMeals:';

export function bsReadShopBy(storage) {
  try { return storage && storage.getItem(BS_SHOP_BY_KEY) === 'meal' ? 'meal' : 'aisle'; } catch (e) { return 'aisle'; }
}

export function bsSaveShopBy(storage, value) {
  try { if (storage) storage.setItem(BS_SHOP_BY_KEY, value === 'meal' ? 'meal' : 'aisle'); } catch (e) { /* not remembered */ }
}

export function bsReadSkippedMeals(storage, listKey) {
  try {
    const raw = storage ? storage.getItem(SKIP_PREFIX + String(listKey || 'list')) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x) : []);
  } catch (e) { return new Set(); }
}

// The ticks, per list: one tick on Eat is the same tick on the Grocery page.
// null when nothing was ever ticked on this device, so the list's defaults hold.
const GOT_PREFIX = 'shape.grocery.got:';

export function bsReadGotItems(storage, listKey) {
  try {
    const raw = storage ? storage.getItem(GOT_PREFIX + String(listKey || 'list')) : null;
    if (raw == null) return null;
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string' && x) : []);
  } catch (e) { return null; }
}

export function bsSaveGotItems(storage, listKey, got) {
  try {
    if (!storage) return;
    storage.setItem(GOT_PREFIX + String(listKey || 'list'), JSON.stringify([...(got || [])]));
  } catch (e) { /* not remembered */ }
}

// The got set after ticking one item, starting from the list's defaults when
// nothing is remembered yet.
export function bsToggleGot(aisles, got, item) {
  const next = got ? new Set(got) : new Set();
  if (!got) (aisles || []).forEach((a) => (a.items || []).forEach((it) => { if (it && it.have) next.add(bsGroceryItemKey(it)); }));
  const k = bsGroceryItemKey(item);
  if (next.has(k)) next.delete(k); else next.add(k);
  return next;
}

// The ticked rows as `${ai}-${ii}` keys, worked out from the got names on every
// render: a list that changes under the screen (another device's edit, merged in)
// keeps each tick on its item, not on the row it used to be in.
export function bsGroceryCheckedKeys(aisles, got) {
  const out = new Set();
  (aisles || []).forEach((a, ai) => ((a && a.items) || []).forEach((it, ii) => { if (bsGroceryIsGot(it, got)) out.add(`${ai}-${ii}`); }));
  return out;
}

export function bsSaveSkippedMeals(storage, listKey, skipped) {
  try {
    if (!storage) return;
    const key = SKIP_PREFIX + String(listKey || 'list');
    if (!skipped || !skipped.size) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify([...skipped]));
  } catch (e) { /* not remembered */ }
}

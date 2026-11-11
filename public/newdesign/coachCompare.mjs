// Compare, side by side: the rules both surfaces read (owner, 2026-11-11: "yes i want compare on app", after
// the website's Compare sheet). The app's Coaches tab (BSMarketDirectory.jsx) draws from these; the
// website's sheet (marketplace.jsx MkCompare) carries the same rules inline (tests/app-compare.test.mjs holds
// the two to the same answers). No React, no window, no clock.

// A compare holds up to three coaches.
export const BS_COMPARE_MAX = 3;

// The keys picked after a tap on `key`: off when it is on; on, at the end, when there is room; else as it was.
export function bsCompareToggle(keys, key, max = BS_COMPARE_MAX) {
  const list = Array.isArray(keys) ? keys.filter((k, i, a) => k != null && a.indexOf(k) === i) : [];
  if (key == null) return list;
  if (list.includes(key)) return list.filter((k) => k !== key);
  return list.length < max ? [...list, key] : list;
}

// How a coach meets. Every coach on Shape coaches remotely through the app (owner, 2026-11-11: "every coach
// should have remote listed"): 'both' for one who also meets in person, else 'remote'.
export function bsCompareMeets(format) {
  return format === 'In-person' || format === 'Hybrid' ? 'both' : 'remote';
}

// The rows of a compare. `rows` is [{ key, text(c) → string, rank?(c) → number|null }], where a higher rank
// is better. Each row comes back with every coach's text, `same` when every text is the same, and `best`:
// the index of the one coach whose rank is the top, or null (a row that can't be ranked, a tie at the top,
// fewer than two coaches ranked, or every text the same).
export function bsCompareRows(list, rows) {
  const coaches = Array.isArray(list) ? list : [];
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const texts = coaches.map((c) => String(row.text(c) ?? ''));
    const same = texts.length > 0 && texts.every((t) => t === texts[0]);
    let best = null;
    if (typeof row.rank === 'function' && !same) {
      const r = coaches.map((c) => { const v = row.rank(c); return typeof v === 'number' && Number.isFinite(v) ? v : null; });
      const ranked = r.filter((v) => v != null);
      if (ranked.length > 1) {
        const top = Math.max(...ranked);
        if (r.filter((v) => v === top).length === 1) best = r.indexOf(top);
      }
    }
    return { key: row.key, texts, same, best };
  });
}

// The price's rank: lower is better, and prices compare only when every coach prices the same way (all per
// session, or all per month). Returns the rank function, or null when they don't.
export function bsComparePriceRank(list, priceOf) {
  const pers = new Set((Array.isArray(list) ? list : []).map((c) => { const p = priceOf(c); return p && Number.isFinite(p.amount) ? p.per : null; }));
  if (pers.size !== 1 || pers.has(null)) return null;
  return (c) => -priceOf(c).amount;
}

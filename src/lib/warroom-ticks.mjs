// Pure tick-pruning for the War Room go-live checklist.
//
// A `declined` checklist item is a CLOSED review decision with no work planned.
// It is deliberately neither `pending` (which would render it as an open
// go-live step and hold its section incomplete) nor `done` (nothing was built).
//
// Its label must not keep a persisted tick. Ignoring the tick only at render
// time is not enough: a ruling can later flip back to `pending`, and a stale
// tick left in localStorage would silently re-mark the item complete with no
// fresh confirmation. So the tick is pruned from state AND storage at the
// source.
//
// Kept pure and separate from the React client so it is testable without a
// DOM/React harness (the suite runs `node --test tests/**/*.test.mjs`).

/** Collect the labels of every `declined` item across a checklist snapshot. */
export function declinedLabels(checklist) {
  const out = new Set();
  for (const sec of Array.isArray(checklist) ? checklist : []) {
    const items = sec && Array.isArray(sec.items) ? sec.items : [];
    for (const it of items) {
      if (it && it.status === 'declined' && typeof it.label === 'string') out.add(it.label);
    }
  }
  return out;
}

/**
 * Drop any tick whose label belongs to a `declined` item.
 * Returns the SAME object reference when nothing changed, so callers can bail
 * out without re-rendering or rewriting storage.
 */
export function pruneDeclinedTicks(ticks, checklist) {
  const source = ticks && typeof ticks === 'object' ? ticks : {};
  const declined = declinedLabels(checklist);
  if (declined.size === 0) return ticks;
  const stale = Object.keys(source).filter((l) => declined.has(l));
  if (stale.length === 0) return ticks;
  const next = { ...source };
  for (const l of stale) delete next[l];
  return next;
}

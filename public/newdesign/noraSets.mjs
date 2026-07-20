// Shape Sets schedule resolver (spec 2026-07-19). CANONICAL COPY — website
// loads it as a native ES module, mobile imports it, tests import directly.
// Pure, injected clock, never throws. Boundary semantics (exact):
//  live: [starts_at, starts_at + duration_min) — now === end is NOT live;
//        latest start wins on overlap.
//  next: soonest starts_at > now (a live row is never next).
//  upcoming: now < starts_at ≤ now + 7 days (inclusive), (starts_at, id)
//            ascending, cap 10, live row excluded by the > now bound.
const WEEK_MS = 7 * 24 * 3600 * 1000;
const CAP = 10;

// The read window BOTH surfaces query with. It lives here rather than at each
// call site because the numbers are load-bearing and coupled to the schema:
// ⚠ MAX_DURATION_MIN is the table's own `duration_min` CHECK ceiling, and the
// lookback IS that ceiling — a set that started MAX_DURATION_MIN ago has at
// most just ended (end-exclusive, so it is no longer live), which makes it the
// earliest a live set can possibly have started. Widen the CHECK without
// widening this and a long set that is on air right now silently disappears.
// Duplicating that reasoning per consumer is exactly how the two drift
// (review: CodeRabbit) — one definition, both callers.
export const MAX_DURATION_MIN = 360;

// The ECMAScript Date range (±100,000,000 days from the epoch). Past it,
// toISOString() raises rather than returning a string.
const MAX_TIME = 8.64e15;

// ⚠ `Number(x)` RAISES on a Symbol — it does not return NaN. So a bare
// `Number(now)` defeats the "never throws" contract both exports below claim,
// and the guard that follows it never gets to run (review: CodeRabbit, who
// flagged the window; the same defect was in bsSetsNow, which it did not).
// One coercion, used by both, so the claim is actually true.
function toEpoch(now) {
  if (now instanceof Date) return now.getTime();
  try { return Number(now); } catch (e) { return NaN; }
}

export function bsSetsWindow(now) {
  let base = toEpoch(now);
  // A finite but extreme epoch can push an edge out of Date range even though
  // the input itself looked fine — validate the EDGES, not just the input.
  const lo = base - MAX_DURATION_MIN * 60000;
  const hi = base + WEEK_MS;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || Math.abs(lo) > MAX_TIME || Math.abs(hi) > MAX_TIME) {
    base = Date.now();
  }
  return {
    from: new Date(base - MAX_DURATION_MIN * 60000).toISOString(),
    to: new Date(base + WEEK_MS).toISOString(),
  };
}

export function bsSetsNow(rows, now) {
  const t = toEpoch(now);
  const out = { live: null, next: null, upcoming: [] };
  if (!Array.isArray(rows) || !Number.isFinite(t)) return out;
  const clean = rows.filter((r) => {
    // Mirror the schema's contract (review round): required non-empty text
    // fields, integer 10–360 duration, parseable start, finite end.
    if (!r || typeof r !== 'object') return false;
    const s = Date.parse(r.starts_at); const d = Number(r.duration_min);
    return typeof r.id === 'string'
      && typeof r.title === 'string' && r.title.trim() !== ''
      && typeof r.dj === 'string' && r.dj.trim() !== ''
      && Number.isFinite(s)
      && Number.isInteger(d) && d >= 10 && d <= 360
      && Number.isFinite(s + d * 60000);
  }).map((r) => ({ ...r, _s: Date.parse(r.starts_at), _e: Date.parse(r.starts_at) + Number(r.duration_min) * 60000 }));
  const liveCands = clean.filter((r) => r._s <= t && t < r._e);
  liveCands.sort((a, b) => b._s - a._s || String(a.id).localeCompare(String(b.id)));
  out.live = liveCands[0] || null;
  const future = clean.filter((r) => r._s > t);
  future.sort((a, b) => a._s - b._s || String(a.id).localeCompare(String(b.id)));
  out.next = future[0] || null;
  out.upcoming = future.filter((r) => r._s <= t + WEEK_MS).slice(0, CAP);
  return out;
}

// Pure helpers for the Home "Front Page" TODAY'S SLATE run-sheet — parsing a
// row's displayed 12-hour time string into sortable minutes, and the stable
// time-ordered sort that places untimed rows after every timed row. No React,
// no window, no theme — dependency-free so the honesty rule (never invent an
// order) stays unit-tested. Spec: docs/superpowers/specs/2026-07-03-home-front-page-hybrid-design.md

// Parse a 12-hour clock string ("7:00 AM", "12:30 PM") into minutes since
// midnight. '12:00 AM' (midnight) → 0; '12:30 PM' (just after noon) → 750.
// null / '' / anything that doesn't match → null (never a fabricated order —
// callers must treat null as "untimed").
export function bsHomeTimeMinutes(str) {
  const s = String(str == null ? '' : str).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 1 || h > 12 || min < 0 || min > 59) return null;
  const ap = m[3].toUpperCase();
  if (ap === 'AM') h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return h * 60 + min;
}

// Stable sort of slate rows by their displayed `row.time` ("7:00 AM"-style).
// Timed rows sort ascending by bsHomeTimeMinutes(row.time); untimed rows (time
// missing/unparseable) land AFTER every timed row, in their original relative
// order. Ties among timed rows, and the untimed group itself, both preserve
// source order (a plain stable sort by a single numeric key, treating
// "untimed" as +Infinity, satisfies both).
export function bsHomeSlateSort(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row, i) => ({ row, i, mins: bsHomeTimeMinutes(row && row.time) }))
    .sort((a, b) => {
      const am = a.mins == null ? Infinity : a.mins;
      const bm = b.mins == null ? Infinity : b.mins;
      if (am !== bm) return am - bm;
      return a.i - b.i;
    })
    .map((x) => x.row);
}

// A client's breaks, "away until <date>" (supabase-migrations/2026-11-11-client-pause.sql), as the
// crons read them with the service role: one row a break, from its first day away (from_on) to its
// last (until_on), kept after it ends. Read by /api/cron/score-accountability (no penalty for a day a
// break covers) and /api/cron/prep-reminders (no prep reminder while away).
//
// ⚠ A BREAK COVERS ITS OWN DAYS ONLY (Codex on #2705). Its end alone said nothing about where it began,
// so a break set today exempted yesterday's missed workout and last week's check-in; and a break ended
// early was deleted, so the days it had covered were charged after all. Both ends are read here.

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Rows { client_id, from_on, until_on } → Map(client_id → [{ from, until }]). A row the crons can't
// read (no client, or a day that isn't YYYY-MM-DD) is dropped.
export function pausesByClient(rows) {
  const out = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r.client_id !== 'string') continue;
    if (typeof r.from_on !== 'string' || !DAY.test(r.from_on) || typeof r.until_on !== 'string' || !DAY.test(r.until_on)) continue;
    const list = out.get(r.client_id) || [];
    list.push({ from: r.from_on, until: r.until_on });
    out.set(r.client_id, list);
  }
  return out;
}

// Whether any of `breaks` covers a day from `from` to `to` (YYYY-MM-DD; `to` defaults to `from`), each
// break's first and last day included.
export function pauseCovers(breaks, from, to = from) {
  if (!Array.isArray(breaks) || typeof from !== 'string' || typeof to !== 'string') return false;
  return breaks.some((b) => !!b && b.from <= to && b.until >= from);
}

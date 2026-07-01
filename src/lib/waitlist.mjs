// src/lib/waitlist.mjs — framework-free waitlist logic (unit-tested).
export const WAITLIST_INVITE_TTL_DAYS = 7;
export const ACTIVE_WAITLIST_STATUSES = new Set(['waiting', 'invited']);

// 1-based FIFO position among ACTIVE rows (waiting|invited), by created_at asc.
export function computePositions(rows) {
  const active = rows
    .filter((r) => ACTIVE_WAITLIST_STATUSES.has(r.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const map = new Map();
  active.forEach((r, i) => map.set(r.id, i + 1));
  return map;
}

// src/lib/waitlist.mjs — framework-free waitlist logic (unit-tested).
export const WAITLIST_INVITE_TTL_DAYS = 7;
export const ACTIVE_WAITLIST_STATUSES = new Set(['waiting', 'invited']);

// A row occupies a live FIFO slot when it's waiting, or an invite that hasn't
// expired yet. Mirrors the SQL predicate in get_my_waitlists / get_coach_waitroom
// EXACTLY — `status='invited' and invite_expires_at > now()` — so a missing
// expiry counts as NOT active (Postgres `null > now()` is null/false), and an
// expired invite never keeps blocking the next person in line.
export function isActiveWaitlistRow(row, now = Date.now()) {
  if (!row) return false;
  if (row.status === 'waiting') return true;
  if (row.status === 'invited') {
    return row.invite_expires_at != null && new Date(row.invite_expires_at).getTime() > now;
  }
  return false;
}

// 1-based FIFO position among ACTIVE rows (waiting | non-expired invited), by
// created_at asc. Mirrors the SQL in get_my_waitlists / get_coach_waitroom.
export function computePositions(rows, now = Date.now()) {
  const active = rows
    .filter((r) => isActiveWaitlistRow(r, now))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const map = new Map();
  active.forEach((r, i) => map.set(r.id, i + 1));
  return map;
}

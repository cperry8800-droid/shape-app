// A client's break, "away until <date>" (supabase-migrations/2026-11-11-client-pause.sql; owner,
// 2026-11-11: set by the member or any of their coaches, billing carries on). While it holds, the
// alerts that read their absence and their own reminders stay quiet; the engine reads it from the
// client's overview (public/newdesign/dashSignals.js pauseOf). Not the Settings "Pause membership"
// request, which is about the membership itself.
//
// The reads and writes go through the two definer functions as the signed-in person: the member for
// themselves, a coach for a client of theirs. Anyone else is refused by the database.

export const PAUSE_MAX_DAYS = 90;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
// The device's own calendar day, as the date input reads and writes it.
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// The days a break may end on: today to PAUSE_MAX_DAYS on (the database counts them in the member's
// own calendar and allows a day either side, for a device on another calendar).
export function pauseBounds(now = new Date()) {
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate() + PAUSE_MAX_DAYS);
  return { min: localDay(now), max: localDay(max) };
}
export function validPauseDay(v, now = new Date()) {
  if (typeof v !== 'string' || !ISO_DAY.test(v)) return false;
  const { min, max } = pauseBounds(now);
  return v >= min && v <= max;
}
// A break that still holds (its last day included): until the instant the member's return day begins
// (`backAt`, the same on every calendar: Codex on #2705), else on the device's today.
export function pauseHolds(pause, now = new Date()) {
  if (!pause || typeof pause.until !== 'string' || !ISO_DAY.test(pause.until)) return false;
  const back = typeof pause.backAt === 'string' ? Date.parse(pause.backAt) : NaN;
  return Number.isFinite(back) ? now.getTime() < back : localDay(now) <= pause.until;
}

function rowOf(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || typeof row.until_on !== 'string' || !ISO_DAY.test(row.until_on)) return null;
  const backAt = typeof row.back_at === 'string' && Number.isFinite(Date.parse(row.back_at)) ? row.back_at : null;
  return { until: row.until_on, by: typeof row.set_by_role === 'string' ? row.set_by_role : null, mine: row.set_by_me === true, ...(backAt ? { backAt } : {}) };
}

// { ok: true, ready: true, pause: { until, by, mine, backAt? } | null } once the database answered;
// { ok: true, ready: false } before the migration runs (the function is not there yet: PGRST202);
// { ok: false } when the read failed, which is never "no break".
export async function readClientPause(client, clientId) {
  if (!client || typeof client.rpc !== 'function' || !clientId) return { ok: false };
  try {
    const { data, error } = await client.rpc('get_client_pause', { p_client_id: clientId });
    if (error) return error.code === 'PGRST202' ? { ok: true, ready: false } : { ok: false };
    return { ok: true, ready: true, pause: rowOf(data) };
  } catch {
    return { ok: false };
  }
}

// `until` a day (validPauseDay) to set or move the break, null to end it. { ok, error? }: `range` for a
// day out of bounds, `refused` when the database said this person may not, `failed` otherwise.
export async function writeClientPause(client, clientId, until) {
  if (until != null && !validPauseDay(until)) return { ok: false, error: 'range' };
  if (!client || typeof client.rpc !== 'function' || !clientId) return { ok: false, error: 'failed' };
  try {
    const { error } = await client.rpc('set_client_pause', { p_client_id: clientId, p_until: until == null ? null : until });
    if (!error) return { ok: true };
    return { ok: false, error: error.code === '42501' ? 'refused' : error.code === '22023' ? 'range' : 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

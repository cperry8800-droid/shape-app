// What every route that WRITES a booking has to agree on (2026-10-07, Schedule step 2):
// whether a time clashes with the coach's other bookings, and whether it sits inside the
// hours they opened. The rules themselves are public/newdesign/scheduleRules.mjs — the same
// file the coach's week grid runs, so the grid's red drop target and these routes' 409s are
// one decision rather than two that happen to agree.
//
// Callers: /api/sessions/manage (a coach's reschedule and create), /api/sessions/request (a
// member asking their own coach for a session), /api/consultation (a prospect's 15-minute
// consult).

import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_STATUSES, clashIn, fitsOpenHours } from '../../public/newdesign/scheduleRules.mjs';

// How far before a new booking an existing one can START and still reach into it. No session
// in this product runs past a few hours (the coach create caps at 4); half a day is a window
// that cannot miss one, and it keeps the read to the bookings that could possibly matter.
const LOOKBACK_MS = 12 * 3600_000;
const MINUTE_MS = 60_000;

export type SessionClash = { id: string; startMs: number; endMs: number; clientName: string | null };

type Db = Pick<SupabaseClient, 'from'>;

/**
 * The coach's first ACTIVE booking (requested or confirmed) that overlaps
 * [startMs, startMs + durationMin), other than `excludeId`.
 *
 * ⚠ A FAILED READ IS `ok: false`, NEVER "NO CLASH". This read is the whole of the overlap
 * refusal, so treating an error as an empty calendar would write the double booking it exists
 * to stop. Callers answer 503 and write nothing.
 *
 * ⚠ THE CLIENT DECIDES WHAT IT CAN SEE. A coach's request-scoped client reads all of their own
 * sessions through RLS; a member's would read only their own, so the member route passes the
 * service role here — and only ever returns yes/no from it, never another member's booking.
 */
export async function findSessionClash(
  db: Db,
  opts: { role: string; providerId: number; startMs: number; durationMin: number; excludeId?: string | null },
): Promise<{ ok: true; clash: SessionClash | null } | { ok: false }> {
  const endMs = opts.startMs + opts.durationMin * MINUTE_MS;
  const { data, error } = await db
    .from('sessions')
    .select('id, scheduled_at, duration_min, status, client_name')
    .eq('provider_role', opts.role)
    .eq('provider_id', opts.providerId)
    .in('status', [...ACTIVE_STATUSES])
    .gte('scheduled_at', new Date(opts.startMs - LOOKBACK_MS).toISOString())
    .lt('scheduled_at', new Date(endMs).toISOString());
  if (error) return { ok: false };
  type Row = { id: string; scheduled_at: string; duration_min: number | null; status: string; client_name?: string | null };
  const items = ((data ?? []) as Row[]).map((r) => {
    const start = Date.parse(r.scheduled_at);
    // The column is NOT NULL with a default of 15; a null here is treated as that default.
    return { id: r.id, start, end: start + (r.duration_min ?? 15) * MINUTE_MS, status: r.status, name: r.client_name ?? null };
  });
  const hit = clashIn(items, opts.startMs, endMs, opts.excludeId ?? null) as (typeof items)[number] | null;
  return { ok: true, clash: hit ? { id: hit.id, startMs: hit.start, endMs: hit.end, clientName: hit.name } : null };
}

/** The coach's weekly open-hours rows, or `ok: false` when they could not be read. */
export async function readOpenHours(
  db: Db,
  role: string,
  providerId: number,
): Promise<{ ok: true; slots: Array<{ weekday: number; start_minute: number; duration_min: number }> } | { ok: false }> {
  const { data, error } = await db
    .from('provider_availability')
    .select('weekday, start_minute, duration_min')
    .eq('provider_role', role)
    .eq('provider_id', providerId);
  if (error) return { ok: false };
  return { ok: true, slots: (data ?? []) as Array<{ weekday: number; start_minute: number; duration_min: number }> };
}

/**
 * Whether a session at the coach's wall clock `date` + `minute` (in THEIR zone — the zone the
 * open hours are stored in) fits inside their open hours. The weekday is the civil date's own,
 * read offset-free, so a Sydney coach's Monday is never filed under Sunday.
 */
export function insideOpenHours(
  slots: Array<{ weekday: number; start_minute: number; duration_min: number }>,
  date: string,
  minute: number,
  durationMin: number,
): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return fitsOpenHours(slots, weekday, minute, durationMin);
}

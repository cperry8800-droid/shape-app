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
import { ACTIVE_STATUSES, clashIn, fitsOpenHours, isOfferedStart } from '../../public/newdesign/scheduleRules.mjs';
import { bookingRuleRefusal, checkSlot, OPEN_REQUESTS_CAP, openRequestsMessage } from '../../public/newdesign/bookingRules.mjs';

// The database's own refusal of a member's request (2026-10-07-booking-rules-enforced.sql), in the
// member's words: the second of two requests sent together, which both passed checkBookingRules.
export { bookingRuleRefusal, OPEN_REQUESTS_CAP, openRequestsMessage };

/**
 * How many open requests (requested, still ahead) the member holds with this coach, read through
 * the given client (a member's RLS-scoped one reads their own rows; the admin client reads all).
 * M3 of the 2026-10-08 review: the routes refuse the (cap + 1)th before the insert, so the
 * refusal is a clean 409 and not the trigger's error. ⚠ A FAILED READ IS `ok: false`, never
 * "none open": callers answer 503 and write nothing.
 */
export async function countOpenRequests(
  db: Db,
  args: { clientId: string; role: ProviderRole; providerId: number; nowMs?: number }
): Promise<{ ok: true; count: number } | { ok: false }> {
  const { count, error } = await db
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', args.clientId)
    .eq('provider_role', args.role)
    .eq('provider_id', args.providerId)
    .eq('status', 'requested')
    .gt('scheduled_at', new Date(args.nowMs ?? Date.now()).toISOString());
  if (error) return { ok: false };
  return { ok: true, count: Number(count ?? 0) };
}
import { isMissingRelation } from '@/lib/owned-provider';

// How far before a new booking an existing one can START and still reach into it. No session
// in this product runs past a few hours (the coach create caps at 4); half a day is a window
// that cannot miss one, and it keeps the read to the bookings that could possibly matter.
const LOOKBACK_MS = 12 * 3600_000;
const MINUTE_MS = 60_000;

export type SessionClash = { id: string; startMs: number; endMs: number; clientName: string | null };

type Db = Pick<SupabaseClient, 'from'>;
type ProviderRole = 'trainer' | 'nutritionist';

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
  return fitsOpenHours(slots, civilWeekday(date), minute, durationMin);
}

// The weekday of a civil 'YYYY-MM-DD', read offset-free (getDay()-style, 0 = Sun).
function civilWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday;
}

/**
 * Whether the time is one the booking page OFFERED: inside the open hours (above) AND one of the
 * starts bookingSlots.js lays out (scheduleRules.isOfferedStart). The member routes use this, so
 * a crafted 9:15 inside a 9:00–11:00 row is refused like a 3 AM one (Codex, the review of #2228).
 */
export function offeredInOpenHours(
  slots: Array<{ weekday: number; start_minute: number; duration_min: number }>,
  date: string,
  minute: number,
  durationMin: number,
): boolean {
  return insideOpenHours(slots, date, minute, durationMin) && isOfferedStart(slots, civilWeekday(date), minute, durationMin);
}

/**
 * Whether a write was refused because the time is already held: 23505 is the identical-start
 * index (sessions_no_conflict_idx), 23P01 the overlap constraint (sessions_no_overlap,
 * 2026-10-07-sessions-no-overlap.sql).
 *
 * ⚠ THE READ ABOVE IS NOT THE GUARD AGAINST A RACE; THE CONSTRAINT IS (Codex, the review of #2228).
 * Two overlapping requests sent together both pass findSessionClash before either writes. The
 * database refuses the second, and every writer answers that with "taken", never a 500.
 */
export function isDoubleBookError(error: unknown): boolean {
  const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code ?? '') : '';
  return code === '23505' || code === '23P01';
}

/**
 * The coach's own booking rules for a MEMBER's booking (2026-10-07, Schedule step 3): their time
 * off, the buffer between sessions, the daily limit and the minimum notice, as
 * bookingRules.checkSlot decides them. The routes have already checked the open hours (the
 * offered starts) and the overlap (findSessionClash, and the database's sessions_no_overlap), so
 * those two are skipped here and keep their own answers.
 *
 * ⚠ A FAILED READ IS `unavailable`, NEVER "NO RULES". Read as no time off and no limits, an
 * outage would book a member into a coach's vacation. Only "not set up yet" (a database without
 * 2026-10-07-booking-rules-time-off.sql) reads as the defaults, which is how it behaved before.
 *
 * `db` must read across the coach's whole calendar: the service role, or any client for the
 * definer read (provider_busy_blocks says when, never who).
 */
export async function checkBookingRules(
  db: Pick<SupabaseClient, 'from' | 'rpc'>,
  opts: {
    role: string;
    providerId: number;
    zone: string;
    slots: Array<{ weekday: number; start_minute: number; duration_min: number }>;
    startMs: number;
    durationMin: number;
    nowMs: number;
  },
): Promise<{ ok: true } | { ok: false; unavailable: true } | { ok: false; unavailable?: false; reason: string; message: string }> {
  const endMs = opts.startMs + opts.durationMin * MINUTE_MS;
  const [rulesRes, busyRes] = await Promise.all([
    db.from('provider_booking_rules')
      .select('buffer_min, max_per_day, min_notice_hours')
      .eq('provider_role', opts.role)
      .eq('provider_id', opts.providerId)
      .maybeSingle(),
    // Two days either side: the daily limit counts the whole local day, and the buffer reaches
    // across midnight.
    db.rpc('provider_busy_blocks', {
      p_role: opts.role,
      p_provider_id: opts.providerId,
      p_from: new Date(opts.startMs - 2 * 86_400_000).toISOString(),
      p_to: new Date(endMs + 2 * 86_400_000).toISOString(),
    }),
  ]);
  if (rulesRes.error && !isMissingRelation(rulesRes.error)) return { ok: false, unavailable: true };
  if (busyRes.error && !isMissingRelation(busyRes.error)) return { ok: false, unavailable: true };
  const verdict = checkSlot(
    { start: opts.startMs, durationMin: opts.durationMin },
    {
      now: opts.nowMs,
      zone: opts.zone,
      availability: opts.slots,
      busy: busyRes.error ? [] : busyRes.data ?? [],
      rules: rulesRes.error ? null : rulesRes.data,
      audience: 'member',
      skip: ['past', 'closed', 'overlap'],
    },
  );
  return verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason, message: verdict.message };
}


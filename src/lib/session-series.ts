// Recurring sessions (2026-10-07, Schedule step 4): "every Tue and Thu at 7 AM for 8 weeks",
// and changing one session of a run or this one and every later one.
//
// A run is ordinary `sessions` rows sharing a `series_id` (2026-10-07-session-series.sql). Each
// row is a booking in its own right, so every calendar, the feed, the reminders and the member's
// own list keep reading single sessions; the id is only what "this and following" acts on.
//
// ⚠ EVERY OCCURRENCE IS A WALL CLOCK IN THE COACH'S ZONE, NEVER "THE FIRST INSTANT PLUS N
// WEEKS". A 7:00 AM New York run that crosses the November clock change stays at 7:00 AM:
// 11:00Z before it, 12:00Z after. Adding 7 × 24 hours of milliseconds would land every session
// after the change at 6:00 AM.
//
// Callers: /api/sessions/manage (create with `repeat`, cancel and reschedule with `scope`).

import type { SupabaseClient } from '@supabase/supabase-js';
import { ACTIVE_STATUSES, clashIn } from '../../public/newdesign/scheduleRules.mjs';
import { instantInZone, wallClockInZone } from '@/lib/time';

// A run is at most half a year of weeks and 60 sessions: enough for any block a coach plans,
// and a ceiling on what one request writes.
export const SERIES_MAX_WEEKS = 26;
export const SERIES_MAX_SESSIONS = 60;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
// The same reach /api/sessions/manage's single clash check uses: no session runs half a day.
const LOOKBACK_MS = 12 * 3600_000;

type Db = Pick<SupabaseClient, 'from'>;
export type Occurrence = { date: string; time: string; at: number };

const civil = (date: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return NaN;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Feb 30 rolls over in Date.UTC; a date that does not exist is not a date.
  return new Date(t).toISOString().slice(0, 10) === date ? t : NaN;
};
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * The run's sessions on the coach's own calendar: every date from `date` (inclusive) for
 * `weeks` weeks whose weekday is in `weekdays` (0 = Sunday, read on the civil date, so a
 * coach's Monday is their Monday), each at `time` in `zone`. `weekdays` defaults to the first
 * date's own. A wall clock the zone skips (the spring-forward hour) is returned in `missing`
 * rather than moved to an hour nobody asked for.
 */
export function seriesOccurrences(o: { date: string; time: string; zone: string; weeks: number; weekdays?: number[] | null }):
  { ok: true; list: Occurrence[]; missing: Array<{ date: string; time: string }> } | { ok: false; error: string } {
  const start = civil(o.date);
  if (!Number.isFinite(start)) return { ok: false, error: 'A repeat needs a valid first date.' };
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(o.time || ''));
  if (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) return { ok: false, error: 'A repeat needs a valid time.' };
  if (!Number.isInteger(o.weeks) || o.weeks < 2 || o.weeks > SERIES_MAX_WEEKS) {
    return { ok: false, error: `A repeat runs 2 to ${SERIES_MAX_WEEKS} weeks.` };
  }
  const firstDay = new Date(start).getUTCDay();
  const asked = o.weekdays == null ? [firstDay] : o.weekdays;
  if (!Array.isArray(asked) || !asked.length || asked.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return { ok: false, error: 'Pick the days the session repeats on.' };
  }
  const days = new Set(asked);
  const h = Number(tm[1]), mi = Number(tm[2]);
  const time = `${String(h).padStart(2, '0')}:${tm[2]}`;
  const list: Occurrence[] = [];
  const missing: Array<{ date: string; time: string }> = [];
  for (let i = 0; i < o.weeks * 7; i++) {
    const t = start + i * DAY_MS;
    if (!days.has(new Date(t).getUTCDay())) continue;
    const date = isoOf(t);
    const [y, m, d] = date.split('-').map(Number);
    const at = instantInZone(y, m, d, h, mi, o.zone);
    if (Number.isFinite(at)) list.push({ date, time, at }); else missing.push({ date, time });
  }
  if (list.length + missing.length > SERIES_MAX_SESSIONS) {
    return { ok: false, error: `A repeat books at most ${SERIES_MAX_SESSIONS} sessions. Pick fewer days or weeks.` };
  }
  return { ok: true, list, missing };
}

export type CalendarItem = { id: string; start: number; end: number; status: string; name: string | null };

/** The coach's active bookings that could touch [fromMs, toMs), or ok: false when unreadable. */
export async function readCalendarWindow(db: Db, o: { role: string; providerId: number; fromMs: number; toMs: number }):
  Promise<{ ok: true; items: CalendarItem[] } | { ok: false }> {
  const { data, error } = await db
    .from('sessions')
    .select('id, scheduled_at, duration_min, status, client_name')
    .eq('provider_role', o.role)
    .eq('provider_id', o.providerId)
    .in('status', [...ACTIVE_STATUSES])
    .gte('scheduled_at', new Date(o.fromMs - LOOKBACK_MS).toISOString())
    .lt('scheduled_at', new Date(o.toMs).toISOString())
    // The window is at most 26 weeks of one coach's calendar; the cap is a ceiling, not a page.
    .order('scheduled_at', { ascending: true })
    .limit(2000);
  if (error) return { ok: false };
  type Row = { id: string; scheduled_at: string; duration_min: number | null; status: string; client_name?: string | null };
  return {
    ok: true,
    items: ((data ?? []) as Row[]).map((r) => {
      const start = Date.parse(r.scheduled_at);
      return { id: r.id, start, end: start + (r.duration_min ?? 15) * MINUTE_MS, status: r.status, name: r.client_name ?? null };
    }),
  };
}

/** The booking a session at `startMs` would overlap, ignoring the ids in `exclude`. */
export function clashInWindow(items: CalendarItem[], startMs: number, durationMin: number, exclude: Set<string> = new Set()): CalendarItem | null {
  const pool = exclude.size ? items.filter((it) => !exclude.has(it.id)) : items;
  return (clashIn(pool, startMs, startMs + durationMin * MINUTE_MS, null) as CalendarItem | null) || null;
}

/**
 * Where "this and following" lands: each session moves by the same number of CALENDAR days
 * on the coach's clock and takes the new wall time, so a run moved from Tuesday 7:00 to
 * Wednesday 8:00 stays on Wednesdays at 8:00 across a clock change. `null` for a session
 * whose new wall time the zone skips.
 */
export function shiftedRun(
  rows: Array<{ id: string; scheduled_at: string }>, o: { zone: string; fromDate: string; toDate: string; time: string },
): Array<{ id: string; at: number | null; date: string }> {
  const dayDelta = Math.round((civil(o.toDate) - civil(o.fromDate)) / DAY_MS);
  const [h, mi] = o.time.split(':').map(Number);
  return rows.map((r) => {
    const wall = wallClockInZone(Date.parse(r.scheduled_at), o.zone);
    const base = wall ? civil(wall.date) : NaN;
    if (!Number.isFinite(base) || !Number.isFinite(dayDelta)) return { id: r.id, at: null, date: '' };
    const date = isoOf(base + dayDelta * DAY_MS);
    const [y, m, d] = date.split('-').map(Number);
    const at = instantInZone(y, m, d, h, mi, o.zone);
    return { id: r.id, at: Number.isFinite(at) ? at : null, date };
  });
}

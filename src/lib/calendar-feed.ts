// The coach's calendar feed (2026-10-07, owner-approved coach-tools plan, Schedule "Connect":
// "A private link that Google, Apple and Outlook can subscribe to, read-only. It's the
// cheapest true version of 'sync'").
//
// Two routes use this file:
//   GET      /api/calendar/feed/<token>  — the feed itself, read by a calendar app with no
//                                          session at all; the token is the whole credential.
//   GET|POST /api/calendar/feed-token    — the signed-in coach reading or resetting their link.
//
// ⚠ IT IS READ-ONLY, AND THE COPY MUST SAY SO. A subscription is one-way by construction:
// nothing a coach does in Google comes back to Shape, and a change in Shape reaches Google only
// when Google next fetches the link (it decides when; hours, sometimes a day). Anything
// claiming "sync" or "two-way" is still false after this ships.
//
// Pure — no clock, no I/O: the feed route reads the rows and passes `now`.

import { randomBytes } from 'node:crypto';
import { icsCalendar, type IcsEvent, type IcsTime } from '@/lib/ics';
import { instantInZone } from '@/lib/time';

// ── the token ────────────────────────────────────────────────────────────────
// 32 random bytes, base64url: 43 characters, 256 bits. Unguessable, so the feed needs no
// rate-limit arithmetic of its own to be safe from enumeration (the proxy's per-IP limit
// still applies), and the same 404 answers a malformed token and an unknown one.
export const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/;

export function newFeedToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The token in a feed path segment ("<token>" or "<token>.ics"), or null when it cannot be one. */
export function feedTokenFromPath(segment: unknown): string | null {
  let s = String(segment ?? '');
  try { s = decodeURIComponent(s); } catch { return null; }
  s = s.replace(/\.ics$/i, '');
  return FEED_TOKEN_RE.test(s) ? s : null;
}

/** The https and webcal:// forms of a coach's feed link. */
export function feedUrls(origin: string, token: string): { url: string; webcalUrl: string } {
  const base = String(origin || '').replace(/\/+$/, '');
  const url = `${base}/api/calendar/feed/${token}.ics`;
  return { url, webcalUrl: url.replace(/^https?:/i, 'webcal:') };
}

/** A PostgREST / Postgres error that means "the table is not there yet". */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message ?? '');
}

// ── the window ───────────────────────────────────────────────────────────────
// Thirty days back so last month's sessions stay on the calendar a coach is looking at, and
// six months ahead, well past how far anyone books.
export const FEED_PAST_DAYS = 30;
export const FEED_AHEAD_DAYS = 180;
const DAY_MS = 86_400_000;

export function feedWindow(now: number): { fromMs: number; toMs: number; fromDate: string; toDate: string } {
  const fromMs = now - FEED_PAST_DAYS * DAY_MS;
  const toMs = now + FEED_AHEAD_DAYS * DAY_MS;
  // calendar_events dates are wall-clock dates in no zone, so their window is a day wider
  // each side — a feed that shows one extra day loses nothing; one that cuts a day short
  // deletes it from the coach's calendar.
  return {
    fromMs,
    toMs,
    fromDate: new Date(fromMs - DAY_MS).toISOString().slice(0, 10),
    toDate: new Date(toMs + DAY_MS).toISOString().slice(0, 10),
  };
}

// ── the rows ─────────────────────────────────────────────────────────────────
export type FeedSession = {
  id: string; client_id: string | null; provider_role: string; type: string | null;
  scheduled_at: string; duration_min: number | null; status: string;
  topic: string | null; meeting_url: string | null;
  updated_at?: string | null; created_at?: string | null;
};
export type FeedEvent = {
  id: string; kind: string | null; title: string; sub: string | null;
  event_date: string; event_time: string | null; duration_min: number | null;
  with_name: string | null; location: string | null; status: string;
  updated_at?: string | null; created_at?: string | null;
};

// Which bookings the feed carries. Cancelled and declined ones are left OUT, which is how a
// subscription removes an event: the next fetch no longer lists it, so the calendar app
// drops it. Completed ones stay, as they do on the Schedule page (/api/calendar reads
// requested, confirmed and completed).
export const FEED_SESSION_STATUSES = ['requested', 'confirmed', 'completed'];
export const FEED_EVENT_STATUSES = ['planned', 'done'];

const TYPE_LABEL: Record<string, string> = { video: 'Video call', phone: 'Phone call', inperson: 'In person', message: 'Messages' };
const DEFAULT_EVENT_MIN = 30;

function ms(iso: string | null | undefined): number | null {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
}
function minutes(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 24 * 60) : fallback;
}
function nextDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + DAY_MS).toISOString().slice(0, 10);
}
const safeId = (s: unknown) => String(s ?? '').replace(/[^A-Za-z0-9-]/g, '');

export type FeedInput = {
  sessions: FeedSession[];
  events: FeedEvent[];
  /** client_id → display name (profiles.full_name); a missing one reads "Client". */
  names: Map<string, string>;
  /** The coach's own zone (trainers/nutritionists.timezone), for calendar_events wall clocks. */
  zone: string | null;
  /** The site origin, for the "Open in Shape" line. */
  origin: string;
  now: number;
};

function sessionEvent(s: FeedSession, input: FeedInput): IcsEvent | null {
  const start = ms(s.scheduled_at);
  if (start == null) return null;
  const nutri = s.provider_role === 'nutritionist';
  const who = (s.client_id && input.names.get(s.client_id)) || 'Client';
  const requested = s.status === 'requested';
  const meeting = typeof s.meeting_url === 'string' && /^https?:\/\//i.test(s.meeting_url.trim()) ? s.meeting_url.trim() : '';
  const how = TYPE_LABEL[String(s.type ?? '')] || '';
  const app = `${input.origin.replace(/\/+$/, '')}/newdesign/${nutri ? 'NutritionistApp' : 'TrainerApp'}.html#schedule`;
  const lines = [
    requested ? 'Requested: not confirmed yet.'
      : s.status === 'completed' ? 'Completed.' : 'Confirmed.',
    how,
    s.topic ? `Topic: ${s.topic}` : '',
    meeting ? `Join: ${meeting}` : '',
    `Open in Shape: ${app}`,
  ].filter(Boolean);
  const stamp = ms(s.updated_at) ?? ms(s.created_at) ?? input.now;
  return {
    uid: `session-${safeId(s.id)}@theshapecommunity.com`,
    start: { utc: start },
    end: { utc: start + minutes(s.duration_min, 30) * 60_000 },
    stamp,
    lastModified: ms(s.updated_at) ?? undefined,
    summary: `${nutri ? 'Consult' : 'Session'} · ${who}${requested ? ' (requested)' : ''}`,
    description: lines.join('\n'),
    location: meeting || how || undefined,
    url: meeting || undefined,
    status: requested ? 'TENTATIVE' : 'CONFIRMED',
  };
}

// A calendar_events row: a wall clock with no zone of its own. Placed in the coach's zone
// when it is known; floating (shown at that clock wherever the calendar is) when it is not,
// or when the time does not exist there (the spring-forward hour).
function eventEvent(e: FeedEvent, input: FeedInput): IcsEvent | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(e.event_date ?? ''))) return null;
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(e.event_time ?? '').trim());
  let start: IcsTime;
  let end: IcsTime;
  if (!tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) {
    start = { date: e.event_date };
    end = { date: nextDate(e.event_date) };
  } else {
    const [y, mo, d] = e.event_date.split('-').map(Number);
    const h = Number(tm[1]);
    const mi = Number(tm[2]);
    const len = minutes(e.duration_min, DEFAULT_EVENT_MIN) * 60_000;
    const at = input.zone ? instantInZone(y, mo, d, h, mi, input.zone) : NaN;
    if (Number.isFinite(at)) {
      start = { utc: at };
      end = { utc: at + len };
    } else {
      const naive = Date.UTC(y, mo - 1, d, h, mi);
      const fl = (t: number) => new Date(t).toISOString().slice(0, 16);
      start = { floating: fl(naive) };
      end = { floating: fl(naive + len) };
    }
  }
  const lines = [e.sub ?? '', e.with_name ? `With ${e.with_name}` : '', e.status === 'done' ? 'Done.' : ''].filter(Boolean);
  return {
    uid: `event-${safeId(e.id)}@theshapecommunity.com`,
    start,
    end,
    stamp: ms(e.updated_at) ?? ms(e.created_at) ?? input.now,
    lastModified: ms(e.updated_at) ?? undefined,
    summary: e.title || 'Event',
    description: lines.join('\n') || undefined,
    location: e.location || undefined,
    status: 'CONFIRMED',
    // An all-day note should not block the day out as busy; a timed one does.
    transparent: 'date' in start,
  };
}

function sortKey(e: IcsEvent): string {
  const t = e.start;
  return 'utc' in t ? new Date(t.utc).toISOString() : 'date' in t ? t.date : t.floating;
}

/** The coach's feed as iCalendar text. */
export function buildCoachFeed(input: FeedInput): string {
  const events: IcsEvent[] = [];
  for (const s of input.sessions) {
    if (!FEED_SESSION_STATUSES.includes(s.status)) continue;
    const ev = sessionEvent(s, input);
    if (ev) events.push(ev);
  }
  for (const e of input.events) {
    if (!FEED_EVENT_STATUSES.includes(e.status)) continue;
    const ev = eventEvent(e, input);
    if (ev) events.push(ev);
  }
  // A stable order, so two fetches of an unchanged calendar are the same bytes.
  events.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
  return icsCalendar({
    name: 'Shape sessions',
    description: 'Your Shape bookings, read-only. Change them in Shape; this calendar updates when your calendar app next refreshes.',
    refreshMinutes: 60,
    events,
  });
}

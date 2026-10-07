// GET /api/calendar/feed/<token>[.ics] — a coach's Shape bookings as an iCalendar feed that
// Google, Apple or Outlook subscribes to. Read-only. See src/lib/calendar-feed.ts.
//
// ⚠ THE TOKEN IS THE WHOLE CREDENTIAL. A calendar app fetches this with no cookie and no
// header, so the route cannot ask who is calling — it asks only "whose link is this", reads
// that coach's rows with the service role, and answers 404 to everything else. A malformed
// token, an unknown one, a reset (rotated) one, a token whose owner is no longer a coach and a
// database without the migration all get the SAME 404, so the route says nothing about which
// links exist. The proxy lets this one path through the membership gate
// (src/lib/supabase/middleware.ts, GATE_SKIP_PREFIXES) and still rate-limits it per IP.
//
// ⚠ A FAILED READ IS A 503, NEVER AN EMPTY CALENDAR. To a subscribing app an empty feed means
// "every event was deleted": it would wipe the coach's sessions off their phone until the next
// refresh. A 503 makes it keep what it had. So every read that feeds the calendar must succeed
// or the whole response fails — the one exception is client names, which degrade to "Client"
// exactly as they do on the Schedule page.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeZone } from '@/lib/time';
import {
  buildCoachFeed, feedTokenFromPath, feedWindow, isMissingTable,
  FEED_EVENT_STATUSES, FEED_SESSION_STATUSES, type FeedEvent, type FeedSession,
} from '@/lib/calendar-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A ceiling, not a page: six months of one coach's bookings. Read NEWEST first, so a coach
// past it loses the oldest days of the window rather than next week (tests/capped-reads).
const ROW_CAP = 5000;
// ⚠ ONE REQUEST IS NOT THE WHOLE WINDOW (Codex, the review of #2224). PostgREST answers a list
// read with at most its own db-max-rows (1,000 here, the figure the repo's other readers
// assume), whatever `.limit()` asked for, and it says nothing when it cuts: the array is just
// shorter. A coach past that in 210 days would have been handed a calendar with real sessions
// missing, which a subscribing app applies as deletions — the exact outcome the 503 rule below
// exists to prevent. So each read pages, a page at a time, and checks what it got against the
// exact count.
const PAGE = 1000;
// get_display_names' own batch limit, kept for the direct read too.
const NAME_BATCH = 200;

function notFound() {
  return new NextResponse('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
  });
}
function unavailable() {
  return new NextResponse('Calendar temporarily unavailable', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '300', 'X-Robots-Tag': 'noindex' },
  });
}

type Provider = { role: 'trainer' | 'nutritionist'; id: number; zone: string | null };

type Page<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

// Every row of one bounded read, newest first, or `null` when the read failed or came back
// incomplete (the caller answers 503). The query orders newest first with `id` as the
// tiebreak, so a page boundary between two rows at one instant is stable.
//
// ⚠ THE STEP IS WHAT A PAGE RETURNED, NOT WHAT IT ASKED FOR, so a server ceiling lower than
// PAGE still walks the whole set. ⚠ AND THE CHECK IS THE EXACT COUNT FROM THE FIRST PAGE, NOT
// "a short page means the end": a row deleted (or cancelled) between two pages shifts every
// later offset by one and skips a row, and only the count can see that. A read that fell short
// of its count is reported as incomplete — Google keeps what it had for five minutes — rather
// than published with a hole in it. Reaching ROW_CAP is the one deliberate shortfall: the
// newest ROW_CAP rows are served and the oldest past days drop off, as the cap above says.
async function readAll<T extends { id: unknown }>(what: string, page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[] | null> {
  const rows = new Map<string, T>();
  let offset = 0;
  let total: number | null = null;
  while (offset < ROW_CAP) {
    const res = await page(offset, Math.min(offset + PAGE, ROW_CAP) - 1);
    if (res.error) {
      console.error(`[shape-api] calendar feed: ${what} read failed:`, res.error.message);
      return null;
    }
    if (total == null) total = typeof res.count === 'number' ? res.count : null;
    const got = res.data ?? [];
    for (const r of got) rows.set(String(r.id), r);
    if (!got.length) break;
    offset += got.length;
    if (total != null && offset >= total) break;
  }
  if (total == null) {
    console.error(`[shape-api] calendar feed: ${what} read returned no count`);
    return null;
  }
  if (rows.size < Math.min(total, ROW_CAP)) {
    console.error(`[shape-api] calendar feed: ${what} read incomplete (${rows.size} of ${total})`);
    return null;
  }
  return [...rows.values()];
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = feedTokenFromPath((await params).token);
  if (!token) return notFound();

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch (e) {
    console.error('[shape-api] calendar feed: no service client:', e instanceof Error ? e.message : e);
    return unavailable();
  }

  const { data: link, error: linkError } = await admin
    .from('calendar_feed_tokens').select('user_id').eq('token', token).maybeSingle();
  if (linkError) {
    // Before the migration the table is not there: no link can exist yet, so this is the
    // same 404 an unknown link gets, not an outage.
    if (isMissingTable(linkError)) return notFound();
    console.error('[shape-api] calendar feed: link read failed:', linkError.message);
    return unavailable();
  }
  const userId = (link as { user_id?: string } | null)?.user_id;
  if (!userId) return notFound();

  // ⚠ `select('*')` FOR THE SAME REASON AS /api/my-availability: naming `timezone` errors the
  // whole read on a database without 2026-09-11-provider-timezone.sql.
  const [tr, nu] = await Promise.all([
    admin.from('trainers').select('*').eq('owner_id', userId).maybeSingle(),
    admin.from('nutritionists').select('*').eq('owner_id', userId).maybeSingle(),
  ]);
  if (tr.error || nu.error) {
    console.error('[shape-api] calendar feed: provider read failed:', (tr.error ?? nu.error)?.message);
    return unavailable();
  }
  const providers: Provider[] = [];
  for (const [role, res] of [['trainer', tr], ['nutritionist', nu]] as const) {
    const row = res.data as { id?: number; timezone?: unknown } | null;
    if (row && row.id != null) providers.push({ role, id: Number(row.id), zone: normalizeZone(row.timezone) });
  }
  // A link outlives nothing: an account that no longer owns a coach row has no bookings to
  // publish, and saying so would confirm the link was once real.
  if (!providers.length) return notFound();

  const now = Date.now();
  const win = feedWindow(now);
  const sessions: FeedSession[] = [];
  for (const p of providers) {
    const rows = await readAll<FeedSession>('sessions', (from, to) => admin
      .from('sessions')
      .select('id, client_id, provider_role, type, scheduled_at, duration_min, status, topic, meeting_url, created_at, updated_at', { count: 'exact' })
      .eq('provider_role', p.role)
      .eq('provider_id', p.id)
      .in('status', FEED_SESSION_STATUSES)
      .gte('scheduled_at', new Date(win.fromMs).toISOString())
      .lte('scheduled_at', new Date(win.toMs).toISOString())
      .order('scheduled_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to));
    if (!rows) return unavailable();
    sessions.push(...rows);
  }

  // The coach's OWN calendar notes — never the ones they wrote onto a client's calendar,
  // which belong to that client (user_id is the owner, created_by the author).
  const evRows = await readAll<FeedEvent>('events', (from, to) => admin
    .from('calendar_events')
    .select('id, kind, title, sub, event_date, event_time, duration_min, with_name, location, status, created_at, updated_at', { count: 'exact' })
    .eq('user_id', userId)
    .in('status', FEED_EVENT_STATUSES)
    .gte('event_date', win.fromDate)
    .lte('event_date', win.toDate)
    .order('event_date', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to));
  if (!evRows) return unavailable();

  // Client names, as the Schedule page shows them (profiles.full_name, else "Client").
  // ⚠ NOT get_display_names: it answers nothing when auth.uid() is null, which it always is
  // under the service role. The direct read selects the same one display field and nothing
  // else from the row.
  const names = new Map<string, string>();
  const ids = [...new Set(sessions.map((s) => s.client_id).filter(Boolean) as string[])];
  for (let i = 0; i < ids.length; i += NAME_BATCH) {
    const { data: profs, error: profError } = await admin.from('profiles').select('id, full_name').in('id', ids.slice(i, i + NAME_BATCH));
    if (profError) {
      console.warn("[shape-api] calendar feed: names read failed — clients read as 'Client':", profError.message);
      break;
    }
    for (const p of (profs ?? []) as { id: string; full_name: string | null }[]) {
      const n = String(p.full_name ?? '').trim();
      if (n) names.set(String(p.id), n);
    }
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://theshapecommunity.com').replace(/\/+$/, '');
  const body = buildCoachFeed({
    sessions,
    events: evRows,
    names,
    zone: providers.find((p) => p.zone)?.zone ?? null,
    origin,
    now,
  });
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="shape-sessions.ics"',
      // Private: a shared cache must never hold one coach's bookings under a URL. Five
      // minutes is plenty for an app that refreshes every few hours.
      'Cache-Control': 'private, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}

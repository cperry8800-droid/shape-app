// Shared habits, hourly (owner, 2026-10-20: "habits can be public so that friends on app will be
// notified if you don't complete a habit"). A member picks, per habit, people they are connected
// to by an accepted follow (habit_watchers; supabase-migrations/2026-10-20-habit-watchers.sql).
// At 8 pm in the member's own timezone, each of those people hears about a shared habit that is
// not checked off yet, so there is still time to nudge. The rules are src/lib/habit-watch.mjs.
//
// It goes through preferredNotificationOutcome: a person who muted everything or turned "Friends'
// habits" off gets nothing, and inside their own quiet hours the row lands in the app with no
// push. One notice per person, per habit, per the owner's day (the notifications dedupe index).
// A notice that did not land (a failed read or write, or a run that ran out of time) is tried
// again in the two hours after 8 pm; one that landed is not (Codex on #2413).
//
// ⚠ A READ THAT FAILS IS NOT AN EMPTY ANSWER. A check-off read as "none" would tell friends a
// habit was missed when it was done, and a follow read as "none" would quietly drop people; so a
// failed read stops the run, and nothing is sent this hour.
//
// Auth: `x-cron-secret: <CRON_SECRET>` or Vercel Cron's `Authorization: Bearer <CRON_SECRET>`,
// as /api/cron/prep-reminders. Runs as the service role.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { preferredNotificationOutcome } from '@/lib/notify';
import { normalizeZone } from '@/lib/time';
import * as NotifyLayer from '@/lib/ai/notifications.mjs';
import { habitWatchDue, habitWatchText, habitWatchDedupe, HABIT_WATCH_HOUR, HABIT_WATCH_CATCHUP } from '@/lib/habit-watch.mjs';
import { bsYmdIn } from '../../../../../mobile-app/src/services/prepAhead.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const { inQuietHours, localHour } = NotifyLayer as unknown as {
  inQuietHours: (now: Date, prefs: { quietStart?: number; quietEnd?: number; tz?: string }) => boolean;
  localHour: (now: Date, tz: string) => number;
};

// PostgREST takes `in` filters on the URL, so long id lists go in chunks.
const CHUNK = 150;
// The shared-habit scan's page, under PostgREST's "Max rows" cap (1000) so a short page means the
// end of the table, and its ceiling, which bounds the run (maxDuration) and is reported when hit.
const HABIT_PAGE = 500;
const HABIT_MAX_ROWS = 50_000;
// The notices go out several at a time (Codex on #2413: one at a time, a large 8 pm hour outran
// maxDuration and the rest were never sent), and none is started once the run nears its limit:
// what is left is reported as `unsent` and logged, and the next hour of the evening sends it.
const SEND_AT_ONCE = 8;
const SEND_BUDGET_MS = 90_000;
// notification_settings.daily_cap's default (2026-06-17-notification-center.sql).
const DAILY_CAP = 4;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.NOTIFY_CRON_SECRET || '';
  if (!secret) return false;
  const hdr = request.headers.get('x-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  return safeEqual(hdr, secret) || safeEqual(auth, `Bearer ${secret}`);
}

function chunks<T>(xs: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

type Row = Record<string, unknown>;
type Admin = ReturnType<typeof createAdminClient>;
type Habit = { id: string; user_id: string; name: string; type: string | null; cadence: string | null; archived_at: string | null };

// Every row of a query run over the ids in chunks, or null when any chunk fails.
// ⚠ EACH CHUNK IS READ IN PAGES. PostgREST answers at most its "Max rows" per request and says
// nothing when it cuts a list short, so one request per chunk silently dropped rows: 150 habits
// can hold 3,000 watcher rows, and 75 owners more than 1,000 follows (Codex on #2413). Each query
// orders by a unique key so the pages neither skip nor repeat a row, and a page shorter than
// READ_PAGE (under the 1,000 cap, as HABIT_PAGE is) is the end.
const READ_PAGE = 500;
type Pageable = { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> };
async function readIn(ids: string[], run: (chunk: string[]) => Pageable, size = CHUNK): Promise<Row[] | null> {
  const rows: Row[] = [];
  for (const chunk of chunks(ids, size)) {
    for (let from = 0; ; from += READ_PAGE) {
      const { data, error } = await run(chunk).range(from, from + READ_PAGE - 1);
      if (error) return null;
      const page = (data ?? []) as Row[];
      rows.push(...page);
      if (page.length < READ_PAGE) break;
    }
  }
  return rows;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin: Admin = createAdminClient();
  const now = Date.now();

  // Every shared, live habit. A cursor walk on `id` (unique), not range(): an offset shifts when a
  // row changes between pages and skips one (as /api/cron/prep-reminders says).
  const habits: Habit[] = [];
  let cursor = '';
  let truncated = false;
  for (;;) {
    let q = admin
      .from('user_habits')
      .select('id, user_id, name, type, cadence, archived_at')
      .eq('visibility', 'friends')
      .is('archived_at', null);
    if (cursor) q = q.gt('id', cursor);
    // capped-read-ok: not a cap that keeps the first rows. Each page is one step of a cursor walk
    // that reads on to the end of the table (or to the ceiling, which is reported), and `id` is a
    // random uuid, so ascending only fixes the walk's direction.
    const { data, error } = await q.order('id', { ascending: true }).limit(HABIT_PAGE);
    if (error) {
      console.error('[shape] habit watch: habit scan failed:', error);
      return NextResponse.json({ error: 'Could not read shared habits.' }, { status: 500 });
    }
    const page = (data ?? []) as Row[];
    for (const r of page) {
      if (str(r.id) && str(r.user_id)) habits.push({ id: str(r.id), user_id: str(r.user_id), name: str(r.name), type: str(r.type) || null, cadence: str(r.cadence) || null, archived_at: null });
    }
    const last = page.length ? page[page.length - 1].id : null;
    if (page.length < HABIT_PAGE || typeof last !== 'string') break;
    if (habits.length >= HABIT_MAX_ROWS) { truncated = true; break; }
    cursor = last;
  }
  if (truncated) console.error(`[shape] habit watch: habit scan stopped at its ${HABIT_MAX_ROWS}-row ceiling; habits past it are not watched`);
  if (!habits.length) return NextResponse.json({ ok: true, owed: 0, sent: 0, failed: 0, unsent: 0, truncated });

  // Each owner's zone: the one the app saves on every open, else their notification zone.
  const owners = [...new Set(habits.map((h) => h.user_id))];
  const [profiles, settings] = await Promise.all([
    readIn(owners, (c) => admin.from('client_profiles').select('user_id, timezone').in('user_id', c).order('user_id')),
    readIn(owners, (c) => admin.from('notification_settings').select('user_id, tz').in('user_id', c).order('user_id')),
  ]);
  if (!profiles || !settings) {
    console.error('[shape] habit watch: could not read zones');
    return NextResponse.json({ error: 'Could not read time zones.' }, { status: 500 });
  }
  const zoneCache = new Map<string, string | null>();
  const zone = (raw: unknown) => {
    const k = String(raw ?? '');
    if (!zoneCache.has(k)) zoneCache.set(k, normalizeZone(raw));
    return zoneCache.get(k) ?? null;
  };
  const zoneOf = new Map<string, string>();
  for (const r of profiles) { const z = zone(r.timezone); if (z) zoneOf.set(str(r.user_id), z); }
  for (const r of settings) { const z = zone(r.tz); if (z && !zoneOf.has(str(r.user_id))) zoneOf.set(str(r.user_id), z); }
  const hourCache = new Map<string, number>();
  const hourOf = (tz: string) => {
    if (!hourCache.has(tz)) hourCache.set(tz, localHour(new Date(now), tz));
    return hourCache.get(tz) as number;
  };
  const dayOf = (tz: string) => bsYmdIn(now, tz);
  // 8 pm, or one of the catch-up hours after it, on the owner's clock.
  const inWindow = (at: number) => at >= HABIT_WATCH_HOUR && at <= HABIT_WATCH_HOUR + HABIT_WATCH_CATCHUP;
  const due = habits.filter((h) => inWindow(hourOf(zoneOf.get(h.user_id) || 'UTC')));
  if (!due.length) return NextResponse.json({ ok: true, owed: 0, sent: 0, failed: 0, unsent: 0, truncated });

  const dueIds = due.map((h) => h.id);
  const dueOwners = [...new Set(due.map((h) => h.user_id))];
  const days = [...new Set(dueOwners.map((u) => dayOf(zoneOf.get(u) || 'UTC')))];
  const [watchers, completions, follows, names] = await Promise.all([
    readIn(dueIds, (c) => admin.from('habit_watchers').select('habit_id, owner_id, watcher_id').in('habit_id', c).order('habit_id').order('watcher_id')),
    readIn(dueIds, (c) => admin.from('user_habit_completions').select('habit_id, done_on').in('habit_id', c).in('done_on', days).order('habit_id').order('done_on')),
    // Every accepted follow touching a due owner, either way round: who is still connected.
    // The list rides the URL twice, so its chunk is half the usual.
    readIn(dueOwners, (c) => admin.from('user_follows').select('follower_id, following_id').eq('status', 'accepted').or(`follower_id.in.(${c.join(',')}),following_id.in.(${c.join(',')})`).order('follower_id').order('following_id'), CHUNK / 2),
    readIn(dueOwners, (c) => admin.from('profiles').select('id, full_name').in('id', c).order('id')),
  ]);
  if (!watchers || !completions || !follows || !names) {
    console.error('[shape] habit watch: could not read watchers, check-offs, follows or names');
    return NextResponse.json({ error: 'Could not read who to tell.' }, { status: 500 });
  }
  const doneOn = new Set(completions.map((r) => `${str(r.habit_id)}|${str(r.done_on)}`));
  const pairs = new Set(follows.map((r) => `${str(r.follower_id)}|${str(r.following_id)}`));
  const connected = (a: string, b: string) => pairs.has(`${a}|${b}`) || pairs.has(`${b}|${a}`);
  const notices = habitWatchDue({
    habits: due,
    watchers: watchers.map((r) => ({ habit_id: str(r.habit_id), owner_id: str(r.owner_id), watcher_id: str(r.watcher_id) })),
    doneOn,
    zoneOf: (u) => zoneOf.get(u) || null,
    hourOf,
    dayOf,
    connected,
  });
  if (!notices.length) return NextResponse.json({ ok: true, owed: 0, sent: 0, failed: 0, unsent: 0, truncated });

  // The people's own quiet hours, read on their own clock (the zone the app saves, else their
  // notification zone, as for the owners), and the evening's notices already stored for them.
  const people = [...new Set(notices.map((n) => n.watcherId))];
  const since = new Date(now - 30 * 60 * 60 * 1000).toISOString();
  const [quietRows, peopleZones, landed] = await Promise.all([
    readIn(people, (c) => admin.from('notification_settings').select('user_id, tz, quiet_start, quiet_end, daily_cap').in('user_id', c).order('user_id')),
    readIn(people, (c) => admin.from('client_profiles').select('user_id, timezone').in('user_id', c).order('user_id')),
    readIn(people, (c) => admin.from('notifications').select('user_id, data, created_at').eq('type', 'friend_habit').in('user_id', c).gte('created_at', since).order('id')),
  ]);
  if (!quietRows || !peopleZones) {
    console.error('[shape] habit watch: could not read quiet hours');
    return NextResponse.json({ error: 'Could not read quiet hours.' }, { status: 500 });
  }
  const quietOf = new Map<string, Row>();
  for (const r of quietRows) quietOf.set(str(r.user_id), r);
  const personZone = new Map<string, string>();
  for (const r of peopleZones) { const z = zone(r.timezone); if (z) personZone.set(str(r.user_id), z); }
  const nameOf = new Map<string, string>();
  for (const r of names) nameOf.set(str(r.id), str(r.full_name));
  // A catch-up hour sends only what has not landed. If that read fails, everything due is tried
  // again and the dedupe index refuses the ones that did.
  // ⚠ THE PERSON'S DAILY CAP (notification_settings.daily_cap, 4 by default) BOUNDS THE PUSHES.
  // Several friends' habits can fall due in one evening; past the cap a notice still lands in the
  // app but does not push, as inside quiet hours (Codex on #2413). Counted from these notices that
  // pushed in the last 24 hours, and reserved before each send so the eight at a time cannot
  // overshoot it.
  const stored = new Set<string>();
  const pushed = new Map<string, number>();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  if (landed) {
    for (const r of landed) {
      const d = r.data as Row | null;
      if (d && typeof d.dedupe === 'string') stored.add(`${str(r.user_id)}|${d.dedupe}`);
      const ch = d && (d.channels as Row | undefined);
      if (ch && ch.push === true && Date.parse(str(r.created_at)) >= dayAgo) pushed.set(str(r.user_id), (pushed.get(str(r.user_id)) || 0) + 1);
    }
  } else {
    console.error("[shape] habit watch: could not read the evening's notices; the dedupe index refuses repeats");
  }
  const owed = notices.filter((n) => !stored.has(`${n.watcherId}|${habitWatchDedupe(n.habitId, n.day)}`));
  if (!owed.length) return NextResponse.json({ ok: true, owed: 0, sent: 0, failed: 0, unsent: 0, truncated });

  // `owed`: notices due and not yet landed. `sent`: those stored now; a muted person, the type
  // off or a duplicate is owed and not sent. `failed`: a read or write that did not work, and
  // `unsent`: those the time ran out on; the next hour of the evening tries both again.
  let sent = 0;
  let failed = 0;
  const send = async (n: (typeof notices)[number]) => {
    let reserved = false;
    try {
      const q = quietOf.get(n.watcherId) || {};
      const asleep = inQuietHours(new Date(now), {
        tz: personZone.get(n.watcherId) || zone(q.tz) || 'UTC',
        quietStart: typeof q.quiet_start === 'number' ? q.quiet_start : undefined,
        quietEnd: typeof q.quiet_end === 'number' ? q.quiet_end : undefined,
      });
      const cap = typeof q.daily_cap === 'number' && Number.isFinite(q.daily_cap) ? q.daily_cap : DAILY_CAP;
      const used = pushed.get(n.watcherId) || 0;
      const quiet = asleep || used >= cap;
      if (!quiet) { pushed.set(n.watcherId, used + 1); reserved = true; }
      const text = habitWatchText({ ownerName: nameOf.get(n.ownerId), habitName: n.name, type: n.type });
      const outcome = await preferredNotificationOutcome(admin, {
        userId: n.watcherId,
        type: 'friend_habit',
        title: text.title,
        body: text.body,
        // Their profile, where the person can message them: `person`, not a follow's `profile`,
        // which the app opens on the reader's own profile (Codex on #2413).
        route: 'person',
        quiet,
        data: { actorId: n.ownerId, habitId: n.habitId, dedupe: habitWatchDedupe(n.habitId, n.day) },
      });
      if (outcome === 'stored') sent += 1;
      else if (outcome === 'failed') failed += 1;
      // A push that did not happen gives its place under the cap back.
      if (reserved && outcome !== 'stored') pushed.set(n.watcherId, (pushed.get(n.watcherId) || 1) - 1);
    } catch (err) {
      failed += 1;
      if (reserved) pushed.set(n.watcherId, (pushed.get(n.watcherId) || 1) - 1);
      console.error('[shape] habit watch notice failed:', n.habitId, err);
    }
  };
  let next = 0;
  const worker = async () => {
    while (next < owed.length && Date.now() - now < SEND_BUDGET_MS) await send(owed[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(SEND_AT_ONCE, owed.length) }, worker));
  const unsent = owed.length - next;
  if (unsent) console.error('[shape] habit watch: out of time with', unsent, 'notices unsent');
  if (failed) console.error('[shape] habit watch:', failed, 'notices failed');

  return NextResponse.json({ ok: true, owed: owed.length, sent, failed, unsent, truncated });
}

export async function GET(request: Request) {
  return handle(request);
}

// Night-before prep reminders, hourly (owner, 2026-10-04: "if anything that needs to be prepped
// the night before, that should be a notification to the user to remind them if it is part of a
// meal plan"; the review's suggestions taken 2026-10-05). At 7 pm in each member's own timezone,
// a member whose published meal plan has a meal tomorrow that has to be prepped the night before
// (a catalog recipe marked makeAhead: the overnight oats) gets ONE notification, naming every
// planned day one prep covers. Which meals is decided by the rule the app's Eat card reads too
// (mobile-app/src/services/prepAhead.mjs), so the two agree on what is owed and what is prepped.
// A day is named in one reminder only; the card stays until the prep is recorded.
//
// It goes through createPreferredNotification: a muted member, or one who turned "Prep reminders"
// off, gets nothing, and the push webhook honours the channel toggles. Inside the member's quiet
// hours the row still lands in the app, with no push.
//
// ⚠ A READ THAT FAILS IS NOT AN EMPTY ANSWER. Swaps, prep records and earlier reminders decide
// what is owed; reading any of them as "none" would remind a member about a meal they swapped
// out, prepped, or were already told about. A member whose reads fail is skipped this hour.
//
// Auth: `x-cron-secret: <CRON_SECRET>` or Vercel Cron's `Authorization: Bearer <CRON_SECRET>`,
// as /api/cron/reminders. Runs as the service role.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPreferredNotification } from '@/lib/notify';
import { normalizeZone } from '@/lib/time';
import * as NotifyLayer from '@/lib/ai/notifications.mjs';
import { SHAPE_KITCHEN_RECIPES } from '../../../../../mobile-app/src/broadsheet/shapeKitchenData.js';
import {
  bsMakeAheadIndex,
  bsPrepDueTonight,
  bsPrepReminderText,
  bsPrepRoute,
  bsYmdIn,
} from '../../../../../mobile-app/src/services/prepAhead.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const { inQuietHours, localHour } = NotifyLayer as unknown as {
  inQuietHours: (now: Date, prefs: { quietStart?: number; quietEnd?: number; tz?: string }) => boolean;
  localHour: (now: Date, tz: string) => number;
};

// 7 pm local: after a usual dinner and before the default quiet hours (22:00). A time the member
// chooses is the next step (owner, 2026-10-05).
const PREP_HOUR = 19;
// How far back earlier reminders are read. One prep keeps at most 7 days, and a reminder names
// days from tomorrow on, so a reminder older than this names no day still ahead.
const REMINDED_DAYS = 9;
// PostgREST takes `in` filters on the URL, so long id lists go in chunks.
const CHUNK = 150;
const INDEX = bsMakeAheadIndex(SHAPE_KITCHEN_RECIPES);

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

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

type Row = Record<string, unknown>;
type Admin = ReturnType<typeof createAdminClient>;

// Every row of a query run over the ids in chunks, or null when any chunk fails.
async function readIn(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[] | null> {
  const rows: Row[] = [];
  for (const chunk of chunks(ids)) {
    const { data, error } = await run(chunk);
    if (error) return null;
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
}

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin: Admin = createAdminClient();
  const now = Date.now();

  // The newest published plan per member: the one /api/client/plan serves to Eat.
  const { data: planRows, error: planError } = await admin
    .from('client_meal_plans')
    .select('client_id, payload, created_at')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(5000);
  if (planError) {
    console.error('[shape] prep reminders: plan scan failed:', planError);
    return NextResponse.json({ error: 'Could not read meal plans.' }, { status: 500 });
  }
  const plans = new Map<string, unknown>();
  for (const r of (planRows ?? []) as Row[]) {
    const id = typeof r.client_id === 'string' ? r.client_id : '';
    if (id && !plans.has(id)) plans.set(id, r.payload);
  }
  if (!plans.size) return NextResponse.json({ ok: true, owed: 0 });

  // Each member's zone: the one the app saves on every open, else their notification zone.
  const ids = [...plans.keys()];
  const [profiles, settings] = await Promise.all([
    readIn(ids, (c) => admin.from('client_profiles').select('user_id, timezone').in('user_id', c)),
    readIn(ids, (c) => admin.from('notification_settings').select('user_id, tz, quiet_start, quiet_end').in('user_id', c)),
  ]);
  if (!profiles || !settings) {
    console.error('[shape] prep reminders: could not read zones');
    return NextResponse.json({ error: 'Could not read time zones.' }, { status: 500 });
  }
  const zoneOf = new Map<string, string>();
  for (const r of profiles) { const z = normalizeZone(r.timezone); if (z) zoneOf.set(String(r.user_id), z); }
  const quietOf = new Map<string, Row>();
  for (const r of settings) {
    quietOf.set(String(r.user_id), r);
    const z = normalizeZone(r.tz);
    if (z && !zoneOf.has(String(r.user_id))) zoneOf.set(String(r.user_id), z);
  }
  const due = ids.filter((id) => localHour(new Date(now), zoneOf.get(id) || 'UTC') === PREP_HOUR);
  if (!due.length) return NextResponse.json({ ok: true, owed: 0 });

  const since = new Date(now - REMINDED_DAYS * 86400000).toISOString();
  const [goals, earlier] = await Promise.all([
    readIn(due, (c) => admin.from('user_goals').select('user_id, kind, data').in('user_id', c).in('kind', ['client_meal_swaps', 'meal_prep'])),
    readIn(due, (c) => admin.from('notifications').select('user_id, data').in('user_id', c).eq('type', 'meal_prep').gte('created_at', since)),
  ]);
  if (!goals || !earlier) {
    console.error('[shape] prep reminders: could not read swaps, prep records or earlier reminders');
    return NextResponse.json({ error: 'Could not read what was prepped.' }, { status: 500 });
  }

  // Members a reminder was owed to. A muted member, or one with Prep reminders off, is counted
  // and then skipped inside createPreferredNotification.
  let owed = 0;
  for (const userId of due) {
    try {
      const tz = zoneOf.get(userId) || 'UTC';
      const goal = (kind: string) => {
        const row = goals.find((g) => g.user_id === userId && g.kind === kind);
        return row && row.data && typeof row.data === 'object' ? (row.data as Row) : {};
      };
      const reminded = earlier
        .filter((r) => r.user_id === userId)
        .flatMap((r) => {
          const f = r.data && typeof r.data === 'object' ? (r.data as Row).forMeals : null;
          return Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : [];
        });
      const payload = plans.get(userId);
      const days = payload && typeof payload === 'object' ? (payload as Row).days : null;
      const groups = bsPrepDueTonight({
        days,
        swaps: goal('client_meal_swaps'),
        entries: Array.isArray(goal('meal_prep').entries) ? goal('meal_prep').entries : [],
        reminded,
        today: bsYmdIn(now, tz),
        index: INDEX,
        dayOf: (ms: number) => bsYmdIn(ms, tz),
        now,
      });
      const text = bsPrepReminderText(groups);
      if (!text) continue;
      const q = quietOf.get(userId) || {};
      const quiet = inQuietHours(new Date(now), {
        tz,
        quietStart: typeof q.quiet_start === 'number' ? q.quiet_start : undefined,
        quietEnd: typeof q.quiet_end === 'number' ? q.quiet_end : undefined,
      });
      await createPreferredNotification(admin, {
        userId,
        type: 'meal_prep',
        title: text.title,
        body: text.body,
        route: bsPrepRoute(groups[0].slug),
        quiet,
        data: {
          // Read back by the next evenings' runs, so a day is never named twice.
          forMeals: groups.flatMap((g: { meals: { date: string; mealId: string }[] }) => g.meals.map((m) => `${m.date}|${m.mealId}`)),
          recipes: groups.map((g: { slug: string }) => g.slug),
        },
      });
      owed += 1;
    } catch (err) {
      console.error('[shape] prep reminder failed:', userId, err);
    }
  }

  return NextResponse.json({ ok: true, owed });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}

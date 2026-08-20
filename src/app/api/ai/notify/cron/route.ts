// Proactive notification CRON — reaches CLOSED apps. Server-to-server (no user
// session): a scheduler (Vercel Cron / Supabase cron) hits this on an interval.
// For each active user it re-runs the SAME engine + decision layer over the
// snapshot their app last sent (/api/ai/notify stores it). The engine's
// TIME-BASED rules recompute against now, so a check-in that has since gone
// overdue, or a goal whose ETA has slipped, fires as a genuinely-new real event
// — with dedup preventing re-nags, and prefs/quiet-hours fully honored.
//
// Auth: header `x-notify-secret: <NOTIFY_CRON_SECRET>` OR Vercel Cron's
// `Authorization: Bearer <CRON_SECRET>`. Runs as the service role (acts for many
// users); reads/writes are explicitly user-scoped. Excluded from the membership
// gate + rate limiter in the proxy. NOTHING about any record is changed.
//
// GET|POST /api/ai/notify/cron  → { ok, evaluated, delivered }

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { dbError } from '@/lib/request-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { candidatesFor, deliver, readUserGoal, writeUserGoal, loadPrefs, loadHabitContext, Notify, type Snapshot } from '@/lib/ai/notify-core';
import { isCoachRole } from '@/lib/roles.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_WINDOW_MS = 14 * 86400000; // only users whose app checked in ≤14d ago
const BATCH = 500;

// Constant-time, length-safe compare so the shared secret can't be probed by
// timing the response.
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
function authorized(request: Request): boolean {
  const secret = process.env.NOTIFY_CRON_SECRET || process.env.CRON_SECRET || '';
  if (!secret) return false;
  const hdr = request.headers.get('x-notify-secret') || '';
  const auth = request.headers.get('authorization') || '';
  return safeEqual(hdr, secret) || safeEqual(auth, `Bearer ${secret}`);
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const admin = createAdminClient();
  // The snapshots the apps last sent (one row per user, kind 'notify_snapshot').
  const { data: rows, error } = await admin
    .from('user_goals')
    .select('user_id, data')
    .eq('kind', 'notify_snapshot')
    .limit(BATCH);
  if (error) return dbError(error, 'ai notify cron read', 500);

  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  let evaluated = 0;
  let delivered = 0;

  for (const row of rows ?? []) {
    const snapshot = (row as { data?: unknown }).data as Snapshot | undefined;
    const userId = (row as { user_id?: string }).user_id;
    if (!snapshot || typeof snapshot !== 'object' || !userId) continue;
    if (typeof snapshot.at === 'number' && snapshot.at < cutoff) continue; // inactive → skip

    const prefs = await loadPrefs(admin, userId);      // the preference center
    if (prefs.muted) continue;                          // honor master mute
    // ⚠ Read alongside `notify_state` rather than in a second round trip: this loop
    // runs for up to BATCH users, so an extra sequential query per user is real cost.
    const [last, settings] = await Promise.all([
      readUserGoal(admin, userId, 'notify_state'),
      readUserGoal(admin, userId, 'client_settings'),
    ]);
    // ⚠ SPEC §3D. Turning Daily check-in off stopped the Home bulletin and nothing
    // else: the stored snapshot keeps its check-in state, so this cron kept nudging a
    // member who had opted out and never reopened the app. Absence reads as opted IN.
    const checkinOptedOut = !Notify.dailyCheckinOn(settings.dailyCheckin);
    const now = new Date();
    const isCoach = isCoachRole(snapshot.role);  // trainer | nutritionist | dietitian
    const habitContext = isCoach ? undefined : await loadHabitContext(admin, userId, now, prefs.tz);

    const { audience, candidates } = candidatesFor(snapshot, { tone: prefs.tone, lastSeverity: (last.coachClients as Record<string, string>) || {}, now, habitContext, checkinOptedOut });
    const { send, digest, nextState } = Notify.decideNotifications({ candidates, last, prefs, now, audience });
    const items = digest ? [...send, digest] : send;
    if (items.length) { await deliver(admin, userId, items); delivered += items.length; }
    await writeUserGoal(admin, userId, 'notify_state', nextState);
    evaluated += 1;
  }

  return NextResponse.json({ ok: true, evaluated, delivered });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }

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

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { candidatesFor, deliver, readUserGoal, writeUserGoal, Notify, type Snapshot } from '@/lib/ai/notify-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_WINDOW_MS = 14 * 86400000; // only users whose app checked in ≤14d ago
const BATCH = 500;

function authorized(request: Request): boolean {
  const secret = process.env.NOTIFY_CRON_SECRET || process.env.CRON_SECRET || '';
  if (!secret) return false;
  const hdr = request.headers.get('x-notify-secret') || '';
  const auth = request.headers.get('authorization') || '';
  return hdr === secret || auth === `Bearer ${secret}`;
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cutoff = Date.now() - ACTIVE_WINDOW_MS;
  let evaluated = 0;
  let delivered = 0;

  for (const row of rows ?? []) {
    const snapshot = (row as { data?: unknown }).data as Snapshot | undefined;
    const userId = (row as { user_id?: string }).user_id;
    if (!snapshot || typeof snapshot !== 'object' || !userId) continue;
    if (typeof snapshot.at === 'number' && snapshot.at < cutoff) continue; // inactive → skip

    const prefs = { ...Notify.DEFAULT_PREFS, ...(await readUserGoal(admin, userId, 'notify_prefs')) };
    if (prefs.enabled === false) continue; // honor the master switch
    const last = await readUserGoal(admin, userId, 'notify_state');
    const now = new Date();
    const tone = typeof prefs.tone === 'string' ? prefs.tone : 'supportive';

    const { audience, candidates } = candidatesFor(snapshot, { tone, lastSeverity: (last.coachClients as Record<string, string>) || {}, now });
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

// Proactive notification CRON — reaches CLOSED apps. Server-to-server (no user
// session): a scheduler (Vercel Cron / Supabase cron) hits this on an interval.
// For each active user it re-runs the SAME engine + decision layer over the
// snapshot their app last sent (/api/ai/notify stores it), and for a coach with
// both listings over each role's roster (notifyKind). A member's record is read
// against now, so a check-in that has since gone due nudges them as a genuinely
// new event; a coach's roster is read as of its save (rosterClock, notify-core.ts:
// its dates never move, so a later clock invented gaps for clients who were active),
// with their dismissals and tuning read fresh. Both count days in the person's own
// zone. Dedup prevents re-nags, and prefs/quiet-hours are fully honored.
//
// Auth: header `x-notify-secret: <NOTIFY_CRON_SECRET>` OR Vercel Cron's
// `Authorization: Bearer <CRON_SECRET>`. Runs as the service role (acts for many
// users); reads/writes are explicitly user-scoped. Excluded from the membership
// gate + rate limiter in the proxy. NOTHING about any record is changed.
//
// GET|POST /api/ai/notify/cron  → { ok, evaluated, delivered }

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { candidatesFor, coachRecordId, decideAndClaim, deliver, readUserGoal, readNotifyState, writeNotifyState, writeUserGoal, loadPrefs, loadHabitContext, loadCoachThresholds, loadCoachContext, loadPushedToday, loadMemberPaused, loadClientBreaks, memberCopy, notifyKind, snapshotsToEvaluate, NOTIFY_SNAPSHOT_KINDS, Notify, type Snapshot } from '@/lib/ai/notify-core';
import { releasePushClaim } from '@/lib/push-cap';
import { isCoachRole } from '@/lib/roles.mjs';
import { rotated } from '../../../../../lib/run-rotation.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE_WINDOW_MS = 14 * 86400000; // only users whose app checked in ≤14d ago
// ⚠ EVERY ACTIVE PERSON, NOT THE FIRST 500 ROWS (owner, 2026-10-26: "fix 1-7"). The read took 500
// snapshot rows in no order and only then dropped the inactive ones, so past 500 people some were
// never evaluated, hour after hour. The owners are read a page at a time (without the snapshot body),
// and the active ones evaluated CONCURRENCY at a time inside the run's time.
const PAGE = 1000;
const CONCURRENCY = 8;
const TIME_BUDGET_MS = 240_000;
export const maxDuration = 300;

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

// The people to evaluate this hour: everyone with a snapshot whose app checked in within ACTIVE_WINDOW_MS
// (or whose snapshot carries no time, as before), read without the snapshot body. A coach with both
// listings has one per role (NOTIFY_SNAPSHOT_KINDS) and is one person here. Null when the first page
// cannot be read.
async function activeSnapshotOwners(admin: ReturnType<typeof createAdminClient>, cutoff: number): Promise<string[] | null> {
  const owners = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from('user_goals')
      .select('user_id, at:data->at')
      .in('kind', NOTIFY_SNAPSHOT_KINDS)
      .order('user_id', { ascending: true })
      .order('kind', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (from === 0) return null;
      console.error('[ai notify cron] a page of snapshots could not be read; evaluating the rest:', error.message);
      break;
    }
    const rows = (data ?? []) as { user_id?: string; at?: unknown }[];
    for (const r of rows) {
      if (!r.user_id) continue;
      const at = typeof r.at === 'number' ? r.at : null;
      if (at !== null && at < cutoff) continue; // inactive → skip
      owners.add(r.user_id);
    }
    if (rows.length < PAGE) break;
  }
  return [...owners];
}

// One person: each of their snapshots (snapshotsToEvaluate: a coach's per role, a member's record) re-run
// through the engine and the decision layer, one after the other, so the second sees the pushes of the
// first. Answers how many notices went out, or null when none was evaluated.
async function evaluate(admin: ReturnType<typeof createAdminClient>, userId: string, cutoff: number): Promise<number | null> {
  const { data: rows } = await admin.from('user_goals').select('kind, data').eq('user_id', userId).in('kind', NOTIFY_SNAPSHOT_KINDS);
  let evaluated = false;
  let delivered = 0;
  for (const snapshot of snapshotsToEvaluate(rows as Array<{ kind?: unknown; data?: unknown }> | null, cutoff)) {
    // One role's failure does not cost the other role its run.
    try {
      const sent = await evaluateSnapshot(admin, userId, snapshot);
      if (sent !== null) { evaluated = true; delivered += sent; }
    } catch (err) {
      console.error('[ai notify cron] could not evaluate a snapshot:', err instanceof Error ? err.message : err);
    }
  }
  return evaluated ? delivered : null;
}

// One snapshot, on its role's own alert memory (readNotifyState).
async function evaluateSnapshot(admin: ReturnType<typeof createAdminClient>, userId: string, snapshot: Snapshot): Promise<number | null> {
  const prefs = await loadPrefs(admin, userId);      // the preference center
  if (prefs.muted) return null;                       // honor master mute
  // ⚠ Read alongside `notify_state` rather than in a second round trip: this runs for every active
  // person, so an extra sequential query per person is real cost.
  // The day's pushes (the person's one daily limit) ride in the same batch (Codex on #2417).
  const now = new Date();
  const [last, settings, localeDoc, pushedToday] = await Promise.all([
    readNotifyState(admin, userId, snapshot.role),
    readUserGoal(admin, userId, 'client_settings'),
    // The member's language: their notices are in it, in their units (memberCopy).
    readUserGoal(admin, userId, 'app_locale'),
    loadPushedToday(admin, userId, now, prefs.capTz),
  ]);
  // ⚠ SPEC §3D. Turning Daily check-in off stopped the Home bulletin and nothing
  // else: the stored snapshot keeps its check-in state, so this cron kept nudging a
  // member who had opted out and never reopened the app. Absence reads as opted IN.
  const checkinOptedOut = !Notify.dailyCheckinOn(settings.dailyCheckin);
  const isCoach = isCoachRole(snapshot.role);  // trainer | nutritionist | dietitian
  const habitContext = isCoach ? undefined : await loadHabitContext(admin, userId, now, prefs.tz);
  // A member on a break gets none of their own notices (loadMemberPaused, read fresh).
  const memberPaused = isCoach ? false : await loadMemberPaused(admin, userId, now, prefs.tz, { asService: true });
  // The coach's own office-settings tuning (R14), so the cron's alerts agree with
  // the roster the same thresholds produce on their dashboard.
  // …and their dismissals and check-in reviews read fresh (P2), so one made since the snapshot holds.
  // …and each client's break as it is now (Codex on #2705): one set since the roster was saved holds.
  const [thresholds, coachContext, clientBreaks] = isCoach
    ? await Promise.all([
      loadCoachThresholds(admin, userId, snapshot.role),
      loadCoachContext(admin, userId),
      loadClientBreaks(admin, userId, (Array.isArray(snapshot.clients) ? snapshot.clients : []).map(coachRecordId).filter((v): v is string => !!v), now),
    ])
    : [null, null, null];
  // The reader's language: a member's notices, and a coach's alert titles and digest.
  const copy = memberCopy(localeDoc, settings);

  const { audience, candidates, coachSeen } = candidatesFor(snapshot, { tone: prefs.tone, lastSeverity: (last.coachClients as Record<string, string>) || {}, now, habitContext, checkinOptedOut, thresholds, copy, coachContext, zone: prefs.tz, memberPaused, clientBreaks });
  // The pushes decided are claimed under the person's cap before anything is sent (decideAndClaim).
  const { decided, claim } = await decideAndClaim(admin, userId, { candidates, last, prefs, now, audience, checkinOptedOut, pushedToday, memberPaused, tr: copy?.tr, coachSeen }, prefs.capTz);
  const { send, digest, nextState } = decided;
  const items = digest ? [...send, digest] : send;
  let delivered = 0;
  try {
    if (items.length) { await deliver(admin, userId, items); delivered = items.length; }
  } finally {
    // The notices have landed and count themselves now.
    await releasePushClaim(admin, claim);
  }
  await writeNotifyState(admin, userId, snapshot.role, nextState as Record<string, unknown>);
  return delivered;
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const startedAt = Date.now();
  const admin = createAdminClient();
  const owners = await activeSnapshotOwners(admin, startedAt - ACTIVE_WINDOW_MS);
  if (!owners) return NextResponse.json({ error: 'Could not read the snapshots.' }, { status: 500 });

  // Started at a different place each hour (run-rotation.mjs), so runs that meet the time limit reach
  // everyone within a few hours.
  const queue = rotated(owners, Math.floor(startedAt / 3_600_000));
  let evaluated = 0;
  let delivered = 0;
  let unreached = 0;
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { unreached = queue.length - next; next = queue.length; return; }
      const userId = queue[next++];
      try {
        const sent = await evaluate(admin, userId, startedAt - ACTIVE_WINDOW_MS);
        if (sent !== null) { evaluated += 1; delivered += sent; }
      } catch (err) {
        console.error('[ai notify cron] could not evaluate a person:', err instanceof Error ? err.message : err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  if (unreached) console.error(`[ai notify cron] the run's time ran out with ${unreached} people left; the next hour starts elsewhere`);

  return NextResponse.json({ ok: true, active: owners.length, evaluated, delivered, unreached });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }

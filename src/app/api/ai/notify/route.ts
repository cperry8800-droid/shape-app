// Proactive notification evaluator (app-driven). Runs the SAME engine (AI2
// buildDirective / AI4 getTriageFeed) over the caller's REAL current data, then
// the pure decision layer (dedup, caps, quiet hours, opt-out, never-shaming),
// and delivers via the existing notifications table (→ in-app bell + push
// webhook). It also PERSISTS the verified snapshot so the cron can re-evaluate
// time-based triggers later, reaching a closed app. Prefs + state + snapshot
// live in user_goals (no migration). NOTHING about the record is changed.
//
// POST /api/ai/notify
//   client (role=client): { record }               — your own unified record
//   coach  (role=trainer|nutritionist): { clients, role? } — your roster's records; `role` names
//          which of your coach roles they are (the website's Today posts its page's), and is
//          honoured only when it is one you hold (a dietitian holds the nutritionist's). Each role's
//          roster is kept on its own (notifyKind), for the cron to re-run both
// → { ok, sent, digest, suppressed }
//
// ROLE-SCOPED: a client only evaluates themselves; a coach only their own
// clients (each clientId re-checked via is_coach_on_client). Signed-out → 401.

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor } from '@/lib/ai/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { candidatesFor, coachRecordId, decideAndClaim, deliver, readUserGoal, readNotifyState, writeNotifyState, writeUserGoal, loadPrefs, loadHabitContext, loadCoachThresholds, loadCoachContext, loadPushedToday, memberCopy, notifyKind, rosterRole, Notify, type Snapshot, type HabitContext } from '@/lib/ai/notify-core';
import { releasePushClaim } from '@/lib/push-cap';
import { isCoachRole } from '@/lib/roles.mjs';
import { requireNora } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireNora(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ record?: Record<string, unknown>; clients?: unknown[]; role?: unknown }>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  // THE preference center is the single source of truth.
  const prefs = await loadPrefs(actor.supabase, actor.user.id);
  // ⚠ SPEC §3D — the same opt-out the cron honours. This route recomputes from the
  // same snapshot, so gating only the cron would have left the live path nudging a
  // member who had turned Daily check-in off. Absence of the setting reads as opted IN.
  // The person's one daily limit counts every push of their day, not only this engine's; read
  // in the same batch rather than a round trip of its own.
  const now = new Date();
  // The coach role the roster is evaluated as: the one the body names when the caller holds it (a
  // coach with both listings posts each page's own), else the profile's (rosterRole).
  const role = rosterRole(parsed.data.role, actor);
  const isCoach = isCoachRole(role);
  const [last, settings, localeDoc, pushedToday] = await Promise.all([
    // That role's own alert memory (a member's is the plain one).
    readNotifyState(actor.supabase, actor.user.id, role),
    readUserGoal(actor.supabase, actor.user.id, 'client_settings'),
    // The member's language: their notices are in it, in their units (memberCopy).
    readUserGoal(actor.supabase, actor.user.id, 'app_locale'),
    loadPushedToday(actor.supabase, actor.user.id, now, prefs.capTz),
  ]);
  const checkinOptedOut = !Notify.dailyCheckinOn(settings.dailyCheckin);
  const tone = prefs.tone;

  // Build the snapshot of REAL data, role-scoped.
  const snapshot: Snapshot = { role, tz: prefs.tz, at: +now };
  let habitContext: HabitContext | undefined;
  if (isCoach) {
    const clients = Array.isArray(parsed.data.clients) ? parsed.data.clients.slice(0, 100) : [];
    // Re-check coach scope for every client in PARALLEL — sequential RPCs for up
    // to 100 clients inflate latency and timeout risk.
    const checks = await Promise.all(
      clients.map(async (c) => {
        // ⚠ The record's id may be only at profile.id (the app's records): coachRecordId reads all three.
        const id = coachRecordId(c);
        if (!id) return null; // demo/no-id → skip (honest)
        const { data: ok, error: scopeErr } = await actor.supabase.rpc('is_coach_on_client', { p_client_id: id });
        // Fail CLOSED on a scope-check error (never include an unverified client),
        // but log it so a backend outage isn't silently dropping the whole roster.
        if (scopeErr) { console.warn('[shape-ai] notify scope-check failed for client', id, scopeErr.message); return null; }
        return ok === true ? c : null;
      })
    );
    snapshot.clients = checks.filter((c): c is unknown => c !== null);
  } else {
    const record = parsed.data.record;
    if (!record || typeof record !== 'object') {
      return NextResponse.json({ error: 'record is required.' }, { status: 400 });
    }
    snapshot.record = record;
    habitContext = await loadHabitContext(actor.supabase, actor.user.id, now, prefs.tz);
  }

  // The coach's office-settings tuning drives the same engine these candidates come
  // from, so the alerts agree with the roster that produced them (R14).
  const [thresholds, coachContext] = isCoach
    ? await Promise.all([loadCoachThresholds(actor.supabase, actor.user.id), loadCoachContext(actor.supabase, actor.user.id)])
    : [null, null];
  // The reader's language: a member's notices, and a coach's alert titles and digest.
  const copy = memberCopy(localeDoc, settings);
  const { audience, candidates, coachSeen } = candidatesFor(snapshot, { tone, lastSeverity: (last.coachClients as Record<string, string>) || {}, now, habitContext, checkinOptedOut, thresholds, copy, coachContext });
  // The pushes decided are claimed under the person's cap before anything is sent (decideAndClaim).
  const admin = createAdminClient();
  const { decided, claim } = await decideAndClaim(admin, actor.user.id, { candidates, last, prefs, now, audience, checkinOptedOut, pushedToday, tr: copy?.tr, coachSeen }, prefs.capTz);
  const { send, digest, nextState, suppressed } = decided;

  // Persist the dedup/cap state BEFORE delivering. Delivery + state aren't one
  // transaction, so we must choose a failure direction: writing state first means
  // a delivery failure at worst SKIPS a nudge (safe), whereas delivering first and
  // then failing the state write would let a retry RESEND the same nudges (spam).
  // For proactive, never-shaming notifications, fail toward under-delivery.
  try {
    await writeNotifyState(actor.supabase, actor.user.id, role, nextState as Record<string, unknown>);
    await deliver(admin, actor.user.id, digest ? [...send, digest] : send);
  } finally {
    // The notices have landed and count themselves now.
    await releasePushClaim(admin, claim);
  }

  // The snapshot is only read later by the cron to re-evaluate — order-independent. Under this role's
  // own key, so the other role's roster stays.
  await writeUserGoal(actor.supabase, actor.user.id, notifyKind('notify_snapshot', role), snapshot);

  return NextResponse.json({ ok: true, sent: send.length, digest: digest ? 1 : 0, suppressed });
}

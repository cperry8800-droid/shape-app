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
//   coach  (role=trainer|nutritionist): { clients } — your roster's records
// → { ok, sent, digest, suppressed }
//
// ROLE-SCOPED: a client only evaluates themselves; a coach only their own
// clients (each clientId re-checked via is_coach_on_client). Signed-out → 401.

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor } from '@/lib/ai/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { candidatesFor, deliver, readUserGoal, writeUserGoal, loadPrefs, loadHabitContext, Notify, type Snapshot, type HabitContext } from '@/lib/ai/notify-core';
import { isCoachRole } from '@/lib/roles.mjs';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ record?: Record<string, unknown>; clients?: unknown[] }>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  // THE preference center is the single source of truth.
  const prefs = await loadPrefs(actor.supabase, actor.user.id);
  // ⚠ SPEC §3D — the same opt-out the cron honours. This route recomputes from the
  // same snapshot, so gating only the cron would have left the live path nudging a
  // member who had turned Daily check-in off. Absence of the setting reads as opted IN.
  const [last, settings] = await Promise.all([
    readUserGoal(actor.supabase, actor.user.id, 'notify_state'),
    readUserGoal(actor.supabase, actor.user.id, 'client_settings'),
  ]);
  const checkinOptedOut = !Notify.dailyCheckinOn(settings.dailyCheckin);
  const now = new Date();
  const tone = prefs.tone;
  const isCoach = isCoachRole(actor.role);

  // Build the snapshot of REAL data, role-scoped.
  const snapshot: Snapshot = { role: actor.role, tz: prefs.tz, at: +now };
  let habitContext: HabitContext | undefined;
  if (isCoach) {
    const clients = Array.isArray(parsed.data.clients) ? parsed.data.clients.slice(0, 100) : [];
    // Re-check coach scope for every client in PARALLEL — sequential RPCs for up
    // to 100 clients inflate latency and timeout risk.
    const checks = await Promise.all(
      clients.map(async (c) => {
        const id = (c as { userId?: string; id?: string })?.userId || (c as { id?: string })?.id;
        if (!id || typeof id !== 'string') return null; // demo/no-id → skip (honest)
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

  const { audience, candidates } = candidatesFor(snapshot, { tone, lastSeverity: (last.coachClients as Record<string, string>) || {}, now, habitContext, checkinOptedOut });
  const { send, digest, nextState, suppressed } = Notify.decideNotifications({ candidates, last, prefs, now, audience });

  // Persist the dedup/cap state BEFORE delivering. Delivery + state aren't one
  // transaction, so we must choose a failure direction: writing state first means
  // a delivery failure at worst SKIPS a nudge (safe), whereas delivering first and
  // then failing the state write would let a retry RESEND the same nudges (spam).
  // For proactive, never-shaming notifications, fail toward under-delivery.
  await writeUserGoal(actor.supabase, actor.user.id, 'notify_state', nextState);

  const admin = createAdminClient();
  await deliver(admin, actor.user.id, digest ? [...send, digest] : send);

  // The snapshot is only read later by the cron to re-evaluate — order-independent.
  await writeUserGoal(actor.supabase, actor.user.id, 'notify_snapshot', snapshot);

  return NextResponse.json({ ok: true, sent: send.length, digest: digest ? 1 : 0, suppressed });
}

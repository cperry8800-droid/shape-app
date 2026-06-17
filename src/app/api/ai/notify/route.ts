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
import { candidatesFor, deliver, readUserGoal, writeUserGoal, Notify, type Snapshot } from '@/lib/ai/notify-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ record?: Record<string, unknown>; clients?: unknown[] }>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  const prefs = { ...Notify.DEFAULT_PREFS, ...(await readUserGoal(actor.supabase, actor.user.id, 'notify_prefs')) };
  const last = await readUserGoal(actor.supabase, actor.user.id, 'notify_state');
  const now = new Date();
  const tone = typeof prefs.tone === 'string' ? prefs.tone : 'supportive';
  const isCoach = actor.role === 'trainer' || actor.role === 'nutritionist';

  // Build the snapshot of REAL data, role-scoped.
  const snapshot: Snapshot = { role: actor.role, tz: typeof prefs.tz === 'string' ? prefs.tz : 'UTC', at: +now };
  if (isCoach) {
    const clients = Array.isArray(parsed.data.clients) ? parsed.data.clients.slice(0, 100) : [];
    const verified: unknown[] = [];
    for (const c of clients) {
      const id = (c as { userId?: string; id?: string })?.userId || (c as { id?: string })?.id;
      if (!id || typeof id !== 'string') continue; // demo/no-id → skip (honest)
      const { data: ok } = await actor.supabase.rpc('is_coach_on_client', { p_client_id: id });
      if (ok === true) verified.push(c);
    }
    snapshot.clients = verified;
  } else {
    const record = parsed.data.record;
    if (!record || typeof record !== 'object') {
      return NextResponse.json({ error: 'record is required.' }, { status: 400 });
    }
    snapshot.record = record;
  }

  const { audience, candidates } = candidatesFor(snapshot, { tone, lastSeverity: (last.coachClients as Record<string, string>) || {}, now });
  const { send, digest, nextState, suppressed } = Notify.decideNotifications({ candidates, last, prefs, now, audience });

  const admin = createAdminClient();
  await deliver(admin, actor.user.id, digest ? [...send, digest] : send);

  // Persist dedup/cap state + the verified snapshot (so the cron can re-run it).
  await writeUserGoal(actor.supabase, actor.user.id, 'notify_state', nextState);
  await writeUserGoal(actor.supabase, actor.user.id, 'notify_snapshot', snapshot);

  return NextResponse.json({ ok: true, sent: send.length, digest: digest ? 1 : 0, suppressed });
}

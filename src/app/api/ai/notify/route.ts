// Proactive notification evaluator — the server path that turns real record
// changes into notifications that reach people when the app is closed. It runs
// the SAME engine (AI2 buildDirective / AI4 getTriageFeed) over the caller's
// REAL current data, then the pure decision layer (dedup, caps, quiet hours,
// opt-out, never-shaming copy) decides what to actually send. Delivery is the
// existing notifications table (+ the push webhook); prefs + dedup state live in
// user_goals. NOTHING about the user's record is changed — informational only.
//
// POST /api/ai/notify
//   client (role=client): { record }              — your own unified record
//   coach  (role=trainer|nutritionist): { clients } — your roster's records
// → { ok, sent, digest, suppressed }
//
// ROLE-SCOPED: a client only evaluates themselves; a coach only their own
// clients (each clientId re-checked via is_coach_on_client). Signed-out → 401
// (they get nothing). Behind the membership gate (/api/ai/*).

import { NextResponse } from 'next/server';
import { readJson } from '@/lib/request-utils';
import { resolveActor, type Actor } from '@/lib/ai/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import { speakableDirective } from '@/lib/ai/tone.mjs';
import * as NotifyLayer from '@/lib/ai/notifications.mjs';
// The pure UMD engine (module.exports = api), imported directly (no window in Node).
import DashSignals from '../../../../../public/newdesign/dashSignals.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Candidate = { type: string; title: string; body: string; route: string; data: Record<string, unknown>; priority: string };
type DecideResult = { send: Candidate[]; digest: Candidate | null; nextState: Record<string, unknown>; suppressed: { type: string; reason: string }[] };
const Notify = NotifyLayer as unknown as {
  clientCandidates: (input: Record<string, unknown>) => Candidate[];
  coachCandidates: (input: Record<string, unknown>) => Candidate[];
  decideNotifications: (input: { candidates: Candidate[]; last: Record<string, unknown>; prefs: Record<string, unknown>; now: Date; audience: string }) => DecideResult;
  DEFAULT_PREFS: Record<string, unknown>;
};

type Directive = { verdict: string; reason: string; action: { label: string; kind: string } | null; read: { summary30d: string; oneThingNow: string }; cited?: string[] };
type Flag = { key: string; label: string; reason: string; owned?: boolean; discipline?: string };
type TriageRow = { client: { userId?: string; id?: string; profile?: { name?: string } }; severity: string; flags: Flag[]; reasons: string[] };
const engine = DashSignals as unknown as {
  buildDirective: (record: unknown, now?: Date, role?: string) => Directive;
  evaluateClient: (record: unknown, now?: Date, role?: string) => { flags: Flag[]; severity: string };
  getTriageFeed: (role: string, clients: unknown[], now?: Date) => TriageRow[];
};

async function loadDoc(actor: Actor, kind: string): Promise<Record<string, unknown>> {
  try {
    const { data } = await actor.supabase.from('user_goals').select('data').eq('user_id', actor.user.id).eq('kind', kind).maybeSingle();
    const blob = (data as { data?: unknown } | null)?.data as Record<string, unknown> | undefined;
    return blob && typeof blob === 'object' ? blob : {};
  } catch { return {}; }
}

export async function POST(request: Request) {
  const actor = await resolveActor(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = await readJson<{ record?: Record<string, unknown>; clients?: unknown[] }>(request, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  const prefs = { ...Notify.DEFAULT_PREFS, ...(await loadDoc(actor, 'notify_prefs')) };
  const last = await loadDoc(actor, 'notify_state');
  const now = new Date();
  const tone = typeof prefs.tone === 'string' ? prefs.tone : 'supportive';

  const isCoach = actor.role === 'trainer' || actor.role === 'nutritionist';
  let candidates: Candidate[] = [];
  let audience: 'client' | 'coach' = 'client';

  if (isCoach) {
    audience = 'coach';
    const clients = Array.isArray(parsed.data.clients) ? parsed.data.clients.slice(0, 100) : [];
    // ROLE-SCOPE: keep only real clients this coach is actually on.
    const verified: unknown[] = [];
    for (const c of clients) {
      const id = (c as { userId?: string; id?: string })?.userId || (c as { id?: string })?.id;
      if (!id || typeof id !== 'string') continue; // demo/no-id → skip (honest)
      const { data: ok } = await actor.supabase.rpc('is_coach_on_client', { p_client_id: id });
      if (ok === true) verified.push(c);
    }
    const rows = engine.getTriageFeed(actor.role, verified, now).map((r) => ({
      clientId: (r.client.userId || r.client.id) as string,
      clientName: (r.client.profile && r.client.profile.name) || 'A client',
      severity: r.severity,
      reason: (r.reasons && r.reasons[0]) || '',
      flags: r.flags,
    }));
    candidates = Notify.coachCandidates({ triageRows: rows, lastSeverity: (last.coachClients as Record<string, string>) || {} });
  } else {
    const record = parsed.data.record;
    if (!record || typeof record !== 'object') {
      return NextResponse.json({ error: 'record is required.' }, { status: 400 });
    }
    const directive = engine.buildDirective(record, now, 'client');
    const line = speakableDirective(directive, tone);
    const { flags } = engine.evaluateClient(record, now, 'client');
    candidates = Notify.clientCandidates({
      directive: { ...directive, line },
      flags,
      goals: Array.isArray((record as { goals?: unknown[] }).goals) ? (record as { goals?: unknown[] }).goals : [],
      checkinDueThisWeek: (record as { checkinDueThisWeek?: boolean }).checkinDueThisWeek === true,
      coachEvents: Array.isArray((record as { coachEvents?: unknown[] }).coachEvents) ? (record as { coachEvents?: unknown[] }).coachEvents : [],
      tone,
    });
  }

  const { send, digest, nextState, suppressed } = Notify.decideNotifications({ candidates, last, prefs, now, audience });

  // Deliver via the existing notifications table (→ in-app bell + push webhook).
  const admin = createAdminClient();
  const toDeliver = digest ? [...send, digest] : send;
  for (const n of toDeliver) {
    await createNotification(admin, {
      userId: actor.user.id,
      type: `ai_${n.type}`,
      title: n.title,
      body: n.body,
      route: n.route,
      data: { ...(n.data || {}), ai: true, priority: n.priority },
    });
  }

  // Persist the dedup/cap state (the actor's own row).
  try {
    await actor.supabase.from('user_goals').upsert({ user_id: actor.user.id, kind: 'notify_state', data: nextState }, { onConflict: 'user_id,kind' });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, sent: send.length, digest: digest ? 1 : 0, suppressed });
}

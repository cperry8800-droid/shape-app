// Shared evaluation core for the notification layer — used by BOTH the
// app-driven route (/api/ai/notify) and the cron (/api/ai/notify/cron). Given a
// SNAPSHOT (the real record/roster the user's app last sent) it runs the SAME
// engine (AI2 buildDirective / AI4 getTriageFeed) and returns candidates for the
// pure decision layer. The engine's time-based rules (check-in overdue, goal-ETA
// slip) recompute against `now`, so the cron surfaces genuinely-new, real events
// from a stored snapshot without the app being open. No data is mutated.

import { speakableDirective } from '@/lib/ai/tone.mjs';
import * as NotifyLayer from '@/lib/ai/notifications.mjs';
import { createNotification } from '@/lib/notify';
import type { SupabaseClient } from '@supabase/supabase-js';
// The pure UMD engine (module.exports = api); imported directly (no window in Node).
import DashSignals from '../../../public/newdesign/dashSignals.js';

export type Candidate = { type: string; title: string; body: string; route: string; data: Record<string, unknown>; priority: string };
export type DecideResult = { send: Candidate[]; digest: Candidate | null; nextState: Record<string, unknown>; suppressed: { type: string; reason: string }[] };
export type Snapshot = { role?: string; tz?: string; record?: Record<string, unknown>; clients?: unknown[]; at?: number };

export const Notify = NotifyLayer as unknown as {
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

// Snapshot → candidates + audience. `lastSeverity` (coach) suppresses re-nags.
export function candidatesFor(
  snapshot: Snapshot,
  opts: { tone: string; lastSeverity: Record<string, string>; now: Date },
): { audience: 'client' | 'coach'; candidates: Candidate[] } {
  const role = snapshot.role;
  if (role === 'trainer' || role === 'nutritionist') {
    const clients = Array.isArray(snapshot.clients) ? snapshot.clients : [];
    const rows = engine.getTriageFeed(role, clients, opts.now).map((r) => ({
      clientId: (r.client.userId || r.client.id) as string,
      clientName: (r.client.profile && r.client.profile.name) || 'A client',
      severity: r.severity,
      reason: (r.reasons && r.reasons[0]) || '',
      flags: r.flags,
    }));
    return { audience: 'coach', candidates: Notify.coachCandidates({ triageRows: rows, lastSeverity: opts.lastSeverity }) };
  }
  const record = snapshot.record;
  if (!record || typeof record !== 'object') return { audience: 'client', candidates: [] };
  const directive = engine.buildDirective(record, opts.now, 'client');
  const line = speakableDirective(directive, opts.tone);
  const { flags } = engine.evaluateClient(record, opts.now, 'client');
  const candidates = Notify.clientCandidates({
    directive: { ...directive, line },
    flags,
    goals: Array.isArray((record as { goals?: unknown[] }).goals) ? (record as { goals?: unknown[] }).goals : [],
    checkinDueThisWeek: (record as { checkinDueThisWeek?: boolean }).checkinDueThisWeek === true,
    coachEvents: Array.isArray((record as { coachEvents?: unknown[] }).coachEvents) ? (record as { coachEvents?: unknown[] }).coachEvents : [],
    tone: opts.tone,
  });
  return { audience: 'client', candidates };
}

// Deliver the decided items to one user via the existing notifications table
// (→ in-app bell + push webhook). Informational only — title/body + deep-link.
export async function deliver(admin: SupabaseClient, userId: string, items: Candidate[]): Promise<void> {
  for (const n of items) {
    await createNotification(admin, {
      userId,
      type: `ai_${n.type}`,
      title: n.title,
      body: n.body,
      route: n.route,
      data: { ...(n.data || {}), ai: true, priority: n.priority },
    });
  }
}

// user_goals helpers scoped to one user (service-role safe — explicit user_id).
export async function readUserGoal(client: SupabaseClient, userId: string, kind: string): Promise<Record<string, unknown>> {
  try {
    const { data } = await client.from('user_goals').select('data').eq('user_id', userId).eq('kind', kind).maybeSingle();
    const blob = (data as { data?: unknown } | null)?.data as Record<string, unknown> | undefined;
    return blob && typeof blob === 'object' ? blob : {};
  } catch { return {}; }
}
export async function writeUserGoal(client: SupabaseClient, userId: string, kind: string, value: unknown): Promise<void> {
  try {
    await client.from('user_goals').upsert({ user_id: userId, kind, data: value ?? {} }, { onConflict: 'user_id,kind' });
  } catch { /* best-effort */ }
}

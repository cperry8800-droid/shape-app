// Shared evaluation core for the notification layer — used by BOTH the
// app-driven route (/api/ai/notify) and the cron (/api/ai/notify/cron). Given a
// SNAPSHOT (the real record/roster the user's app last sent) it runs the SAME
// engine (AI2 buildDirective / AI4 getTriageFeed) and returns candidates for the
// pure decision layer. The engine's time-based rules (check-in overdue, goal-ETA
// slip) recompute against `now`, so the cron surfaces genuinely-new, real events
// from a stored snapshot without the app being open. No data is mutated.

import { speakableDirective } from '@/lib/ai/tone.mjs';
import * as NotifyLayer from '@/lib/ai/notifications.mjs';
import { isCoachRole } from '@/lib/roles.mjs';
import { createNotification } from '@/lib/notify';
import { sendEmail } from '@/lib/email';
import type { SupabaseClient } from '@supabase/supabase-js';
// The pure UMD engine (module.exports = api); imported directly (no window in Node).
import DashSignals from '../../../public/newdesign/dashSignals.js';

export type Candidate = { type: string; title: string; body: string; route: string; data: Record<string, unknown>; priority: string };
export type DecideResult = { send: Candidate[]; digest: Candidate | null; nextState: Record<string, unknown>; suppressed: { type: string; reason: string }[] };
export type Snapshot = { role?: string; tz?: string; record?: Record<string, unknown>; clients?: unknown[]; at?: number };

export const Notify = NotifyLayer as unknown as {
  clientCandidates: (input: Record<string, unknown>) => Candidate[];
  coachCandidates: (input: Record<string, unknown>) => Candidate[];
  habitReminderCandidates: (input: Record<string, unknown>) => Candidate[];
  decideNotifications: (input: { candidates: Candidate[]; last: Record<string, unknown>; prefs: Record<string, unknown>; now: Date; audience: string; checkinOptedOut?: boolean }) => DecideResult;
  DEFAULT_PREFS: Record<string, unknown>;
  dailyCheckinOn: (v: unknown) => boolean;
};

export type Prefs = { muted: boolean; quietStart: number; quietEnd: number; tz: string; maxPerDay: number; tone: string; matrix: Record<string, Record<string, boolean>> };
export type HabitContext = { reminders: unknown[]; doneToday: string[] };

function ymdInTz(now: Date, tz: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}

// THE preference center is the single source of truth: settings + the per-type ×
// per-channel matrix (notification_settings / notification_preferences), plus the
// user's chosen tone (nora_voice). Absent rows fall back to defaults in the layer.
export async function loadPrefs(client: SupabaseClient, userId: string): Promise<Prefs> {
  const [settingsRes, prefsRes, voice] = await Promise.all([
    client.from('notification_settings').select('muted, quiet_start, quiet_end, tz, daily_cap').eq('user_id', userId).maybeSingle(),
    client.from('notification_preferences').select('type, channel, enabled').eq('user_id', userId),
    readUserGoal(client, userId, 'nora_voice'),
  ]);
  const s = (settingsRes.data || {}) as { muted?: boolean; quiet_start?: number; quiet_end?: number; tz?: string; daily_cap?: number };
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const row of (prefsRes.data || []) as { type: string; channel: string; enabled: boolean }[]) {
    (matrix[row.type] ||= {})[row.channel] = !!row.enabled;
  }
  return {
    muted: s.muted === true,
    quietStart: Number.isFinite(s.quiet_start) ? (s.quiet_start as number) : 22,
    quietEnd: Number.isFinite(s.quiet_end) ? (s.quiet_end as number) : 7,
    tz: s.tz || 'UTC',
    maxPerDay: Number.isFinite(s.daily_cap) ? (s.daily_cap as number) : 4,
    tone: (voice as { tone?: string }).tone === 'direct' ? 'direct' : 'supportive',
    matrix,
  };
}

// A client's enabled habit reminders + the habits already done today (in their
// timezone) — so a completed habit's reminder is suppressed (the honest, kind path).
export async function loadHabitContext(client: SupabaseClient, userId: string, now: Date, tz: string): Promise<HabitContext> {
  const today = ymdInTz(now, tz);
  const [remRes, doneRes] = await Promise.all([
    client.from('habit_reminders').select('habit_id, label, at_time, days, tz, enabled, snooze_until').eq('user_id', userId).eq('enabled', true),
    client.from('user_habit_completions').select('habit_id').eq('user_id', userId).eq('done_on', today),
  ]);
  const reminders = ((remRes.data || []) as { habit_id: string; label: string; at_time: string; days: number[]; tz: string; enabled: boolean; snooze_until: string | null }[])
    .map((r) => ({ habitId: r.habit_id, label: r.label, at: r.at_time, days: r.days, tz: r.tz || tz, enabled: r.enabled, snoozeUntil: r.snooze_until }));
  const doneToday = ((doneRes.data || []) as { habit_id: string }[]).map((r) => r.habit_id);
  return { reminders, doneToday };
}

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
  // ⚠ `checkinOptedOut` is NOT derived here. This function has no client and cannot
  // read the member's settings, so each caller supplies it — and a caller that forgets
  // gets the safe default (opted IN), never a silent opt-out.
  opts: {
    tone: string;
    lastSeverity: Record<string, string>;
    now: Date;
    habitContext?: HabitContext;
    checkinOptedOut?: boolean;
  },
): { audience: 'client' | 'coach'; candidates: Candidate[] } {
  const role = snapshot.role || '';
  if (isCoachRole(role)) {
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
  const candidates: Candidate[] = [];
  const record = snapshot.record;
  if (record && typeof record === 'object') {
    const directive = engine.buildDirective(record, opts.now, 'client');
    const line = speakableDirective(directive, opts.tone);
    const { flags } = engine.evaluateClient(record, opts.now, 'client');
    candidates.push(...Notify.clientCandidates({
      directive: { ...directive, line },
      flags,
      goals: Array.isArray((record as { goals?: unknown[] }).goals) ? (record as { goals?: unknown[] }).goals : [],
      checkinDueThisWeek: (record as { checkinDueThisWeek?: boolean }).checkinDueThisWeek === true,
      checkinOptedOut: opts.checkinOptedOut === true,
      coachEvents: Array.isArray((record as { coachEvents?: unknown[] }).coachEvents) ? (record as { coachEvents?: unknown[] }).coachEvents : [],
      // ⚠ The self-keyed signatures carry the WEEK, so they must key off the pipeline's
      // instant rather than the wall clock this function would otherwise default to.
      now: opts.now,
      tone: opts.tone,
    }));
  }
  // user-scheduled habit reminders (suppressed when done / snoozed inside the layer)
  if (opts.habitContext) {
    candidates.push(...Notify.habitReminderCandidates({ reminders: opts.habitContext.reminders, doneToday: opts.habitContext.doneToday, now: opts.now, tone: opts.tone }));
  }
  return { audience: 'client', candidates };
}

function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// Deliver the decided items per CHANNEL. The notifications row is the in-app bell
// (its data.channels.inapp/push gate what the bell shows + whether the push
// webhook pushes); email goes out separately when that channel is on. Each item
// already passed the per-type×per-channel gate. Informational only.
export async function deliver(admin: SupabaseClient, userId: string, items: Array<Candidate & { channels?: Record<string, boolean> }>): Promise<void> {
  let email: string | null = null; // resolved lazily, once
  for (const n of items) {
    const channels = n.channels || { inapp: true, push: true, email: false };
    await createNotification(admin, {
      userId,
      type: `ai_${n.type}`,
      title: n.title,
      body: n.body,
      route: n.route,
      data: { ...(n.data || {}), ai: true, priority: n.priority, channels },
    });
    if (channels.email) {
      try {
        if (email === null) { const { data } = await admin.auth.admin.getUserById(userId); email = (data?.user?.email) || ''; }
        if (email) await sendEmail({ to: email, subject: n.title, html: `<p>${escapeHtml(n.body || n.title)}</p>`, text: n.body || n.title });
      } catch { /* best-effort — never blocks delivery */ }
    }
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

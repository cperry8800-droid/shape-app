// Shared evaluation core for the notification layer — used by BOTH the
// app-driven route (/api/ai/notify) and the cron (/api/ai/notify/cron). Given a
// SNAPSHOT (the real record/roster the user's app last sent) it runs the SAME
// engine (AI2 buildDirective / AI4 getTriageFeed) and returns candidates for the
// pure decision layer. The engine's time-based rules (check-in overdue, goal-ETA
// slip) recompute against `now`, so the cron surfaces genuinely-new, real events
// from a stored snapshot without the app being open. No data is mutated.

import * as NotifyLayer from '@/lib/ai/notifications.mjs';
import { memberLocaleCode } from '@/lib/ai/memberTranslator.mjs';
import { copyFor, type Translate as ReaderTranslate } from '@/lib/reader-copy';
import { isCoachRole } from '@/lib/roles.mjs';
import { createNotification } from '@/lib/notify';
import { sendEmail } from '@/lib/email';
import { normalizeZone } from '@/lib/time';
import { claimPushSlots, type PushClaim } from '@/lib/push-cap';
import type { SupabaseClient } from '@supabase/supabase-js';
// The pure UMD engine (module.exports = api); imported directly (no window in Node).
import DashSignals from '../../../public/newdesign/dashSignals.js';
import { bsUnitsMetric } from '../../../mobile-app/src/services/leadReason.mjs';

export type Candidate = { type: string; title: string; body: string; route: string; data: Record<string, unknown>; priority: string };
export type DecideResult = { send: Candidate[]; digest: Candidate | null; nextState: Record<string, unknown>; suppressed: { type: string; reason: string }[] };
export type DecideInput = { candidates: Candidate[]; last: Record<string, unknown>; prefs: Record<string, unknown>; now: Date; audience: string; checkinOptedOut?: boolean; pushedToday?: number | null; tr?: Translate };
export type Snapshot = { role?: string; tz?: string; record?: Record<string, unknown>; clients?: unknown[]; at?: number };

export type Translate = ReaderTranslate;
// The member's notices in their language and units: `tr` their translator, `locale` the Intl locale,
// `metric` their units preference (memberCopy, below).
export type MemberCopy = { code: string; locale: string; metric: boolean; tr: Translate };

export const Notify = NotifyLayer as unknown as {
  memberMoveLine: (directive: unknown, opts: { tr?: Translate; locale?: string; metric?: boolean; tone?: string }) => string;
  clientCandidates: (input: Record<string, unknown>) => Candidate[];
  coachCandidates: (input: Record<string, unknown>) => Candidate[];
  habitReminderCandidates: (input: Record<string, unknown>) => Candidate[];
  decideNotifications: (input: DecideInput) => DecideResult;
  dailyCap: (prefs: Record<string, unknown>) => number;
  pushCount: (decided: { send: Candidate[]; digest: Candidate | null }) => number;
  DEFAULT_PREFS: Record<string, unknown>;
  dailyCheckinOn: (v: unknown) => boolean;
};

export type Prefs = { muted: boolean; quietStart: number; quietEnd: number; tz: string; capTz: string; maxPerDay: number; tone: string; matrix: Record<string, Record<string, boolean>> };
export type HabitContext = { reminders: unknown[]; doneToday: string[] };

function ymdInTz(now: Date, tz: string): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}

// THE preference center is the single source of truth: settings + the per-type ×
// per-channel matrix (notification_settings / notification_preferences), plus the
// user's chosen tone (nora_voice). Absent rows fall back to defaults in the layer.
export async function loadPrefs(client: SupabaseClient, userId: string): Promise<Prefs> {
  const [settingsRes, prefsRes, voice, profileRes] = await Promise.all([
    client.from('notification_settings').select('muted, quiet_start, quiet_end, tz, daily_cap').eq('user_id', userId).maybeSingle(),
    client.from('notification_preferences').select('type, channel, enabled').eq('user_id', userId),
    readUserGoal(client, userId, 'nora_voice'),
    client.from('client_profiles').select('timezone').eq('user_id', userId).maybeSingle(),
  ]);
  const s = (settingsRes.data || {}) as { muted?: boolean; quiet_start?: number; quiet_end?: number; tz?: string; daily_cap?: number };
  // ⚠ THE CAP'S DAY IS READ IN THE ZONE THE HABIT CRON USES (Codex on #2417): the profile's zone,
  // which the app refreshes on sign-in, then the notification settings' zone, which moves only
  // when settings are saved, then UTC. The daily cap is shared with /api/cron/habit-watch, so
  // after travel two zones would date the same pushes on different days around either midnight,
  // and each sender would grant its own allowance.
  // ⚠ ONLY THE CAP'S DAY (Codex on #2417). Quiet hours stay on `tz`, the settings' zone, because
  // push delivery checks them there (pushAllowed, push/dispatch/route.ts): read in another zone,
  // the engine pushed what delivery then dropped as quiet, and never held it for the digest.
  const profileTz = normalizeZone((profileRes.data as { timezone?: string } | null)?.timezone);
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const row of (prefsRes.data || []) as { type: string; channel: string; enabled: boolean }[]) {
    (matrix[row.type] ||= {})[row.channel] = !!row.enabled;
  }
  return {
    muted: s.muted === true,
    quietStart: Number.isFinite(s.quiet_start) ? (s.quiet_start as number) : 22,
    quietEnd: Number.isFinite(s.quiet_end) ? (s.quiet_end as number) : 7,
    tz: s.tz || 'UTC',
    capTz: profileTz || normalizeZone(s.tz) || 'UTC',
    maxPerDay: Number.isFinite(s.daily_cap) ? (s.daily_cap as number) : 4,
    tone: (voice as { tone?: string }).tone === 'direct' ? 'direct' : 'supportive',
    matrix,
  };
}

// How many notices pushed to the person on their own date today, from any sender: every
// preference-aware send and this engine's deliver() stamp data.channels, and the cap is the
// person's one daily limit (decideNotifications' pushedToday). A row written without the stamp
// (createNotification) can't say whether it pushed and isn't counted. Null when the read fails:
// the engine then counts only its own sends, as it always did.
// ⚠ ONLY PUSHED ROWS ARE READ (Codex on #2417). Reading the newest rows of any kind let a day of
// in-app notices push the morning's pushes out of the window, so the engine sent a fresh cap's
// worth. Filtered in the database, the newest PUSH_SCAN_LIMIT are all pushes, today's first, and
// the count stops only past any cap.
const PUSH_SCAN_LIMIT = 50;
export async function loadPushedToday(client: SupabaseClient, userId: string, now: Date, tz: string): Promise<number | null> {
  const today = ymdInTz(now, tz);
  const since = new Date(now.getTime() - 30 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.from('notifications').select('created_at')
    .eq('user_id', userId).eq('data->channels->>push', 'true').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(PUSH_SCAN_LIMIT);
  if (error) { console.warn('[shape-ai] could not read the day\'s pushes; counting this engine\'s own', error.message); return null; }
  let n = 0;
  for (const r of (data || []) as { created_at?: string }[]) {
    const at = Date.parse(String(r.created_at || ''));
    if (Number.isFinite(at) && ymdInTz(new Date(at), tz) === today) n += 1;
  }
  return n;
}

// ⚠ THE PUSHES ARE CLAIMED BEFORE THEY ARE SENT (owner, 2026-10-21: "yes build the cap
// reservation"). The day's count is read before deciding, so another sender (the habit cron, or
// this engine's other route) could take a place between the read and the send, and the cap passed
// by one. The pushes decided are claimed in the database (claim_push_slots, push-cap.ts), which
// grants only the places still free. Granted fewer, the engine decides again with only those
// left: what no longer fits waits for the digest, as anything over the cap does, so no notice is
// lost. The caller releases the claim once delivery is done (releasePushClaim). A claim that can't
// be made keeps the first decision, on the count as read.
export async function decideAndClaim(
  admin: SupabaseClient,
  userId: string,
  input: DecideInput,
  capTz: string,
): Promise<{ decided: DecideResult; claim: PushClaim | null }> {
  const decided = Notify.decideNotifications(input);
  const want = Notify.pushCount(decided);
  if (want < 1) return { decided, claim: null };
  const cap = Notify.dailyCap(input.prefs);
  const claim = await claimPushSlots(admin, userId, { tz: capTz, cap, want });
  if (!claim || claim.granted >= want) return { decided, claim };
  // The day as the database counts it: everything but the granted places is taken.
  return { decided: Notify.decideNotifications({ ...input, pushedToday: cap - claim.granted }), claim };
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

// ⚠ A MEMBER'S NOTICES ARE IN THEIR LANGUAGE AND UNITS (owner, 2026-10-21: "fix the push and bell row
// wording too"). The language is the one the app stores for the account (user_goals 'app_locale'), and
// the units the Settings preference both routes already read (client_settings.units). One translator
// per language, built once per server instance (reader-copy.ts), shared with push dispatch.
export function memberCopy(localeDoc: Record<string, unknown>, settings: Record<string, unknown>): MemberCopy {
  return copyFor(memberLocaleCode(localeDoc), bsUnitsMetric(settings && settings.units));
}

type Directive = { verdict: string; reason: string; action: { label: string; kind: string } | null; read: { summary30d: string; oneThingNow: string }; cited?: string[] };
type Flag = { key: string; label: string; reason: string; owned?: boolean; discipline?: string };
type TriageRow = { client: { userId?: string; id?: string; profile?: { name?: string } }; severity: string; flags: Flag[]; reasons: string[] };
const engine = DashSignals as unknown as {
  buildDirective: (record: unknown, now?: Date, role?: string) => Directive;
  evaluateClient: (record: unknown, now?: Date, role?: string) => { flags: Flag[]; severity: string };
  getTriageFeed: (role: string, clients: unknown[], now?: Date, thresholds?: Record<string, number>) => TriageRow[];
  resolveThresholds: (o: unknown) => { thresholds: Record<string, number>; applied: Record<string, number>; refused: { key: string; why: string }[] };
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
    // ⚠ THE COACH'S OWN TUNING (review 2026-09-09, R14), AND WITHOUT IT THIS FILE
    // CONTRADICTS THE PANEL THAT SETS IT. The office settings page tunes the same
    // engine this module imports — but the module carries house defaults compiled
    // in, so a trainer who raises the food-log gap 3 → 6 watched their roster stop
    // flagging while this cron went on pushing "needs you" alerts for exactly those
    // clients. Passed as a VALUE, per call: the engine is a singleton in this Node
    // process, and a global would let one coach's tuning decide another's alerts.
    // A caller that omits it gets house policy, which is the safe default.
    thresholds?: Record<string, number> | null;
    // The reader's language and units (memberCopy): a member's notices, or a coach's alert titles.
    // A caller that omits it gets the English notices.
    copy?: MemberCopy | null;
  },
): { audience: 'client' | 'coach'; candidates: Candidate[] } {
  const role = snapshot.role || '';
  if (isCoachRole(role)) {
    const clients = Array.isArray(snapshot.clients) ? snapshot.clients : [];
    const rows = engine.getTriageFeed(role, clients, opts.now, opts.thresholds || undefined).map((r) => ({
      clientId: (r.client.userId || r.client.id) as string,
      clientName: (r.client.profile && r.client.profile.name) || 'A client',
      severity: r.severity,
      reason: (r.reasons && r.reasons[0]) || '',
      flags: r.flags,
    }));
    // The alert's title in the coach's language (their copy, from the same stored language).
    return { audience: 'coach', candidates: Notify.coachCandidates({ triageRows: rows, lastSeverity: opts.lastSeverity, providerRole: role, tr: opts.copy?.tr }) };
  }
  const candidates: Candidate[] = [];
  const record = snapshot.record;
  if (record && typeof record === 'object') {
    const directive = engine.buildDirective(record, opts.now, 'client');
    const copy = opts.copy || null;
    // Home's lead, in the member's words (memberMoveLine); the engine's English line without a copy.
    const line = Notify.memberMoveLine(directive, { tr: copy?.tr, locale: copy?.locale, metric: copy?.metric, tone: opts.tone });
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
      tr: copy?.tr,
      locale: copy?.locale,
      metric: copy?.metric,
    }));
  }
  // user-scheduled habit reminders (suppressed when done / snoozed inside the layer)
  if (opts.habitContext) {
    candidates.push(...Notify.habitReminderCandidates({ reminders: opts.habitContext.reminders, doneToday: opts.habitContext.doneToday, now: opts.now, tone: opts.tone, tr: opts.copy?.tr }));
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
// The coach's own signal tuning, resolved against the engine's ranges. Returns null
// for every non-answer — not a coach, nothing tuned, unreadable — so the caller runs
// on house policy, which is what every other coach gets.
// ⚠ THE STORED DOCUMENT IS RE-VALIDATED HERE, not trusted. It is written by a
// browser panel, so an out-of-range or non-numeric entry must be refused server-side
// too; `resolveThresholds` drops those back to the house value rather than clamping.
export async function loadCoachThresholds(
  client: SupabaseClient, userId: string,
): Promise<Record<string, number> | null> {
  const doc = await readUserGoal(client, userId, 'coach_settings');
  const t = doc && typeof doc.thresholds === 'object' ? doc.thresholds : null;
  if (!t) return null;
  try { return engine.resolveThresholds(t).thresholds; } catch { return null; }
}

export async function writeUserGoal(client: SupabaseClient, userId: string, kind: string, value: unknown): Promise<void> {
  try {
    await client.from('user_goals').upsert({ user_id: userId, kind, data: value ?? {} }, { onConflict: 'user_id,kind' });
  } catch { /* best-effort */ }
}

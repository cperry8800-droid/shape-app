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
import { isCoachRole, providerRoleForRole } from '@/lib/roles.mjs';
import { loadCoachContext as loadCoachContextMjs } from './coachContext.mjs';
import { createNotification } from '@/lib/notify';
import { sendEmail } from '@/lib/email';
import { normalizeZone, personZone } from '@/lib/time';
import { claimPushSlots, type PushClaim } from '@/lib/push-cap';
import type { SupabaseClient } from '@supabase/supabase-js';
// The pure UMD engine (module.exports = api); imported directly (no window in Node).
import DashSignals from '../../../public/newdesign/dashSignals.js';
import { bsUnitsMetric } from '../../../mobile-app/src/services/leadReason.mjs';

export type Candidate = { type: string; title: string; body: string; route: string; data: Record<string, unknown>; priority: string };
export type DecideResult = { send: Candidate[]; digest: Candidate | null; nextState: Record<string, unknown>; suppressed: { type: string; reason: string }[] };
export type DecideInput = { candidates: Candidate[]; last: Record<string, unknown>; prefs: Record<string, unknown>; now: Date; audience: string; checkinOptedOut?: boolean; pushedToday?: number | null; tr?: Translate; coachSeen?: Record<string, string> | null };
// The coach's own context the engine reads (P2): their dismissals (coach_signal_dismissals rows) and
// their check-in reviews (the coach_week_reviews doc). Each is null when it could not be read.
export type CoachContext = { dismissals: unknown[] | null; reviews: Record<string, unknown> | null };
export type Snapshot = { role?: string; tz?: string; record?: Record<string, unknown>; clients?: unknown[]; at?: number };

export type Translate = ReaderTranslate;
// The member's notices in their language and units: `tr` their translator, `locale` the Intl locale,
// `metric` their units preference (memberCopy, below).
export type MemberCopy = { code: string; locale: string; metric: boolean; tr: Translate };

export const Notify = NotifyLayer as unknown as {
  memberMoveLine: (directive: unknown, opts: { tr?: Translate; locale?: string; metric?: boolean; tone?: string }) => string;
  clientCandidates: (input: Record<string, unknown>) => Candidate[];
  coachCandidates: (input: Record<string, unknown>) => Candidate[];
  coachSeen: (rows: unknown[]) => Record<string, string>;
  habitReminderCandidates: (input: Record<string, unknown>) => Candidate[];
  decideNotifications: (input: DecideInput) => DecideResult;
  dailyCap: (prefs: Record<string, unknown>) => number;
  pushCount: (decided: { send: Candidate[]; digest: Candidate | null }) => number;
  DEFAULT_PREFS: Record<string, unknown>;
  dailyCheckinOn: (v: unknown) => boolean;
  quietWindow: (settings: unknown, zone: string | null) => { quietStart: number; quietEnd: number; tz: string };
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
  // ⚠ QUIET HOURS ARE THE PERSON'S OWN NIGHT, ON THE CLOCK PUSH DELIVERY READS (quietWindow; owner,
  // 2026-10-26: "fix 1-7"). They were read in the settings' zone, UTC for anyone who never saved
  // settings, which held an American member's nudges from 6 pm and sent the digest at 3 am. Delivery
  // (pushAllowed, push/dispatch/route.ts) reads the same zone: read in another, the engine pushed what
  // delivery then held as quiet. No zone known: no quiet hours, there or here.
  const profileTz = normalizeZone((profileRes.data as { timezone?: string } | null)?.timezone);
  const quiet = Notify.quietWindow(s, personZone(profileTz, s.tz));
  const matrix: Record<string, Record<string, boolean>> = {};
  for (const row of (prefsRes.data || []) as { type: string; channel: string; enabled: boolean }[]) {
    (matrix[row.type] ||= {})[row.channel] = !!row.enabled;
  }
  return {
    muted: s.muted === true,
    quietStart: quiet.quietStart,
    quietEnd: quiet.quietEnd,
    tz: quiet.tz,
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
type Lead = { key: string; reason: string; label?: string; sig?: string | null; action?: { kind: string; label: string } | null };
type TriageRow = { client: { userId?: string; id?: string; profile?: { id?: string; name?: string } }; severity: string; flags: Flag[]; reasons: string[]; lead?: Lead | null };
const engine = DashSignals as unknown as {
  attachCoachContext: (records: unknown[], ctx: CoachContext, role?: string) => unknown[];
  buildDirective: (record: unknown, now?: Date, role?: string) => Directive;
  evaluateClient: (record: unknown, now?: Date, role?: string) => { flags: Flag[]; severity: string };
  getTriageFeed: (role: string, clients: unknown[], now?: Date, thresholds?: Record<string, number>) => TriageRow[];
  resolveThresholds: (o: unknown) => { thresholds: Record<string, number>; applied: Record<string, number>; refused: { key: string; why: string }[] };
};

// The client a coach record names: the snapshot's `userId` (DashSignals.engineSnapshot), else its id,
// else its profile's. ⚠ The app posted records whose id was only at `profile.id`, and the route's
// scope check read `userId || id`, so every client was dropped and no coach alert ever fired.
export function coachRecordId(c: unknown): string | null {
  const r = (c && typeof c === 'object' ? c : {}) as { userId?: unknown; id?: unknown; profile?: { id?: unknown } };
  const v = r.userId ?? r.id ?? (r.profile && typeof r.profile === 'object' ? r.profile.id : null);
  return typeof v === 'string' && v ? v : null;
}

// Read a coach's dismissals and check-in reviews fresh, so the hourly run honours a dismissal or a
// review made since the snapshot was posted (src/lib/ai/coachContext.mjs, which Nora reads too).
export async function loadCoachContext(client: SupabaseClient, userId: string): Promise<CoachContext> {
  return (await loadCoachContextMjs(client, userId)) as CoachContext;
}

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
    // The coach's dismissals and reviews, read fresh (loadCoachContext). Omitted: the snapshot's own.
    coachContext?: CoachContext | null;
  },
): { audience: 'client' | 'coach'; candidates: Candidate[]; coachSeen?: Record<string, string> } {
  const role = snapshot.role || '';
  if (isCoachRole(role)) {
    const raw = Array.isArray(snapshot.clients) ? snapshot.clients : [];
    // The dismissals of this role only: a coach with both listings sets a reason aside per role.
    const clients = opts.coachContext ? engine.attachCoachContext(raw, opts.coachContext, role) : raw;
    const rows = engine.getTriageFeed(role, clients, opts.now, opts.thresholds || undefined).map((r) => ({
      clientId: coachRecordId(r.client) as string,
      clientName: (r.client.profile && r.client.profile.name) || 'A client',
      severity: r.severity,
      // The reason Today leads with (the engine's lead), so the push and the page say one thing.
      reason: (r.lead && r.lead.reason) || (r.reasons && r.reasons[0]) || '',
      flags: r.flags,
      lead: r.lead || null,
    }));
    // The alert's title in the coach's language (their copy, from the same stored language).
    return {
      audience: 'coach',
      candidates: Notify.coachCandidates({ triageRows: rows, lastSeverity: opts.lastSeverity, providerRole: role, tr: opts.copy?.tr }),
      // Who this run saw clear, so the alert memory forgets them (settleCoachMemory).
      coachSeen: Notify.coachSeen(rows),
    };
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

// ── One roster per coach role (2026-11-05) ──────────────────────────────────
// The coach role a posted roster is evaluated as: the one the body names when the caller holds it, else
// the profile's. ⚠ COMPARED AS PROVIDER ROLES: a dietitian is on the nutritionist rails and the nutrition
// page posts 'nutritionist', so an exact match sent a dietitian's nutrition roster down the profile
// role's path (a trainer's, for a coach with both listings).
export function rosterRole(asked: unknown, actor: { role: string; roles: string[] }): string {
  if (typeof asked !== 'string' || !isCoachRole(asked)) return actor.role;
  const want = providerRoleForRole(asked);
  return actor.roles.some((r) => providerRoleForRole(r) === want) ? asked : actor.role;
}

// ⚠ A COACH WITH BOTH LISTINGS POSTS TWO ROSTERS, AND BOTH ARE KEPT. The trainer page and the nutrition
// page each post their own role's clients, and both went to the one `notify_snapshot`, so opening the
// second replaced the first and the hourly run stopped alerting for the other role's clients. A coach
// role's roster is `notify_snapshot:<provider role>` (a dietitian's is the nutritionist's), and its alert
// memory `notify_state:<provider role>`: run side by side on one memory, a client on both rosters whom
// one role reads clear would be forgotten (settleCoachMemory) and alerted again by the other, every
// hour. A member's own record keeps the plain keys.
export function notifyKind(base: 'notify_snapshot' | 'notify_state', role: unknown): string {
  const provider = isCoachRole(role) ? providerRoleForRole(role) : null;
  return provider ? `${base}:${provider}` : base;
}
// Every key a snapshot is kept under. The plain one also holds a coach roster posted before the split.
export const NOTIFY_SNAPSHOT_KINDS = ['notify_snapshot', 'notify_snapshot:trainer', 'notify_snapshot:nutritionist'];

// The snapshots the hourly run evaluates for one person, from their NOTIFY_SNAPSHOT_KINDS rows: each coach
// role's own roster, a member's record, and a coach roster under the plain key from before the split
// until that role posts its own, so no roster is lost in the change. One whose app last checked in
// before `cutoff` is skipped, as the run skips an inactive person.
export function snapshotsToEvaluate(rows: Array<{ kind?: unknown; data?: unknown }> | null | undefined, cutoff?: number): Snapshot[] {
  const byKind = new Map<string, Snapshot>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r && typeof r.kind === 'string' && r.data && typeof r.data === 'object') byKind.set(r.kind, r.data as Snapshot);
  }
  const active = (s: Snapshot) => !(typeof s.at === 'number' && typeof cutoff === 'number' && s.at < cutoff);
  const out: Snapshot[] = [];
  for (const kind of NOTIFY_SNAPSHOT_KINDS) {
    const s = byKind.get(kind);
    if (!s || !active(s)) continue;
    // The plain key: a member's record, or a coach roster that role has not replaced since.
    if (kind === 'notify_snapshot' && isCoachRole(s.role) && byKind.has(notifyKind('notify_snapshot', s.role))) continue;
    out.push(s);
  }
  return out;
}

// The alert memory a coach role's evaluation starts from: its own, else (that role's first run since the
// split) the one state every role shared, its held coach alerts narrowed to this role's (each carries
// its role), so a client alerted before is not alerted again and a held alert is not sent twice.
export async function readNotifyState(client: SupabaseClient, userId: string, role: unknown): Promise<Record<string, unknown>> {
  const kind = notifyKind('notify_state', role);
  const own = await readUserGoal(client, userId, kind);
  if (kind === 'notify_state' || Object.keys(own).length) return own;
  const shared = await readUserGoal(client, userId, 'notify_state');
  const provider = providerRoleForRole(role);
  const held = Array.isArray(shared.pendingDigest) ? shared.pendingDigest : null;
  if (!held) return shared;
  const mine = held.filter((i) => {
    const pr = i && typeof i === 'object' ? ((i as { data?: { providerRole?: unknown } }).data || {}).providerRole : undefined;
    return typeof pr !== 'string' || pr === provider;
  });
  return { ...shared, pendingDigest: mine };
}

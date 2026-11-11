// Shared evaluation core for the notification layer — used by BOTH the
// app-driven route (/api/ai/notify) and the cron (/api/ai/notify/cron). Given a
// SNAPSHOT (the real record/roster the user's app last sent) it runs the SAME
// engine (AI2 buildDirective / AI4 getTriageFeed) and returns candidates for the
// pure decision layer. A member's record is read against `now`, so a check-in that has since gone
// due nudges them without the app open; a coach's roster is read as of its save (rosterClock). Both
// count days in the person's own zone (inZone). No data is mutated.

import * as NotifyLayer from '@/lib/ai/notifications.mjs';
import { memberLocaleCode } from '@/lib/ai/memberTranslator.mjs';
import { copyFor, type Translate as ReaderTranslate } from '@/lib/reader-copy';
import { isCoachRole, providerRoleForRole } from '@/lib/roles.mjs';
import { loadCoachContext as loadCoachContextMjs } from './coachContext.mjs';
import { createNotification } from '@/lib/notify';
import { sendEmail } from '@/lib/email';
import { instantInZone, normalizeZone, personZone } from '@/lib/time';
import { claimPushSlots, type PushClaim } from '@/lib/push-cap';
import { OPEN_SUB_STATUSES } from '../coach-trajectory.mjs';
import type { SupabaseClient } from '@supabase/supabase-js';
// The pure UMD engine (module.exports = api); imported directly (no window in Node).
import DashSignals from '../../../public/newdesign/dashSignals.js';
import { bsUnitsMetric } from '../../../mobile-app/src/services/leadReason.mjs';

export type Candidate = { type: string; title: string; body: string; route: string; data: Record<string, unknown>; priority: string };
export type DecideResult = { send: Candidate[]; digest: Candidate | null; nextState: Record<string, unknown>; suppressed: { type: string; reason: string }[] };
export type DecideInput = { candidates: Candidate[]; last: Record<string, unknown>; prefs: Record<string, unknown>; now: Date; audience: string; checkinOptedOut?: boolean; memberPaused?: boolean; pushedToday?: number | null; tr?: Translate; coachSeen?: Record<string, string> | null };
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
  inZone: <T>(zone: string | null | undefined, now: Date, fn: (at: Date) => T) => T;
  resolveThresholds: (o: unknown, role?: string) => { thresholds: Record<string, number>; applied: Record<string, number>; refused: { key: string; why: string }[] };
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

// ⚠ A STORED ROSTER IS READ AS OF ITS SAVE, NEVER AGAINST A LATER CLOCK (F1, the engine audit of
// 2026-11-11). A coach's roster is posted only when they open the website or the app, and the hourly
// run read it against the hour it ran, for up to 14 days: the dates in it (the last food log, the
// last message, the last check-in) never moved, so a client who logged every day read "No food logs
// in 3 days" two days on and red "No food logs in 8 days · No contact in 7 days" a week on, and the
// coach was pushed both. Read as of its save, the roster says only what was true when it was posted;
// what changes after waits for the coach's next visit, which posts a fresh one. Rebuilding each
// client on the server would need the coach's own sign-in, which the run has not got (War Room).
// A clock ahead of the run's, or a snapshot with no time on it, reads at the run's own clock.
export function rosterClock(snapshot: Snapshot, now: Date): Date {
  const at = snapshot && snapshot.at;
  return typeof at === 'number' && Number.isFinite(at) && at < now.getTime() ? new Date(at) : now;
}

// ⚠ A SNOOZE ENDS ON THE RUN'S CLOCK, NOT THE SAVE'S (Codex on #2703). The roster is read as of its
// save (rosterClock), and a snooze compared with that moment never ended: one set at 10:00 until noon
// kept its flag hidden at the 1 pm run and every run after, until the coach's next visit. A snooze that
// has ended by the run's own clock is dropped here, so the flag the roster held at its save comes back.
// A dismissal with no end, and a snooze still running, hold as before; an end that can't be read is an
// ended one, as isDismissed reads it.
export function liveDismissals(records: unknown[], now: Date): unknown[] {
  return records.map((r) => {
    const list = r && typeof r === 'object' ? (r as { dismissals?: unknown }).dismissals : undefined;
    if (!Array.isArray(list)) return r;
    const kept = list.filter((d) => {
      const until = d && typeof d === 'object' ? (d as { until?: unknown }).until : null;
      if (until == null || until === '') return true;
      const t = Date.parse(String(until));
      return Number.isFinite(t) && t > now.getTime();
    });
    return { ...(r as Record<string, unknown>), dismissals: kept };
  });
}

// ⚠ A MEMBER ON A BREAK GETS NONE OF THIS ENGINE'S NOTICES (a pause, 2026-11-11-client-pause.sql:
// "away until <date>", set by them or a coach). Read fresh on every run, never from the stored
// record, so a pause set or ended since the app last posted holds. `asService`: the hourly run reads
// the table with the service role; the live route asks get_client_pause as the member. A read that
// fails, or a table not there yet, is no pause: the notices go on as before.
export async function loadMemberPaused(client: SupabaseClient, userId: string, now: Date, tz: string, opts: { asService?: boolean } = {}): Promise<boolean> {
  try {
    const r = opts.asService
      // One row a break, kept after it ends: the latest end is the one that may hold today.
      ? await client.from('client_pauses').select('until_on').eq('client_id', userId).order('until_on', { ascending: false }).limit(1).maybeSingle()
      : await client.rpc('get_client_pause', { p_client_id: userId });
    if (r.error) return false;
    const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { until_on?: unknown } | null | undefined;
    return !!row && typeof row.until_on === 'string' && ymdInTz(now, tz) <= row.until_on;
  } catch {
    return false;
  }
}

// A client's break as the engine reads it (dashSignals.js pauseOf): its last day away, who set it, and
// the instant their return day begins in their own zone (get_client_pause's back_at).
export type ClientBreak = { until: string; by: string | null; backAt?: string };
// Who of a stored roster the coach still has (`coached`), and those clients' latest breaks read fresh
// (`breaks`: null when they couldn't be read). loadClientBreaks.
export type RosterAccess = { coached: Set<string>; breaks: Map<string, ClientBreak | null> | null };
// ⚠ A COACH'S STORED ROSTER HOLDS EACH CLIENT'S BREAK AS OF ITS SAVE (Codex on #2705). The hourly run
// reads that roster while the coach is away from Shape, so a break set since read as no break: an alert
// for a client now away was still sent, or sent from the digest it was held in. Each client's latest
// break is read fresh here with the service role, as get_client_pause answers it, and laid over the
// roster (candidatesFor `clientBreaks`); a client away then reads clear, and the decision drops an alert
// held for them (coachSeen). null when the breaks can't be read (or the table isn't there yet): the
// roster is read as it was saved. A zone that can't be read leaves `backAt` out (the coach's day).
// ⚠ ONLY THE COACH'S OWN CLIENTS (CodeRabbit's security check on #2705). The stored roster is the
// coach's own user_goals row, which they may write directly, with any role and any ids, and this read
// runs as the service role: unchecked, a forged roster would push a stranger's break, and the day it
// ended, to whoever wrote it. A client is read only when is_coach_on_client would answer for this coach
// (an active, trialing or past-due subscription to a listing they own); the rest are left out, read as
// saved. A check that can't be made reads nothing (null).
// ⚠ AND ONLY THE COACH'S OWN CLIENTS ARE EVALUATED (CodeRabbit's security check on #2705): `coached` is
// who of the roster they still have, and candidatesFor `rosterAccess` evaluates those alone, dropping
// the alerts held for the rest. So a client who has left, or one a forged roster names, is never
// alerted about from what the roster held. null when the check can't be made: the run sends nothing.
export async function loadClientBreaks(admin: SupabaseClient, coachId: string, clientIds: string[], now: Date): Promise<RosterAccess | null> {
  const asked = [...new Set((Array.isArray(clientIds) ? clientIds : []).filter((v) => typeof v === 'string' && v))].slice(0, 100);
  const out = new Map<string, ClientBreak | null>();
  if (!asked.length || typeof coachId !== 'string' || !coachId) return { coached: new Set(), breaks: out };
  try {
    // 16 days of UTC's calendar: get_client_pause's 15 in the member's own, whichever side of UTC.
    const floor = new Date(now.getTime() - 16 * 86_400_000).toISOString().slice(0, 10);
    // One round trip: the coach's listings, the clients' subscriptions, their breaks and their zones.
    const [trainers, nutritionists, subs, pauses, zones] = await Promise.all([
      admin.from('trainers').select('id').eq('owner_id', coachId),
      admin.from('nutritionists').select('id').eq('owner_id', coachId),
      admin.from('subscriptions').select('client_id, provider_id, provider_role').in('client_id', asked).in('status', OPEN_SUB_STATUSES),
      admin.from('client_pauses').select('id, client_id, from_on, until_on, set_by_role').in('client_id', asked).gte('until_on', floor),
      admin.from('profiles').select('id, timezone').in('id', asked),
    ]);
    if (trainers.error || nutritionists.error || subs.error || !Array.isArray(subs.data)) return null;
    const own = (r: { data: unknown }) => new Set((Array.isArray(r.data) ? r.data as { id?: unknown }[] : []).map((x) => String(x.id)));
    const tIds = own(trainers), nIds = own(nutritionists);
    const coached = new Set((subs.data as { client_id?: unknown; provider_id?: unknown; provider_role?: unknown }[])
      .filter((x) => (x.provider_role === 'trainer' && tIds.has(String(x.provider_id))) || (x.provider_role === 'nutritionist' && nIds.has(String(x.provider_id))))
      .map((x) => String(x.client_id)));
    const ids = asked.filter((id) => coached.has(id));
    // The breaks unread: who they still have is known, their breaks are as the roster was saved.
    if (pauses.error || !Array.isArray(pauses.data)) return { coached, breaks: null };
    const zoneOf = zones.error || !Array.isArray(zones.data) ? null
      : new Map((zones.data as { id?: unknown; timezone?: unknown }[]).map((z) => [String(z.id), normalizeZone(z.timezone) || 'UTC']));
    const latest = new Map<string, { id: number; from_on: string; until_on: string; set_by_role: unknown }>();
    for (const r of pauses.data as { id?: unknown; client_id?: unknown; from_on?: unknown; until_on?: unknown; set_by_role?: unknown }[]) {
      if (typeof r.client_id !== 'string' || typeof r.from_on !== 'string' || typeof r.until_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.until_on)) continue;
      const row = { id: Number(r.id) || 0, from_on: r.from_on, until_on: r.until_on, set_by_role: r.set_by_role };
      const had = latest.get(r.client_id);
      // The latest break: the last to begin, and of two begun the same day the last made (order by from_on desc, id desc).
      if (!had || row.from_on > had.from_on || (row.from_on === had.from_on && row.id > had.id)) latest.set(r.client_id, row);
    }
    for (const id of ids) {
      const row = latest.get(id);
      if (!row) { out.set(id, null); continue; }
      const b: ClientBreak = { until: row.until_on, by: typeof row.set_by_role === 'string' ? row.set_by_role : null };
      const zone = zoneOf ? (zoneOf.get(id) || 'UTC') : null;
      if (zone) {
        const [y, mo, d] = row.until_on.split('-').map(Number);
        const next = new Date(Date.UTC(y, mo - 1, d + 1));
        const t = instantInZone(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, zone);
        if (Number.isFinite(t)) b.backAt = new Date(t).toISOString();
      }
      out.set(id, b);
    }
    return { coached, breaks: out };
  } catch {
    return null;
  }
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
    // The person's own zone (loadPrefs' `tz`), so the engine counts their days, not the server's UTC
    // ones (F2). Omitted: the zone the snapshot was posted with.
    zone?: string | null;
    // A member on a break (loadMemberPaused): none of their own notices. A coach's roster reads each
    // client's pause from the roster itself, unless `clientBreaks` says otherwise.
    memberPaused?: boolean;
    // Who of a coach's stored roster they still have, and those clients' breaks read fresh
    // (loadClientBreaks): only those clients are evaluated, each break laid over the saved one (null:
    // none). Omitted: the roster as saved (the live route, whose roster is checked as it is posted).
    rosterAccess?: RosterAccess | null;
    // Clients the coach no longer has (the live route's scope check, and loadClientBreaks): an alert
    // held for them is dropped, and they are forgotten (coachSeen 'clear').
    revokedClients?: string[];
  },
): { audience: 'client' | 'coach'; candidates: Candidate[]; coachSeen?: Record<string, string> } {
  const role = snapshot.role || '';
  if (isCoachRole(role)) {
    const saved = Array.isArray(snapshot.clients) ? snapshot.clients : [];
    // Only the clients the coach still has, each break as it is now over the one the roster was saved
    // with (loadClientBreaks); the rest are dropped, and so are the alerts held for them.
    const access = opts.rosterAccess || null;
    const kept = !access ? saved : saved.filter((c) => { const id = coachRecordId(c); return !!id && access.coached.has(id); });
    const revoked = new Set((Array.isArray(opts.revokedClients) ? opts.revokedClients : []).filter((v) => typeof v === 'string' && v));
    if (access) for (const c of saved) { const id = coachRecordId(c); if (id && !access.coached.has(id)) revoked.add(id); }
    const fresh = access ? access.breaks : null;
    // Each break as read at this run (`readAt`), so one over since the save says "Back from a break"
    // (pauseOf), though the rest of the roster is read as of its save.
    const readAt = opts.now.toISOString();
    const raw = !fresh ? kept : kept.map((c) => {
      const id = coachRecordId(c);
      if (!id || !fresh.has(id) || !c || typeof c !== 'object') return c;
      const b = fresh.get(id);
      return { ...(c as Record<string, unknown>), pause: b ? { ...b, readAt } : null };
    });
    // The dismissals of this role only: a coach with both listings sets a reason aside per role.
    // …each snooze held to the run's own clock (liveDismissals).
    const clients = liveDismissals(opts.coachContext ? engine.attachCoachContext(raw, opts.coachContext, role) : raw, opts.now);
    const zone = opts.zone || snapshot.tz || null;
    const rows = engine.inZone(zone, rosterClock(snapshot, opts.now), (at) => engine.getTriageFeed(role, clients, at, opts.thresholds || undefined)).map((r) => ({
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
      // Who this run saw clear, so the alert memory forgets them (settleCoachMemory), and those the coach
      // no longer has, so an alert held for them is dropped (decideNotifications).
      coachSeen: { ...Object.fromEntries([...revoked].map((id) => [id, 'clear'])), ...Notify.coachSeen(rows) },
    };
  }
  const candidates: Candidate[] = [];
  if (opts.memberPaused) return { audience: 'client', candidates };
  const record = snapshot.record;
  if (record && typeof record === 'object') {
    // On the member's own day (F2), as their Home reads it on the phone.
    const { directive, flags } = engine.inZone(opts.zone || snapshot.tz || null, opts.now, (at) => ({
      directive: engine.buildDirective(record, at, 'client'),
      flags: engine.evaluateClient(record, at, 'client').flags,
    }));
    const copy = opts.copy || null;
    // Home's lead, in the member's words (memberMoveLine); the engine's English line without a copy.
    const line = Notify.memberMoveLine(directive, { tr: copy?.tr, locale: copy?.locale, metric: copy?.metric, tone: opts.tone });
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
// ⚠ AND RESOLVED FOR THE ROLE THE ROSTER IS (`role`): the house values under the tuning are that
// role's (a trainer's food-log gap is 5 days), so a coach with both listings gets each roster's own.
export async function loadCoachThresholds(
  client: SupabaseClient, userId: string, role?: string,
): Promise<Record<string, number> | null> {
  const doc = await readUserGoal(client, userId, 'coach_settings');
  const t = doc && typeof doc.thresholds === 'object' ? doc.thresholds : null;
  if (!t) return null;
  try { return engine.resolveThresholds(t, role).thresholds; } catch { return null; }
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
// ⚠ THE DAY'S PUSH COUNT STAYS THE PERSON'S (Codex on #2622). Only the alert memory is per role: the
// engine's own count (`date` + `sentToday`), which decideNotifications falls back on when the day's
// pushes can't be read and the claim is unavailable, is read from and written to the shared
// `notify_state`, so a coach with both listings has one daily budget, not one per role.
export async function readNotifyState(client: SupabaseClient, userId: string, role: unknown): Promise<Record<string, unknown>> {
  const kind = notifyKind('notify_state', role);
  if (kind === 'notify_state') return readUserGoal(client, userId, kind);
  const [own, shared] = await Promise.all([readUserGoal(client, userId, kind), readUserGoal(client, userId, 'notify_state')]);
  let memory: Record<string, unknown> = own;
  if (!Object.keys(own).length) {
    const provider = providerRoleForRole(role);
    const held = Array.isArray(shared.pendingDigest) ? shared.pendingDigest : null;
    memory = !held ? shared : { ...shared, pendingDigest: held.filter((i) => {
      const pr = i && typeof i === 'object' ? ((i as { data?: { providerRole?: unknown } }).data || {}).providerRole : undefined;
      // Only this role's own (Codex on #2622): a held item with no provider role is a member's, and
      // stays in the shared state, never copied into a coach role's digest.
      return pr === provider;
    }) };
  }
  const { date: _d, sentToday: _s, ...rest } = memory;
  return shared.date !== undefined ? { ...rest, date: shared.date, sentToday: shared.sentToday } : rest;
}
// The other half: the role's memory under its own key, the day's count on the shared one.
export async function writeNotifyState(client: SupabaseClient, userId: string, role: unknown, nextState: Record<string, unknown>): Promise<void> {
  const kind = notifyKind('notify_state', role);
  await writeUserGoal(client, userId, kind, nextState);
  if (kind === 'notify_state') return;
  const shared = await readUserGoal(client, userId, 'notify_state');
  await writeUserGoal(client, userId, 'notify_state', { ...shared, date: nextState.date, sentToday: nextState.sentToday });
}

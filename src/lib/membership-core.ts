// Edge-safe member entitlement logic — NO `next/headers` imports, so it's safe
// to use from middleware (Edge runtime). The route-level helper lives in
// `require-membership.ts`, which builds on this.

import type { SupabaseClient } from '@supabase/supabase-js';
// Pure + tested (tests/age-derive.test.mjs). Imports nothing, so it stays safe
// in this module's edge-proxy import chain.
import { isMinorFromDob, mustRefuseForAge } from './age-derive.mjs';

export { isMinorFromDob, mustRefuseForAge };

// The OPEN statuses of a subscription: one that exists and has not ended. Still the rule for a
// member's subscriptions to their COACHES (and for "already subscribed" checks), so it keeps
// trialing and past_due. ⚠ NOT THE PLATFORM PERK RULE: see PLATFORM_PERK_STATUSES.
export const ACTIVE_SUB = new Set(['active', 'trialing', 'past_due']);

// ⚠ PAID FEATURES COME FROM A PAID MEMBERSHIP ONLY (owner, 2026-11-10). An account is free; the
// $5 platform membership adds assistant Nora, Shape Radio, the AI helpers and the points Store.
// Only `active` pays for them: Shape sells no trial ("im not doing free trials"), and a member
// whose renewal failed (past_due, Stripe retrying) keeps their account and the free features but
// loses the paid ones until the payment goes through ("past due just loses the paid percs").
export const PLATFORM_PERK_STATUSES = new Set(['active']);

// The proxy gate's verification stamp. After the edge gate verifies a gated
// request's entitlement it stamps this request header for the route layer;
// requireMembership() (require-membership.ts) trusts the stamp as its fast
// path — no repeated entitlement queries. The middleware STRIPS any incoming
// value on every request, so the header can only ever be proxy-issued —
// never caller-supplied.
export const GATE_STAMP_HEADER = 'x-shape-gate';
/** Stamped on a request the gate verified as a paid member (or a coach or an admin). */
export const GATE_STAMP_VALUE = 'member';
/** Stamped on a request the gate verified as a signed-in adult account, paid or not. */
export const GATE_STAMP_ACCOUNT = 'account';

// Mirrors getAdminEmails() in admin-access.ts (which can't be imported here —
// that module pulls in the cookie-based server client).
const DEFAULT_ADMIN_EMAILS = [
  'christopher.perry@theshapecommunity.com',
  'cperry8800@gmail.com',
  'chris.perry@shapecommunity.onmicrosoft.com',
];

export function adminEmails(): string[] {
  // L14: ADMIN_EMAILS only; the applications inbox is not an admin (see admin-access.ts).
  const configured = [process.env.ADMIN_EMAILS]
    .filter(Boolean)
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...configured, ...DEFAULT_ADMIN_EMAILS]));
}

export type Membership = {
  /** Paid features: an active platform membership, an approved coach, or an admin. */
  isMember: boolean;
  /**
   * The platform membership's renewal failed and Stripe is retrying: the account keeps its free
   * features, and a paid feature answers `payment_past_due` so the app can say "update your card".
   * Never true for a coach or an admin (their features never depended on the payment).
   */
  pastDue: boolean;
  /** The newest platform subscription's status, or null (none, or not read for an admin). */
  platformStatus: string | null;
  /**
   * The paid features come with the member's coaching: an active subscription to a coach (owner,
   * 2026-11-10: "Include the membership while someone is paying a coach"). False for an account
   * that is a member on its own (a plan, a coach role, an admin), so a screen can say which.
   */
  includedWithCoach: boolean;
  isCoach: boolean;
  isAdmin: boolean;
  /**
   * TRUE only when we hold a date of birth that proves the account is a minor.
   *
   * `profiles.over_18` is DERIVED by the set_over_18() trigger from
   * date_of_birth, so it cannot be written directly. A `false` is trustworthy
   * only once 2026-08-15-profiles-dob-immutable.sql freezes date_of_birth
   * against self-rewrite — before that, editing the input flips the flag.
   * ⚠ It is NULL when no DOB was ever captured (accounts created before the age
   * gate, and phone sign-ups whose DOB claim did not persist), and NULL is NOT
   * evidence of anything — so this flags only a CONFIRMED minor. Blocking NULL
   * would lock out every legacy account, which is a different change and needs a
   * DOB-completion flow first.
   */
  isKnownMinor: boolean;
};

/**
 * Paid entitlement: approved coach OR admin OR an `active` platform subscription (never trialing or
 * past_due) OR an active subscription to a coach (coaching includes the membership).
 */
export async function computeMembership(
  client: SupabaseClient,
  userId: string,
  email: string | null,
  // L14 (2026-10-08 review; Codex on #2289): an admin is an allow-listed address Supabase has
  // CONFIRMED. The caller passes the state off its auth user (`!!user.email_confirmed_at`);
  // left out, it is false, so a caller that forgets grants nothing rather than everything.
  // `strict`: a read that comes back with an error THROWS. Supabase reports an ordinary
  // failure as `{ data: null, error }`, not a rejection, so without it a failed subscription
  // read reads as "not a member". The gate keeps that (its own fault handling is documented
  // where it calls this); a caller that sells something on the answer, or shows the app's
  // paywall on it, passes strict so a failed read is unknown, never a non-member (Codex on
  // #2353: an existing member could open a second $5 checkout on a failed read).
  opts: { emailConfirmed?: boolean; strict?: boolean } = {}
): Promise<Membership> {
  const isAdmin = !!email && opts.emailConfirmed === true && adminEmails().includes(email.toLowerCase());
  // ⚠ THE PROFILE AND THE SUBSCRIPTION ARE READ TOGETHER. Neither depends on the other, and
  // this runs on every gated API call (the edge gate) and every question to Nora, so one
  // round trip is saved each time. An approved coach or an admin never needs the
  // subscription; its read is then left unused. Each builder becomes a promise ONCE
  // (Promise.resolve): a Supabase query runs again every time its `then` is called.
  const profileRead = Promise.resolve(client
    .from('profiles')
    .select('role, roles, over_18, date_of_birth, created_at')
    .eq('id', userId)
    .maybeSingle());
  const subRead = isAdmin ? null : Promise.resolve(client
    .from('platform_subscriptions')
    .select('status')
    .eq('client_id', userId)
    .order('current_period_end', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle());
  // ⚠ COACHING INCLUDES THE MEMBERSHIP (owner, 2026-11-10). An active subscription to a coach (the
  // member's own row; "clients read own subscriptions") pays for the paid features while it lasts.
  // Read beside the others; used only when nothing else made them a member.
  const coachRead = isAdmin ? null : Promise.resolve(client
    .from('subscriptions')
    .select('id')
    .eq('client_id', userId)
    .eq('status', 'active')
    .limit(1));
  // Handled here so a failure is not reported as unhandled while the profile is read; it is
  // still thrown below, where it was always awaited, when the subscription decides.
  if (subRead) subRead.then(undefined, () => {});
  if (coachRead) coachRead.then(undefined, () => {});
  const { data: profile, error: profileError } = await profileRead;
  if (profileError && opts.strict) throw profileError;
  const role = (profile?.role as string) || 'client';
  const roles = Array.isArray((profile as { roles?: unknown } | null)?.roles)
    ? ((profile as { roles?: string[] }).roles as string[])
    : [];
  // Coach roles (members by role, not subscription). Dietitian (RD/RDN) is a
  // first-class nutrition-discipline provider — mirror roles.mjs COACH_ROLES.
  // (Literal here, not the helper import, to keep this edge-proxy module
  // dependency-free.)
  const COACH_ROLES = ['trainer', 'nutritionist', 'dietitian'];
  const isCoach = COACH_ROLES.includes(role) || roles.some((r) => COACH_ROLES.includes(r));

  let isMember = isCoach || isAdmin;
  let platformStatus: string | null = null;
  let includedWithCoach = false;
  if (!isMember && subRead) {
    const { data: sub, error: subError } = await subRead;
    if (subError && opts.strict) throw subError;
    platformStatus = sub ? String((sub as { status?: unknown }).status ?? '') || null : null;
    isMember = !!platformStatus && PLATFORM_PERK_STATUSES.has(platformStatus);
  }
  if (!isMember && coachRead) {
    const { data: coached, error: coachError } = await coachRead;
    if (coachError && opts.strict) throw coachError;
    includedWithCoach = Array.isArray(coached) && coached.length > 0;
    isMember = includedWithCoach;
  }
  const pastDue = !isMember && platformStatus === 'past_due';
  // Age is derived from the DATE first (see isMinorFromDob — `over_18` is a
  // signup-time snapshot that goes stale on the member's eighteenth birthday).
  // The stored flag is the fallback for rows that carry no usable DOB, where
  // only an explicit false is a proven minor.
  // ⚠ ABSENCE NO LONGER ADMITS. This used to be
  //   fromDob !== null ? fromDob : over_18 === false
  // i.e. only proof of MINORITY refused — so any account that reached a session
  // without a stored date of birth (failed upsert, unprovisioned confirmation
  // callback, coach invitation) was admitted. mustRefuseForAge() requires proof
  // of ADULTHOOD for accounts created from ADULT_PROOF_REQUIRED_FROM onward and
  // grandfathers the pre-launch rows.  is selected above and is
  // required — without it every account reads as unplaceable and is refused.
  const isKnownMinor = mustRefuseForAge(
    profile as { date_of_birth?: unknown; over_18?: unknown; created_at?: unknown } | null
  );

  return { isMember, pastDue, platformStatus, includedWithCoach, isCoach, isAdmin, isKnownMinor };
}

/** A stamp the gate gives a request for assistant Nora during an account's free week. */
export const GATE_STAMP_NORA = 'nora';

export type NoraPreview = { startedAt: string; endsAt: string; active: boolean };

/**
 * The account's free week of assistant Nora (supabase-migrations/2026-11-10-nora-free-week.sql: it
 * starts by itself after a free account's third completed workout, once per account, with no card;
 * owner, 2026-11-10). Read with the caller's own session (an account reads its own row) or the
 * service role. null when there is none (or no table yet); a failed read throws.
 */
export async function readNoraPreview(
  client: SupabaseClient,
  userId: string,
  opts: { now?: number } = {}
): Promise<NoraPreview | null> {
  const { data, error } = await client.from('nora_previews').select('started_at, ends_at').eq('user_id', userId).maybeSingle();
  if (error) {
    // Before 2026-11-10-nora-free-week.sql has run there is no table, and so no week: an answer.
    // ⚠ ANY OTHER FAILURE IS UNKNOWN, AND THROWN, EVERYWHERE (Codex P2 ×2 on #2675). Read as "no
    // week", it was a confirmed refusal: /api/me/membership answered nora:false, and the edge gate
    // and requireNora answered a 402, to an account in its free week, for as long as the table
    // could not be read. Thrown, each takes its own fault path: the membership read's 503 (clients
    // keep what they knew), and the gate's and requireNora's fail-open with a log, as every other
    // read of the paid gate. A caller that would rather have none says so (.catch).
    const code = String((error as { code?: unknown }).code ?? '');
    if (code === 'PGRST205' || code === '42P01') return null;
    throw error;
  }
  if (!data) return null;
  const row = data as { started_at?: unknown; ends_at?: unknown };
  const endsAt = String(row.ends_at ?? '');
  const ends = Date.parse(endsAt);
  if (!Number.isFinite(ends)) return null;
  return { startedAt: String(row.started_at ?? ''), endsAt, active: ends > (opts.now ?? Date.now()) };
}

/** The 402 a paid feature answers a signed-in adult who may not use it: past due, or not a member. */
export function paidRefusal(m: Pick<Membership, 'pastDue'>): { error: string; code: 'payment_past_due' | 'membership_required' } {
  return m.pastDue
    ? { error: "Your Shape membership payment didn't go through. Update your card to use this.", code: 'payment_past_due' }
    : { error: 'Shape membership required.', code: 'membership_required' };
}

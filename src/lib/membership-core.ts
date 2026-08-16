// Edge-safe member entitlement logic — NO `next/headers` imports, so it's safe
// to use from middleware (Edge runtime). The route-level helper lives in
// `require-membership.ts`, which builds on this.

import type { SupabaseClient } from '@supabase/supabase-js';
// Pure + tested (tests/age-derive.test.mjs). Imports nothing, so it stays safe
// in this module's edge-proxy import chain.
import { isMinorFromDob } from './age-derive.mjs';

export { isMinorFromDob };

export const ACTIVE_SUB = new Set(['active', 'trialing', 'past_due']);

// The proxy gate's verification stamp. After the edge gate verifies a gated
// request's entitlement it stamps this request header for the route layer;
// requireMembership() (require-membership.ts) trusts the stamp as its fast
// path — no repeated entitlement queries. The middleware STRIPS any incoming
// value on every request, so the header can only ever be proxy-issued —
// never caller-supplied.
export const GATE_STAMP_HEADER = 'x-shape-gate';
export const GATE_STAMP_VALUE = 'member';

// Mirrors getAdminEmails() in admin-access.ts (which can't be imported here —
// that module pulls in the cookie-based server client).
const DEFAULT_ADMIN_EMAILS = [
  'christopher.perry@theshapecommunity.com',
  'cperry8800@gmail.com',
  'chris.perry@shapecommunity.onmicrosoft.com',
];

export function adminEmails(): string[] {
  const configured = [process.env.ADMIN_EMAILS, process.env.APPLICATIONS_EMAIL]
    .filter(Boolean)
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...configured, ...DEFAULT_ADMIN_EMAILS]));
}

export type Membership = {
  isMember: boolean;
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

/** Entitlement: approved coach OR admin OR an active platform subscription. */
export async function computeMembership(
  client: SupabaseClient,
  userId: string,
  email: string | null
): Promise<Membership> {
  const { data: profile } = await client
    .from('profiles')
    .select('role, roles, over_18, date_of_birth')
    .eq('id', userId)
    .maybeSingle();
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
  const isAdmin = !!email && adminEmails().includes(email.toLowerCase());

  let isMember = isCoach || isAdmin;
  if (!isMember) {
    const { data: sub } = await client
      .from('platform_subscriptions')
      .select('status')
      .eq('client_id', userId)
      .order('current_period_end', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    isMember = !!(sub && ACTIVE_SUB.has(String((sub as { status?: unknown }).status)));
  }
  // Age is derived from the DATE first (see isMinorFromDob — `over_18` is a
  // signup-time snapshot that goes stale on the member's eighteenth birthday).
  // The stored flag is the fallback for rows that carry no usable DOB, where
  // only an explicit false is a proven minor.
  const fromDob = isMinorFromDob((profile as { date_of_birth?: unknown } | null)?.date_of_birth);
  const over18 = (profile as { over_18?: unknown } | null)?.over_18;
  const isKnownMinor = fromDob !== null ? fromDob : over18 === false;

  return { isMember, isCoach, isAdmin, isKnownMinor };
}

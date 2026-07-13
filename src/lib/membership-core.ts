// Edge-safe member entitlement logic — NO `next/headers` imports, so it's safe
// to use from middleware (Edge runtime). The route-level helper lives in
// `require-membership.ts`, which builds on this.

import type { SupabaseClient } from '@supabase/supabase-js';

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

export type Membership = { isMember: boolean; isCoach: boolean; isAdmin: boolean };

/** Entitlement: approved coach OR admin OR an active platform subscription. */
export async function computeMembership(
  client: SupabaseClient,
  userId: string,
  email: string | null
): Promise<Membership> {
  const { data: profile } = await client
    .from('profiles')
    .select('role, roles')
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
  return { isMember, isCoach, isAdmin };
}

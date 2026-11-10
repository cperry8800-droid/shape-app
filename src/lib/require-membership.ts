// Per-endpoint paid-feature enforcement — the route-layer half of the
// membership gate the edge proxy starts (middleware.ts GATED_API_PREFIXES).
//
// The proxy gate deliberately FAILS OPEN (a gate fault must never take down
// the API), which makes it a paywall, not access control, on its own. Every
// paid route calls requireMembership() at the top of each handler so a gate
// bypass — the fail-open path, matcher drift, a route moved outside the
// gated prefixes — can never serve paid features to a signed-in non-member.
//
// Cost model: in normal operation the proxy has ALREADY verified this exact
// request and stamped GATE_STAMP_HEADER on the forwarded request headers
// (spoof-proof: the middleware strips any incoming value on every request),
// so the fast path here is a header read — zero extra queries. The full
// entitlement check runs only when the stamp is absent, i.e. exactly when
// the proxy didn't do its job.
//
// Failure semantics mirror the proxy's availability call: an enforcement
// FAULT (not a verified non-member) fails open with a loud log — two
// independent layers now have to fault simultaneously before a non-member
// reaches a paid feature, without a DB blip 500ing the paid API.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { computeMembership, GATE_STAMP_ACCOUNT, GATE_STAMP_HEADER, GATE_STAMP_VALUE, paidRefusal } from '@/lib/membership-core';

/**
 * Returns null when the caller may use PAID features (an active membership, an approved coach or
 * an admin), or the 401/402/403 response the route should return. A past-due member gets 402
 * `payment_past_due`, anyone else 402 `membership_required`.
 * Call it first in every handler of a paid route:
 *
 *   const denied = await requireMembership(request);
 *   if (denied) return denied;
 */
export async function requireMembership(request: Request): Promise<NextResponse | null> {
  // Fast path: the edge gate verified this request and stamped it.
  if (request.headers.get(GATE_STAMP_HEADER) === GATE_STAMP_VALUE) return null;
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const client = await clientForRequest(request);
    // ⚠ THE ADDRESS'S CONFIRMATION GOES IN. Left out, an admin with no coach role read as a
    // non-member here whenever the proxy's stamp was missing (computeMembership grants an admin
    // only a CONFIRMED allow-listed address).
    const membership = await computeMembership(client, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at });
    const { isMember, isKnownMinor } = membership;
    // Same 18+ refusal as the proxy — this is the per-endpoint half, so it must
    // hold on its own when the proxy stamp is absent.
    if (isKnownMinor) {
      return NextResponse.json({ error: 'Shape is for adults 18 and over.', code: 'age_restricted' }, { status: 403 });
    }
    if (!isMember) return NextResponse.json(paidRefusal(membership), { status: 402 });
    return null;
  } catch (e) {
    console.error('[require-membership] enforcement fault — failing open:', e);
    return null;
  }
}

/**
 * The FREE features' guard (owner, 2026-11-10: an account is free; membership adds assistant
 * Nora, Shape Radio, the AI helpers and the points Store). Returns null for any signed-in adult
 * account, paid or not, or the 401/403 the route should return. Call it first in every handler of
 * a free route under the gated prefixes:
 *
 *   const denied = await requireAccount(request);
 *   if (denied) return denied;
 *
 * Same layering as requireMembership: the edge gate's stamp (either value) is the fast path, and
 * a fault fails open with a loud log.
 */
export async function requireAccount(request: Request): Promise<NextResponse | null> {
  const stamp = request.headers.get(GATE_STAMP_HEADER);
  if (stamp === GATE_STAMP_ACCOUNT || stamp === GATE_STAMP_VALUE) return null;
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const client = await clientForRequest(request);
    const { isKnownMinor } = await computeMembership(client, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at });
    if (isKnownMinor) {
      return NextResponse.json({ error: 'Shape is for adults 18 and over.', code: 'age_restricted' }, { status: 403 });
    }
    return null;
  } catch (e) {
    console.error('[require-account] enforcement fault — failing open:', e);
    return null;
  }
}

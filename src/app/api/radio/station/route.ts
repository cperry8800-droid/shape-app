// src/app/api/radio/station/route.ts
// Station config for the in-app player.
//
// ⚠ MEMBERS ONLY. Shape Radio is a non-interactive webcast we transmit under
// the statutory licence, and the owner's rate classification is SETTLED as
// **subscription only** (docs/legal/compliance-spec.md) — so neither a
// signed-out visitor NOR a free authenticated account is a listener we are
// licensed for. The UI gates were closed first (radio.html starts gated, the
// mobile provider fails closed), but a UI gate is not an access control: this
// route handed `streamUrl` to any anonymous GET, so the stream stayed one curl
// away. Closing anonymous access was only half of it — a free signed-in account
// is exactly the non-subscriber listening the rate ruling forbids.
//
// ⚠ HONEST RESIDUAL — this narrows the exposure, it does not eliminate it. The
// URL points at our provider's public endpoint, so anyone who has already
// resolved it can keep hitting the provider directly; what changes is that
// SHAPE no longer distributes it to unauthenticated callers. Closing it fully
// needs a subscriber-scoped stream token or a proxy in front of the provider,
// which is a provider capability question — tracked, not solved here.
import { NextResponse, type NextRequest } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { refuseKnownMinor } from '@/lib/age-gate';
import { computeMembership } from '@/lib/membership-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) {
    // Deliberately no streamUrl, and no hint about whether a station is
    // configured — an anonymous caller learns nothing about the stream.
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const supabase = await clientForRequest(request);

  // Shape is 18+, no exceptions — and "authenticated" is not "eligible". This
  // route sits outside the paid-prefix gate that carries the age check, so
  // without this a confirmed minor gets the stream URL.
  const minor = await refuseKnownMinor(supabase, user.id);
  if (minor) return minor;

  // ⚠ MEMBERSHIP, AND THIS IS THE ONE PAID CHECK THAT FAILS **CLOSED**.
  // `requireMembership()` is deliberately NOT used here. It fails OPEN on a
  // fault, which is right for every other paid route (a gate fault must never
  // take down the API) and wrong for this one: failing open serves a
  // PERFORMANCE to a possible non-subscriber, which re-opens the $0.0025
  // non-subscription rate and permanently splits SoundExchange reporting.
  // The spec's rule for this surface — the same reason radio.html fails closed
  // to a sign-in gate even when the auth client never loads — is that an
  // unlicensed-tier performance is worse than an unnecessary prompt.
  //
  // ⚠ HOW A FAULT ACTUALLY LANDS, because the two cases differ and the
  // difference is not obvious: `computeMembership` destructures `{ data }` and
  // does NOT read `error`, and the Supabase client RESOLVES rather than throws
  // on a query error. So a query-level fault (RLS denial, bad column, timeout
  // surfaced as an error payload) resolves `isMember: false` and exits via the
  // **402** below — closed, no URL, but indistinguishable from a verified
  // non-member. Only a genuine rejection (network failure, client construction)
  // reaches the catch and the 503. Both are fail-closed, which is the property
  // that matters here; the cost is that a real member during a database blip is
  // told "membership required" instead of "temporarily unavailable". Accepted
  // deliberately over duplicating entitlement logic in this route — the shared
  // helper's fail-OPEN semantics are correct for the proxy and must not change.
  //
  // The over_18 read above is a second `profiles` hit (computeMembership reads
  // it too). Kept deliberately: it makes a minor's 403 outrank a non-member's
  // 402, so an under-18 account is told it is under 18 rather than asked to pay.
  let isMember = false;
  try {
    const membership = await computeMembership(supabase, user.id, user.email ?? null);
    isMember = membership.isMember;
  } catch (e) {
    console.error('[radio/station] membership check faulted — failing CLOSED:', e);
    return NextResponse.json(
      { error: 'Radio is unavailable right now.', code: 'membership_unverified' },
      { status: 503 }
    );
  }
  if (!isMember) {
    return NextResponse.json(
      { error: 'Shape membership required.', code: 'membership_required' },
      { status: 402 }
    );
  }

  const { data } = await supabase
    .from('radio_station')
    .select('provider, station_name, stream_url')
    .eq('id', 1)
    .maybeSingle();
  return NextResponse.json({
    name: data?.station_name || 'Shape Radio',
    streamUrl: data?.stream_url || null,
    provider: data?.provider || 'mock',
    configured: !!data?.stream_url,
  });
}

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
// ⚠ AND THE STATION'S DOOR IS CLOSED TOO (part 3, src/lib/radio/pass.mjs): the stream
// handed out is Shape's own address with a pass signed for this member, good for a
// few hours, and the station lets no listener in without a good one. An address
// someone shared stops working when its pass does.
//
// ⚠ SHAPE'S OWN STATION IS THE ONLY ONE (owner, 2026-11-04: "yes remove radio.co").
// Any other provider stored in radio_station (the placeholder 'mock', or a radio.co
// row from before) is no station: no stream is handed out for it.
//
// ⚠ AND ONLY WHERE THE LICENCES REACH: the US and the UK. A member elsewhere gets
// 451 and no stream; in production a request with no measured country is refused.
import { NextResponse, type NextRequest } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { refuseKnownMinor } from '@/lib/age-gate';
import { computeMembership, paidRefusal } from '@/lib/membership-core';
import { OWN_PROVIDER } from '@/lib/radio/station.mjs';
import { listenUrl, makePass, passKey, regionAllowed } from '@/lib/radio/pass.mjs';

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
  let pastDue = false;
  try {
    const membership = await computeMembership(supabase, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at });
    isMember = membership.isMember;
    pastDue = membership.pastDue;
  } catch (e) {
    console.error('[radio/station] membership check faulted — failing CLOSED:', e);
    return NextResponse.json(
      { error: 'Radio is unavailable right now.', code: 'membership_unverified' },
      { status: 503 }
    );
  }
  // ⚠ AN ACTIVE MEMBERSHIP ONLY (owner, 2026-11-10): no trial, and a past-due member is told to
  // update their card (`payment_past_due`), not to join.
  if (!isMember) return NextResponse.json(paidRefusal({ pastDue }), { status: 402 });

  // The territory: the country Vercel measured for this request.
  const region = regionAllowed(request.headers.get('x-vercel-ip-country'), { production: process.env.NODE_ENV === 'production' });
  if (!region.ok) {
    return NextResponse.json(
      { error: 'Shape Radio isn’t available in your region yet.', code: region.reason },
      { status: 451, headers: { 'cache-control': 'no-store' } }
    );
  }

  // ⚠ THE QUERY ERROR IS READ, AND DROPPING IT MANUFACTURED A FALSE 200 (Codex,
  // #2101 round 4). The Supabase client RESOLVES rather than throws on a query
  // fault — a statement timeout, an RLS change, a column that moved — so
  // destructuring `{ data }` alone turned every one of those into `data: null`
  // and answered **200 with configured:false**. That is not "there is no station";
  // it is "we could not look", published with the authority of a successful
  // response, and no client guard can tell the two apart because the status says
  // everything went fine. The web player then printed "No station on the air yet".
  //
  // This is the same class the header above documents for computeMembership — the
  // file explains the trap about one query and then walked into it on the next.
  // 503 rather than 200, so the caller lands on the unavailable path it already
  // has, and fail-closed stays fail-closed: no URL either way.
  const { data, error } = await supabase
    .from('radio_station')
    .select('provider, station_name, stream_url')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    console.error('[radio/station] station lookup failed — failing CLOSED:', error.message);
    return NextResponse.json(
      { error: 'Radio is unavailable right now.', code: 'station_unavailable' },
      { status: 503 }
    );
  }
  // Shape's own station: the stream is Shape's own address, with this member's pass on it
  // (/api/radio/listen checks the pass and the listener's country at every connection, and
  // sends the player on to the station with a short ticket); the station's own address is
  // never handed out. No key, no pass, and no stream either: the station would refuse it,
  // so the player says it could not reach the station rather than playing nothing.
  const own = data?.provider === OWN_PROVIDER && !!data?.stream_url;
  let streamUrl: string | null = null;
  let passExpiresAt: string | null = null;
  if (own) {
    const key = passKey();
    const issued = key ? makePass({ userId: user.id, now: Date.now(), key }) : null;
    if (!issued) {
      console.error('[radio/station] no key to sign a stream pass with — failing CLOSED');
      return NextResponse.json(
        { error: 'Radio is unavailable right now.', code: 'station_unavailable' },
        { status: 503 }
      );
    }
    streamUrl = listenUrl(new URL(request.url).origin, issued.pass);
    passExpiresAt = issued.expiresAt;
  }
  return NextResponse.json(
    {
      name: data?.station_name || 'Shape Radio',
      streamUrl,
      provider: own ? OWN_PROVIDER : 'mock',
      configured: own,
      ...(passExpiresAt ? { passExpiresAt } : {}),
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}

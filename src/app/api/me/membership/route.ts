// "Is this account a Shape member?" — the same answer the membership gate gives
// (membership-core.ts), for screens that need to know BEFORE they draw: the website's client
// dashboard shows the $5 join panel instead of demo data, and the app shows its paywall.
//
// ⚠ /api/stripe/subscription CANNOT ANSWER THIS. It reads `platform_subscriptions` only, so an
// approved coach or an admin reads as inactive, and it turns a failed read into
// `{ active: false }`, which a screen cannot tell apart from a confirmed non-member.
//
// 200 { signedIn: false } signed out · 200 { signedIn: true, member, coach, ageRestricted, pastDue,
// status, includedWithCoach, nora, noraPreview } · 503 when we could not find out (callers then keep
// whatever they were showing).
// `member` is the PAID features (an active membership, an approved coach or an admin): every
// signed-in adult account has the free ones (owner, 2026-11-10). `pastDue` says the membership's
// renewal failed, so a screen can say "update your card" instead of "join".

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { computeMembership, readNoraPreview } from '@/lib/membership-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    const user = await currentUser(request);
    if (!user) return NextResponse.json({ signedIn: false }, { headers: NO_STORE });
    const client = await clientForRequest(request);
    const [m, week] = await Promise.all([
      computeMembership(client, user.id, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at, strict: true }),
      // The free week of Nora (2026-11-10-nora-free-week.sql); before that migration, none. ⚠ A read
      // that failed is no answer (Codex P2 on #2675): `nora: false` from it would take an active free
      // week away in the app, so it is the 503, and clients keep what they last knew.
      readNoraPreview(client, user.id, { strict: true }),
    ]);
    // `nora`: assistant Nora now, a member's or the free week's.
    return NextResponse.json(
      {
        signedIn: true, member: m.isMember, coach: m.isCoach, ageRestricted: m.isKnownMinor, pastDue: m.pastDue,
        status: m.platformStatus, includedWithCoach: m.includedWithCoach,
        nora: m.isMember || (!m.isKnownMinor && !!week?.active), noraPreview: week,
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error('[me/membership] lookup failed', err);
    return NextResponse.json({ unknown: true }, { status: 503, headers: NO_STORE });
  }
}

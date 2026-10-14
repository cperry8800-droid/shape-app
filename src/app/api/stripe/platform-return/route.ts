// Where Stripe sends a member after the $5 membership checkout. It confirms the session with
// Stripe, writes the member's row if the subscription is live (platform-membership.ts says why
// this cannot wait for the webhook), and continues to `next` with `member=joined`, or
// `member=pending` when the subscription is not live yet or Stripe could not be read. The
// webhook still writes the same row either way.

import { NextResponse } from 'next/server';
import { confirmPlatformCheckout, MEMBERSHIP_HOME } from '@/lib/platform-membership';
import { appendParam, sameOriginPath } from '@/lib/return-path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SESSION_ID = /^cs_[A-Za-z0-9_]{8,255}$/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = sameOriginPath(url.searchParams.get('next'), MEMBERSHIP_HOME);
  const sessionId = url.searchParams.get('session_id') ?? '';
  let state: 'joined' | 'pending' = 'pending';
  if (SESSION_ID.test(sessionId)) {
    try {
      state = (await confirmPlatformCheckout(sessionId)) === 'active' ? 'joined' : 'pending';
    } catch (err) {
      console.error('[shape-app] platform-return could not confirm the session', { sessionId, err });
    }
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  return NextResponse.redirect(`${origin}${appendParam(next, 'member', state)}`, 303);
}

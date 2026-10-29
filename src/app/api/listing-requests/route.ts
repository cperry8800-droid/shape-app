// POST: ask a coach who isn't on Shape yet for one of their sample times (src/lib/listing-requests.ts).
//
// The caller's account, never the body, says who asked: the app sends a Bearer token and the website
// its cookie (request-auth.ts). Members have no write on listing_time_requests: this route is the one
// way in. It checks the ask, then stores it through add_listing_time_request (service role), which
// makes every other check in the transaction that inserts (2026-10-29-listing-time-requests.sql):
//   - The listing exists and has no owner: a coach on Shape is booked on their listing. Its row is
//     held until the insert commits, so a claim either sees the ask or the ask sees the claim.
//   - The same time asked twice is the same ask, answered as done, before any cap.
//   - A member asks at most 10 times a day, and has at most 3 times waiting on one listing; one
//     member's asks are stored one at a time, so asks sent together can't pass a cap.
//   - The time is 15 minutes to 60 days off, the call 5 to 240 minutes, the note 500 characters
//     (readListingAsk, here).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/request-auth';
import { dbError, readJson } from '@/lib/request-utils';
import { ASKS_PER_DAY, ASKS_PER_LISTING, readListingAsk, tellOwnersOfAsk } from '@/lib/listing-requests';

export const dynamic = 'force-dynamic';

type Stored = { outcome?: string; ask_id?: string | null; coach?: string | null };

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to ask for a time.', code: 'signed_out' }, { status: 401 });

  const parsed = await readJson<Record<string, unknown>>(request, { maxBytes: 8_000 });
  if (!parsed.ok) return parsed.response;
  const read = readListingAsk(parsed.data, Date.now());
  if (!read.ok) return NextResponse.json({ error: read.error, code: read.code }, { status: 400 });
  const ask = read.value;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('add_listing_time_request', {
    p_role: ask.role,
    p_provider_id: ask.providerId,
    p_member_id: user.id,
    p_slot_start: ask.slotStart,
    p_duration_min: ask.durationMin,
    p_note: ask.note,
    p_per_day: ASKS_PER_DAY,
    p_per_listing: ASKS_PER_LISTING,
  });
  if (error) return dbError(error, 'listing-requests store');
  const stored = ((Array.isArray(data) ? data[0] : data) || {}) as Stored;
  const coach = String(stored.coach || '').trim();
  switch (stored.outcome) {
    case 'added':
      break;
    case 'already':
      return NextResponse.json({ ok: true, already: true });
    case 'no_listing':
      return NextResponse.json({ error: 'That coach is no longer listed.', code: 'no_listing' }, { status: 404 });
    case 'claimed':
      return NextResponse.json({ error: `${coach || 'This coach'} is on Shape now. Book a time on their listing.`, code: 'claimed' }, { status: 409 });
    case 'daily_cap':
      return NextResponse.json({ error: "You've asked for a lot of times today. Try again tomorrow.", code: 'daily_cap' }, { status: 429 });
    case 'too_many':
      return NextResponse.json({ error: `You've asked ${coach || 'this coach'} for ${ASKS_PER_LISTING} times already. You'll hear back when they join.`, code: 'too_many' }, { status: 409 });
    default:
      return dbError({ message: `unexpected outcome ${String(stored.outcome)}` }, 'listing-requests store');
  }
  if (!stored.ask_id) return dbError({ message: 'no ask id' }, 'listing-requests store');

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const member = String((profile as { full_name?: string | null } | null)?.full_name || '').trim();
  await tellOwnersOfAsk(admin, String(stored.ask_id), ask, user.id, member, coach);
  return NextResponse.json({ ok: true });
}

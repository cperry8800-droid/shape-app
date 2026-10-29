// POST: ask a coach who isn't on Shape yet for one of their sample times (src/lib/listing-requests.ts).
//
// The caller's account, never the body, says who asked: the app sends a Bearer token and the website
// its cookie (request-auth.ts). The row is written with the service role, since members have no
// write on listing_time_requests: this route is the one way in, so its checks hold.
//   - The listing exists and has no owner: a coach on Shape is booked on their listing.
//   - The time is 15 minutes to 60 days off, the call 5 to 240 minutes, the note 500 characters.
//   - A member asks at most 10 times a day, and has at most 3 times waiting on one listing.
// The same time asked twice is the same ask (the table's unique key), answered as done.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { currentUser } from '@/lib/request-auth';
import { dbError, readJson } from '@/lib/request-utils';
import { ASKS_PER_DAY, ASKS_PER_LISTING, readListingAsk, tellOwnersOfAsk } from '@/lib/listing-requests';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to ask for a time.', code: 'signed_out' }, { status: 401 });

  const parsed = await readJson<Record<string, unknown>>(request, { maxBytes: 8_000 });
  if (!parsed.ok) return parsed.response;
  const now = Date.now();
  const read = readListingAsk(parsed.data, now);
  if (!read.ok) return NextResponse.json({ error: read.error, code: read.code }, { status: 400 });
  const ask = read.value;

  const admin = createAdminClient();
  const { data: listing, error: listingError } = await admin
    .from(ask.role === 'nutritionist' ? 'nutritionists' : 'trainers')
    .select('id, name, owner_id')
    .eq('id', ask.providerId)
    .maybeSingle();
  if (listingError) return dbError(listingError, 'listing-requests listing read');
  const row = listing as { name?: string | null; owner_id?: string | null } | null;
  if (!row) return NextResponse.json({ error: 'That coach is no longer listed.', code: 'no_listing' }, { status: 404 });
  const coach = String(row.name || '').trim();
  if (row.owner_id) {
    return NextResponse.json({ error: `${coach || 'This coach'} is on Shape now. Book a time on their listing.`, code: 'claimed' }, { status: 409 });
  }

  const [today, waiting] = await Promise.all([
    admin.from('listing_time_requests').select('id', { count: 'exact', head: true })
      .eq('member_id', user.id).gte('created_at', new Date(now - 86_400_000).toISOString()),
    admin.from('listing_time_requests').select('id', { count: 'exact', head: true })
      .eq('member_id', user.id).eq('provider_role', ask.role).eq('provider_id', ask.providerId).gte('slot_start', new Date(now).toISOString()),
  ]);
  if (today.error || waiting.error) return dbError(today.error || waiting.error, 'listing-requests caps read');
  if ((today.count ?? 0) >= ASKS_PER_DAY) {
    return NextResponse.json({ error: "You've asked for a lot of times today. Try again tomorrow.", code: 'daily_cap' }, { status: 429 });
  }
  if ((waiting.count ?? 0) >= ASKS_PER_LISTING) {
    return NextResponse.json({ error: `You've asked ${coach || 'this coach'} for ${ASKS_PER_LISTING} times already. You'll hear back when they join.`, code: 'too_many' }, { status: 409 });
  }

  const { data: inserted, error: insertError } = await admin
    .from('listing_time_requests')
    .insert({ provider_role: ask.role, provider_id: ask.providerId, member_id: user.id, slot_start: ask.slotStart, duration_min: ask.durationMin, note: ask.note })
    .select('id')
    .single();
  if (insertError) {
    // 23505: this member asked for this very time already. The ask stands; say it is done.
    if ((insertError as { code?: string }).code === '23505') return NextResponse.json({ ok: true, already: true });
    return dbError(insertError, 'listing-requests insert');
  }

  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  const member = String((profile as { full_name?: string | null } | null)?.full_name || '').trim();
  await tellOwnersOfAsk(admin, String((inserted as { id: string }).id), ask, user.id, member, coach);
  return NextResponse.json({ ok: true });
}

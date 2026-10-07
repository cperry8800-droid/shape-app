// Public endpoint to read a coach's weekly availability slots, used by
// the consultation page to render real open times instead of randomly
// marking some as unavailable.
//
// ⚠ `timezone` IS PART OF THE ANSWER, NOT A NICETY. provider_availability.start_minute
// is a bare wall-clock minute in the COACH's local day (the table's own migration says
// so), so a consumer holding only slots+booked cannot turn one into an instant without
// inventing a zone — and until 2026-09-11 the three live consumers invented three
// different ones. Every reader now needs this field, and a coach who has none offers no
// bookable hours rather than being read as UTC.

//
// ⚠ AND `busy` + `rules` ARE WHAT KEEPS THE OFFER HONEST (2026-10-07, Schedule step 3). The
// member routes refuse a time during the coach's time off, inside their buffer, past their daily
// limit or sooner than their notice (bookingRules.checkSlot). bookingSlots.buildSlots drops those
// same times when it is handed these two, so a member is never shown a time the route refuses.
//
// ⚠ `booked` USED TO COME BACK EMPTY FOR ALMOST EVERYONE. It read `sessions` through the visitor's
// own client, and RLS lets a reader see only their own sessions or ones booked against a provider
// row they own, so a signed-out visitor or another member saw no bookings and every taken hour
// was offered as open. provider_busy_blocks is a definer read that says WHEN a coach is busy and
// nothing else, so `booked` now comes from it too.
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeZone } from '@/lib/time';
import { isMissingRelation } from '@/lib/owned-provider';
import { BUSY_READ_MAX_DAYS, normalizeRules } from '../../../../public/newdesign/bookingRules.mjs';

const DAY_MS = 86_400_000;
// A day back (today's earlier sessions count toward the daily limit) and as far ahead as the
// busy read allows. The consultation page shows 28 days and the Team page 14.
const BACK_DAYS = 1;
const AHEAD_DAYS = BUSY_READ_MAX_DAYS - BACK_DAYS - 1;

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const role = (url.searchParams.get('role') ?? '').toLowerCase();
  const idRaw = Number(url.searchParams.get('id') ?? 0);
  if (role !== 'trainer' && role !== 'nutritionist') {
    return NextResponse.json({ error: 'invalid role' }, { status: 400 });
  }
  if (!idRaw || !Number.isFinite(idRaw)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const supabase = await createClient();
  const nowMs = Date.now();
  const [{ data: slots }, busyRes, rulesRes, { data: pro }] = await Promise.all([
    supabase
      .from('provider_availability')
      .select('weekday, start_minute, duration_min')
      .eq('provider_role', role)
      .eq('provider_id', idRaw)
      .order('weekday', { ascending: true })
      .order('start_minute', { ascending: true }),
    supabase.rpc('provider_busy_blocks', {
      p_role: role,
      p_provider_id: idRaw,
      p_from: new Date(nowMs - BACK_DAYS * DAY_MS).toISOString(),
      p_to: new Date(nowMs + AHEAD_DAYS * DAY_MS).toISOString(),
    }),
    supabase
      .from('provider_booking_rules')
      .select('buffer_min, max_per_day, min_notice_hours')
      .eq('provider_role', role)
      .eq('provider_id', idRaw)
      .maybeSingle(),
    // ⚠ `select('*')` IS MIGRATION-SAFE: naming `timezone` errors the WHOLE query on a
    // pre-migration database, which would take the coach's open hours down with it
    // instead of degrading to an unknown zone. The house pattern (trainer/dashboard,
    // trainer/analytics) for exactly this reason. Both tables are public-read, so an
    // anonymous consultation visitor can resolve the zone it needs to label a slot.
    supabase
      .from(role === 'trainer' ? 'trainers' : 'nutritionists')
      .select('*')
      .eq('id', idRaw)
      .maybeSingle(),
  ]);

  // ⚠ A FAILED BUSY OR RULES READ FAILS THE ANSWER, NEVER SHORTENS IT. An empty busy list reads
  // as a free calendar and default rules as no time off and no limits, which is the one error
  // this read must never make: the pages show "couldn't load" instead. Only "not set up yet" (a
  // database without the 2026-10-07 migration) answers with nothing busy and the defaults.
  if (busyRes.error && !isMissingRelation(busyRes.error)) {
    return NextResponse.json({ error: "This coach's calendar couldn't be read." }, { status: 503 });
  }
  if (rulesRes.error && !isMissingRelation(rulesRes.error)) {
    return NextResponse.json({ error: "This coach's calendar couldn't be read." }, { status: 503 });
  }
  type Busy = { starts_at: string; ends_at: string; kind: string };
  const busy = ((busyRes.error ? [] : busyRes.data ?? []) as Busy[]).map((b) => ({ start: b.starts_at, end: b.ends_at, kind: b.kind }));

  return NextResponse.json({
    slots: slots ?? [],
    // Upcoming session starts, the list every older caller reads (the app's coachAvailability.mjs).
    booked: busy.filter((b) => b.kind === 'session' && Date.parse(b.end) > nowMs).map((b) => b.start),
    busy,
    rules: normalizeRules(rulesRes.error ? null : rulesRes.data),
    // null means "we cannot place these hours" — never a defaulted UTC, which is the
    // defect this field exists to close.
    timezone: normalizeZone((pro as { timezone?: unknown } | null)?.timezone),
  });
}

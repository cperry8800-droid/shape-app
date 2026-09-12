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

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeZone } from '@/lib/time';

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
  const [{ data: slots }, { data: booked }, { data: pro }] = await Promise.all([
    supabase
      .from('provider_availability')
      .select('weekday, start_minute, duration_min')
      .eq('provider_role', role)
      .eq('provider_id', idRaw)
      .order('weekday', { ascending: true })
      .order('start_minute', { ascending: true }),
    supabase
      .from('sessions')
      .select('scheduled_at, status')
      .eq('provider_role', role)
      .eq('provider_id', idRaw)
      .in('status', ['requested', 'confirmed'])
      .gte('scheduled_at', new Date().toISOString()),
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

  return NextResponse.json({
    slots: slots ?? [],
    booked: (booked ?? []).map((b) => b.scheduled_at),
    // null means "we cannot place these hours" — never a defaulted UTC, which is the
    // defect this field exists to close.
    timezone: normalizeZone((pro as { timezone?: unknown } | null)?.timezone),
  });
}

// Public endpoint to read a coach's weekly availability slots, used by
// the consultation page to render real open times instead of randomly
// marking some as unavailable.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  const [{ data: slots }, { data: booked }] = await Promise.all([
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
  ]);

  return NextResponse.json({
    slots: slots ?? [],
    booked: (booked ?? []).map((b) => b.scheduled_at),
  });
}

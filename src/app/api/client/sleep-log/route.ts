// Manual sleep entry — makes "Log last night's sleep" real.
// When a client logs sleep (the home recovery directive's one-tap sheet), the
// hours are written to today's daily_health_snapshot.sleep_hours (unique on
// user_id + snapshot_date) — the same column the device-sync writers
// (HealthKit/Whoop/Oura/Garmin) and the recovery-readiness signals read. Unlike
// meal macros this SETS the value (a nightly figure, not additive) and merges
// with any device-synced metrics for the day rather than overwriting them.
//
// POST { hours, date? } -> { ok, day }
// `date` is the client's local YYYY-MM-DD (an early-morning log buckets to the
// user's calendar day, not UTC's); falls back to the server's UTC date.
// Auth: cookie session OR Bearer token. Under /api/client so the membership
// proxy gate applies.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { clientLocalDay } from '@/lib/local-day';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data as Record<string, unknown>;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return NextResponse.json({ error: 'Enter sleep between 0 and 24 hours.' }, { status: 400 });
  }
  const sleepHours = Math.round(hours * 100) / 100;

  const supabase = await clientForRequest(request);
  const today = clientLocalDay(body.date);

  const { data: existing } = await supabase
    .from('daily_health_snapshot')
    .select('snapshot_date')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();

  const result = existing
    ? await supabase.from('daily_health_snapshot').update({ sleep_hours: sleepHours }).eq('user_id', user.id).eq('snapshot_date', today)
    : await supabase.from('daily_health_snapshot').insert({ user_id: user.id, snapshot_date: today, sleep_hours: sleepHours });
  if (result.error) {
    return dbError(result.error, 'sleep log write', 500);
  }
  return NextResponse.json({ ok: true, day: today });
}

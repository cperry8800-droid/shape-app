// Daily check-in write — lets a client log today's mood, energy, hunger
// (and optional stress / soreness) from the home Mood card. Upserts today's
// daily_health_snapshot row (unique on user_id + snapshot_date), so it merges
// with any device-synced metrics for the day rather than overwriting them.
//
// POST { mood?, energy?, hunger?, stress?, soreness?, date? }  -> { ok, mood, energy, hunger }
// At least one of mood/energy/hunger/stress/soreness is required.
// `date` is the client's local YYYY-MM-DD (buckets to the user's calendar day,
// not UTC's); falls back to the server's UTC date.
// Auth: cookie session OR Bearer token (mobile bridges either).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { clientLocalDay } from '@/lib/local-day';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clamp1to10(v: unknown): number | null {
  // null/undefined/empty/boolean = "field absent" — the daily card submits the
  // unset row as null, and Number(null) is 0, which would otherwise clamp to 1
  // and write a rating the user never set. Treat all non-numeric inputs as absent.
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10, n));
}

// Sleep duration is continuous (not a 1-10 rating). Accept a JSON number in
// (0, 24]; anything else (null/string/boolean/out-of-range) → absent.
function sleepHoursOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 24) return null;
  return Math.round(v * 100) / 100;
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const mood = clamp1to10((body as Record<string, unknown>).mood);
  const energy = clamp1to10((body as Record<string, unknown>).energy);
  const hunger = clamp1to10((body as Record<string, unknown>).hunger);
  const stress = clamp1to10((body as Record<string, unknown>).stress);
  const soreness = clamp1to10((body as Record<string, unknown>).soreness);
  const sleepHours = sleepHoursOrNull((body as Record<string, unknown>).sleepHours);
  const sleepQuality = clamp1to10((body as Record<string, unknown>).sleepQuality);
  if (mood == null && energy == null && hunger == null && stress == null && soreness == null && sleepHours == null && sleepQuality == null) {
    return NextResponse.json({ error: 'Nothing to log.' }, { status: 400 });
  }

  const supabase = await clientForRequest(request);
  const today = clientLocalDay((body as Record<string, unknown>).date);

  const { data: existing } = await supabase
    .from('daily_health_snapshot')
    .select('id')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (mood != null) patch.mood = mood;
  if (energy != null) patch.energy = energy;
  if (hunger != null) patch.hunger = hunger;
  if (stress != null) patch.stress = stress;
  if (soreness != null) patch.soreness = soreness;
  if (sleepHours != null) patch.sleep_hours = sleepHours;
  if (sleepQuality != null) patch.sleep_quality = sleepQuality;

  if (existing && (existing as { id: string }).id) {
    const { error } = await supabase
      .from('daily_health_snapshot')
      .update(patch)
      .eq('id', (existing as { id: string }).id);
    if (error) return dbError(error, 'checkin write', 500);
  } else {
    const { error } = await supabase
      .from('daily_health_snapshot')
      .insert({ user_id: user.id, snapshot_date: today, ...patch });
    if (error) return dbError(error, 'checkin write', 500);
  }

  return NextResponse.json({ ok: true, mood, energy, hunger, sleepHours, sleepQuality });
}

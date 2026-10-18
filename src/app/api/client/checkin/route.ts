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
import { requireMembership } from '@/lib/require-membership';

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
  const denied = await requireMembership(request);
  if (denied) return denied;
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
    .select('id, sleep_hours')
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

  // ⚠ HOURS THE MEMBER TYPED OVER A WATCH'S NIGHT ARE THEIRS (Codex P2 on #2398). A device sync
  // stamps `sources.sleep_hours`, and the Home check-in reads that stamp as "a watch's night":
  // read-only, and never copied by Same as yesterday. So when this write changes the night's
  // hours, the stamp says "manual". The Details page re-sends a watch's own hours on every Log;
  // the same value keeps the watch's stamp.
  let typedOverNight = false;
  if (existing && (existing as { id: string }).id) {
    const { error } = await supabase
      .from('daily_health_snapshot')
      .update(patch)
      .eq('id', (existing as { id: string }).id);
    if (error) return dbError(error, 'checkin write', 500);
    const before = (existing as { sleep_hours?: unknown }).sleep_hours;
    typedOverNight = sleepHours != null && before != null && Number(before) !== sleepHours;
  } else {
    const { error } = await supabase
      .from('daily_health_snapshot')
      .insert({ user_id: user.id, snapshot_date: today, ...patch });
    // ⚠ ANOTHER WRITE CAN MAKE TODAY'S ROW BETWEEN THE READ AND THIS INSERT: a glass of water
    // (its own save line on the Home card), a watch sync, a meal log. The insert then hits the
    // unique (user_id, snapshot_date) key, and the answer is written to that row instead.
    if (error && error.code === '23505') {
      const { error: again } = await supabase
        .from('daily_health_snapshot')
        .update(patch)
        .eq('user_id', user.id)
        .eq('snapshot_date', today);
      if (again) return dbError(again, 'checkin write', 500);
      typedOverNight = sleepHours != null; // the row the other write made may hold a watch's night
    } else if (error) return dbError(error, 'checkin write', 500);
  }
  if (typedOverNight) {
    // The hours are saved either way; a failed stamp only leaves the night labelled as the watch's.
    const { error } = await supabase.rpc('merge_snapshot_sources', { p_user_id: user.id, p_date: today, p_sources: { sleep_hours: 'manual' } });
    if (error) console.error('[shape-api] checkin sleep source:', error.message || error);
  }

  return NextResponse.json({ ok: true, mood, energy, hunger, sleepHours, sleepQuality });
}

// Daily check-in write — lets a client log today's mood, energy, hunger
// (and optional stress / soreness) from the home Mood card. Upserts today's
// daily_health_snapshot row (unique on user_id + snapshot_date), so it merges
// with any device-synced metrics for the day rather than overwriting them.
//
// POST { mood?, energy?, hunger?, stress?, soreness?, sleepHours?, sleepQuality?, sleepSkipped?, date? }
//   -> { ok, mood, energy, hunger, sleepHours, sleepFromDevice, sleepQuality, sleepSkipped }
// At least one field is required. `sleepHours` in the answer is the night that stands: a
// watch's, when one wrote it (`sleepFromDevice`), else the member's.
// `sleepSkipped: true` records that the member skipped the night in the Morning check-in, so the
// reminder can tell a skipped night from an unanswered one (owner, 2026-10-19). Only `true` counts.
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
  const sleepSkipped = (body as Record<string, unknown>).sleepSkipped === true;
  if (mood == null && energy == null && hunger == null && stress == null && soreness == null && sleepHours == null && sleepQuality == null && !sleepSkipped) {
    return NextResponse.json({ error: 'Nothing to log.' }, { status: 400 });
  }

  const supabase = await clientForRequest(request);
  const today = clientLocalDay((body as Record<string, unknown>).date);

  const { data: existing } = await supabase
    .from('daily_health_snapshot')
    .select('id, sleep_hours, sources')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();

  // Everything but the night's hours: the member's own answers, written as given.
  const patch: Record<string, unknown> = {};
  if (mood != null) patch.mood = mood;
  if (energy != null) patch.energy = energy;
  if (hunger != null) patch.hunger = hunger;
  if (stress != null) patch.stress = stress;
  if (soreness != null) patch.soreness = soreness;
  if (sleepQuality != null) patch.sleep_quality = sleepQuality;
  if (sleepSkipped) patch.sleep_skipped = true;

  // ⚠ A WATCH'S NIGHT COMES FIRST (owner, 2026-10-18: "Use the data from smart device priority
  // of the member has one, if not manual entry"; "just use smart device data that matches what we
  // are asking for"). The night's hours are the one check a device measures; energy, hunger and
  // Rested are the member's own. A device sync stamps `sources.sleep_hours` with its provider
  // (upsertSnapshot), so typed hours are written only to a night no device has written, and in one
  // conditional statement, so a sync that lands after the read above is never written over. A
  // night stamped 'manual' (by an earlier build) is a typed one, and a stamp with no hours is no
  // night at all. The answer says which hours stand.
  const byDevice = (r: { sleep_hours?: unknown; sources?: unknown } | null) => {
    if (!r || r.sleep_hours == null) return false;
    const src = r.sources;
    const by = src && typeof src === 'object' ? (src as Record<string, unknown>).sleep_hours : null;
    return typeof by === 'string' && by !== '' && by !== 'manual';
  };
  let standingHours: number | null = sleepHours;
  let sleepFromDevice = false;
  let sleepWritten = false;

  const row = existing as { id?: string; sleep_hours?: unknown; sources?: unknown } | null;
  if (row && row.id) {
    if (Object.keys(patch).length) {
      const { error } = await supabase
        .from('daily_health_snapshot')
        .update(patch)
        .eq('id', row.id);
      if (error) return dbError(error, 'checkin write', 500);
    }
  } else {
    const { error } = await supabase
      .from('daily_health_snapshot')
      .insert({ user_id: user.id, snapshot_date: today, ...patch, ...(sleepHours != null ? { sleep_hours: sleepHours } : {}) });
    if (!error) sleepWritten = true;
    // ⚠ ANOTHER WRITE CAN MAKE TODAY'S ROW BETWEEN THE READ AND THIS INSERT: a glass of water
    // (its own save line on the Home card), a watch sync, a meal log. The insert then hits the
    // unique (user_id, snapshot_date) key, and the answers are written to that row instead (the
    // night through the conditional write below, since that row may hold a watch's night).
    else if (error.code === '23505') {
      if (Object.keys(patch).length) {
        const { error: again } = await supabase
          .from('daily_health_snapshot')
          .update(patch)
          .eq('user_id', user.id)
          .eq('snapshot_date', today);
        if (again) return dbError(again, 'checkin write', 500);
      }
    } else return dbError(error, 'checkin write', 500);
  }

  if (sleepHours != null && !sleepWritten) {
    if (byDevice(row)) {
      sleepFromDevice = true;
      standingHours = Number(row!.sleep_hours);
    } else {
      const { data: wrote, error } = await supabase
        .from('daily_health_snapshot')
        .update({ sleep_hours: sleepHours })
        .eq('user_id', user.id)
        .eq('snapshot_date', today)
        .or('sleep_hours.is.null,sources->>sleep_hours.is.null,sources->>sleep_hours.eq.manual')
        .select('id');
      if (error) return dbError(error, 'checkin write', 500);
      if (!Array.isArray(wrote) || wrote.length === 0) {
        // A watch wrote the night after the read above: its hours stand. No row, or a row
        // with no watch's night, means the hours were not saved at all.
        const { data: now } = await supabase
          .from('daily_health_snapshot')
          .select('sleep_hours, sources')
          .eq('user_id', user.id)
          .eq('snapshot_date', today)
          .maybeSingle();
        const after = now as { sleep_hours?: unknown; sources?: unknown } | null;
        if (!byDevice(after)) {
          return NextResponse.json({ error: 'The night was not saved.' }, { status: 500 });
        }
        sleepFromDevice = true;
        standingHours = Number(after!.sleep_hours);
      }
    }
  }

  return NextResponse.json({ ok: true, mood, energy, hunger, sleepHours: standingHours, sleepFromDevice, sleepQuality, sleepSkipped });
}

// Daily check-in write — lets a client log today's mood (and optional
// stress / soreness) from the home Mood card. Upserts today's
// daily_health_snapshot row (unique on user_id + snapshot_date), so it merges
// with any device-synced metrics for the day rather than overwriting them.
//
// POST { mood (1-10), stress?, soreness? }  -> { ok, mood }
// Auth: cookie session OR Bearer token (mobile bridges either).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clamp1to10(v: unknown): number | null {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10, n));
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const mood = clamp1to10((body as Record<string, unknown>).mood);
  if (mood == null) return NextResponse.json({ error: 'A mood from 1–10 is required.' }, { status: 400 });
  const stress = clamp1to10((body as Record<string, unknown>).stress);
  const soreness = clamp1to10((body as Record<string, unknown>).soreness);

  const supabase = await clientForRequest(request);
  const today = new Date().toISOString().slice(0, 10);

  // Merge into today's row: read existing first so we only set the check-in
  // fields and never clobber synced metrics (calories, sleep, etc.).
  const { data: existing } = await supabase
    .from('daily_health_snapshot')
    .select('id')
    .eq('user_id', user.id)
    .eq('snapshot_date', today)
    .maybeSingle();

  const patch: Record<string, unknown> = { mood };
  if (stress != null) patch.stress = stress;
  if (soreness != null) patch.soreness = soreness;

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

  return NextResponse.json({ ok: true, mood });
}

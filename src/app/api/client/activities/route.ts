// Activities for the signed-in client — typed log (tennis, pilates, rowing,
// golf, stairmaster, run, …) from connected devices OR manual entry.
//
// GET  -> { activities: [...recent], breakdown: [{type,count,minutes}], totalMinutes }
// POST -> log a manual activity { activityType, durationMin, distanceKm?,
//         calories?, startedAt?, title? }; inserts source='manual' and awards
//         Shape Score (category 'workouts').
//
// Auth: cookie session OR Bearer token (mobile bridges either).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson, dbError } from '@/lib/request-utils';
import { requireMembership } from '@/lib/require-membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ActivityRow = {
  id: string; source: string; activity_type: string; title: string | null;
  started_at: string | null; duration_min: number | null; distance_km: number | null;
  calories: number | null; strain: number | null;
};

export async function GET(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  // A coach may pass ?clientId=<uuid> to read one of their subscribers'
  // activities. The activities provider-read RLS policy only returns rows when
  // the caller is actually an active coach on that client, so passing someone
  // else's id just yields an empty set — no extra auth check needed here.
  const url = new URL(request.url);
  const clientId = clean(url.searchParams.get('clientId'), 64);
  const targetUserId = clientId || user.id;

  const { data, error } = await supabase
    .from('activities')
    .select('id, source, activity_type, title, started_at, duration_min, distance_km, calories, strain')
    .eq('user_id', targetUserId)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) return NextResponse.json({ activities: [], breakdown: [], totalMinutes: 0 });

  const rows = (data ?? []) as ActivityRow[];

  // Shape Score per activity: prefer the real ledger entry (manual logs award
  // points on create); otherwise compute the same formula so device-synced
  // activities show the points they'd earn (1 pt / 5 min, clamped 2–20).
  const ids = rows.map(r => r.id);
  const ledgerByActivity = new Map<string, number>();
  if (ids.length) {
    const { data: led } = await supabase
      .from('score_ledger')
      .select('source_id, delta')
      .eq('user_id', targetUserId)
      .eq('source_kind', 'activity')
      .in('source_id', ids);
    for (const l of (led ?? []) as { source_id: string; delta: number }[]) {
      ledgerByActivity.set(l.source_id, (ledgerByActivity.get(l.source_id) || 0) + (l.delta || 0));
    }
  }
  const pointsFor = (r: ActivityRow) => {
    if (ledgerByActivity.has(r.id)) return ledgerByActivity.get(r.id);
    return Math.max(2, Math.min(20, Math.round((r.duration_min || 10) / 5)));
  };

  const activities = rows.map(r => ({
    id: r.id, source: r.source, type: r.activity_type, title: r.title ?? r.activity_type,
    startedAt: r.started_at, durationMin: r.duration_min, distanceKm: r.distance_km,
    calories: r.calories, strain: r.strain, points: pointsFor(r),
  }));

  // Breakdown by type over the last 30 days.
  const cutoff = Date.now() - 30 * 86_400_000;
  const byType = new Map<string, { count: number; minutes: number }>();
  let totalMinutes = 0;
  for (const r of rows) {
    if (r.started_at && new Date(r.started_at).getTime() < cutoff) continue;
    const slot = byType.get(r.activity_type) || { count: 0, minutes: 0 };
    slot.count += 1;
    slot.minutes += r.duration_min || 0;
    byType.set(r.activity_type, slot);
    totalMinutes += r.duration_min || 0;
  }
  const breakdown = [...byType.entries()]
    .map(([type, v]) => ({ type, count: v.count, minutes: v.minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  return NextResponse.json({ activities, breakdown, totalMinutes });
}

function clean(v: unknown, max: number): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  const denied = await requireMembership(request);
  if (denied) return denied;
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const activityType = clean(body.activityType, 40).toLowerCase();
  if (!activityType) return NextResponse.json({ error: 'Pick an activity type.' }, { status: 400 });
  const durationMin = Math.max(0, Math.round(num(body.durationMin) ?? 0));
  const startedAt = clean(body.startedAt, 40) || new Date().toISOString();
  const distanceKm = num(body.distanceKm);
  const calories = num(body.calories);
  const title = clean(body.title, 80) || activityType;

  const supabase = await clientForRequest(request);
  const { data: inserted, error } = await supabase
    .from('activities')
    .insert({
      user_id: user.id, source: 'manual', activity_type: activityType, title,
      started_at: startedAt, duration_min: durationMin || null,
      distance_km: distanceKm, calories: calories != null ? Math.round(calories) : null,
    })
    .select('id, source, activity_type, title, started_at, duration_min, distance_km, calories, strain')
    .single();
  if (error) return dbError(error, 'client activities write', 500);

  // Award Shape Score — 1 pt per 5 min, 2–20 range. Written via the DEFINER RPC
  // (clients can no longer write score_ledger directly); the RPC derives the same
  // amount from the stored row, so it can't be forged. Idempotent on source_id.
  // `pts` is recomputed here only for the response's pointsAwarded field.
  const pts = Math.max(2, Math.min(20, Math.round((durationMin || 10) / 5)));
  await supabase.rpc('award_activity', { p_activity_id: inserted.id });

  const r = inserted as ActivityRow;
  return NextResponse.json({
    activity: { id: r.id, source: r.source, type: r.activity_type, title: r.title, startedAt: r.started_at, durationMin: r.duration_min, distanceKm: r.distance_km, calories: r.calories },
    pointsAwarded: pts,
  });
}

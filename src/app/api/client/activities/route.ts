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
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      { global: { headers: { Authorization: `Bearer ${bearer[1]}` } }, auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}

async function currentUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearer) {
    const client = await clientForRequest(request);
    const { data } = await client.auth.getUser(bearer[1]);
    return data.user ?? null;
  }
  const client = await createClient();
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

type ActivityRow = {
  id: string; source: string; activity_type: string; title: string | null;
  started_at: string | null; duration_min: number | null; distance_km: number | null;
  calories: number | null; strain: number | null;
};

export async function GET(request: Request) {
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
  const activities = rows.map(r => ({
    id: r.id, source: r.source, type: r.activity_type, title: r.title ?? r.activity_type,
    startedAt: r.started_at, durationMin: r.duration_min, distanceKm: r.distance_km,
    calories: r.calories, strain: r.strain,
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
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Award Shape Score — 1 pt per 5 min, 2–20 range. Idempotent on source_id.
  const pts = Math.max(2, Math.min(20, Math.round((durationMin || 10) / 5)));
  await supabase.from('score_ledger').upsert({
    user_id: user.id, category: 'workouts', source_kind: 'activity',
    source_id: inserted.id, delta: pts, note: activityType,
  }, { onConflict: 'user_id,source_kind,source_id' });

  const r = inserted as ActivityRow;
  return NextResponse.json({
    activity: { id: r.id, source: r.source, type: r.activity_type, title: r.title, startedAt: r.started_at, durationMin: r.duration_min, distanceKm: r.distance_km, calories: r.calories },
    pointsAwarded: pts,
  });
}

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeCorrelations, type SnapshotPoint } from '@/lib/correlations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SNAPSHOT_FIELDS = [
  'snapshot_date',
  'sleep_hours',
  'sleep_performance_pct',
  'recovery_score',
  'hrv_ms',
  'resting_hr',
  'strain',
  'workout_minutes',
  'workout_volume_lb',
  'avg_heart_rate',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'hydration_l',
  'weight_lb',
  'body_fat_pct',
  'mood',
  'stress',
  'soreness',
].join(',');

function clampWindow(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 28;
  return Math.max(7, Math.min(180, Math.round(value)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const targetUserId = url.searchParams.get('user_id');
  const windowDays = clampWindow(url.searchParams.get('window'));

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  // RLS handles authorization: clients see their own rows; trainers and
  // nutritionists see active subscribers. If a non-permitted user_id is
  // requested the query simply returns zero rows.
  const userId = targetUserId || user.id;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('daily_health_snapshot')
    .select(SNAPSHOT_FIELDS)
    .eq('user_id', userId)
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true })
    .returns<SnapshotPoint[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const correlations = computeCorrelations(rows);

  return NextResponse.json({
    user_id: userId,
    window_days: windowDays,
    sample_size: rows.length,
    correlations,
  });
}

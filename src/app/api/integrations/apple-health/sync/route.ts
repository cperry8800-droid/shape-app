// Apple Health (HealthKit) sync — receives per-day roll-ups + workouts read
// on-device by the iOS app (there is no server-side HealthKit API) and writes
// the same daily_health_snapshot rows as WHOOP / Oura. With workouts present,
// imports them as private activity + community rows. Also records a connection
// marker under the synthetic 'apple_health' provider so status shows connected.

import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertSnapshot, type SnapshotPatch } from '@/lib/health-snapshot';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only these snapshot fields may be written from a device payload.
const ALLOWED_FIELDS: (keyof SnapshotPatch)[] = [
  'calories', 'avg_heart_rate', 'max_heart_rate', 'resting_hr', 'hrv_ms', 'sleep_hours', 'workout_minutes', 'steps',
];

type DayInput = { date?: string; patch?: Record<string, unknown> };
type WorkoutInput = {
  externalId?: string;
  activity?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMin?: number | null;
  calories?: number | null;
  distanceM?: number | null;
};
type ProfileRow = { full_name?: string | null; role?: string | null };

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function cleanPatch(input: Record<string, unknown> | undefined): SnapshotPatch {
  const patch: SnapshotPatch = {};
  if (!input) return patch;
  for (const field of ALLOWED_FIELDS) {
    const v = num(input[field]);
    if (v === null) continue;
    // steps is an integer count — never negative or fractional (a bad payload must
    // not store an impossible total or fail the integer-column write).
    (patch as Record<string, number>)[field] = field === 'steps' ? Math.max(0, Math.round(v)) : v;
  }
  return patch;
}

function normalizeRole(role?: string | null): 'client' | 'trainer' | 'nutritionist' | 'member' {
  if (role === 'client' || role === 'trainer' || role === 'nutritionist') return role;
  return 'member';
}

function workoutPostPayload(w: WorkoutInput, userId: string, profile: ProfileRow | null, fallbackName: string) {
  const activity = (w.activity || 'apple health workout').trim();
  const minutes = num(w.durationMin);
  const distanceKm = num(w.distanceM) !== null ? Number((num(w.distanceM)! / 1000).toFixed(2)) : null;
  const calories = num(w.calories);
  const noteParts = [
    minutes !== null ? `${minutes} min` : null,
    distanceKm !== null ? `${distanceKm} km` : null,
    calories !== null ? `${calories} kcal` : null,
  ].filter(Boolean);
  return {
    author_id: userId,
    author_name: profile?.full_name || fallbackName,
    author_role: normalizeRole(profile?.role),
    privacy: 'private',
    activity_type: activity.toLowerCase(),
    title: activity,
    status: 'Imported from Apple Health',
    note: noteParts.length ? `Apple Health ${noteParts.join(' · ')}` : 'Imported from Apple Health.',
    metrics: {
      provider: 'apple_health',
      durationMin: minutes,
      distanceMeter: num(w.distanceM),
      calories,
      labels: ['Duration', 'Distance', 'Calories'],
      values: [
        minutes !== null ? `${minutes} min` : '-',
        distanceKm !== null ? `${distanceKm} km` : '-',
        calories !== null ? `${calories} kcal` : '-',
      ],
      tags: ['APPLE HEALTH', 'PRIVATE'],
    },
    route: {},
    source_provider: 'apple_health',
    source_activity_id: w.externalId,
    created_at: w.startedAt ?? new Date().toISOString(),
  };
}

function activityRow(w: WorkoutInput, userId: string) {
  return {
    user_id: userId,
    source: 'apple_health',
    external_id: String(w.externalId),
    activity_type: (w.activity || 'workout').toLowerCase(),
    title: (w.activity || 'workout').toLowerCase(),
    started_at: w.startedAt ?? null,
    duration_min: num(w.durationMin),
    distance_km: num(w.distanceM) !== null ? Number((num(w.distanceM)! / 1000).toFixed(2)) : null,
    calories: num(w.calories) !== null ? Math.round(num(w.calories)!) : null,
    avg_hr: null,
    strain: null,
    metrics: {},
  };
}

async function importWorkouts(
  client: SupabaseClient,
  userId: string,
  profile: ProfileRow | null,
  fallbackName: string,
  workouts: WorkoutInput[]
) {
  let imported = 0;
  const errors: string[] = [];
  for (const w of workouts) {
    if (!w.externalId) continue;
    await client.from('activities').upsert(activityRow(w, userId), { onConflict: 'user_id,source,external_id' });
    const payload = workoutPostPayload(w, userId, profile, fallbackName);
    const { data: existing, error: lookupError } = await client
      .from('community_posts')
      .select('id')
      .eq('author_id', userId)
      .eq('source_provider', 'apple_health')
      .eq('source_activity_id', w.externalId)
      .maybeSingle();
    if (lookupError) {
      console.error('[shape-api] apple-health activity lookup failed:', lookupError.message);
      errors.push('Could not sync an activity.');
      continue;
    }
    const result = existing?.id
      ? await client.from('community_posts').update(payload).eq('id', existing.id)
      : await client.from('community_posts').insert(payload);
    if (result.error) {
      console.error('[shape-api] apple-health activity write failed:', result.error.message);
      errors.push('Could not save an activity.');
    } else imported += 1;
  }
  return { imported, errors };
}

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<{ days?: DayInput[]; workouts?: WorkoutInput[] }>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const days = Array.isArray(body.days) ? body.days : [];
  const workouts = Array.isArray(body.workouts) ? body.workouts : [];

  const client = await clientForRequest(request);
  const { data: profile } = await client
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  let written = 0;
  const errors: string[] = [];
  for (const day of days) {
    if (!day?.date) continue;
    const patch = cleanPatch(day.patch);
    if (Object.keys(patch).length === 0) continue;
    const res = await upsertSnapshot(client, { userId: user.id, date: day.date, source: 'apple_health', patch });
    if (res.written > 0) written += 1;
    if (res.error) errors.push(res.error);
  }

  const importResult = workouts.length
    ? await importWorkouts(client, user.id, (profile as ProfileRow | null) ?? null, user.email?.split('@')[0] || 'Shape member', workouts)
    : null;

  // Record the connection marker (synthetic provider, no token).
  try {
    const admin = createAdminClient();
    await admin.from('user_integrations').upsert(
      {
        user_id: user.id,
        provider: 'apple_health',
        access_token: 'healthkit',
        token_type: 'healthkit',
        scope: 'read',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );
  } catch {
    /* connection marker is best-effort */
  }

  return NextResponse.json({
    snapshot: { days: written },
    import: importResult,
    errors: errors.length ? errors : undefined,
  });
}

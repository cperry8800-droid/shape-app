import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { dbError } from '@/lib/request-utils';
import { getFreshAccessToken } from '@/lib/integrations/tokens';
import { writeWhoopSnapshots } from '@/lib/health-snapshot';
import { resolveWorkoutSharePrivacy, findCrossSourceDuplicate, maybeSendFirstShareNotice, type SharePrivacy } from '@/lib/workout-share';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';

type WhoopCollection<T> = {
  records?: T[];
  next_token?: string;
};

type WhoopWorkout = {
  id?: string;
  start?: string;
  end?: string;
  sport_name?: string;
  score_state?: string;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    distance_meter?: number;
    altitude_gain_meter?: number;
    zone_durations?: Record<string, number>;
  };
};

type ProfileRow = {
  full_name?: string | null;
  role?: string | null;
};

async function whoopGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${WHOOP_API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`WHOOP ${path} failed (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}

function durationMinutes(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60_000);
}

function normalizeRole(role?: string | null): 'client' | 'trainer' | 'nutritionist' | 'member' {
  if (role === 'client' || role === 'trainer' || role === 'nutritionist') return role;
  return 'member';
}

function workoutPostPayload(workout: WhoopWorkout, userId: string, profile: ProfileRow | null, fallbackName: string, sharePrivacy: SharePrivacy) {
  const score = workout.score ?? {};
  const minutes = durationMinutes(workout.start, workout.end);
  const sport = (workout.sport_name || 'WHOOP workout').trim();
  const avgHr = typeof score.average_heart_rate === 'number' ? Math.round(score.average_heart_rate) : null;
  const strain = typeof score.strain === 'number' ? Number(score.strain.toFixed(1)) : null;
  const distanceKm = typeof score.distance_meter === 'number' ? Number((score.distance_meter / 1000).toFixed(2)) : null;

  const noteParts = [
    strain !== null ? `strain ${strain}` : null,
    avgHr !== null ? `avg HR ${avgHr} bpm` : null,
    distanceKm !== null ? `${distanceKm} km` : null,
  ].filter(Boolean);

  // Full device-captured stat set, Strain-led (WHOOP's signature metric). Only
  // metrics WHOOP returned are included. Card shows the first 3; detail shows all.
  const maxHr = typeof score.max_heart_rate === 'number' ? Math.round(score.max_heart_rate) : null;
  const kcal = typeof score.kilojoule === 'number' ? `${Math.round(score.kilojoule * 0.239006)} kcal` : null;
  const distMi = typeof score.distance_meter === 'number' && score.distance_meter > 0 ? `${(score.distance_meter / 1609.344).toFixed(2)} mi` : null;
  const elevFt = typeof score.altitude_gain_meter === 'number' ? `${Math.round(score.altitude_gain_meter * 3.28084)} ft` : null;
  const workoutStats: { label: string; value: string }[] = [];
  const addStat = (label: string, value: string | null) => { if (value && value !== '-') workoutStats.push({ label, value }); };
  addStat('Strain', strain !== null ? String(strain) : null);
  addStat('Avg HR', avgHr !== null ? `${avgHr} bpm` : null);
  addStat('Duration', minutes !== null ? `${minutes} min` : null);
  addStat('Calories', kcal);
  addStat('Max HR', maxHr !== null ? `${maxHr} bpm` : null);
  addStat('Distance', distMi);
  addStat('Elevation', elevFt);

  return {
    author_id: userId,
    author_name: profile?.full_name || fallbackName,
    author_role: normalizeRole(profile?.role),
    privacy: sharePrivacy,
    activity_type: sport.toLowerCase(),
    title: sport,
    status: 'Imported from WHOOP',
    note: noteParts.length ? `WHOOP ${noteParts.join(' · ')}` : 'Imported from WHOOP.',
    metrics: {
      provider: 'whoop',
      durationMin: minutes,
      averageHeartRate: avgHr,
      maxHeartRate: score.max_heart_rate ?? null,
      strain,
      kilojoule: score.kilojoule ?? null,
      distanceMeter: score.distance_meter ?? null,
      altitudeGainMeter: score.altitude_gain_meter ?? null,
      zoneDurations: score.zone_durations ?? null,
      workoutStats,
      labels: ['Duration', 'Avg HR', 'Strain'],
      values: [
        minutes !== null ? `${minutes} min` : 'WHOOP',
        avgHr !== null ? `${avgHr} bpm` : '-',
        strain !== null ? String(strain) : '-',
      ],
      tags: sharePrivacy === 'private' ? ['WHOOP', 'PRIVATE'] : ['WHOOP'],
    },
    route: {},
    source_provider: 'whoop',
    source_activity_id: workout.id,
    created_at: workout.start ?? new Date().toISOString(),
  };
}

// Typed per-activity row for the activities table (preserves sport type).
function whoopActivityRow(workout: WhoopWorkout, userId: string) {
  const score = workout.score ?? {};
  const sport = (workout.sport_name || 'whoop workout').trim().toLowerCase();
  const mins = durationMinutes(workout.start, workout.end);
  return {
    user_id: userId,
    source: 'whoop',
    external_id: String(workout.id),
    activity_type: sport,
    title: sport,
    started_at: workout.start ?? null,
    duration_min: typeof mins === 'number' ? mins : null,
    distance_km: typeof score.distance_meter === 'number' ? Number((score.distance_meter / 1000).toFixed(2)) : null,
    calories: typeof score.kilojoule === 'number' ? Math.round(score.kilojoule / 4.184) : null,
    avg_hr: typeof score.average_heart_rate === 'number' ? Math.round(score.average_heart_rate) : null,
    strain: typeof score.strain === 'number' ? Number(score.strain.toFixed(1)) : null,
    metrics: { kilojoule: score.kilojoule ?? null },
  };
}

async function importWhoopWorkouts(
  client: SupabaseClient,
  userId: string,
  profile: ProfileRow | null,
  fallbackName: string,
  workouts: WhoopWorkout[]
) {
  let imported = 0;
  const errors: string[] = [];
  // The member's own share level — resolved once per sync run (fail-closed to
  // 'private' on any settings read error).
  const sharePrivacy = await resolveWorkoutSharePrivacy(client, userId);

  for (const workout of workouts) {
    if (!workout.id) continue;
    // Typed per-activity row (idempotent on user+source+external_id).
    await client
      .from('activities')
      .upsert(whoopActivityRow(workout, userId), { onConflict: 'user_id,source,external_id' });

    const payload = workoutPostPayload(workout, userId, profile, fallbackName, sharePrivacy);
    const { data: existing, error: lookupError } = await client
      .from('community_posts')
      .select('id')
      .eq('author_id', userId)
      .eq('source_provider', 'whoop')
      .eq('source_activity_id', workout.id)
      .maybeSingle();

    if (lookupError) {
      console.error('[shape-api] whoop activity lookup failed:', lookupError.message);
      errors.push('Could not sync an activity.');
      continue;
    }

    if (!existing?.id) {
      // Cross-source guard: another provider (or the in-app logger) already
      // posted this workout within ±20 min → keep the activities row, skip the
      // social post (first-writer-wins, silent).
      const dup = await findCrossSourceDuplicate(client, userId, payload.created_at, 'whoop');
      if (dup) continue;
    }

    // Updates never rewrite privacy — the member may have retro-tightened, and
    // a re-sync must not loosen (or re-decide) an existing post's audience.
    const { privacy: _privacy, ...updatePayload } = payload;
    const result = existing?.id
      ? await client.from('community_posts').update(updatePayload).eq('id', existing.id)
      : await client.from('community_posts').insert(payload);

    if (result.error) {
      console.error('[shape-api] whoop activity write failed:', result.error.message);
      errors.push('Could not save an activity.');
    } else {
      imported += 1;
      if (!existing?.id) await maybeSendFirstShareNotice(client, userId, sharePrivacy);
    }
  }

  return { imported, errors };
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const accessToken = await getFreshAccessToken(user.id, 'whoop');
  if (!accessToken) return NextResponse.json({ error: 'WHOOP is not connected.' }, { status: 400 });

  const client = await clientForRequest(request);
  const { data: profile } = await client
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  try {
    const [basicProfile, bodyMeasurement, recoveries, cycles, sleeps, workouts] = await Promise.all([
      whoopGet(accessToken, '/v2/user/profile/basic'),
      whoopGet(accessToken, '/v2/user/measurement/body'),
      whoopGet<WhoopCollection<unknown>>(accessToken, '/v2/recovery?limit=5'),
      whoopGet<WhoopCollection<unknown>>(accessToken, '/v2/cycle?limit=5'),
      whoopGet<WhoopCollection<unknown>>(accessToken, '/v2/activity/sleep?limit=5'),
      whoopGet<WhoopCollection<WhoopWorkout>>(accessToken, '/v2/activity/workout?limit=10'),
    ]);

    const url = new URL(request.url);
    const shouldImport = url.searchParams.get('import') === '1';
    const importResult = shouldImport
      ? await importWhoopWorkouts(
          client,
          user.id,
          (profile as ProfileRow | null) ?? null,
          user.email?.split('@')[0] || 'Shape member',
          workouts.records ?? []
        )
      : null;

    const snapshot = await writeWhoopSnapshots(client, user.id, {
      recoveries,
      sleeps,
      cycles,
      workouts,
    }).catch((error) => {
      console.warn('[shape-app] WHOOP snapshot upsert failed:', error);
      return { days: 0 };
    });

    return NextResponse.json({
      whoop: {
        basicProfile,
        bodyMeasurement,
        recoveries,
        cycles,
        sleeps,
        workouts,
      },
      import: importResult,
      snapshot,
    });
  } catch (error) {
    return dbError(error, 'whoop sync', 502, 'WHOOP sync failed.');
  }
}

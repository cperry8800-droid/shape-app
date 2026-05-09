import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getFreshAccessToken } from '@/lib/integrations/tokens';
import { writeWhoopSnapshots } from '@/lib/health-snapshot';

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

async function clientForRequest(request: Request): Promise<SupabaseClient> {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      {
        global: { headers: { Authorization: `Bearer ${bearerMatch[1]}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  }
  return createClient() as Promise<SupabaseClient>;
}

async function currentUser(request: Request) {
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch) {
    const client = await clientForRequest(request);
    const { data } = await client.auth.getUser(bearerMatch[1]);
    return data.user ?? null;
  }
  const client = await createClient();
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

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

function workoutPostPayload(workout: WhoopWorkout, userId: string, profile: ProfileRow | null, fallbackName: string) {
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

  return {
    author_id: userId,
    author_name: profile?.full_name || fallbackName,
    author_role: normalizeRole(profile?.role),
    privacy: 'private',
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
      labels: ['Duration', 'Avg HR', 'Strain'],
      values: [
        minutes !== null ? `${minutes} min` : 'WHOOP',
        avgHr !== null ? `${avgHr} bpm` : '-',
        strain !== null ? String(strain) : '-',
      ],
      tags: ['WHOOP', 'PRIVATE'],
    },
    route: {},
    source_provider: 'whoop',
    source_activity_id: workout.id,
    created_at: workout.start ?? new Date().toISOString(),
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

  for (const workout of workouts) {
    if (!workout.id) continue;
    const payload = workoutPostPayload(workout, userId, profile, fallbackName);
    const { data: existing, error: lookupError } = await client
      .from('community_posts')
      .select('id')
      .eq('author_id', userId)
      .eq('source_provider', 'whoop')
      .eq('source_activity_id', workout.id)
      .maybeSingle();

    if (lookupError) {
      errors.push(lookupError.message);
      continue;
    }

    const result = existing?.id
      ? await client.from('community_posts').update(payload).eq('id', existing.id)
      : await client.from('community_posts').insert(payload);

    if (result.error) {
      errors.push(result.error.message);
    } else {
      imported += 1;
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'WHOOP sync failed.' },
      { status: 502 }
    );
  }
}

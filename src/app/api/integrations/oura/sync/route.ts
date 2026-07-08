// Oura Ring sync. Pulls recent sleep / readiness / activity / workout data
// from the Oura v2 API, writes a daily health snapshot, and (with ?import=1)
// imports Oura workouts as private community activity rows — mirroring the
// WHOOP and Strava sync routes.

import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { dbError } from '@/lib/request-utils';
import { getFreshAccessToken } from '@/lib/integrations/tokens';
import { writeOuraSnapshots } from '@/lib/health-snapshot';
import { resolveWorkoutSharePrivacy, findCrossSourceDuplicate, maybeSendFirstShareNotice, type SharePrivacy } from '@/lib/workout-share';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';
const PERSONAL_INFO = 'https://api.ouraring.com/v2/usercollection/personal_info';
const LOOKBACK_DAYS = 14;

type OuraCollection<T> = { data?: T[]; next_token?: string };

type OuraWorkout = {
  id?: string;
  activity?: string;
  label?: string | null;
  day?: string;
  start_datetime?: string;
  end_datetime?: string;
  calories?: number | null;
  distance?: number | null;
  intensity?: string | null;
};

type ProfileRow = { full_name?: string | null; role?: string | null };

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function ouraGet<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Oura request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

function collection<T>(accessToken: string, path: string, start: string, end: string) {
  const url = `${OURA_API_BASE}/${path}?start_date=${start}&end_date=${end}`;
  return ouraGet<OuraCollection<T>>(accessToken, url);
}

function durationMinutes(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 60_000);
}

function normalizeRole(role?: string | null): 'client' | 'trainer' | 'nutritionist' | 'member' {
  if (role === 'client' || role === 'trainer' || role === 'nutritionist') return role;
  return 'member';
}

function ouraActivityRow(workout: OuraWorkout, userId: string) {
  const activity = (workout.activity || workout.label || 'oura workout').trim().toLowerCase();
  const minutes = durationMinutes(workout.start_datetime, workout.end_datetime);
  return {
    user_id: userId,
    source: 'oura',
    external_id: String(workout.id),
    activity_type: activity,
    title: activity,
    started_at: workout.start_datetime ?? null,
    duration_min: typeof minutes === 'number' ? minutes : null,
    distance_km: typeof workout.distance === 'number' ? Number((workout.distance / 1000).toFixed(2)) : null,
    calories: typeof workout.calories === 'number' ? Math.round(workout.calories) : null,
    avg_hr: null,
    strain: null,
    metrics: { intensity: workout.intensity ?? null },
  };
}

function workoutPostPayload(workout: OuraWorkout, userId: string, profile: ProfileRow | null, fallbackName: string, sharePrivacy: SharePrivacy) {
  const activity = (workout.activity || workout.label || 'Oura workout').trim();
  const minutes = durationMinutes(workout.start_datetime, workout.end_datetime);
  const distanceKm = typeof workout.distance === 'number' ? Number((workout.distance / 1000).toFixed(2)) : null;
  const calories = typeof workout.calories === 'number' ? Math.round(workout.calories) : null;
  const noteParts = [
    minutes !== null ? `${minutes} min` : null,
    distanceKm !== null ? `${distanceKm} km` : null,
    calories !== null ? `${calories} kcal` : null,
  ].filter(Boolean);

  return {
    author_id: userId,
    author_name: profile?.full_name || fallbackName,
    author_role: normalizeRole(profile?.role),
    privacy: sharePrivacy,
    activity_type: activity.toLowerCase(),
    title: activity,
    status: 'Imported from Oura',
    note: noteParts.length ? `Oura ${noteParts.join(' · ')}` : 'Imported from Oura.',
    metrics: {
      provider: 'oura',
      durationMin: minutes,
      distanceMeter: workout.distance ?? null,
      calories,
      intensity: workout.intensity ?? null,
      labels: ['Duration', 'Distance', 'Calories'],
      values: [
        minutes !== null ? `${minutes} min` : '-',
        distanceKm !== null ? `${distanceKm} km` : '-',
        calories !== null ? `${calories} kcal` : '-',
      ],
      tags: sharePrivacy === 'private' ? ['OURA', 'PRIVATE'] : ['OURA'],
    },
    route: {},
    source_provider: 'oura',
    source_activity_id: workout.id,
    created_at: workout.start_datetime ?? new Date().toISOString(),
  };
}

async function importOuraWorkouts(
  client: SupabaseClient,
  userId: string,
  profile: ProfileRow | null,
  fallbackName: string,
  workouts: OuraWorkout[]
) {
  let imported = 0;
  const errors: string[] = [];
  // The member's own share level — resolved once per sync run (fail-closed to
  // 'private' on any settings read error).
  const sharePrivacy = await resolveWorkoutSharePrivacy(client, userId);

  for (const workout of workouts) {
    if (!workout.id) continue;
    await client
      .from('activities')
      .upsert(ouraActivityRow(workout, userId), { onConflict: 'user_id,source,external_id' });

    const payload = workoutPostPayload(workout, userId, profile, fallbackName, sharePrivacy);
    const { data: existing, error: lookupError } = await client
      .from('community_posts')
      .select('id')
      .eq('author_id', userId)
      .eq('source_provider', 'oura')
      .eq('source_activity_id', workout.id)
      .maybeSingle();

    if (lookupError) {
      console.error('[shape-api] oura activity lookup failed:', lookupError.message);
      errors.push('Could not sync an activity.');
      continue;
    }

    if (!existing?.id) {
      // Cross-source guard: another provider (or the in-app logger) already
      // posted this workout within ±20 min → keep the activities row, skip the
      // social post (first-writer-wins, silent).
      const dup = await findCrossSourceDuplicate(client, userId, payload.created_at, 'oura');
      if (dup) continue;
    }

    // Updates never rewrite privacy — the member may have retro-tightened, and
    // a re-sync must not loosen (or re-decide) an existing post's audience.
    const { privacy: _privacy, ...updatePayload } = payload;
    const result = existing?.id
      ? await client.from('community_posts').update(updatePayload).eq('id', existing.id)
      : await client.from('community_posts').insert(payload);

    if (result.error) {
      console.error('[shape-api] oura activity write failed:', result.error.message);
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

  const accessToken = await getFreshAccessToken(user.id, 'oura');
  if (!accessToken) return NextResponse.json({ error: 'Oura is not connected.' }, { status: 400 });

  const client = await clientForRequest(request);
  const { data: profile } = await client
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  const end = new Date();
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 86_400_000);
  const startStr = ymd(start);
  const endStr = ymd(end);

  try {
    const [personalInfo, readiness, sleep, dailySleep, dailyActivity, workouts] = await Promise.all([
      ouraGet(accessToken, PERSONAL_INFO),
      collection<unknown>(accessToken, 'daily_readiness', startStr, endStr),
      collection<unknown>(accessToken, 'sleep', startStr, endStr),
      collection<unknown>(accessToken, 'daily_sleep', startStr, endStr),
      collection<unknown>(accessToken, 'daily_activity', startStr, endStr),
      collection<OuraWorkout>(accessToken, 'workout', startStr, endStr),
    ]);

    const shouldImport = new URL(request.url).searchParams.get('import') === '1';
    const importResult = shouldImport
      ? await importOuraWorkouts(
          client,
          user.id,
          (profile as ProfileRow | null) ?? null,
          user.email?.split('@')[0] || 'Shape member',
          workouts.data ?? []
        )
      : null;

    const snapshot = await writeOuraSnapshots(client, user.id, {
      readiness,
      sleep,
      dailySleep,
      dailyActivity,
      workouts,
    }).catch((error) => {
      console.warn('[shape-app] Oura snapshot upsert failed:', error);
      return { days: 0 };
    });

    return NextResponse.json({
      oura: { personalInfo, readiness, sleep, dailySleep, dailyActivity, workouts },
      import: importResult,
      snapshot,
    });
  } catch (error) {
    return dbError(error, 'oura sync', 502, 'Oura sync failed.');
  }
}

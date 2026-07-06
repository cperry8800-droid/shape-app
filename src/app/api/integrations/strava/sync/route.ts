import { NextResponse } from 'next/server';
import { type SupabaseClient } from '@supabase/supabase-js';
import { dbError } from '@/lib/request-utils';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { getFreshAccessToken } from '@/lib/integrations/tokens';
import { writeStravaSnapshots } from '@/lib/health-snapshot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STRAVA_API_BASE = 'https://www.strava.com/api/v3';

type StravaAthlete = {
  id?: number;
  firstname?: string;
  lastname?: string;
  city?: string;
  state?: string;
  country?: string;
};

type StravaActivity = {
  id?: number;
  name?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  type?: string;
  sport_type?: string;
  start_date?: string;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  suffer_score?: number;
  kudos_count?: number;
  comment_count?: number;
  calories?: number;
  map?: {
    id?: string;
    summary_polyline?: string | null;
  };
};

type ProfileRow = {
  full_name?: string | null;
  role?: string | null;
};

async function stravaGet<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${STRAVA_API_BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Strava ${path} failed (${res.status}): ${text || res.statusText}`);
  }

  return (await res.json()) as T;
}

function normalizeRole(role?: string | null): 'client' | 'trainer' | 'nutritionist' | 'member' {
  if (role === 'client' || role === 'trainer' || role === 'nutritionist') return role;
  return 'member';
}

function decodePolyline(encoded?: string | null): Array<[number, number]> {
  if (!encoded) return [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points: Array<[number, number]> = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

function downsample<T>(items: T[], max = 80): T[] {
  if (items.length <= max) return items;
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, index) => items[Math.round(index * step)]);
}

function normalizeRoutePoints(latLng: Array<[number, number]>): Array<[number, number]> {
  if (latLng.length < 2) return [];
  const sample = downsample(latLng, 80);
  const lats = sample.map(([lat]) => lat);
  const lngs = sample.map(([, lng]) => lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;

  return sample.map(([lat, lng]) => {
    const x = 8 + ((lng - minLng) / lngSpan) * 84;
    const y = 92 - ((lat - minLat) / latSpan) * 84;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  });
}

function miles(meters?: number): string | null {
  if (typeof meters !== 'number') return null;
  return `${(meters / 1609.344).toFixed(2)} mi`;
}

function minutes(seconds?: number): string | null {
  if (typeof seconds !== 'number') return null;
  const total = Math.round(seconds / 60);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

function pacePerMile(distanceMeters?: number, movingSeconds?: number): string | null {
  if (!distanceMeters || !movingSeconds || distanceMeters <= 0) return null;
  const paceSeconds = movingSeconds / (distanceMeters / 1609.344);
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.round(paceSeconds % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/mi`;
}

function pacePer100m(distanceMeters?: number, movingSeconds?: number): string | null {
  if (!distanceMeters || !movingSeconds || distanceMeters <= 0) return null;
  const s = movingSeconds / (distanceMeters / 100);
  const min = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${min}:${sec.toString().padStart(2, '0')}/100m`;
}

function feet(meters?: number | null): string | null {
  if (typeof meters !== 'number') return null;
  return `${Math.round(meters * 3.28084)} ft`;
}

function mph(metersPerSecond?: number | null): string | null {
  if (typeof metersPerSecond !== 'number' || metersPerSecond <= 0) return null;
  return `${(metersPerSecond * 2.23694).toFixed(1)} mph`;
}

// The full set of device-captured stats for an activity, ordered per sport so the
// card's 3-up leads with the right ones and the detail page shows the rest. Only
// metrics the wearable actually returned are included — never a fabricated value.
function buildActivityStats(activity: StravaActivity): { label: string; value: string }[] {
  const sport = (activity.sport_type || activity.type || '').toLowerCase();
  const isRide = /ride|bike|cycl|ebike|handcycle/.test(sport);
  const isSwim = /swim/.test(sport);
  const isWalkHike = /walk|hike|snowshoe/.test(sport);
  const hr = (v?: number) => (typeof v === 'number' ? `${Math.round(v)} bpm` : null);
  const kcal = typeof activity.calories === 'number' ? `${Math.round(activity.calories)} kcal` : null;
  const dist = miles(activity.distance);
  const time = minutes(activity.moving_time) ?? minutes(activity.elapsed_time);
  const elev = feet(activity.total_elevation_gain);
  const watts = typeof activity.average_watts === 'number' ? `${Math.round(activity.average_watts)} W` : null;
  const maxWatts = typeof activity.max_watts === 'number' ? `${Math.round(activity.max_watts)} W` : null;
  const cadence = typeof activity.average_cadence === 'number'
    ? `${Math.round(activity.average_cadence * (isRide ? 1 : 2))} ${isRide ? 'rpm' : 'spm'}` : null;
  const effort = typeof activity.suffer_score === 'number' ? `${Math.round(activity.suffer_score)}` : null;
  const out: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null) => { if (value && value !== '-') out.push({ label, value }); };
  if (isSwim) {
    add('Distance', dist); add('Pace', pacePer100m(activity.distance, activity.moving_time) ?? time);
    add('Time', time); add('Avg HR', hr(activity.average_heartrate)); add('Max HR', hr(activity.max_heartrate)); add('Calories', kcal);
  } else if (isRide) {
    add('Distance', dist); add('Avg power', watts); add('Time', time); add('Avg speed', mph(activity.average_speed));
    add('Avg HR', hr(activity.average_heartrate)); add('Max HR', hr(activity.max_heartrate)); add('Elevation', elev);
    add('Calories', kcal); add('Max power', maxWatts); add('Max speed', mph(activity.max_speed)); add('Cadence', cadence); add('Effort', effort);
  } else if (isWalkHike) {
    add('Distance', dist); add('Time', time); add('Elevation', elev); add('Avg HR', hr(activity.average_heartrate)); add('Calories', kcal); add('Cadence', cadence);
  } else { // run + default
    add('Distance', dist); add('Pace', pacePerMile(activity.distance, activity.moving_time) ?? time); add('Time', time);
    add('Avg HR', hr(activity.average_heartrate)); add('Max HR', hr(activity.max_heartrate)); add('Cadence', cadence);
    add('Elevation', elev); add('Calories', kcal); add('Avg speed', mph(activity.average_speed)); add('Effort', effort);
  }
  if (out.length === 0) { add('Time', time); add('Avg HR', hr(activity.average_heartrate)); add('Calories', kcal); }
  return out;
}

function activityPostPayload(
  activity: StravaActivity,
  userId: string,
  profile: ProfileRow | null,
  fallbackName: string
) {
  const sport = activity.sport_type || activity.type || 'Activity';
  const distance = miles(activity.distance) ?? '-';
  const duration = minutes(activity.moving_time) ?? minutes(activity.elapsed_time) ?? '-';
  const pace = pacePerMile(activity.distance, activity.moving_time) ?? duration;
  const avgHr = typeof activity.average_heartrate === 'number' ? Math.round(activity.average_heartrate) : null;
  const polyline = activity.map?.summary_polyline || null;
  const latLng = decodePolyline(polyline);
  const points = normalizeRoutePoints(latLng);

  return {
    author_id: userId,
    author_name: profile?.full_name || fallbackName,
    author_role: normalizeRole(profile?.role),
    privacy: 'private',
    activity_type: sport.toLowerCase(),
    title: activity.name || sport,
    status: 'Imported from Strava',
    note: [
      activity.name || sport,
      distance !== '-' ? distance : null,
      avgHr !== null ? `${avgHr} bpm avg HR` : null,
    ].filter(Boolean).join(' - ') || 'Imported from Strava.',
    metrics: {
      provider: 'strava',
      distanceMeter: activity.distance ?? null,
      movingTimeSeconds: activity.moving_time ?? null,
      elapsedTimeSeconds: activity.elapsed_time ?? null,
      elevationGainMeter: activity.total_elevation_gain ?? null,
      averageSpeedMeterSecond: activity.average_speed ?? null,
      maxSpeedMeterSecond: activity.max_speed ?? null,
      averageHeartRate: avgHr,
      maxHeartRate: activity.max_heartrate ?? null,
      sufferScore: activity.suffer_score ?? null,
      kudosCount: activity.kudos_count ?? null,
      commentCount: activity.comment_count ?? null,
      calories: activity.calories ?? null,
      averageCadence: activity.average_cadence ?? null,
      averageWatts: activity.average_watts ?? null,
      maxWatts: activity.max_watts ?? null,
      // The full device-captured stat set (sport-ordered) — the card shows the
      // first 3, the detail page shows them all.
      workoutStats: buildActivityStats(activity),
      statA: distance,
      statB: pace,
      statC: avgHr !== null ? `${avgHr} bpm` : duration,
      labels: ['Distance', pace === duration ? 'Time' : 'Pace', avgHr !== null ? 'Avg HR' : 'Time'],
      tags: ['STRAVA', 'PRIVATE'],
    },
    route: {
      provider: 'strava',
      encodedPolyline: polyline,
      latLng: downsample(latLng, 80),
      points,
      privacyZonesApplied: true,
    },
    source_provider: 'strava',
    source_activity_id: activity.id ? String(activity.id) : null,
    created_at: activity.start_date ?? new Date().toISOString(),
  };
}

// Typed per-activity row for the activities table (preserves sport type).
function stravaActivityRow(activity: StravaActivity, userId: string) {
  const sport = (activity.sport_type || activity.type || 'Activity').toLowerCase();
  const secs = activity.moving_time ?? activity.elapsed_time ?? null;
  return {
    user_id: userId,
    source: 'strava',
    external_id: String(activity.id),
    activity_type: sport,
    title: activity.name || sport,
    started_at: activity.start_date ?? null,
    duration_min: typeof secs === 'number' ? Math.round(secs / 60) : null,
    distance_km: typeof activity.distance === 'number' ? Number((activity.distance / 1000).toFixed(2)) : null,
    calories: typeof activity.calories === 'number' ? Math.round(activity.calories) : null,
    avg_hr: typeof activity.average_heartrate === 'number' ? Math.round(activity.average_heartrate) : null,
    metrics: {
      elevationGainMeter: activity.total_elevation_gain ?? null,
      maxHeartRate: activity.max_heartrate ?? null,
      averageSpeedMeterSecond: activity.average_speed ?? null,
      sufferScore: activity.suffer_score ?? null,
    },
  };
}

// Downsample a per-second stream to ~N points for the detail-page sparklines.
function downsampleStream(arr: number[] | undefined, N = 40, scale = 1): number[] | null {
  if (!Array.isArray(arr) || arr.length < 4) return null;
  if (arr.length <= N) return arr.map((v) => Math.round(v * scale));
  const out: number[] = [];
  const step = arr.length / N;
  for (let i = 0; i < N; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(Math.floor((i + 1) * step), start + 1);
    const slice = arr.slice(start, end);
    out.push(Math.round((slice.reduce((s, v) => s + v, 0) / slice.length) * scale));
  }
  return out;
}

// Resample a per-second metric stream onto N points EVENLY SPACED BY DISTANCE
// (not time) using the cumulative distance stream — so the chart's x-axis is
// true distance and the mile markers line up exactly (no even-pacing assumption).
function resampleByDistance(values: number[] | undefined, distance: number[] | undefined, N = 50, scale = 1): number[] | null {
  if (!Array.isArray(values) || values.length < 4 || !Array.isArray(distance) || distance.length !== values.length) return null;
  const total = distance[distance.length - 1] - distance[0];
  if (!(total > 0)) return null;
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = distance[0] + (i / (N - 1)) * total;
    while (j < distance.length - 2 && distance[j + 1] < target) j++;
    const d0 = distance[j], d1 = distance[j + 1];
    const f = d1 > d0 ? Math.max(0, Math.min(1, (target - d0) / (d1 - d0))) : 0;
    out.push(Math.round((values[j] + (values[j + 1] - values[j]) * f) * scale));
  }
  return out;
}

// HR / cadence / altitude over time for the detail-page graphs — ONE streams
// call (Strava allows multiple keys). Cadence → spm for foot sports; altitude
// → feet so the elevation profile's labels read in the same unit as the gain.
// GRAPH-TYPE RULE (server side, mirrors the app): the primary velocity series
// is sport-specific — Speed (mph) for rides, Pace/100m for swims, Pace/mile for
// run/walk/hike/default. Power is its own series when a power meter is present.
async function fetchStreams(
  accessToken: string,
  activityId: number,
  sport: string
): Promise<{ hr: number[] | null; cadence: number[] | null; elev: number[] | null; pace: number[] | null; power: number[] | null }> {
  const isRide = /ride|bike|cycl|ebike|handcycle/.test(sport);
  const isSwim = /swim/.test(sport);
  try {
    const data = await stravaGet<{
      heartrate?: { data?: number[] };
      cadence?: { data?: number[] };
      altitude?: { data?: number[] };
      velocity_smooth?: { data?: number[] };
      watts?: { data?: number[] };
      distance?: { data?: number[] };
    }>(accessToken, `/activities/${activityId}/streams?keys=heartrate,cadence,altitude,velocity_smooth,watts,distance&key_by_type=true`);
    const vel = data?.velocity_smooth?.data;
    // Convert velocity (m/s) into the sport's primary unit; clamp slow samples.
    let paceRaw: number[] = [];
    if (Array.isArray(vel)) {
      if (isRide) paceRaw = vel.map((v) => Math.max(0, v * 2.236936)); // mph
      else if (isSwim) paceRaw = vel.map((v) => (v > 0.2 ? Math.min(100 / v, 600) : 600)); // sec/100m
      else paceRaw = vel.map((v) => (v > 0.5 ? Math.min(1609.344 / v, 1200) : 1200)); // sec/mile
    }
    // Prefer DISTANCE-uniform resampling (true x-axis); fall back to time-uniform
    // when there's no distance stream (e.g. indoor/treadmill).
    const dist = data?.distance?.data;
    const hasDist = Array.isArray(dist) && dist.length >= 4;
    const sample = (vals: number[] | undefined, scale = 1) => (hasDist ? resampleByDistance(vals, dist, 50, scale) : downsampleStream(vals, 50, scale));
    return {
      hr: sample(data?.heartrate?.data),
      cadence: sample(data?.cadence?.data, isRide ? 1 : 2),
      elev: sample(data?.altitude?.data, 3.28084),
      pace: sample(paceRaw),
      power: sample(data?.watts?.data),
    };
  } catch {
    return { hr: null, cadence: null, elev: null, pace: null, power: null };
  }
}

// Per-mile splits from the DETAILED activity (splits_standard) — one extra call per
// new post, same cap as the streams fetch. Honest: absent fields stay absent; no
// splits on the response → returns null (the app falls back to trace-derived splits).
async function fetchActivitySplits(
  accessToken: string,
  activityId: number
): Promise<{ label: string; pace: string; hr?: string; elevation?: string }[] | null> {
  try {
    const detail = await stravaGet<{
      splits_standard?: Array<{
        distance?: number; elapsed_time?: number; moving_time?: number;
        average_heartrate?: number; elevation_difference?: number; split?: number;
      }>;
    }>(accessToken, `/activities/${activityId}`);
    const arr = detail?.splits_standard;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const out: { label: string; pace: string; hr?: string; elevation?: string }[] = [];
    arr.forEach((s, i) => {
      const secs = (typeof s.moving_time === 'number' ? s.moving_time : s.elapsed_time) ?? null;
      // Never fabricate a mile — skip a split that lacks a real distance (honest-data rule).
      const meters = typeof s.distance === 'number' ? s.distance : null;
      if (secs == null || secs <= 0 || meters == null || meters <= 0) return;
      const perMile = secs / (meters / 1609.344);
      const mm = Math.floor(perMile / 60), ss = Math.round(perMile % 60);
      const row: { label: string; pace: string; hr?: string; elevation?: string } = {
        label: `Mile ${s.split ?? i + 1}`,
        pace: `${mm}:${String(ss).padStart(2, '0')}/mi`,
      };
      if (typeof s.average_heartrate === 'number') row.hr = `${Math.round(s.average_heartrate)} bpm`;
      if (typeof s.elevation_difference === 'number') {
        const ft = Math.round(s.elevation_difference * 3.28084);
        row.elevation = `${ft >= 0 ? '+' : ''}${ft} ft`;
      }
      out.push(row);
    });
    return out.length ? out : null;
  } catch {
    return null; // failure-isolated: never fails the activity's sync
  }
}

async function importStravaActivities(
  client: SupabaseClient,
  userId: string,
  profile: ProfileRow | null,
  fallbackName: string,
  activities: StravaActivity[],
  accessToken: string
) {
  let imported = 0;
  const errors: string[] = [];
  // Cap stream calls per sync to stay well under Strava's rate limit; only NEW
  // posts with HR get a trace fetched (existing posts already have theirs).
  const STREAM_CAP = 24;
  let streamsFetched = 0;

  for (const activity of activities) {
    if (!activity.id) continue;
    // Typed per-activity row (idempotent on user+source+external_id).
    await client
      .from('activities')
      .upsert(stravaActivityRow(activity, userId), { onConflict: 'user_id,source,external_id' });

    const { data: existing, error: lookupError } = await client
      .from('community_posts')
      .select('id')
      .eq('author_id', userId)
      .eq('source_provider', 'strava')
      .eq('source_activity_id', String(activity.id))
      .maybeSingle();

    if (lookupError) {
      console.error('[shape-api] strava activity lookup failed:', lookupError.message);
      errors.push('Could not sync an activity.');
      continue;
    }

    const payload = activityPostPayload(activity, userId, profile, fallbackName);
    // Real HR / cadence / elevation traces for the detail-page graphs — new posts
    // only (existing posts already have theirs), in one streams call per activity.
    // Any activity with movement, HR, cadence, power, or elevation qualifies —
    // so rides/swims (which may lack HR) still get their pace/speed/power graphs.
    const hasStreamSignal = typeof activity.average_heartrate === 'number'
      || typeof activity.average_cadence === 'number'
      || typeof activity.average_watts === 'number'
      || typeof activity.average_speed === 'number'
      || (typeof activity.distance === 'number' && activity.distance > 0)
      || (typeof activity.total_elevation_gain === 'number' && activity.total_elevation_gain > 0);
    if (!existing?.id && hasStreamSignal && streamsFetched < STREAM_CAP) {
      streamsFetched += 1;
      const sport = (activity.sport_type || activity.type || '').toLowerCase();
      const { hr, cadence, elev, pace, power } = await fetchStreams(accessToken, activity.id, sport);
      const m = payload.metrics as Record<string, unknown>;
      if (hr) m.hrTrace = hr;
      if (cadence) m.cadenceTrace = cadence;
      if (elev) m.elevTrace = elev;
      if (pace) m.paceTrace = pace;
      if (power) m.powerTrace = power;
      // Provider per-mile splits for the Splits page (same new-post/cap gating).
      const splits = await fetchActivitySplits(accessToken, activity.id);
      if (splits) m.splits = splits;
    }

    const result = existing?.id
      ? await client.from('community_posts').update(payload).eq('id', existing.id)
      : await client.from('community_posts').insert(payload);

    if (result.error) {
      console.error('[shape-api] strava activity write failed:', result.error.message);
      errors.push('Could not save an activity.');
    } else {
      imported += 1;
    }
  }

  return { imported, errors };
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const accessToken = await getFreshAccessToken(user.id, 'strava');
  if (!accessToken) return NextResponse.json({ error: 'Strava is not connected.' }, { status: 400 });

  const client = await clientForRequest(request);
  const { data: profile } = await client
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  try {
    const [athlete, activities] = await Promise.all([
      stravaGet<StravaAthlete>(accessToken, '/athlete'),
      stravaGet<StravaActivity[]>(accessToken, '/athlete/activities?per_page=30&page=1'),
    ]);

    const url = new URL(request.url);
    const shouldImport = url.searchParams.get('import') === '1';
    const importResult = shouldImport
      ? await importStravaActivities(
          client,
          user.id,
          (profile as ProfileRow | null) ?? null,
          user.email?.split('@')[0] || 'Shape member',
          activities,
          accessToken
        )
      : null;

    const snapshot = await writeStravaSnapshots(client, user.id, activities).catch((error) => {
      console.warn('[shape-app] Strava snapshot upsert failed:', error);
      return { days: 0 };
    });

    return NextResponse.json({
      strava: {
        athlete,
        activities,
      },
      import: importResult,
      snapshot,
    });
  } catch (error) {
    return dbError(error, 'strava sync', 502, 'Strava sync failed.');
  }
}

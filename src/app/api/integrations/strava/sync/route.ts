import { NextResponse } from 'next/server';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
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

async function importStravaActivities(
  client: SupabaseClient,
  userId: string,
  profile: ProfileRow | null,
  fallbackName: string,
  activities: StravaActivity[]
) {
  let imported = 0;
  const errors: string[] = [];

  for (const activity of activities) {
    if (!activity.id) continue;
    const payload = activityPostPayload(activity, userId, profile, fallbackName);
    const { data: existing, error: lookupError } = await client
      .from('community_posts')
      .select('id')
      .eq('author_id', userId)
      .eq('source_provider', 'strava')
      .eq('source_activity_id', String(activity.id))
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
          activities
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Strava sync failed.' },
      { status: 502 }
    );
  }
}

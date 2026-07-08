// Garmin Health API push-notification receiver.
//
// Garmin's Health API is PUSH-based: after a user authorizes, Garmin POSTs
// summaries to the webhook URL(s) registered in the Garmin Developer Portal,
// keyed by Garmin's own `userId` (which we capture onto
// user_integrations.provider_user_id at connect time — see the OAuth callback).
// Each item is mapped back to a Shape user and upserted into the shared
// daily_health_snapshot + activities tables — the same destinations as the
// Whoop / Oura / Strava syncs, so coach-facing views work unchanged.
//
// Setup once Garmin access is approved:
//   • Register this URL for the Dailies, Sleeps, and Activities summary types:
//       POST  https://<site>/api/integrations/garmin/webhook
//   • Garmin push has no signature, so optionally set GARMIN_WEBHOOK_SECRET and
//     register the URL with ?token=<secret> for a lightweight guard.
//
// Reuses existing tables — no migration required.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertSnapshot } from '@/lib/health-snapshot';
import { resolveWorkoutSharePrivacy, findCrossSourceDuplicate, maybeSendFirstShareNotice, type SharePrivacy } from '@/lib/workout-share';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Constant-time, length-safe compare for the shared webhook token. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

type GarminDaily = {
  userId?: string;
  calendarDate?: string;
  startTimeInSeconds?: number;
  restingHeartRateInBeatsPerMinute?: number;
  averageStressLevel?: number;
  activeKilocalories?: number;
  steps?: number;
};
type GarminSleep = {
  userId?: string;
  calendarDate?: string;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  overallSleepScore?: { value?: number } | null;
};
type GarminActivity = {
  userId?: string;
  summaryId?: string;
  activityId?: number | string;
  activityType?: string;
  startTimeInSeconds?: number;
  durationInSeconds?: number;
  averageHeartRateInBeatsPerMinute?: number;
  maxHeartRateInBeatsPerMinute?: number;
  distanceInMeters?: number;
  activeKilocalories?: number;
};

const isoFromEpoch = (sec?: number): string | null =>
  typeof sec === 'number' && Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : null;
const dayFromEpoch = (sec?: number): string | null => isoFromEpoch(sec)?.slice(0, 10) ?? null;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Garmin pings a GET to validate the URL on registration — answer 200.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  // Required (fail-closed): Garmin push has no signature, so the shared ?token=
  // secret is the only gate. If it's unset, reject — never accept an
  // unauthenticated write. Set GARMIN_WEBHOOK_SECRET before enabling the webhook.
  const secret = process.env.GARMIN_WEBHOOK_SECRET || '';
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!secret || !safeEqual(token, secret)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed bodies so Garmin doesn't retry-storm
  }

  const dailies = Array.isArray(body.dailies) ? (body.dailies as GarminDaily[]) : [];
  const sleeps = Array.isArray(body.sleeps) ? (body.sleeps as GarminSleep[]) : [];
  const activities = Array.isArray(body.activities) ? (body.activities as GarminActivity[]) : [];

  // Map every Garmin userId in the payload → Shape user_id in one query.
  const garminIds = new Set<string>();
  for (const it of [...dailies, ...sleeps, ...activities]) if (it.userId) garminIds.add(String(it.userId));
  if (garminIds.size === 0) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const { data: links } = await admin
    .from('user_integrations')
    .select('user_id, provider_user_id')
    .eq('provider', 'garmin')
    .in('provider_user_id', [...garminIds]);

  const userByGarmin = new Map<string, string>();
  for (const row of links ?? []) {
    if (row.provider_user_id) userByGarmin.set(String(row.provider_user_id), row.user_id);
  }
  const resolve = (gid?: string): string | null => (gid ? userByGarmin.get(String(gid)) ?? null : null);

  let snapshots = 0;
  let acts = 0;

  // Per-user share level + author identity, resolved once per webhook delivery
  // (one push can carry many users' items).
  const shareByUser = new Map<string, SharePrivacy>();
  const profileByUser = new Map<string, { full_name?: string | null; role?: string | null } | null>();
  const shareFor = async (uid: string): Promise<SharePrivacy> => {
    if (!shareByUser.has(uid)) shareByUser.set(uid, await resolveWorkoutSharePrivacy(admin, uid));
    return shareByUser.get(uid) as SharePrivacy;
  };
  const profileFor = async (uid: string) => {
    if (!profileByUser.has(uid)) {
      const { data } = await admin.from('profiles').select('full_name, role').eq('id', uid).maybeSingle();
      profileByUser.set(uid, (data ?? null) as { full_name?: string | null; role?: string | null } | null);
    }
    return profileByUser.get(uid) ?? null;
  };

  // Dailies → resting HR / stress / active calories / steps on the calendar day.
  for (const d of dailies) {
    const uid = resolve(d.userId);
    const date = d.calendarDate || dayFromEpoch(d.startTimeInSeconds);
    if (!uid || !date) continue;
    const r = await upsertSnapshot(admin, {
      userId: uid, date, source: 'garmin',
      patch: {
        resting_hr: num(d.restingHeartRateInBeatsPerMinute),
        stress: num(d.averageStressLevel),
        calories: num(d.activeKilocalories) != null ? Math.round(d.activeKilocalories as number) : null,
        steps: num(d.steps) != null && (d.steps as number) >= 0 ? Math.round(d.steps as number) : null,
      },
    });
    if (r.written) snapshots += 1;
  }

  // Sleeps → hours slept (+ sleep score when present).
  for (const s of sleeps) {
    const uid = resolve(s.userId);
    const date = s.calendarDate || dayFromEpoch(s.startTimeInSeconds);
    if (!uid || !date) continue;
    const r = await upsertSnapshot(admin, {
      userId: uid, date, source: 'garmin',
      patch: {
        sleep_hours: num(s.durationInSeconds) != null ? Number(((s.durationInSeconds as number) / 3600).toFixed(2)) : null,
        sleep_performance_pct: num(s.overallSleepScore?.value),
      },
    });
    if (r.written) snapshots += 1;
  }

  // Activities → per-activity row (idempotent) + workout minutes / HR on the day.
  for (const a of activities) {
    const uid = resolve(a.userId);
    const externalId = String(a.summaryId ?? a.activityId ?? '');
    if (!uid || !externalId) continue;
    const type = String(a.activityType || 'activity').toLowerCase();
    const mins = num(a.durationInSeconds) != null ? Math.round((a.durationInSeconds as number) / 60) : null;
    const started = isoFromEpoch(a.startTimeInSeconds);
    const avgHr = num(a.averageHeartRateInBeatsPerMinute) != null ? Math.round(a.averageHeartRateInBeatsPerMinute as number) : null;
    const maxHr = num(a.maxHeartRateInBeatsPerMinute) != null ? Math.round(a.maxHeartRateInBeatsPerMinute as number) : null;

    await admin.from('activities').upsert(
      {
        user_id: uid,
        source: 'garmin',
        external_id: externalId,
        activity_type: type,
        title: type,
        started_at: started,
        duration_min: mins,
        distance_km: num(a.distanceInMeters) != null ? Number(((a.distanceInMeters as number) / 1000).toFixed(2)) : null,
        calories: num(a.activeKilocalories) != null ? Math.round(a.activeKilocalories as number) : null,
        avg_hr: avgHr,
        metrics: { maxHeartRate: maxHr },
      },
      { onConflict: 'user_id,source,external_id' }
    );
    acts += 1;

    if (started) {
      await upsertSnapshot(admin, {
        userId: uid, date: started, source: 'garmin',
        patch: { workout_minutes: mins, avg_heart_rate: avgHr, max_heart_rate: maxHr },
      });
    }

    // Community post (parity with the other providers). Whoop-shaped summary
    // payload — Garmin push sends no per-second streams.
    const sharePrivacy = await shareFor(uid);
    const profile = await profileFor(uid);
    const distMi = num(a.distanceInMeters) != null ? `${((a.distanceInMeters as number) / 1609.344).toFixed(2)} mi` : null;
    const kcal = num(a.activeKilocalories) != null ? `${Math.round(a.activeKilocalories as number)} kcal` : null;
    const workoutStats: { label: string; value: string }[] = [];
    if (mins != null) workoutStats.push({ label: 'Duration', value: `${mins} min` });
    if (distMi) workoutStats.push({ label: 'Distance', value: distMi });
    if (avgHr != null) workoutStats.push({ label: 'Avg HR', value: `${avgHr} bpm` });
    if (maxHr != null) workoutStats.push({ label: 'Max HR', value: `${maxHr} bpm` });
    if (kcal) workoutStats.push({ label: 'Calories', value: kcal });

    const { data: existingPost, error: postLookupErr } = await admin
      .from('community_posts')
      .select('id')
      .eq('author_id', uid)
      .eq('source_provider', 'garmin')
      .eq('source_activity_id', externalId)
      .maybeSingle();
    if (postLookupErr) { console.error('[shape-api] garmin post lookup failed:', postLookupErr.message); continue; }

    const postPayload = {
      author_id: uid,
      author_name: profile?.full_name || 'Shape member',
      author_role: ((r) => (r === 'trainer' || r === 'nutritionist' || r === 'client' ? r : 'client'))(String(profile?.role || 'client')),
      privacy: sharePrivacy,
      activity_type: type,
      title: type.charAt(0).toUpperCase() + type.slice(1),
      status: 'Imported from Garmin',
      note: [type, distMi, avgHr != null ? `${avgHr} bpm avg HR` : null].filter(Boolean).join(' - ') || 'Imported from Garmin.',
      metrics: {
        provider: 'garmin',
        durationMinutes: mins,
        averageHeartRate: avgHr,
        maxHeartRate: maxHr,
        workoutStats,
        statA: workoutStats[0]?.value ?? '-',
        statB: workoutStats[1]?.value ?? '-',
        statC: workoutStats[2]?.value ?? '-',
        labels: [workoutStats[0]?.label ?? 'Duration', workoutStats[1]?.label ?? 'Distance', workoutStats[2]?.label ?? 'Avg HR'],
        tags: sharePrivacy === 'private' ? ['GARMIN', 'PRIVATE'] : ['GARMIN'],
      },
      source_provider: 'garmin',
      source_activity_id: externalId,
      created_at: started ?? new Date().toISOString(),
    };

    if (!existingPost?.id) {
      const dup = await findCrossSourceDuplicate(admin, uid, postPayload.created_at, 'garmin');
      if (dup) continue;
    }
    // Updates never rewrite privacy (retro-tighten stands on re-delivery).
    const { privacy: _privacy, ...updatePayload } = postPayload;
    const postResult = existingPost?.id
      ? await admin.from('community_posts').update(updatePayload).eq('id', existingPost.id)
      : await admin.from('community_posts').insert(postPayload);
    if (postResult.error) console.error('[shape-api] garmin post write failed:', postResult.error.message);
    else if (!existingPost?.id) await maybeSendFirstShareNotice(admin, uid, sharePrivacy);
  }

  return NextResponse.json({ ok: true, snapshots, activities: acts });
}

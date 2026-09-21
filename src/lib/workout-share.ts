// Server helpers for workout auto-share. The PURE rule + dedup predicate are
// imported directly from the mobile module (the unit-tested source of truth in
// tests/workout-share.test.mjs) — one implementation, so the server sync/webhook
// routes can never drift from the app. This file adds only the DB-touching
// async wrappers (resolver, dedup query, first-share notice).
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import {
  bsWorkoutSharePrivacy as workoutSharePrivacy,
  bsIsDuplicateWorkoutPost as isDuplicateWorkoutPost,
  bsFetchDuplicateCandidates as fetchDuplicateCandidates,
  bsActivityStartISO as activityStartISO,
  bsPostActivityStart as postActivityStart,
} from '../../mobile-app/src/services/workoutShare.mjs';

export type SharePrivacy = 'public' | 'followers' | 'private';
export { workoutSharePrivacy, isDuplicateWorkoutPost, activityStartISO, postActivityStart };

// Fail CLOSED on a read error — a transient settings failure must degrade to
// the old behavior (private), never accidentally publish someone's workout.
export async function resolveWorkoutSharePrivacy(client: SupabaseClient, userId: string): Promise<SharePrivacy> {
  try {
    const { data, error } = await client
      .from('user_goals')
      .select('data')
      .eq('user_id', userId)
      .eq('kind', 'client_settings')
      .maybeSingle();
    if (error) return 'private';
    return workoutSharePrivacy((data?.data ?? null) as Record<string, unknown> | null) as SharePrivacy;
  } catch {
    return 'private';
  }
}

// ±20-min different-provider window around the ACTIVITY START. Best-effort:
// any error → not a duplicate (never block the sync).
//
// ⚠ `startISO` IS THE ACTIVITY'S OWN START, NEVER `payload.created_at`. Those
// were the same value until auto-posters stopped dating a post by the workout
// it describes; `created_at` now means when the post was made, so passing it
// here would compare a backfilled year-old workout against posts made in the
// last twenty minutes and match nothing. The candidate rows are pre-filtered by
// the shared two-leg query (see bsFetchDuplicateCandidates) and judged by the
// shared predicate, which reads metrics.startedAt with a created_at fallback.
export async function findCrossSourceDuplicate(
  client: SupabaseClient, userId: string, startISO: string, provider: string,
): Promise<boolean> {
  if (!Number.isFinite(Date.parse(startISO || ''))) return false;
  try {
    const rows = await fetchDuplicateCandidates(
      () => client
        .from('community_posts')
        .select('source_provider, created_at, metrics')
        .eq('author_id', userId)
        .not('source_provider', 'is', null)
        .neq('source_provider', provider),
      startISO,
    );
    return isDuplicateWorkoutPost(rows, startISO, provider);
  } catch {
    return false;
  }
}

// One-time heads-up the first time a member's workout auto-shares beyond
// private. The dedup stamp lives in its OWN user_goals row
// (kind 'auto_share_flag', shared with the mobile in-app poster) — NOT merged
// into client_settings, so this best-effort write can never clobber a
// concurrent Settings change (read-modify-write race). The notification insert
// needs service-role (notifications RLS has no self-insert path). Never throws.
export const AUTO_SHARE_FLAG_KIND = 'auto_share_flag';
export async function maybeSendFirstShareNotice(
  client: SupabaseClient, userId: string, privacy: SharePrivacy,
): Promise<void> {
  if (privacy === 'private') return;
  try {
    const { data, error } = await client
      .from('user_goals')
      .select('data')
      .eq('user_id', userId)
      .eq('kind', AUTO_SHARE_FLAG_KIND)
      .maybeSingle();
    if (error) return;
    if ((data?.data as { at?: unknown } | null)?.at) return;
    const { error: upErr } = await client
      .from('user_goals')
      .upsert(
        { user_id: userId, kind: AUTO_SHARE_FLAG_KIND, data: { at: new Date().toISOString() } },
        { onConflict: 'user_id,kind' },
      );
    if (upErr) return; // couldn't stamp → don't notify (avoids repeat notices)
    await createNotification(createAdminClient(), {
      userId,
      type: 'general',
      title: 'Your workouts now share automatically',
      body: 'Logged and synced workouts show on your profile and in the community feed. Manage this in Settings → Share workout data.',
      route: 'settings',
    });
  } catch { /* best-effort */ }
}

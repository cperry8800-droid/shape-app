// Server twin of mobile-app/src/services/workoutShare.mjs — keep the pure
// parts in sync with the .mjs (the unit-tested source of truth).
//
// What privacy does an auto-posted workout get? The member's own Share toggle
// gates everything; their profile visibility scopes it. Defaults mirror the
// Settings pills' first options (On · Public). The resolver fails CLOSED
// (private) so a transient settings failure can never accidentally publish.
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';

export type SharePrivacy = 'public' | 'followers' | 'private';

export function workoutSharePrivacy(doc: Record<string, unknown> | null): SharePrivacy {
  const d = doc && typeof doc === 'object' ? doc : {};
  if (String((d as { shareWorkoutData?: unknown }).shareWorkoutData ?? 'On') === 'Off') return 'private';
  const vis = String((d as { profileVisibility?: unknown }).profileVisibility ?? 'Public');
  if (vis === 'Private') return 'private';
  if (vis === 'Just friends') return 'followers';
  return 'public';
}

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
    return workoutSharePrivacy((data?.data ?? null) as Record<string, unknown> | null);
  } catch {
    return 'private';
  }
}

const WINDOW_MS = 20 * 60 * 1000;
export function isDuplicateWorkoutPost(
  rows: Array<{ source_provider: string | null; created_at: string | null }>,
  startISO: string,
  provider: string,
): boolean {
  const start = Date.parse(startISO || '');
  if (!Number.isFinite(start)) return false;
  return (rows || []).some((r) => {
    if (!r || !r.source_provider || r.source_provider === provider) return false;
    const at = Date.parse(r.created_at || '');
    return Number.isFinite(at) && Math.abs(at - start) <= WINDOW_MS;
  });
}

// ±20-min different-provider window (device posts stamp created_at = activity
// start). Best-effort: any error → not a duplicate (never block the sync).
export async function findCrossSourceDuplicate(
  client: SupabaseClient, userId: string, startISO: string, provider: string,
): Promise<boolean> {
  const start = Date.parse(startISO || '');
  if (!Number.isFinite(start)) return false;
  try {
    const { data, error } = await client
      .from('community_posts')
      .select('source_provider, created_at')
      .eq('author_id', userId)
      .not('source_provider', 'is', null)
      .neq('source_provider', provider)
      .gte('created_at', new Date(start - WINDOW_MS).toISOString())
      .lte('created_at', new Date(start + WINDOW_MS).toISOString())
      .limit(5);
    if (error) return false;
    return isDuplicateWorkoutPost(data ?? [], startISO, provider);
  } catch {
    return false;
  }
}

// One-time heads-up the first time a member's workout auto-shares beyond
// private. Dedup stamp lives in the same client_settings doc
// (data.autoShareNoticeAt — the mobile in-app poster shares the field); the
// notification insert needs service-role (notifications RLS has no self-insert
// path). Best-effort, never throws.
export async function maybeSendFirstShareNotice(
  client: SupabaseClient, userId: string, privacy: SharePrivacy,
): Promise<void> {
  if (privacy === 'private') return;
  try {
    const { data, error } = await client
      .from('user_goals')
      .select('data')
      .eq('user_id', userId)
      .eq('kind', 'client_settings')
      .maybeSingle();
    if (error) return;
    const doc = (data?.data ?? {}) as Record<string, unknown>;
    if (doc.autoShareNoticeAt) return;
    const { error: upErr } = await client
      .from('user_goals')
      .upsert(
        { user_id: userId, kind: 'client_settings', data: { ...doc, autoShareNoticeAt: new Date().toISOString() } },
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

// The daily push cap's places, claimed in the database before a push is sent
// (supabase-migrations/2026-10-21-push-cap-claims.sql; owner, 2026-10-21).
//
// notification_settings.daily_cap is the person's one daily limit on pushes. The senders that hold
// to it (the AI notify engine and the friends' habits cron) read the day's count, decide, and only
// then send, so two of them deciding in the same minute could each take the last place. A sender
// now claims the places it decided on: claim_push_slots grants at most what is left, counting the
// places other senders hold, one claim per person at a time. It sends what it was granted, then
// releases the claim, since its notices count themselves once they have landed.
//
// ⚠ A CLAIM THAT CAN'T BE MADE SENDS AS BEFORE. Null means the claim was not made (the function
// isn't there before its migration runs, or the call failed): the sender keeps its own decision,
// bounded by the day's count it read, so the worst is the old pass-by-one. Refusing every push on
// a database hiccup would hold back notices the member is owed under their cap.
// Both calls take the service-role client: the table and the function are closed to everyone else.

import type { SupabaseClient } from '@supabase/supabase-js';

export type PushClaim = { id: string | null; granted: number };

export async function claimPushSlots(
  admin: SupabaseClient,
  userId: string,
  { tz, cap, want }: { tz: string; cap: number; want: number },
): Promise<PushClaim | null> {
  if (!userId || !(want > 0)) return { id: null, granted: 0 };
  try {
    const { data, error } = await admin.rpc('claim_push_slots', { p_user: userId, p_tz: tz || 'UTC', p_cap: cap, p_want: want });
    if (error) {
      console.warn('[push-cap] could not claim places under the daily cap; sending on the count as read:', error.message);
      return null;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { claim_id?: unknown; granted?: unknown } | null | undefined;
    const granted = Number(row?.granted);
    if (!row || !Number.isInteger(granted) || granted < 0) {
      console.warn('[push-cap] the claim came back unreadable; sending on the count as read');
      return null;
    }
    return { id: typeof row.claim_id === 'string' ? row.claim_id : null, granted: Math.min(granted, want) };
  } catch (err) {
    console.warn('[push-cap] the claim threw; sending on the count as read:', err instanceof Error ? err.message : err);
    return null;
  }
}

// Once the claimed notices have landed. A release that fails leaves the claim to lapse (five
// minutes), holding back nothing longer than that.
export async function releasePushClaim(admin: SupabaseClient, claim: PushClaim | null): Promise<void> {
  if (!claim || !claim.id) return;
  try {
    const { error } = await admin.from('push_cap_claims').delete().eq('id', claim.id);
    if (error) console.warn('[push-cap] could not release a claim; it lapses in five minutes:', error.message);
  } catch (err) {
    console.warn('[push-cap] releasing a claim threw; it lapses in five minutes:', err instanceof Error ? err.message : err);
  }
}

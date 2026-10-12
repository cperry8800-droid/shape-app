// The marketplace Verified badge mirrors the credential review: the admin's approval sets
// `verified` on the coach's listing row(s) (src/app/dashboard/credentials/actions.ts), and
// everything that undoes the verdict has to take it off again.
//
// ⚠ THE DATABASE ALREADY UNDOES THE VERDICT; THE BADGE DID NOT FOLLOW. The
// provider_credentials_guard_review trigger sends any self-written credential row back to
// 'pending' and clears its verification (2026-06-25-provider-admin-column-guard.sql), and an
// expired insurance certificate voids the review the badge rests on. Neither touched
// trainers.verified / nutritionists.verified, so a coach under re-review, or with lapsed
// insurance, kept showing as Verified. The coach's own client cannot clear the flag (the
// listing's admin columns are pinned for non-service writers), so this runs as the service role,
// always scoped to the owner it is given.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Take the Verified badge off every listing `ownerId` holds. Returns how many rows changed. */
export async function clearListingVerified(admin: SupabaseClient, ownerId: string): Promise<number> {
  let changed = 0;
  for (const table of ['trainers', 'nutritionists'] as const) {
    const { data, error } = await admin
      .from(table)
      .update({ verified: false, verified_at: null })
      .eq('owner_id', ownerId)
      .eq('verified', true)
      .select('id');
    if (error) throw error;
    changed += data?.length ?? 0;
  }
  return changed;
}

// The marketplace Verified badge mirrors the credential review: the admin's approval sets
// `verified` on the coach's listing row(s) (src/app/dashboard/credentials/actions.ts), and
// everything that undoes the verdict has to take it off again.
//
// ⚠ THE DATABASE TAKES IT OFF ITSELF NOW (2026-10-13-listing-badge-follows-credential.sql). Any
// write that leaves a credential row not 'approved', or deletes it, clears the owner's badge in
// the same transaction (the provider_credentials_zz_unverify_listings trigger): a coach's own
// edit, which the review guard sends back to 'pending', an admin's rejection or request for
// changes, and the expiry cron's move. So the coach's routes make no badge write of their own.
//
// This helper is for a badge that has to come off with no credential write behind it: the
// expiry cron's coach who shows as Verified on lapsed insurance. It calls the same database
// function, which clears both listing tables in one statement, so the two cannot disagree.
// Service role only (the function is not executable by members).

import type { SupabaseClient } from '@supabase/supabase-js';

/** Take the Verified badge off every listing `ownerId` holds. Returns how many rows changed. */
export async function clearListingVerified(admin: SupabaseClient, ownerId: string): Promise<number> {
  const { data, error } = await admin.rpc('clear_listing_verified', { p_owner: ownerId });
  if (error) throw error;
  return Number(data) || 0;
}

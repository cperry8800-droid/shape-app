// The Terms and Privacy acceptance record (client-onboarding review, M4). The website's sign-up
// required a Terms tick and kept no record of it; the app showed no Terms at all. Both sign-ups now
// put `terms_accepted_at` in the account's metadata, and this writes the record the first time the
// account signs in (the session bridge and /auth/callback): the versions in force when the account
// was created, at that time. The time comes from the account (auth.users.created_at), never from the
// browser, and the table is written by the service role only (2026-10-15-terms-acceptances.sql).

import type { SupabaseClient, User } from '@supabase/supabase-js';

// Each page's "Last updated" date, oldest first. ⚠ ADD A DATE HERE WHEN A PAGE CHANGES:
// tests/onboarding-small-fixes.test.mjs holds the newest entry to the page's own date.
export const TERMS_VERSIONS: readonly string[] = ['2026-06-22'];
export const PRIVACY_VERSIONS: readonly string[] = ['2026-10-13'];

/** The version in force on a day: the newest whose date is on or before it (the oldest before any). */
export function versionInForce(versions: readonly string[], day: string): string {
  let pick = versions[0];
  for (const v of versions) if (v <= day) pick = v;
  return pick;
}

const RECORD_WINDOW_MS = 30 * 86_400_000;

export type AcceptanceResult = 'recorded' | 'none' | 'failed';

export async function recordLegalAcceptance(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'created_at' | 'user_metadata'> | null | undefined
): Promise<AcceptanceResult> {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  if (!user?.id || typeof meta.terms_accepted_at !== 'string' || !meta.terms_accepted_at) return 'none';
  const created = Date.parse(String(user.created_at ?? ''));
  if (!Number.isFinite(created)) return 'none';
  // The bridge runs on every signed-in page load. The record is written at the first sign-in, so an
  // account older than a month has long had its row and pays nothing here.
  if (Date.now() - created > RECORD_WINDOW_MS) return 'none';
  const day = new Date(created).toISOString().slice(0, 10);
  const source = meta.signup_source && typeof meta.signup_source === 'object' ? (meta.signup_source as Record<string, unknown>) : null;
  const surface = source && source.surface === 'app' ? 'app' : 'website';
  try {
    const { error } = await admin.from('terms_acceptances').upsert(
      {
        user_id: user.id,
        terms_version: versionInForce(TERMS_VERSIONS, day),
        privacy_version: versionInForce(PRIVACY_VERSIONS, day),
        surface,
        accepted_at: new Date(created).toISOString(),
      },
      { onConflict: 'user_id,terms_version,privacy_version', ignoreDuplicates: true }
    );
    if (error) {
      // Before the migration runs the table is missing (42P01): nothing to record into yet.
      if (error.code !== '42P01') console.warn('[shape] terms acceptance not recorded', error.message);
      return 'failed';
    }
    return 'recorded';
  } catch (e) {
    console.warn('[shape] terms acceptance not recorded', e instanceof Error ? e.message : e);
    return 'failed';
  }
}

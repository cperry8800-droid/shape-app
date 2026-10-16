// The Terms and Privacy acceptance record (client-onboarding review, M4). The website's sign-up
// required a Terms tick and kept no record of it; the app showed no Terms at all. Both sign-ups now
// send `terms_accepted_at` with the account's creation, the migration's trigger keeps it in
// app_metadata, and this writes the record the first time the account signs in (the session bridge
// and /auth/callback): the versions in force when the account was created, at that time. The time
// comes from the account (auth.users.created_at), never from the browser, and the table is written
// by the service role only (2026-10-15-terms-acceptances.sql).

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

export type AcceptanceResult = 'recorded' | 'none' | 'failed';

export async function recordLegalAcceptance(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'created_at' | 'user_metadata' | 'app_metadata'> | null | undefined
): Promise<AcceptanceResult> {
  // ⚠ ONLY WHAT THE ACCOUNT CARRIED WHEN IT WAS CREATED (Codex on #2379, P1). This read
  // user_metadata, which the member can edit (supabase.auth.updateUser), so an old account could set
  // `terms_accepted_at` and have a record written backdated to its creation, naming versions it never
  // saw. The migration's BEFORE INSERT trigger on auth.users copies the sign-up's flag into
  // app_metadata, which only the server writes; a later edit of user_metadata never reaches it.
  const app = (user?.app_metadata ?? {}) as Record<string, unknown>;
  if (!user?.id || typeof app.terms_accepted_at !== 'string' || !app.terms_accepted_at) return 'none';
  const created = Date.parse(String(user.created_at ?? ''));
  if (!Number.isFinite(created)) return 'none';
  const day = new Date(created).toISOString().slice(0, 10);
  const terms = versionInForce(TERMS_VERSIONS, day);
  const privacy = versionInForce(PRIVACY_VERSIONS, day);
  // ⚠ RECORDED ONCE, WHENEVER THE FIRST SIGN-IN IS (Fable on the small fixes). The bridge runs on
  // every signed-in page load, and this skipped accounts over a month old to keep that cheap, which
  // lost the record of anyone who first signed in later. Once written, the account carries a marker
  // in app_metadata (which only the service role can write), and that is what is skipped on.
  const key = `${terms}|${privacy}`;
  if (app.terms_recorded === key) return 'none';
  // Where the account was made, as the trigger read it from the sign-up (not the editable metadata).
  const surface = app.terms_surface === 'app' ? 'app' : 'website';
  try {
    const { error } = await admin.from('terms_acceptances').upsert(
      {
        user_id: user.id,
        terms_version: terms,
        privacy_version: privacy,
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
    // The marker. A failed write only means the next page load upserts again (a no-op) and retries.
    const { error: markErr } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...app, terms_recorded: key } });
    if (markErr) console.warn('[shape] terms acceptance marker not saved', markErr.message);
    return 'recorded';
  } catch (e) {
    console.warn('[shape] terms acceptance not recorded', e instanceof Error ? e.message : e);
    return 'failed';
  }
}

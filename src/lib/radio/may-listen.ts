// Whether an account may hear Shape Radio right now, asked by id on the server (the station's
// re-check of a live connection, src/lib/radio/streams.mjs kicksFor). The same rule
// /api/radio/station holds as a member starts: a paid membership (active only; an approved coach;
// an admin, by a confirmed address on the allow-list) and not a known minor.
// true / false, or null when it could not be read (the connection is kept and asked again).

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeMembership } from '@/lib/membership-core';

export async function mayListen(admin: SupabaseClient, userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    // A deleted account answers "User not found": it may not listen. Any other failure is unknown.
    if (error) return /not.?found/i.test(String(error.message ?? '')) ? false : null;
    const user = data?.user;
    if (!user) return false;
    const m = await computeMembership(admin, userId, user.email ?? null, { emailConfirmed: !!user.email_confirmed_at, strict: true });
    return m.isMember && !m.isKnownMinor;
  } catch {
    return null;
  }
}

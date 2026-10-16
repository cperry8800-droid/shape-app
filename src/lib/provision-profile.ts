// The one server-side place a signed-in account gets its profiles row (client-onboarding review,
// H10). It was inline in /auth/callback, so an account that never came back through that route had
// no row at all: a /signup confirmation opened in another browser (its PKCE code cannot be exchanged
// there, though Supabase has already confirmed the address), or any sign-in whose page did not
// provision. The age check then refused them with "your account setup didn't complete". Now
// /auth/callback and the sign-in bridge (POST /api/auth/session, which the website's sign-in and
// the app both call) run this, under the member's own session.
//
// It only ever fills what is missing. The database decides the rest: a self-created row can only be
// a client (profiles_guard_role_elevation drops a coach role), and set_over_18() derives the age flag.

import type { SupabaseClient, User } from '@supabase/supabase-js';

export type ProvisionResult = 'created' | 'filled' | 'unchanged' | 'unread' | 'failed';

export async function ensureProfile(supabase: SupabaseClient, user: Pick<User, 'id' | 'email' | 'user_metadata'> | null | undefined): Promise<ProvisionResult> {
  if (!user?.id) return 'unchanged';
  try {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const { data: existing, error: readError } = await supabase
      .from('profiles')
      .select('id, date_of_birth, full_name, email, role, roles')
      .eq('id', user.id)
      .maybeSingle();
    // ⚠ A FAILED READ IS NOT AN ABSENT ROW, and conflating the two is how the
    // overwrite defect re-enters. maybeSingle() RESOLVES `{data:null,error}` on a
    // transient failure or an RLS refusal — it does not throw, so the catch below
    // never sees it. Treating that null as "no row" takes the create path, and
    // because the write is an upsert on `id` it UPDATEs the existing row: a coach
    // demoted to 'client' with `roles` collapsed. Provision only when the row's
    // state is actually KNOWN; on an unreadable read do nothing and let the next
    // visit try again (the gates refuse an unproven row, which is the safe way to
    // fail).
    if (readError) {
      console.warn('[shape] profile read failed; skipping provisioning', readError.message);
      return 'unread';
    }
    // ⚠ PROVISION, NEVER OVERWRITE. Password resets, magic links and email-change
    // confirmations all carry SIGNUP metadata, so writing it back reverts a renamed
    // member and collapses a dual-role coach's `roles` to one. Seed each field only
    // when the row lacks it — as `date_of_birth` already does.
    const seed: Record<string, unknown> = { id: user.id };
    if (!existing?.full_name && typeof meta.full_name === 'string' && meta.full_name) {
      seed.full_name = meta.full_name;
    }
    if (!existing?.email && user.email) seed.email = user.email;
    // ⚠ `profiles.role` is NOT NULL with NO DEFAULT — verified against the live
    // catalog, not the migration files. So an INSERT that omits it fails 23502:
    // provisioning dies, no row is written, and absence-refuses then locks the
    // member out of every gated surface. So the CREATE path always sets a role.
    // NOT NULL means any existing row already has one, so `!existing` is the whole
    // condition — no roles-array inspection needed.
    if (!existing) {
      const role = typeof meta.role === 'string' && meta.role ? meta.role : 'client';
      seed.role = role;
      seed.roles = [role];
    }
    // Never overwrite a date already on the row — the DOB freeze makes the
    // first write permanent, and re-sending it would be a way around it.
    if (!existing?.date_of_birth && typeof meta.date_of_birth === 'string' && meta.date_of_birth) {
      seed.date_of_birth = meta.date_of_birth;
    }
    // Nothing missing: no write (the sign-in bridge runs this on every sign-in).
    if (Object.keys(seed).length === 1) return 'unchanged';
    // over_18 is deliberately absent: set_over_18() derives it and
    // discards any supplied value.
    const { error } = await supabase.from('profiles').upsert(seed, { onConflict: 'id' });
    if (error) {
      console.warn('[shape] profile provisioning failed', error.message);
      return 'failed';
    }
    return existing ? 'filled' : 'created';
  } catch {
    /* Best-effort: a failed provision must not strand the user on an error
       page. The gates fail CLOSED on the resulting unproven row, so the
       failure mode is a refusal to enter — never a silent admission. */
    return 'failed';
  }
}

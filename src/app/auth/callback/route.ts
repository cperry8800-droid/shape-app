// OAuth / email-confirm callback. Supabase sends the user here with a
// `code` query param after they click a magic link or confirm their email.
// We exchange it for a session, then bounce them to `next` (or home).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Validate the redirect target — only a same-origin absolute path, never an
  // external host (e.g. //evil.com) — matching the login action's guard.
  // Via the shared helper. The inline prefix check this replaced accepted `/\evil.example`,
  // which browsers normalise into a protocol-relative off-site redirect, and embedded control
  // characters, which the URL parser strips. `next` is caller-supplied here (the password-reset
  // link builds it), so this is a live path for that payload rather than a theoretical one.
  const rawNext = searchParams.get('next') ?? '/';
  const next = safeReturnPath(rawNext, '/');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // ⚠ PROVISION THE PROFILE HERE — this is the destination email
      // confirmation actually lands on, and it used to only exchange the code
      // and redirect. The signup action can carry `date_of_birth` in auth
      // metadata but cannot write the row (confirmation returns no session), so
      // without this the confirmed account reached the app with NO profiles row
      // at all. Under the read-time policy an unprovisioned row proves nothing
      // and is REFUSED, so this is what keeps legitimate confirmations working —
      // and, before that policy, it was how they got in ungated.
      const user = data?.user;
      if (user?.id) {
        try {
          const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
          const { data: existing } = await supabase
            .from('profiles')
            .select('id, date_of_birth, full_name, role, roles')
            .eq('id', user.id)
            .maybeSingle();
          // ⚠ PROVISION, NEVER OVERWRITE. Password resets, magic links and email-change
          // confirmations all land here carrying SIGNUP metadata, so writing it back
          // reverts a renamed member and collapses a dual-role coach's `roles` to one.
          // Seed each field only when the row lacks it — as `date_of_birth` already does.
          const seed: Record<string, unknown> = { id: user.id };
          if (!existing?.full_name && typeof meta.full_name === 'string' && meta.full_name) {
            seed.full_name = meta.full_name;
          }
          const hasRoles = Array.isArray(existing?.roles) && existing.roles.length > 0;
          if (!existing?.role && !hasRoles && typeof meta.role === 'string' && meta.role) {
            seed.role = meta.role;
            seed.roles = [meta.role];
          }
          // Never overwrite a date already on the row — the DOB freeze makes the
          // first write permanent, and re-sending it would be a way around it.
          if (!existing?.date_of_birth && typeof meta.date_of_birth === 'string' && meta.date_of_birth) {
            seed.date_of_birth = meta.date_of_birth;
          }
          // over_18 is deliberately absent: set_over_18() derives it and
          // discards any supplied value.
          await supabase.from('profiles').upsert(seed, { onConflict: 'id' });
        } catch {
          /* Best-effort: a failed provision must not strand the user on an error
             page. The gates fail CLOSED on the resulting unproven row, so the
             failure mode is a refusal to enter — never a silent admission. */
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

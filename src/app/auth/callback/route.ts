// OAuth / email-confirm callback. Supabase sends the user here with a
// `code` query param after they click a magic link or confirm their email.
// We exchange it for a session, then bounce them to `next` (or home).

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';
import { ensureProfile } from '@/lib/provision-profile';
import type { SupabaseClient } from '@supabase/supabase-js';

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
      // and redirect. Confirmation returns no session at sign-up, so the row is
      // written now, from the sign-up metadata. Under the read-time policy an
      // unprovisioned row proves nothing and is REFUSED, so this is what keeps
      // legitimate confirmations working. The rules live in ensureProfile, which
      // the sign-in bridge (POST /api/auth/session) runs too (H10).
      await ensureProfile(supabase as unknown as SupabaseClient, data?.user);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

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
  // Via the shared helper. The inline prefix check this replaced accepted `/\evil.example` and
  // control characters — and signup now routes its confirm-email link through here carrying a
  // caller-supplied `next`, so this is a live path for that payload, not a theoretical one.
  const rawNext = searchParams.get('next') ?? '/';
  const next = safeReturnPath(rawNext, '/');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

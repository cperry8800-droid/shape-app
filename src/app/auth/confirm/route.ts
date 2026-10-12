// Email-link confirmation by token hash. The coach approval email links here with the hashed
// token generateLink returned (src/app/dashboard/applications/actions.ts): we verify it on the
// server, which signs the coach in (the SSR client writes the session cookies), then send them
// to `next` — the set-password page.
//
// Why not /auth/callback: that route exchanges a PKCE `?code=`. An admin-created invite has no
// PKCE verifier, so Supabase's own invite link returns through the implicit flow, with the
// tokens in the URL #fragment, which no server route can read and the PKCE browser client
// refuses. Verifying the token hash here needs neither.

import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';

export const dynamic = 'force-dynamic';

// The link types this route accepts. The approval email issues `invite` (a new account) and
// `recovery` (an existing account that has never signed in), so neither may be dropped; magic
// links work the same way if an email template is pointed here later.
const ACCEPTED_TYPES: ReadonlySet<string> = new Set(['invite', 'recovery', 'magiclink']);

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash') ?? '';
  const type = searchParams.get('type') ?? '';
  // Same-origin path only, via the shared guard (see /auth/callback).
  const next = safeReturnPath(searchParams.get('next') ?? '/', '/');

  if (tokenHash && tokenHash.length <= 512 && ACCEPTED_TYPES.has(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    console.warn('[shape] auth/confirm: token verification failed', error.message);
  }

  // Used, expired or malformed: the account exists, so a reset link gets them in.
  return NextResponse.redirect(`${origin}/forgot-password?link=expired`);
}

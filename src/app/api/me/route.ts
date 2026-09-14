// Lightweight "who am I?" endpoint used by static newdesign pages to
// render auth-aware nav. Reads the Supabase session from the same cookie
// the Next.js pages use. 200 with { user } when signed in, 200 with
// { user: null } when signed out, 503 when we could not find out.
//
// ⚠ THAT THIRD ANSWER IS THE WHOLE POINT OF THE THIRD STATE, AND IT USED TO BE
// COLLAPSED INTO THE SECOND. `getUser()` validates the JWT against the auth server,
// so it resolves { user: null, error } for a transient failure exactly as it does for
// a visitor with no session — and this route discarded the error and called both
// "signed out". Harmless while every caller only used the answer to pick which nav to
// draw; NOT harmless once the dashboard shells started REDIRECTING on it, because an
// auth blip then sent a signed-in member to a login form that does not forward a live
// session. Reported by Codex on #2064, against the gate added in that same PR.
//
// ⚠ AND THE TEST IS AN ALLOW-LIST OF REAL ANSWERS, NOT A DENY-LIST OF FAILURES.
// Only two things mean a member is measurably not signed in: no token at all
// (AuthSessionMissingError), or a token the auth server CHECKED and rejected (401/403).
// Everything else — a 5xx, a 429, a retryable fetch error, a shape we do not
// recognise — is a read that did not complete. Written the other way round, an error
// nobody anticipated would read as confirmed anonymity, which is the direction that
// costs a member their dashboard.

import { NextResponse } from 'next/server';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function firstName(full: string | null | undefined, email: string | null | undefined): string {
  const f = (full ?? '').trim();
  if (f) return f.split(/\s+/)[0];
  const local = (email ?? '').split('@')[0];
  // Strip trailing digits and capitalize if it looks like a name.
  const cleaned = local.replace(/[._-]+/g, ' ').replace(/\d+$/, '').trim();
  if (!cleaned) return email ?? '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Did the auth server actually tell us this person is not signed in?
function isMeasuredSignedOut(error: unknown): boolean {
  if (!error) return true; // a clean read that found nobody
  if (isAuthSessionMissingError(error)) return true; // no token was presented
  const status = (error as { status?: unknown }).status;
  // The token was presented, checked, and refused. Anything else (a 429, a 5xx,
  // a dead socket) is us failing to ask, not them failing to be signed in.
  return status === 401 || status === 403;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user) {
    if (!isMeasuredSignedOut(error)) {
      // 503 rather than a 200 carrying a flag: every caller already reads a non-OK
      // response as "draw the signed-out chrome", and the dashboard gate already
      // renders rather than redirecting on one. A new field would be a new thing for
      // three copies of that gate to learn, and one of them to forget.
      return NextResponse.json(
        { user: null, unknown: true, reason: 'auth_lookup_failed' },
        { status: 503 },
      );
    }
    return NextResponse.json({ user: null });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, role, roles')
    .eq('id', user.id)
    .maybeSingle();

  const roles = Array.isArray(profile?.roles) && profile.roles.length
    ? profile.roles
    : (profile?.role ? [profile.role] : ['client']);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: profile?.full_name ?? null,
      firstName: firstName(profile?.full_name, user.email),
      avatarUrl: profile?.avatar_url ?? null,
      role: profile?.role ?? 'client',
      roles,
    },
  });
}

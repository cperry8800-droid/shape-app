// Bridge endpoint — legacy public/*.html pages load supabase-js client-side
// and persist sessions in localStorage (key `shape.auth`). The Next.js app
// uses @supabase/ssr, which keeps the session in HTTP cookies instead.
// When a user signs in through the Next.js flow and lands on a legacy page
// (e.g. /clients.html), that page has no idea they're logged in until it
// reads the session from here and calls setSession() on its own client.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { clearSupabaseAuthCookies } from '@/lib/supabase/auth-cookies.mjs';
import { readJson, dbError } from '@/lib/request-utils';
import { NATIVE_APP_ORIGINS } from '@/lib/native-cors';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ session: null }, { headers: { 'cache-control': 'no-store' } });
  }

  return NextResponse.json(
    {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}

// Reverse bridge — legacy pages sign in with supabase-js and store the session
// in localStorage. This route lets them push that session into the Next.js
// auth cookies so server-rendered /dashboard/* routes recognize the user.
// L2 (2026-10-08 review): this sets the browser's session cookies from tokens in the body, so a
// page on another site could log a visitor into an account of ITS choosing (login CSRF). A
// browser names the page's origin on a cross-site POST; one from outside Shape and the two
// native app origins is refused. A request with no Origin at all is not a browser's cross-site
// form and passes, as before.
function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  const allowed = new Set<string>([new URL(req.url).origin, ...NATIVE_APP_ORIGINS]);
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) { try { allowed.add(new URL(site).origin); } catch { /* a malformed site url allows nothing more */ } }
  return allowed.has(origin);
}

export async function POST(req: Request) {
  if (!originAllowed(req)) {
    return NextResponse.json({ error: 'Cross-site sign-in is not allowed.' }, { status: 403 });
  }
  const bodyResult = await readJson<unknown>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const tokens = body as { access_token?: string; refresh_token?: string } | null;
  if (!tokens || !tokens.access_token || !tokens.refresh_token) {
    return NextResponse.json({ error: 'missing_tokens' }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });
  if (error) {
    return dbError(error, 'auth session bridge', 400);
  }
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}

// ⚠ THE 200 HERE IS A PROMISE THAT THE COOKIE IS GONE. SignOutButton.tsx and
// the mobile app gate their cross-tab sign-out broadcast on this response
// being ok, and a premature broadcast manufactures a signed-in sibling tab
// that nothing corrects. So do NOT wrap the clearing below in a try/catch that
// still returns 200 — if it throws, the 500 is correct and the broadcast is
// correctly suppressed. See auth-cookies.mjs for why the clearing does not
// rely on signOut()'s return value.
export async function DELETE() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  const cleared = clearSupabaseAuthCookies(await cookies());
  return NextResponse.json(
    { ok: true, revoked: !error, cleared: cleared.length },
    { headers: { 'cache-control': 'no-store' } }
  );
}

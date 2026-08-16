// Sign-out endpoint for static newdesign pages (which can't call the
// server action directly). Revokes the session, clears the Supabase auth
// cookies, and returns 200 so the caller can redirect on its own.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { clearSupabaseAuthCookies } from '@/lib/supabase/auth-cookies.mjs';

export const dynamic = 'force-dynamic';

// ⚠ THE 200 HERE IS A PROMISE THAT THE COOKIE IS GONE. pageShell.jsx and
// index.html gate their cross-tab sign-out broadcast on this response being
// ok, and a premature broadcast manufactures a signed-in sibling tab that
// nothing corrects. So do NOT wrap the clearing below in a try/catch that
// still returns 200 — if it throws, the 500 is correct and the broadcast is
// correctly suppressed. See auth-cookies.mjs for why the clearing does not
// rely on signOut()'s return value.
export async function POST() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  const cleared = clearSupabaseAuthCookies(await cookies());
  return NextResponse.json({ ok: true, revoked: !error, cleared: cleared.length });
}

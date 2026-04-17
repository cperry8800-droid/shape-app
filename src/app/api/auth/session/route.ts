// Bridge endpoint — legacy public/*.html pages load supabase-js client-side
// and persist sessions in localStorage (key `shape.auth`). The Next.js app
// uses @supabase/ssr, which keeps the session in HTTP cookies instead.
// When a user signs in through the Next.js flow and lands on a legacy page
// (e.g. /clients.html), that page has no idea they're logged in until it
// reads the session from here and calls setSession() on its own client.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
export async function POST(req: Request) {
  const body = await req.json().catch(() => null as unknown);
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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}

export async function DELETE() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}

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

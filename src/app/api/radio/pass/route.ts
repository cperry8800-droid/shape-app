// The station's door (part 3 of Shape's own radio, src/lib/radio/pass.mjs). Shape's own station
// server (services/station, Icecast's url auth) posts here each time a listener connects, with
// the address they asked for; a good pass on it, for the station's own mount, lets them in.
//
// Icecast reads the answer from a header, not the status: `icecast-auth-user: 1` admits, its
// absence refuses (the reason goes back in `icecast-auth-message`, for its log). So every answer
// is a 200, and a fault refuses: no key, no listener.
//
// No session and no database: the pass is signed by Shape and checked by its signature alone, so
// this route does no work an attacker could multiply, and it is kept off the per-address rate
// limit (src/lib/supabase/middleware.ts), since every check comes from the one station server.
import { NextResponse } from 'next/server';
import { checkListener, passKey } from '@/lib/radio/pass.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let form = new URLSearchParams();
  try {
    form = new URLSearchParams((await request.text()).slice(0, 4096));
  } catch {
    /* an unreadable body refuses, below */
  }
  const verdict = checkListener(form, { now: Date.now(), key: passKey() });
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (verdict.ok) headers['icecast-auth-user'] = '1';
  else headers['icecast-auth-message'] = String((verdict as { reason?: string }).reason ?? 'refused');
  return new NextResponse(null, { status: 200, headers });
}

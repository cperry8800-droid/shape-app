// Shape's own address for the stream (part 3 of Shape's own radio, src/lib/radio/pass.mjs). A
// member's player connects here with the pass /api/radio/station handed it; each connection is
// the player's own request, so Vercel measures the listener's own country (x-vercel-ip-country).
// A good pass, from the US or the UK, on Shape's own station: a redirect to the station with a
// fresh two-minute ticket. Anything else: a refusal, and no station address.
//
// ⚠ THE TERRITORY IS CHECKED HERE, AT EVERY CONNECTION (Codex, #2579): the station route's check
// is the member's as the pass is handed out, and an address can be passed on.
// ⚠ ONE CROSS-ORIGIN HEADER, `*`, ON EVERY ANSWER. The players load the stream with
// crossOrigin="anonymous" (the website from its own origin, the app from capacitor://localhost or
// https://localhost), and a browser follows a redirect in that mode only if the redirect itself
// allows the origin. This route answers CORS itself (src/lib/native-cors.ts SELF_CORS_PREFIXES),
// so the proxy adds no second header.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listenRedirect, passKey, PASS_PARAM } from '@/lib/radio/pass.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

export async function GET(request: Request) {
  const r = await listenRedirect({
    pass: new URL(request.url).searchParams.get(PASS_PARAM),
    country: request.headers.get('x-vercel-ip-country'),
    production: process.env.NODE_ENV === 'production',
    readStation: async () => {
      const { data, error } = await createAdminClient().from('radio_station').select('provider, stream_url').eq('id', 1).maybeSingle();
      return error ? null : data;
    },
    now: Date.now(),
    key: passKey(),
  });
  if (r.status === 302 && 'location' in r) {
    return new NextResponse(null, { status: 302, headers: { ...HEADERS, location: r.location } });
  }
  return NextResponse.json({ error: 'refused', code: (r as { reason?: string }).reason ?? 'refused' }, { status: r.status, headers: HEADERS });
}

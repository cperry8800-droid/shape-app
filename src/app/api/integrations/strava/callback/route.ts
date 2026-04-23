// Strava OAuth callback. Exchanges the `code` query param for the user's
// access + refresh tokens and stashes them so the periodic sync job can
// use them later.
//
// STUB: the token exchange works, but we're not yet writing to a
// `strava_connections` table. Follow-up work:
//   1. Add that table (user_id, athlete_id, access_token, refresh_token,
//      expires_at, scope) with RLS locked to auth.uid().
//   2. Build the sync worker that pulls activities on a schedule.
//   3. Add a "Connect Strava" button in the client dashboard that
//      points at /api/integrations/strava/connect.

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stravaError = url.searchParams.get('error');

  if (stravaError) {
    return NextResponse.redirect(
      `${url.origin}/newdesign/ClientDashboard.html?strava_error=${encodeURIComponent(stravaError)}`
    );
  }
  if (!code) {
    return NextResponse.json({ error: 'Missing code parameter.' }, { status: 400 });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Strava is not configured.' },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${url.origin}/newdesign/Login.html`);
  }

  let tokenRes: Response;
  try {
    tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });
  } catch (err) {
    console.error('[strava/callback] token exchange network error', err);
    return NextResponse.json({ error: 'Could not reach Strava.' }, { status: 502 });
  }

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => '');
    console.error('[strava/callback] token exchange failed', tokenRes.status, body);
    return NextResponse.json({ error: 'Strava rejected the code.' }, { status: 400 });
  }

  const token = (await tokenRes.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    athlete?: { id?: number; firstname?: string; lastname?: string };
  } | null;

  if (!token?.access_token || !token.refresh_token) {
    return NextResponse.json({ error: 'Strava returned an unexpected token payload.' }, { status: 500 });
  }

  // TODO: persist to a `strava_connections` table once it exists. For now
  // we just confirm the exchange worked so env wiring can be verified.
  console.log('[strava/callback] connected athlete', {
    user_id: user.id,
    athlete_id: token.athlete?.id ?? null,
    expires_at: token.expires_at ?? null,
  });

  return NextResponse.redirect(
    `${url.origin}/newdesign/ClientDashboard.html?strava_connected=1`
  );
}

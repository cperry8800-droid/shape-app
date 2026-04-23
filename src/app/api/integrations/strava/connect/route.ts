// Starts the Strava OAuth flow. Redirects the user to Strava's consent
// screen with our client_id + the scopes we need. Strava sends the user
// back to /api/integrations/strava/callback with a short-lived `code`
// that we exchange for per-user access and refresh tokens.
//
// Not yet wired into any UI — call GET /api/integrations/strava/connect
// manually to verify the redirect URL Strava sees is correct.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'Strava is not configured. Set STRAVA_CLIENT_ID in the environment.' },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Not signed in.', redirectTo: '/newdesign/Login.html' },
      { status: 401 }
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://theshapecommunity.com';
  const redirectUri = `${origin}/api/integrations/strava/callback`;

  // `state` carries the user id through Strava's redirect so the callback
  // can attribute the tokens to the right account.
  const state = user.id;

  const url = new URL('https://www.strava.com/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('approval_prompt', 'auto');
  url.searchParams.set('scope', 'read,activity:read_all,profile:read_all');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}

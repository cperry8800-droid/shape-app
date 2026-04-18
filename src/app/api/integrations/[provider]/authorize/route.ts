// Start an OAuth flow for an integration.
//
// GET /api/integrations/{provider}/authorize
//
// Requires a signed-in Supabase user (cookie session). We stash the
// user id, a CSRF state token, and — if the provider needs PKCE — the
// code verifier in short-lived httpOnly cookies. The browser is then
// 302'd to the provider's authorize URL. The matching callback route
// consumes those cookies to complete the exchange.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getProvider, getClientCredentials, type ProviderId } from '@/lib/integrations/providers';
import { callbackUrl, pkcePair, randomToken } from '@/lib/integrations/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_TTL_SECONDS = 600; // 10 minutes

export async function GET(
  request: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  const cfg = getProvider(provider);
  if (!cfg) return NextResponse.json({ error: 'Unknown provider.' }, { status: 404 });

  const creds = getClientCredentials(cfg);
  if (!creds) {
    return NextResponse.json(
      { error: `Missing ${cfg.clientIdEnv}/${cfg.clientSecretEnv} in environment.` },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const returnTo = new URL(request.url).searchParams.get('return') ?? '/integrations.html';
    return NextResponse.redirect(`${new URL(request.url).origin}/login.html?return=${encodeURIComponent(returnTo)}`);
  }

  const state = randomToken(24);
  const returnTo = new URL(request.url).searchParams.get('return') ?? '/integrations.html';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: creds.clientId,
    redirect_uri: callbackUrl(cfg.id),
    scope: cfg.scope,
    state,
  });
  if (cfg.extraAuthorizeParams) {
    for (const [k, v] of Object.entries(cfg.extraAuthorizeParams)) params.set(k, v);
  }

  let verifier: string | null = null;
  if (cfg.usesPkce) {
    const pkce = pkcePair();
    verifier = pkce.verifier;
    params.set('code_challenge', pkce.challenge);
    params.set('code_challenge_method', 'S256');
  }

  const cookieStore = await cookies();
  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_TTL_SECONDS,
  };
  cookieStore.set(`shape_oauth_state_${cfg.id}`, state, cookieOpts);
  cookieStore.set(`shape_oauth_user_${cfg.id}`, user.id, cookieOpts);
  cookieStore.set(`shape_oauth_return_${cfg.id}`, returnTo, cookieOpts);
  if (verifier) {
    cookieStore.set(`shape_oauth_pkce_${cfg.id}`, verifier, cookieOpts);
  }

  const authorizeUrl = `${cfg.authorizeUrl}?${params.toString()}`;
  return NextResponse.redirect(authorizeUrl);
}

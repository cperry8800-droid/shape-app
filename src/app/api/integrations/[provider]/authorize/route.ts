// Start an OAuth flow for an integration.
//
// GET /api/integrations/{provider}/authorize
//
// Requires a signed-in Supabase user (cookie session). We stash the
// user id, a CSRF state token, and — if the provider needs PKCE — the
// code verifier in short-lived httpOnly cookies. The browser is then
// 302'd to the provider's authorize URL. The matching callback route
// consumes those cookies to complete the exchange.
//
// POST /api/integrations/{provider}/authorize   (form: handoff=<link token>)
//
// The installed app's way in (src/lib/integration-handoff.ts): /connect/{provider}'s Continue
// posts the link here from the in-app browser, which has no website session. The link's member
// is the one connected; a post from any other site is refused, so a forwarded link reaches the
// provider only through the page that names the account. The browser lands on /connect/done.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getProvider, getClientCredentials, type ProviderConfig, type ProviderId } from '@/lib/integrations/providers';
import { pkcePair, randomToken } from '@/lib/integrations/oauth';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';
import { CONNECT_DONE_PATH, handoffPostAllowed, readHandoff } from '@/lib/integration-handoff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COOKIE_TTL_SECONDS = 600; // 10 minutes
const DEFAULT_RETURN_TO = '/newdesign/GetApp.html';
const DEFAULT_LOGIN_ROUTE = '/newdesign/GetApp.html';

type Credentials = { clientId: string; clientSecret: string };

function providerAndCredentials(provider: string): { cfg: ProviderConfig; creds: Credentials } | NextResponse {
  const cfg = getProvider(provider);
  if (!cfg) return NextResponse.json({ error: 'Unknown provider.' }, { status: 404 });

  const creds = getClientCredentials(cfg);
  if (!creds) {
    return NextResponse.json(
      { error: `Missing ${cfg.clientIdEnv}/${cfg.clientSecretEnv} in environment.` },
      { status: 500 }
    );
  }
  return { cfg, creds };
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  const found = providerAndCredentials(provider);
  if (found instanceof NextResponse) return found;
  const { cfg, creds } = found;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const returnTo = safeReturnPath(new URL(request.url).searchParams.get('return'), DEFAULT_RETURN_TO);
    const loginUrl = new URL(DEFAULT_LOGIN_ROUTE, new URL(request.url).origin);
    loginUrl.searchParams.set('return', returnTo);
    loginUrl.searchParams.set('integration', cfg.id);
    loginUrl.searchParams.set('status', 'signin_required');
    return NextResponse.redirect(loginUrl.toString());
  }

  const returnTo = safeReturnPath(new URL(request.url).searchParams.get('return'), DEFAULT_RETURN_TO);
  return startAuthorize(request, cfg, creds, user.id, returnTo);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  if (!handoffPostAllowed(request)) {
    return NextResponse.json({ error: 'Connecting from another site is not allowed.' }, { status: 403 });
  }
  const { provider } = await ctx.params;
  const found = providerAndCredentials(provider);
  if (found instanceof NextResponse) return found;
  const { cfg, creds } = found;

  let handoff: unknown = null;
  try {
    handoff = (await request.formData()).get('handoff');
  } catch {
    handoff = null;
  }
  const uid = readHandoff(handoff, cfg.id);
  if (!uid) {
    const done = new URL(CONNECT_DONE_PATH, new URL(request.url).origin);
    done.searchParams.set('integration', cfg.id);
    done.searchParams.set('status', 'expired');
    return NextResponse.redirect(done.toString(), 303);
  }
  // 303, so the browser goes on to the provider with a GET rather than posting the form there.
  return startAuthorize(request, cfg, creds, uid, CONNECT_DONE_PATH, 303);
}

async function startAuthorize(
  request: Request,
  cfg: ProviderConfig,
  creds: Credentials,
  userId: string,
  returnTo: string,
  status?: number
) {
  const state = randomToken(24);
  const redirectUri = `${new URL(request.url).origin}/api/integrations/${cfg.id}/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: creds.clientId,
    redirect_uri: redirectUri,
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
  cookieStore.set(`shape_oauth_user_${cfg.id}`, userId, cookieOpts);
  cookieStore.set(`shape_oauth_return_${cfg.id}`, returnTo, cookieOpts);
  cookieStore.set(`shape_oauth_redirect_${cfg.id}`, redirectUri, cookieOpts);
  if (verifier) {
    cookieStore.set(`shape_oauth_pkce_${cfg.id}`, verifier, cookieOpts);
  }

  const authorizeUrl = `${cfg.authorizeUrl}?${params.toString()}`;
  return NextResponse.redirect(authorizeUrl, status);
}

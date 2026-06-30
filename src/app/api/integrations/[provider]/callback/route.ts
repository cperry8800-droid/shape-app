// OAuth callback. The provider redirects here with ?code= and ?state=.
// We validate the state cookie, exchange the code for tokens, persist
// them, clear the one-shot cookies, and send the user back to wherever
// they started (default: /newdesign/GetApp.html).

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getProvider, getClientCredentials, type ProviderId } from '@/lib/integrations/providers';
import { callbackUrl } from '@/lib/integrations/oauth';
import { storeTokens } from '@/lib/integrations/tokens';
import { safeReturnPath } from '@/lib/safe-redirect.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_RETURN_TO = '/newdesign/GetApp.html';

function redirectBack(origin: string, returnTo: string, status: 'ok' | 'error', provider: string, message?: string) {
  // Defense-in-depth: never redirect off-origin even if a stale/crafted cookie slips through.
  const url = new URL(safeReturnPath(returnTo), origin);
  url.searchParams.set('integration', provider);
  url.searchParams.set('status', status);
  if (message) url.searchParams.set('message', message);
  return NextResponse.redirect(url.toString());
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ provider: string }> }
) {
  const { provider } = await ctx.params;
  const cfg = getProvider(provider);
  if (!cfg) return NextResponse.json({ error: 'Unknown provider.' }, { status: 404 });

  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerError = url.searchParams.get('error');

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(`shape_oauth_state_${cfg.id}`)?.value ?? null;
  const userId = cookieStore.get(`shape_oauth_user_${cfg.id}`)?.value ?? null;
  const returnTo = cookieStore.get(`shape_oauth_return_${cfg.id}`)?.value ?? DEFAULT_RETURN_TO;
  const redirectUri = cookieStore.get(`shape_oauth_redirect_${cfg.id}`)?.value ?? callbackUrl(cfg.id);
  const verifier = cookieStore.get(`shape_oauth_pkce_${cfg.id}`)?.value ?? null;

  // Clear the one-shot cookies immediately — whether or not the exchange succeeds.
  for (const name of [
    `shape_oauth_state_${cfg.id}`,
    `shape_oauth_user_${cfg.id}`,
    `shape_oauth_return_${cfg.id}`,
    `shape_oauth_redirect_${cfg.id}`,
    `shape_oauth_pkce_${cfg.id}`,
  ]) {
    cookieStore.set(name, '', { path: '/', maxAge: 0 });
  }

  if (providerError) return redirectBack(origin, returnTo, 'error', cfg.id, providerError);
  if (!code || !state) return redirectBack(origin, returnTo, 'error', cfg.id, 'missing_code_or_state');
  if (!expectedState || state !== expectedState) return redirectBack(origin, returnTo, 'error', cfg.id, 'state_mismatch');
  if (!userId) return redirectBack(origin, returnTo, 'error', cfg.id, 'missing_session');

  const creds = getClientCredentials(cfg);
  if (!creds) return redirectBack(origin, returnTo, 'error', cfg.id, 'missing_credentials');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  if (cfg.usesPkce && verifier) body.set('code_verifier', verifier);

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    return redirectBack(origin, returnTo, 'error', cfg.id, `token_exchange_failed:${tokenRes.status}:${text.slice(0, 120)}`);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    expires_in?: number;
    expires_at?: number;
    athlete?: { id?: number };
    user?: { id?: string };
  };

  if (!tokenJson.access_token) return redirectBack(origin, returnTo, 'error', cfg.id, 'no_access_token');

  const now = Date.now();
  let expiresAt: Date | null = null;
  if (cfg.tokenResponseMode === 'expires_at_unix' && typeof tokenJson.expires_at === 'number') {
    expiresAt = new Date(tokenJson.expires_at * 1000);
  } else if (typeof tokenJson.expires_in === 'number') {
    expiresAt = new Date(now + tokenJson.expires_in * 1000);
  }

  // Pull a provider-side identifier where we cheaply can (Strava embeds it).
  let providerUserId: string | null = null;
  if (tokenJson.athlete?.id) providerUserId = String(tokenJson.athlete.id);
  else if (tokenJson.user?.id) providerUserId = String(tokenJson.user.id);

  // Garmin's token response omits the user id, but its push webhooks are keyed
  // by it — fetch it now so /integrations/garmin/webhook can map data back to
  // this user. Non-fatal: if it fails we still store the tokens.
  if (!providerUserId && cfg.id === 'garmin') {
    try {
      const idRes = await fetch('https://apis.garmin.com/wellness-api/rest/user/id', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: 'application/json' },
      });
      if (idRes.ok) {
        const idJson = (await idRes.json().catch(() => null)) as { userId?: string } | null;
        if (idJson?.userId) providerUserId = String(idJson.userId);
      }
    } catch {
      /* leave null — the webhook can be backfilled once we have the id */
    }
  }

  try {
    await storeTokens({
      userId,
      provider: cfg.id as ProviderId,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token ?? null,
      tokenType: tokenJson.token_type ?? null,
      scope: tokenJson.scope ?? cfg.scope,
      expiresAt,
      providerUserId,
    });
  } catch (error) {
    console.error('[shape-api] integration token store failed:', error instanceof Error ? error.message : error);
    return redirectBack(origin, returnTo, 'error', cfg.id, 'token_store_failed');
  }

  return redirectBack(origin, returnTo, 'ok', cfg.id);
}

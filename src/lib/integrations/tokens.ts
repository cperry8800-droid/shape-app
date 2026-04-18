// Server-side helpers for persisting and refreshing OAuth tokens.
// Only imported by API route handlers — never from client bundles.

import { createAdminClient } from '@/lib/supabase/admin';
import { getClientCredentials, getProvider, type ProviderId } from './providers';

interface TokenRow {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  provider_user_id: string | null;
}

export interface StoreTokenInput {
  userId: string;
  provider: ProviderId;
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  expiresAt?: Date | null;
  providerUserId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function storeTokens(input: StoreTokenInput): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('user_integrations')
    .upsert(
      {
        user_id: input.userId,
        provider: input.provider,
        access_token: input.accessToken,
        refresh_token: input.refreshToken ?? null,
        token_type: input.tokenType ?? null,
        scope: input.scope ?? null,
        expires_at: input.expiresAt?.toISOString() ?? null,
        provider_user_id: input.providerUserId ?? null,
        metadata: input.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    );
}

export async function getStoredTokens(userId: string, provider: ProviderId): Promise<TokenRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_integrations')
    .select('access_token, refresh_token, expires_at, scope, provider_user_id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  return (data as TokenRow | null) ?? null;
}

export async function deleteTokens(userId: string, provider: ProviderId): Promise<void> {
  const admin = createAdminClient();
  await admin.from('user_integrations').delete().eq('user_id', userId).eq('provider', provider);
}

// Refresh an expired access token if we have a refresh token on file.
// Returns the (possibly refreshed) access token, or null if we can't
// recover one. Each provider hands back tokens in slightly different
// shapes — the callback route normalizes them when they first arrive,
// and this helper does the same for refresh.
export async function getFreshAccessToken(userId: string, providerId: ProviderId): Promise<string | null> {
  const row = await getStoredTokens(userId, providerId);
  if (!row?.access_token) return null;

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
  const now = Date.now();
  // 60s slack: refresh a minute before actual expiry.
  if (!expiresAt || expiresAt - 60_000 > now) return row.access_token;
  if (!row.refresh_token) return row.access_token;

  const cfg = getProvider(providerId);
  if (!cfg) return row.access_token;
  const creds = getClientCredentials(cfg);
  if (!creds) return row.access_token;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return row.access_token;
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    scope?: string;
  };
  if (!json.access_token) return row.access_token;

  let expiresIso: Date | null = null;
  if (cfg.tokenResponseMode === 'expires_at_unix' && typeof json.expires_at === 'number') {
    expiresIso = new Date(json.expires_at * 1000);
  } else if (typeof json.expires_in === 'number') {
    expiresIso = new Date(now + json.expires_in * 1000);
  }

  await storeTokens({
    userId,
    provider: providerId,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? row.refresh_token,
    scope: json.scope ?? row.scope,
    expiresAt: expiresIso,
    providerUserId: row.provider_user_id,
  });

  return json.access_token;
}

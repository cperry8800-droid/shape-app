// Firebase Cloud Messaging (FCM HTTP v1) sender for system push.
//
// Delivers to both Android and iOS (FCM relays to APNs). Gated entirely on
// three env vars pulled from a Firebase service-account JSON — if any is
// missing, pushConfigured() is false and sendPushToUser is a no-op, so the
// rest of the app works unchanged until you wire Firebase up.
//
//   FCM_PROJECT_ID    — service_account.project_id
//   FCM_CLIENT_EMAIL  — service_account.client_email
//   FCM_PRIVATE_KEY   — service_account.private_key  (keep the \n escapes)
//
// We mint a short-lived OAuth access token from the service account with Node
// crypto (RS256) — no extra dependency — and cache it in-process.

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export function pushConfigured(): boolean {
  return !!(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}

function privateKey(): string {
  // Vercel stores newlines as literal "\n"; restore them for the PEM.
  return (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (!pushConfigured()) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: process.env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  let assertion: string;
  try {
    const sig = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey());
    assertion = `${signingInput}.${b64url(sig)}`;
  } catch (err) {
    console.error('[push] JWT sign failed:', err);
    return null;
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    });
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!res.ok || !data.access_token) {
      console.error('[push] token exchange failed:', JSON.stringify(data));
      return null;
    }
    cachedToken = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
    return data.access_token;
  } catch (err) {
    console.error('[push] token exchange threw:', err);
    return null;
  }
}

async function sendToToken(token: string, accessTok: string, msg: { title: string; body: string; data?: Record<string, string> }): Promise<'ok' | 'stale' | 'error'> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessTok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data: msg.data ?? {},
          apns: { payload: { aps: { sound: 'default' } } },
          android: { priority: 'high', notification: { sound: 'default' } },
        },
      }),
    });
    if (res.ok) return 'ok';
    // 404/400 UNREGISTERED → token is dead; caller prunes it.
    if (res.status === 404 || res.status === 400) return 'stale';
    console.error('[push] send failed:', res.status, await res.text().catch(() => ''));
    return 'error';
  } catch (err) {
    console.error('[push] send threw:', err);
    return 'error';
  }
}

// Send a push to all of a user's registered devices. Best-effort: prunes dead
// tokens, never throws. `client` should be the service-role admin client.
export async function sendPushToUser(
  client: SupabaseClient,
  userId: string,
  msg: { title: string; body: string; data?: Record<string, string> }
): Promise<void> {
  if (!pushConfigured() || !userId) return;
  const accessTok = await accessToken();
  if (!accessTok) return;

  const { data } = await client.from('push_tokens').select('token').eq('user_id', userId);
  const tokens = (data ?? []).map((r: { token: string }) => r.token);
  if (!tokens.length) return;

  const stale: string[] = [];
  await Promise.all(tokens.map(async (tk) => {
    const result = await sendToToken(tk, accessTok, msg);
    if (result === 'stale') stale.push(tk);
  }));
  if (stale.length) {
    await client.from('push_tokens').delete().in('token', stale);
  }
}

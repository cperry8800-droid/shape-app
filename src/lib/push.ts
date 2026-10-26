// System push: Firebase Cloud Messaging (FCM HTTP v1) for Android, Apple Push Notification service
// (APNs, HTTP/2 with a .p8 token key) for iOS.
//
// ⚠ iOS GOES TO APPLE DIRECTLY (owner, 2026-10-16: "can we start these", on Firebase and APNs). The
// app's @capacitor/push-notifications plugin hands iOS a raw APNs device token, which FCM cannot
// deliver to (it answers 400 INVALID_ARGUMENT), so with FCM alone no iPhone could ever receive a push.
// The other way round, Firebase Messaging inside the iOS app, needs a Firebase SDK, a config file in
// the Xcode target and a native code path that cannot be built or tested here; this needs one Apple
// key in Vercel. Android tokens are FCM tokens and keep going to FCM.
//
// Each half is gated on its own env vars; with neither set, pushConfigured() is false and
// sendPushToUser is a no-op, so the rest of the app works unchanged.
//
//   FCM_PROJECT_ID    — service_account.project_id                      (Android)
//   FCM_CLIENT_EMAIL  — service_account.client_email
//   FCM_PRIVATE_KEY   — service_account.private_key  (keep the \n escapes)
//
//   APNS_KEY_ID       — the APNs auth key's Key ID (Apple Developer → Keys)   (iOS)
//   APNS_TEAM_ID      — the Apple Developer Team ID
//   APNS_PRIVATE_KEY  — the .p8 file's contents (keep the \n escapes)
//   APNS_BUNDLE_ID    — optional; defaults to com.theshapecommunity.app
//
// Both tokens (the Google OAuth access token and the APNs provider JWT) are minted with Node crypto,
// no extra dependency, and cached in-process.

import crypto from 'crypto';
import http2 from 'node:http2';
import type { SupabaseClient } from '@supabase/supabase-js';

export function fcmConfigured(): boolean {
  return !!(process.env.FCM_PROJECT_ID && process.env.FCM_CLIENT_EMAIL && process.env.FCM_PRIVATE_KEY);
}

export function apnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}

export function pushConfigured(): boolean {
  return fcmConfigured() || apnsConfigured();
}

// Vercel stores newlines as literal "\n"; restore them for the PEM.
function pem(value: string | undefined): string {
  return (value ?? '').replace(/\\n/g, '\n');
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type Msg = { title: string; body: string; data?: Record<string, string> };
type Result = 'ok' | 'stale' | 'error';

// ── FCM (Android) ──────────────────────────────────────────────────────────────────────────────

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (!fcmConfigured()) return null;
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
    const sig = crypto.createSign('RSA-SHA256').update(signingInput).sign(pem(process.env.FCM_PRIVATE_KEY));
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

// ⚠ ONLY A DEAD TOKEN IS PRUNED. This used to treat every 400 as one, and FCM answers 400
// INVALID_ARGUMENT for a malformed MESSAGE as well as a bad token, so one bad payload would have
// deleted every member's devices on its first send. A token is dead when FCM says UNREGISTERED (404),
// or says in a 400 that the registration token itself is not valid.
export function fcmTokenIsDead(status: number, bodyText: string): boolean {
  if (status === 404) return true;
  let err: { message?: string; details?: Array<{ errorCode?: string }> } | undefined;
  try { err = (JSON.parse(bodyText) as { error?: typeof err }).error; } catch { err = undefined; }
  if (err?.details?.some((d) => d && d.errorCode === 'UNREGISTERED')) return true;
  return status === 400 && /registration token/i.test(String(err?.message ?? ''));
}

async function sendFcm(token: string, accessTok: string, msg: Msg): Promise<Result> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessTok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: msg.title, body: msg.body },
          data: msg.data ?? {},
          android: { priority: 'high', notification: { sound: 'default' } },
        },
      }),
    });
    if (res.ok) return 'ok';
    const text = await res.text().catch(() => '');
    if (fcmTokenIsDead(res.status, text)) return 'stale';
    console.error('[push] FCM send failed:', res.status, text);
    return 'error';
  } catch (err) {
    console.error('[push] FCM send threw:', err);
    return 'error';
  }
}

// ── APNs (iOS) ─────────────────────────────────────────────────────────────────────────────────

const APNS_HOSTS = { production: 'api.push.apple.com', sandbox: 'api.sandbox.push.apple.com' } as const;
let cachedApnsJwt: { jwt: string; iat: number } | null = null;

// The provider token: ES256 over { iss: team, iat }, with the key id in the header. Apple refuses one
// older than an hour and asks that it be refreshed no more than every 20 minutes; 50 minutes sits
// between the two.
export function apnsJwt(now = Math.floor(Date.now() / 1000)): string | null {
  if (!apnsConfigured()) return null;
  if (cachedApnsJwt && now - cachedApnsJwt.iat < 50 * 60) return cachedApnsJwt.jwt;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }));
  const claim = b64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: now }));
  const signingInput = `${header}.${claim}`;
  try {
    // JWS wants the raw r||s signature, not the DER that crypto produces by default.
    const sig = crypto.sign('sha256', Buffer.from(signingInput), { key: pem(process.env.APNS_PRIVATE_KEY), dsaEncoding: 'ieee-p1363' });
    const jwt = `${signingInput}.${b64url(sig)}`;
    cachedApnsJwt = { jwt, iat: now };
    return jwt;
  } catch (err) {
    console.error('[push] APNs JWT sign failed:', err);
    return null;
  }
}

// One HTTP/2 POST (APNs speaks nothing else). Never throws: a transport failure is status 0.
function apnsPost(host: string, token: string, headers: Record<string, string>, payload: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    let done = false;
    let session: http2.ClientHttp2Session | undefined;
    const finish = (status: number, body: string) => {
      if (done) return;
      done = true;
      try { session?.close(); } catch { /* already closed */ }
      resolve({ status, body });
    };
    try {
      session = http2.connect(`https://${host}`);
    } catch (err) {
      finish(0, String(err));
      return;
    }
    session.on('error', (err) => finish(0, String(err)));
    const req = session.request({ ':method': 'POST', ':path': `/3/device/${token}`, 'content-type': 'application/json', ...headers });
    let status = 0;
    let body = '';
    req.setEncoding('utf8');
    req.on('response', (h) => { status = Number(h[':status']) || 0; });
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => finish(status, body));
    req.on('error', (err) => finish(0, String(err)));
    req.setTimeout(10_000, () => { try { req.close(); } catch { /* gone */ } finish(0, 'timeout'); });
    req.end(payload);
  });
}

function apnsReason(body: string): string {
  try { return String((JSON.parse(body) as { reason?: unknown }).reason ?? ''); } catch { return ''; }
}

// An APNs device token is hex (the plugin sends upper case); an FCM token never is, because it
// carries a colon and base64url. No length is assumed: Apple says device tokens vary in length.
const APNS_TOKEN = /^[0-9a-f]+$/i;

async function sendApns(token: string, msg: Msg): Promise<Result> {
  const jwt = apnsJwt();
  if (!jwt) return 'error';
  const headers = {
    authorization: `bearer ${jwt}`,
    'apns-topic': process.env.APNS_BUNDLE_ID || 'com.theshapecommunity.app',
    'apns-push-type': 'alert',
    'apns-priority': '10',
  };
  // The data keys ride beside `aps`, where the app's tap handler reads them (notification.data.route).
  const payload = JSON.stringify({ ...(msg.data ?? {}), aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' } });
  // A TestFlight or App Store build registers with production; a build run from Xcode with the
  // sandbox, whose tokens production answers BadDeviceToken. So production first, then the sandbox.
  let res = await apnsPost(APNS_HOSTS.production, token, headers, payload);
  if (res.status === 400 && apnsReason(res.body) === 'BadDeviceToken') {
    res = await apnsPost(APNS_HOSTS.sandbox, token, headers, payload);
    if (res.status === 400 && apnsReason(res.body) === 'BadDeviceToken') return 'stale';
  }
  if (res.status === 200) return 'ok';
  // 410: the app was removed, or the token is no longer valid for the topic.
  if (res.status === 410) return 'stale';
  console.error('[push] APNs send failed:', res.status, res.body);
  return 'error';
}

// ── Fan-out ────────────────────────────────────────────────────────────────────────────────────

// Send a push to all of a user's registered devices. Best-effort: prunes dead tokens, never throws.
// `client` should be the service-role admin client. An iPhone's APNs token (hex) goes to APNs and every
// other token to FCM, so an iOS build that ever registers an FCM token is delivered, not pruned. A
// token whose service is not configured is left alone (it is not dead; there is just nothing to send
// it with yet).
// What it answers: how many devices took the push and how many sends failed (a dead token, pruned,
// is neither). The morning job (/api/cron/push-held) holds a notice again when every send failed, since
// a transient APNs or FCM error is answered here, never thrown (Codex on #2476).
export type PushSent = { sent: number; failed: number };
export async function sendPushToUser(client: SupabaseClient, userId: string, msg: Msg): Promise<PushSent> {
  const out: PushSent = { sent: 0, failed: 0 };
  if (!pushConfigured() || !userId) return out;

  const { data } = await client.from('push_tokens').select('token, platform').eq('user_id', userId);
  const rows = (data ?? []) as Array<{ token: string; platform: string | null }>;
  if (!rows.length) return out;
  const toApns = (r: { token: string; platform: string | null }) => r.platform === 'ios' && APNS_TOKEN.test(r.token);
  const needsFcm = rows.some((r) => !toApns(r));
  const fcmTok = needsFcm && fcmConfigured() ? await accessToken() : null;

  const stale: string[] = [];
  await Promise.all(rows.map(async (r) => {
    let result: Result | null = null;
    if (toApns(r)) {
      if (apnsConfigured()) result = await sendApns(r.token, msg);
    } else if (fcmTok) {
      result = await sendFcm(r.token, fcmTok, msg);
    }
    if (result === 'stale') stale.push(r.token);
    else if (result === 'ok') out.sent += 1;
    else if (result === 'error') out.failed += 1;
  }));
  if (stale.length) {
    await client.from('push_tokens').delete().in('token', stale);
  }
  return out;
}

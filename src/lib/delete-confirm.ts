// A short-lived confirmation for account deletion (L1 of the 2026-10-08 review).
//
// POST /api/account/delete used to purge 30 tables and 6 buckets on one unconfirmed request: the
// clients asked the person to type DELETE, but nothing on the server knew that, so any request
// riding the session (a stale tab, a mistaken retry, a script with the token) was final at once.
// Now the first request earns a token bound to the account and good for ten minutes, and only a
// request carrying that token deletes. The token is HMAC-signed with a server-only secret, so it
// cannot be minted outside the server; it says nothing about the account that a holder of the
// session does not already know.

import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const DELETE_CONFIRM_TTL_S = 10 * 60;

function secret(): string {
  if (process.env.ACCOUNT_DELETE_SECRET) return process.env.ACCOUNT_DELETE_SECRET;
  if (process.env.RATE_LIMIT_SECRET) return process.env.RATE_LIMIT_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Never the raw service key: a one-way derivation, as proposalSecret() does.
  return serviceKey ? createHash('sha256').update(`shape-account-delete:${serviceKey}`).digest('hex') : '';
}

function mac(s: string, body: string): string {
  return createHmac('sha256', s).update(`account-delete:${body}`).digest('hex');
}

/** `<uid>.<exp>.<mac>`, or null when no server secret is configured (the route answers 503). */
export function issueDeleteConfirm(userId: string, now: number = Date.now()): { token: string; expiresAt: number } | null {
  const s = secret();
  if (!s || !userId) return null;
  const exp = Math.floor(now / 1000) + DELETE_CONFIRM_TTL_S;
  const body = `${userId}.${exp}`;
  return { token: `${body}.${mac(s, body)}`, expiresAt: exp * 1000 };
}

/** True only for a token this server issued, for this account, that has not expired. */
export function verifyDeleteConfirm(token: unknown, userId: string, now: number = Date.now()): boolean {
  const s = secret();
  if (!s || !userId || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [uid, expRaw, sig] = parts;
  if (uid !== userId || !/^\d{1,12}$/.test(expRaw) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Number(expRaw) * 1000 < now) return false;
  const want = mac(s, `${uid}.${expRaw}`);
  return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

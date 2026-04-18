// OAuth helpers: state + PKCE.
// Node-only — uses the crypto builtin. State and PKCE verifier are stored
// in short-lived httpOnly cookies; the callback route validates them
// before exchanging the code.

import crypto from 'node:crypto';

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

export function callbackUrl(providerId: string): string {
  return `${siteOrigin()}/api/integrations/${providerId}/callback`;
}

import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Resolve the .p8 private key from the env var, tolerant of how it was pasted.
// Multi-line env values are notoriously fragile (Vercel's field can strip the
// line breaks), so we normalize ANY reasonable form — a proper multi-line PEM, a
// single-line value with literal \n escapes, a flattened PEM with the breaks
// removed, or just the bare base64 body — back into a valid PEM.
function privateKeyFromEnv() {
  const rawEnv = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!rawEnv) return null;
  // Single-line env values use literal "\n" escapes — turn them into real newlines.
  let pem = rawEnv.includes('\\n') ? rawEnv.replace(/\\n/g, '\n') : rawEnv;
  pem = pem.trim();
  // Already a well-formed multi-line PEM (header on its own line) — use as-is.
  if (/-----BEGIN [^-]+-----\r?\n/.test(pem) && /\r?\n-----END [^-]+-----/.test(pem)) return pem;
  // Otherwise the line breaks were lost on paste. Rebuild a valid PEM from the
  // base64 body so the key works regardless of how the value was formatted.
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const wrapped = body.match(/.{1,64}/g);
  if (!wrapped) return pem;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

export async function GET() {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKey = privateKeyFromEnv();

  if (!teamId || !keyId || !privateKey) {
    return NextResponse.json(
      { error: 'Missing APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_KEY_ID, or APPLE_MUSIC_PRIVATE_KEY.' },
      { status: 500 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 60 * 60 * 12,
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

  return NextResponse.json(
    { developerToken: `${unsigned}.${base64url(signature)}`, expiresAt: payload.exp },
    { headers: { 'cache-control': 'private, max-age=3600' } }
  );
}

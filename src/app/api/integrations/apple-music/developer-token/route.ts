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

function privateKeyFromEnv() {
  const raw = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!raw) return null;
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
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

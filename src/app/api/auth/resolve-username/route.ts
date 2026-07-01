// Resolve a Shape username to its login email — server-side + rate-limited.
//
// Username login needs to map @handle -> email before signInWithPassword. Doing
// that via an anon-callable get_email_for_username RPC let anyone bulk-enumerate
// the username->email map (AUTHZ-P2-email-enum, SECURITY-AUDIT-2026-06-30). The
// RPC is now revoked from anon/authenticated; this route calls it via the
// service role. It's reachable pre-auth (not membership-gated), and the proxy
// applies the /api/auth non-GET rate limit (5 / 15 min per IP), so bulk
// enumeration is throttled while a normal login (one lookup) is unaffected.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readJson<{ username?: unknown }>(request);
  if (!body.ok) return body.response;

  const username = String((body.data as { username?: unknown })?.username ?? '')
    .replace(/^@/, '')
    .trim();
  // Same shape the login clients passed to the RPC; bound the length.
  if (!username || username.length > 40) {
    return NextResponse.json({ email: null });
  }

  const admin = createAdminClient();
  const { data } = await admin.rpc('get_email_for_username', { p_username: username });
  return NextResponse.json({ email: typeof data === 'string' && data ? data : null });
}

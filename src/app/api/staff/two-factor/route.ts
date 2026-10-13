// The authenticator steps of a staff sign-in (/staff-verify), run on the server.
//
// ⚠ NOT IN THE BROWSER. The site's session cookies are httpOnly (src/lib/supabase/cookie-options.ts),
// so a browser Supabase client has no session to read: #2329 called mfa.listFactors() from the page
// and every staff member saw "Your sign-in methods could not be read". The server client reads the
// cookies, and a verified code writes the upgraded (aal2) session back to them (@supabase/ssr saves
// on MFA_CHALLENGE_VERIFIED).
//
// POST { action: 'start' }
//   -> { mode: 'enroll', factorId, qr, secret }  no authenticator yet: a new one to scan
//   -> { mode: 'verify', factorId }              one is set up: ask for its code
//   -> { mode: 'verified' }                      this session already passed the second factor
// POST { action: 'verify', factorId, code } -> { ok: true }
// Staff only (getStaffSignIn: the level, whatever the second factor); anyone else gets a 404.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStaffSignIn } from '@/lib/admin-access';
import { cleanCode } from '@/lib/staff-two-factor.mjs';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function say(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const signIn = await getStaffSignIn();
  if (!signIn) return say('Not found.', 404);

  const parsed = await readJson<{ action?: unknown; factorId?: unknown; code?: unknown }>(request);
  if (!parsed.ok) return parsed.response;
  const { action } = parsed.data;
  const supabase = await createClient();

  if (action === 'start') {
    if (signIn.twoFactor === 'verified') return NextResponse.json({ mode: 'verified' }, { headers: NO_STORE });
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error || !data) return say('Your sign-in methods could not be read. Reload the page to try again.', 503);
    const totp = data.all.filter((f) => f.factor_type === 'totp');
    if (signIn.twoFactor === 'verify') {
      const verified = totp.find((f) => f.status === 'verified');
      if (!verified) return say('No authenticator is set up on this account. Reload the page to set one up.', 409);
      return NextResponse.json({ mode: 'verify', factorId: verified.id }, { headers: NO_STORE });
    }
    // A set-up that was started and never confirmed leaves an unverified factor; clear those so
    // they do not pile up against Supabase's limit.
    for (const f of totp.filter((x) => x.status === 'unverified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      issuer: 'Shape',
      friendlyName: `Shape console ${new Date().toISOString().slice(0, 16)}`,
    });
    if (enrollError || !enrolled) return say('An authenticator could not be set up just now. Reload the page to try again.', 503);
    return NextResponse.json(
      { mode: 'enroll', factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret },
      { headers: NO_STORE }
    );
  }

  if (action === 'verify') {
    const factorId = typeof parsed.data.factorId === 'string' ? parsed.data.factorId : '';
    if (!UUID_RE.test(factorId)) return say('Reload the page to try again.', 400);
    const code = cleanCode(parsed.data.code);
    if (!code) return say('Enter the 6-digit code from your authenticator app.', 400);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) return say('That code did not match. Codes change every 30 seconds; enter the one showing now.', 400);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }

  return say('Unknown step.', 400);
}

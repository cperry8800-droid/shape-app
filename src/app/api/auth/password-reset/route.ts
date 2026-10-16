// POST /api/auth/password-reset — mail a reset link that works in any browser (client-onboarding
// review, H9). The app's "Forgot password" calls this; the website's form calls the same function
// through its server action. Body: { email, captchaToken? }. The answer is the same whether or not
// an account has the address. The proxy's auth tier (5 POSTs / 15 min per address) applies too.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson } from '@/lib/request-utils';
import { requestPasswordResetEmail, requestIp } from '@/lib/password-reset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await readJson<{ email?: unknown; captchaToken?: unknown }>(request);
  if (!body.ok) return body.response;
  const data = (body.data ?? {}) as { email?: unknown; captchaToken?: unknown };
  const result = await requestPasswordResetEmail(createAdminClient(), {
    email: data.email,
    captchaToken: data.captchaToken,
    ip: requestIp(request.headers),
  });
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.error, code: result.code }, { status: result.status, headers: { 'cache-control': 'no-store' } });
}

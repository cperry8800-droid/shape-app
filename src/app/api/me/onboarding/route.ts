// Puts the website sign-up's answers on the account's own records, once (signup-answers.mjs says
// what goes where and why). Called by the website's member dashboard and the app on a signed-in
// visit; the first call that finds answers writes them, and every later one is a no-op.
//
// Writes as the member (their own session; user_goals is theirs by RLS), never as the service
// role, and only from the answers on their own account.
//
// Not under the membership gate (/api/me is not gated): a website sign-up arrives here before
// paying, and the answers belong on the record either way.
//
// 200 { seeded: true } wrote them · 200 { seeded: false } nothing to write · 401 signed out ·
// 503 a read or write failed (the next visit tries again: client_onboarding.seededAt is written
// last).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { normalizeSignupAnswers, planOnboardingSeed } from '@/lib/signup-answers.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const KINDS = ['client_onboarding', 'client_goals', 'client_identity', 'client_training_prefs'];

export async function POST(request: Request) {
  const user = await currentUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401, headers: NO_STORE });
  const answers = normalizeSignupAnswers((user.user_metadata as Record<string, unknown> | undefined)?.onboarding);
  if (!answers) return NextResponse.json({ seeded: false }, { headers: NO_STORE });
  try {
    const client = await clientForRequest(request);
    const { data: rows, error } = await client
      .from('user_goals')
      .select('kind, data')
      .eq('user_id', user.id)
      .in('kind', KINDS);
    if (error) throw error;
    const docs: Record<string, unknown> = {};
    for (const row of rows ?? []) docs[row.kind] = row.data;
    const writes = planOnboardingSeed(answers, docs, new Date().toISOString());
    if (!writes) return NextResponse.json({ seeded: false }, { headers: NO_STORE });
    // In order: client_onboarding, carrying seededAt, is the last write.
    for (const w of writes) {
      const { error: werr } = await client
        .from('user_goals')
        .upsert({ user_id: user.id, kind: w.kind, data: w.data }, { onConflict: 'user_id,kind' });
      if (werr) throw werr;
    }
    return NextResponse.json({ seeded: true }, { headers: NO_STORE });
  } catch (err) {
    console.error('[me/onboarding] could not write the sign-up answers', err);
    return NextResponse.json({ error: 'Could not save your sign-up answers.' }, { status: 503, headers: NO_STORE });
  }
}

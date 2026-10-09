// Register / unregister a device's push token for the signed-in user.
//
// POST   { token, platform }  -> upsert (token is unique; re-point to this user)
// DELETE { token }            -> remove (on logout / token refresh)
//
// Auth: cookie session OR Bearer token (mobile bridges either).

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLATFORMS = ['ios', 'android', 'web', 'unknown'];
// L6 (2026-10-08 review): one account registering tokens without end could fill the table and
// fan every notification out to each of them. An account keeps its newest 25; the rest go.
const MAX_TOKENS_PER_USER = 25;
// One prune reads and deletes the overflow in pages of 200, up to 25 pages (5,000 tokens).
const PRUNE_PAGE = 200;
const PRUNE_PASSES = 25;

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const token = String((body as { token?: unknown }).token ?? '').trim();
  const platform = PLATFORMS.includes(String((body as { platform?: unknown }).platform))
    ? String((body as { platform?: unknown }).platform)
    : 'unknown';
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 });

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  // ADMIN client, deliberately — a documented exception to the "service role is
  // for system writes only" house rule, because this re-point is an authorization
  // RLS cannot express. push_tokens RLS is owner-only for ALL operations
  // (2026-05-30-push-tokens.sql: USING user_id = auth.uid()), so a caller-scoped
  // upsert whose ON CONFLICT lands on ANOTHER account's row — the shared-device
  // account switch, the exact case the "re-points to this user" contract exists
  // for — is refused, the row stays assigned to the previous account, and the
  // device keeps receiving the previous member's notifications. The real
  // authorization here is POSSESSION: the FCM/APNs token is minted per-device
  // and only the app instance running on that device holds it, so an
  // authenticated caller presenting the token IS the device's current holder.
  // The caller is still authenticated above (401 before any write); the token
  // is high-entropy and unguessable, so this grants nothing to a caller who
  // doesn't already hold the device.
  const admin = createAdminClient();
  // L6: a token moving between accounts (the shared-device switch, or a token someone else
  // obtained) leaves a line in the log naming both accounts, so a complaint can be traced.
  const { data: prior, error: priorErr } = await admin
    .from('push_tokens')
    .select('user_id')
    .eq('token', token)
    .maybeSingle<{ user_id: string }>();
  if (priorErr) return dbError(priorErr, 'push token register', 500);
  if (prior && prior.user_id !== user.id) {
    console.info('[shape-app] push token re-pointed to another account', { from: prior.user_id, to: user.id, platform });
  }
  const { error } = await admin
    .from('push_tokens')
    .upsert({ user_id: user.id, token, platform, updated_at: new Date().toISOString() }, { onConflict: 'token' });
  if (error) return dbError(error, 'push token register', 500);
  // The cap: everything past the newest MAX_TOKENS_PER_USER is removed. Read newest-first from
  // position MAX onwards, so the page IS the overflow, and go on page by page until one comes
  // back short: an account that held hundreds of tokens before the cap existed is brought
  // down to 25 in one registration, not 200 at a time (Codex, #2289). A failed read or prune
  // is logged, never a 500, because the registration itself succeeded.
  for (let pass = 0; pass < PRUNE_PASSES; pass += 1) {
    const { data: overflow, error: overflowErr } = await admin
      .from('push_tokens')
      .select('token')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .range(MAX_TOKENS_PER_USER, MAX_TOKENS_PER_USER + PRUNE_PAGE - 1);
    if (overflowErr) {
      console.error('[shape-app] push token cap read failed', { user: user.id, error: overflowErr.message });
      break;
    }
    if (!overflow || !overflow.length) break;
    const { error: pruneErr } = await admin
      .from('push_tokens')
      .delete()
      .eq('user_id', user.id)
      .in('token', overflow.map((r) => (r as { token: string }).token));
    if (pruneErr) {
      console.error('[shape-app] push token cap prune failed', { user: user.id, error: pruneErr.message });
      break;
    }
    if (overflow.length < PRUNE_PAGE) break;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const token = String((body as { token?: unknown }).token ?? '').trim();
  if (!token) return NextResponse.json({ error: 'Missing token.' }, { status: 400 });

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const supabase = await clientForRequest(request);
  // Report what actually happened — the client's sign-out teardown clears its
  // retained token only on a CONFIRMED removal. The old unconditional
  // `{ ok: true }` mis-confirmed two cases: a database error (swallowed), and
  // an RLS zero-row delete (a token retried under a different account's
  // session removes nothing while the row stays assigned to its owner). Both
  // made the caller discard the one value that could retry, so the signed-out
  // account kept receiving notifications on a shared device.
  const { error, count } = await supabase
    .from('push_tokens')
    .delete({ count: 'exact' })
    .eq('token', token);
  if (error) return dbError(error, 'push token unregister', 500);
  return NextResponse.json({ ok: true, deleted: count ?? 0 });
}

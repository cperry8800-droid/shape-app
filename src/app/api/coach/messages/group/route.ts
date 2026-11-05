// One message to a chosen set of a coach's clients (owner, 2026-11-05: "Nudge all 3", "Note to all").
// Each client gets their own copy in their own thread with the coach (get_or_create_client_conversation,
// the thread the Messages page and the app already use); there is no group thread, and no client sees
// who else got it. The messages trigger tells each client as it tells them of any message.
//
// POST { role, clientIds: [uuid], body, confirmed: <count the coach confirmed>, groupId: uuid }
//   -> { ok, sent, failed: [clientId], groupId }
// Refused, with nothing sent: not signed in (401); a client who is not the caller's active client in
// that role (403, all of them named); the list changed after the confirm step (409 confirm); the same
// send again (409 already_sent); past GROUP_SENDS_PER_HOUR an hour or GROUP_SENDS_PER_DAY a day (429);
// the limit unreadable (503). The rules are pure (src/lib/group-message.mjs).
//
// Everything runs on the caller's own session: the thread RPC refuses a member who is not their client
// (42501), and the messages RLS lets them write only into a thread they are in.
//
// Auth: cookie session OR Bearer token.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { readJson } from '@/lib/request-utils';
import { checkGroupSend, rateDecision } from '../../../../../lib/group-message.mjs';
import { OPEN_SUB_STATUSES } from '../../../../../lib/coach-trajectory.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = await readJson<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const check = checkGroupSend(parsed.data);
  if (!check.ok) return NextResponse.json({ error: check.error, code: check.code }, { status: check.status });
  const { role, clientIds, body, groupId } = check as { role: 'trainer' | 'nutritionist'; clientIds: string[]; body: string; groupId: string };
  const supabase = await clientForRequest(request);

  // The caller's active clients in that role: every listing of theirs, every open subscription.
  const { data: listings, error: listErr } = await supabase.from(role === 'trainer' ? 'trainers' : 'nutritionists').select('id').eq('owner_id', user.id);
  if (listErr) return NextResponse.json({ error: 'Could not verify your coach account. Please retry.' }, { status: 500 });
  const ids = ((listings ?? []) as { id: number }[]).map((l) => l.id);
  if (!ids.length) return NextResponse.json({ error: `You don't coach as a ${role}.` }, { status: 403 });
  const { data: subs, error: subsErr } = await supabase.from('subscriptions').select('client_id')
    .in('provider_id', ids).eq('provider_role', role).in('status', OPEN_SUB_STATUSES);
  if (subsErr) return NextResponse.json({ error: 'Could not verify your clients. Please retry.' }, { status: 500 });
  const mine = new Set(((subs ?? []) as { client_id: string }[]).map((s) => String(s.client_id)));
  const notMine = clientIds.filter((id) => !mine.has(id));
  if (notMine.length) return NextResponse.json({ error: 'You can only message your own active clients.', code: 'not_your_client', clientIds: notMine }, { status: 403 });

  // The limit: the caller's own group messages of the last day, one per send counted.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: recent, error: recentErr } = await supabase.from('messages').select('metadata, created_at')
    .eq('sender_id', user.id).not('metadata->>groupId', 'is', null).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(2000);
  if (recentErr) return NextResponse.json({ error: "Couldn't check how many group messages you've sent. Nothing was sent — try again." }, { status: 503 });
  const rate = rateDecision(recent ?? [], new Date(), groupId);
  if (!rate.ok) return NextResponse.json({ error: rate.error, code: rate.code }, { status: rate.status });

  let sent = 0;
  const failed: string[] = [];
  for (const clientId of clientIds) {
    const { data: cid, error: openErr } = await supabase.rpc('get_or_create_client_conversation', { p_client_id: clientId, p_provider_role: role });
    if (openErr || typeof cid !== 'string') { failed.push(clientId); continue; }
    const { error: insErr } = await supabase.from('messages').insert({
      conversation_id: cid,
      sender_id: user.id,
      body,
      metadata: { groupId, group: true, recipients: clientIds.length },
    });
    if (insErr) { failed.push(clientId); continue; }
    sent += 1;
  }
  return NextResponse.json({ ok: failed.length === 0, sent, failed, groupId }, { status: sent ? 200 : 502 });
}
